// src/data.js

import path from 'path';
import bcrypt from 'bcryptjs';
import { encrypt, decrypt } from './crypto.js';

// 內存中的鎖，用於防止並發創建同名文件夾
const creatingFolders = new Set();

// --- SQL 輔助常量 ---
const ALL_FILE_COLUMNS = `
    fileName, mimetype, file_id, thumb_file_id, date, size, folder_id, user_id, storage_type, is_deleted, deleted_at
`;
const SAFE_SELECT_MESSAGE_ID = `CAST(message_id AS TEXT) AS message_id`;
const SAFE_SELECT_ID_AS_TEXT = `CAST(message_id AS TEXT) AS id`;

// --- 用戶管理 ---

export async function createUser(db, username, hashedPassword) {
    const sql = `INSERT INTO users (username, password, is_admin, max_storage_bytes) VALUES (?, ?, 0, 1073741824)`;
    const result = await db.run(sql, [username, hashedPassword]);
    return { id: result.meta.last_row_id, username };
}

export async function findUserByName(db, username) {
    return await db.get("SELECT * FROM users WHERE username = ?", [username]);
}

export async function findUserById(db, id) {
    return await db.get("SELECT * FROM users WHERE id = ?", [id]);
}

export async function changeUserPassword(db, userId, newHashedPassword) {
    const sql = `UPDATE users SET password = ? WHERE id = ?`;
    const result = await db.run(sql, [newHashedPassword, userId]);
    return { success: true, changes: result.meta.changes };
}

export async function listNormalUsers(db) {
    const sql = `SELECT id, username FROM users WHERE is_admin = 0 ORDER BY username ASC`;
    return await db.all(sql);
}

export async function listAllUsers(db) {
    const sql = `SELECT id, username FROM users ORDER BY username ASC`;
    return await db.all(sql);
}

export async function deleteUser(db, userId) {
    // 注意：Workers 中無法刪除本地文件目錄，僅刪除數據庫記錄
    // 如果需要清理 S3/WebDAV 中的文件，需要額外邏輯遍歷刪除
    const sql = `DELETE FROM users WHERE id = ? AND is_admin = 0`;
    const result = await db.run(sql, [userId]);
    return { success: true, changes: result.meta.changes };
}

// --- 用戶配額管理 ---

export async function getUserQuota(db, userId) {
    const user = await db.get("SELECT max_storage_bytes FROM users WHERE id = ?", [userId]);
    const usage = await db.get("SELECT SUM(size) as total_size FROM files WHERE user_id = ?", [userId]);

    return {
        max: user ? (user.max_storage_bytes || 1073741824) : 1073741824,
        used: usage && usage.total_size ? usage.total_size : 0
    };
}

export async function checkQuota(db, userId, incomingSize) {
    const quota = await getUserQuota(db, userId);
    return (quota.used + incomingSize) <= quota.max;
}

export async function listAllUsersWithQuota(db) {
    const sql = `SELECT id, username, is_admin, max_storage_bytes FROM users ORDER BY is_admin DESC, username ASC`;
    const users = await db.all(sql);

    const userIds = users.map(u => u.id);
    if (userIds.length === 0) return [];
    
    // D1 不支持數組參數展開，需手動構造占位符
    const placeholders = userIds.map(() => '?').join(',');
    const usageSql = `SELECT user_id, SUM(size) as total_size FROM files WHERE user_id IN (${placeholders}) GROUP BY user_id`;
    const usageData = await db.all(usageSql, userIds);
    
    const usageMap = new Map(usageData.map(row => [row.user_id, row.total_size]));

    return users.map(user => ({
        id: user.id,
        username: user.username,
        is_admin: user.is_admin,
        max_storage_bytes: user.max_storage_bytes || 1073741824, 
        used_storage_bytes: usageMap.get(user.id) || 0
    }));
}

export async function setMaxStorageForUser(db, userId, maxBytes) {
    const sql = `UPDATE users SET max_storage_bytes = ? WHERE id = ? AND is_admin = 0`; 
    const result = await db.run(sql, [maxBytes, userId]);
    return { success: true, changes: result.meta.changes };
}

// --- 搜索與列表 ---

export async function searchItems(db, query, userId) {
    const searchQuery = `%${query}%`;
    const baseQuery = `
        WITH RECURSIVE folder_ancestry(id, parent_id, is_locked, is_deleted) AS (
            SELECT id, parent_id, (password IS NOT NULL) as is_locked, is_deleted
            FROM folders
            WHERE user_id = ?
            UNION ALL
            SELECT fa.id, f.parent_id, (fa.is_locked OR (f.password IS NOT NULL)), (fa.is_deleted OR f.is_deleted)
            FROM folders f
            JOIN folder_ancestry fa ON f.id = fa.parent_id
            WHERE f.user_id = ?
        ),
        folder_status AS (
            SELECT id, MAX(is_locked) as is_path_locked, MAX(is_deleted) as is_path_deleted
            FROM folder_ancestry
            GROUP BY id
        )
    `;

    const sqlFiles = baseQuery + `
        SELECT 
            ${SAFE_SELECT_MESSAGE_ID}, ${ALL_FILE_COLUMNS},
            ${SAFE_SELECT_ID_AS_TEXT}, 
            f.fileName as name, 
            'file' as type
        FROM files f
        JOIN folder_status fs ON f.folder_id = fs.id
        WHERE f.fileName LIKE ? AND f.user_id = ? 
        AND fs.is_path_locked = 0 AND fs.is_path_deleted = 0 AND f.is_deleted = 0
        ORDER BY f.date DESC;
    `;
    
    const sqlFolders = baseQuery + `
        SELECT 
            f.id, 
            f.name, 
            f.parent_id, 
            'folder' as type, 
            (f.password IS NOT NULL) as is_locked
        FROM folders f
        JOIN folder_status fs ON f.id = fs.id
        WHERE f.name LIKE ? AND f.user_id = ? 
        AND fs.is_path_locked = 0 AND fs.is_path_deleted = 0 AND f.is_deleted = 0
        AND f.parent_id IS NOT NULL
        ORDER BY f.name ASC;
    `;

    const folders = await db.all(sqlFolders, [userId, userId, searchQuery, userId]);
    const files = await db.all(sqlFiles, [userId, userId, searchQuery, userId]);

    return {
        folders: folders.map(f => ({ ...f, encrypted_id: encrypt(f.id) })),
        files: files
    };
}

export async function isFileAccessible(db, fileId, userId, unlockedFolders = []) {
    const files = await getFilesByIds(db, [fileId], userId);
    const file = files[0];
    if (!file || file.is_deleted) return false;

    const pathArr = await getFolderPath(db, file.folder_id, userId);
    if (!pathArr || pathArr.length === 0) return false;

    const folderIds = pathArr.map(p => p.id);
    const placeholders = folderIds.map(() => '?').join(',');
    const sql = `SELECT id, password IS NOT NULL as is_locked, is_deleted FROM folders WHERE id IN (${placeholders}) AND user_id = ?`;
    
    const folderRows = await db.all(sql, [...folderIds, userId]);
    const folderInfos = new Map(folderRows.map(row => [row.id, row]));

    for (const folder of pathArr) {
        const info = folderInfos.get(folder.id);
        if (!info) continue;
        if (info.is_deleted) return false;
        if (info.is_locked && !unlockedFolders.includes(folder.id)) return false;
    }
    return true;
}

export async function getItemsByIds(db, itemIds, userId) {
    if (!itemIds || itemIds.length === 0) return [];
    
    const placeholders = itemIds.map(() => '?').join(',');
    const sql = `
        SELECT id, name, parent_id, 'folder' as type, null as storage_type, null as file_id, password IS NOT NULL as is_locked, is_deleted
        FROM folders 
        WHERE id IN (${placeholders}) AND user_id = ?
        UNION ALL
        SELECT ${SAFE_SELECT_ID_AS_TEXT}, fileName as name, folder_id as parent_id, 'file' as type, storage_type, file_id, 0 as is_locked, is_deleted
        FROM files 
        WHERE message_id IN (${placeholders}) AND user_id = ?
    `;
    const stringItemIds = itemIds.map(id => id.toString());
    return await db.all(sql, [...stringItemIds, userId, ...stringItemIds, userId]);
}

export async function getChildrenOfFolder(db, folderId, userId) {
    const sql = `
        SELECT id, name, 'folder' as type FROM folders WHERE parent_id = ? AND user_id = ? AND is_deleted = 0
        UNION ALL
        SELECT ${SAFE_SELECT_ID_AS_TEXT}, fileName as name, 'file' as type FROM files WHERE folder_id = ? AND user_id = ? AND is_deleted = 0
    `;
    return await db.all(sql, [folderId, userId, folderId, userId]);
}

export async function getDescendantFiles(db, folderIds, userId) {
    let allFiles = [];
    for (const folderId of folderIds) {
        const nestedFiles = await getFilesRecursive(db, folderId, userId);
        allFiles.push(...nestedFiles);
    }
    return allFiles;
}

export async function getFilesRecursive(db, folderId, userId, currentPath = '') {
    let allFiles = [];
    const sqlFiles = `SELECT ${SAFE_SELECT_MESSAGE_ID}, ${ALL_FILE_COLUMNS} FROM files WHERE folder_id = ? AND user_id = ?`;
    const files = await db.all(sqlFiles, [folderId, userId]);
    
    for (const file of files) {
        allFiles.push({ ...file, path: path.join(currentPath, file.fileName) });
    }

    const sqlFolders = "SELECT id, name FROM folders WHERE parent_id = ? AND user_id = ?";
    const subFolders = await db.all(sqlFolders, [folderId, userId]);
    
    for (const subFolder of subFolders) {
        const nestedFiles = await getFilesRecursive(db, subFolder.id, userId, path.join(currentPath, subFolder.name));
        allFiles.push(...nestedFiles);
    }
    return allFiles;
}

export async function getFolderPath(db, folderId, userId) {
    let pathArr = [];
    let currentId = folderId;
    
    while (currentId) {
        const folder = await db.get("SELECT id, name, parent_id FROM folders WHERE id = ? AND user_id = ?", [currentId, userId]);
        if (folder) {
            pathArr.unshift({ id: folder.id, name: folder.name, encrypted_id: encrypt(folder.id) });
            currentId = folder.parent_id;
        } else {
            // 為了保持兼容性，如果找不到父級但 ID 存在，可能需要處理，但通常 loop 會正常結束
            break;
        }
    }
    return pathArr;
}

export async function findFolderBySharePath(db, shareToken, pathSegments = []) {
    const rootFolder = await getFolderByShareToken(db, shareToken);
    if (!rootFolder) return null;

    if (pathSegments.length === 0) return rootFolder;

    let currentParentId = rootFolder.id;
    let currentFolder = rootFolder;
    const userId = rootFolder.user_id;

    for (const segment of pathSegments) {
        const sql = `SELECT * FROM folders WHERE name = ? AND parent_id = ? AND user_id = ?`;
        const row = await db.get(sql, [segment, currentParentId, userId]);

        if (!row || row.password) return null;

        currentFolder = row;
        currentParentId = row.id;
    }
    return currentFolder;
}

export async function createFolder(db, name, parentId, userId) {
    const sql = `INSERT INTO folders (name, parent_id, user_id) VALUES (?, ?, ?)`;
    try {
        const result = await db.run(sql, [name, parentId, userId]);
        return { success: true, id: result.meta.last_row_id };
    } catch (err) {
        // D1/SQLite UNIQUE 約束錯誤處理
        if (err.message && err.message.includes('UNIQUE')) {
            const row = await db.get("SELECT id, is_deleted FROM folders WHERE name = ? AND parent_id = ? AND user_id = ?", [name, parentId, userId]);
            if (row) {
                if (row.is_deleted) {
                    await db.run("UPDATE folders SET is_deleted = 0 WHERE id = ?", [row.id]);
                    return { success: true, id: row.id, restored: true };
                } else {
                    return { success: true, id: row.id, existed: true };
                }
            }
        }
        throw err;
    }
}

export async function findFolderByName(db, name, parentId, userId) {
    const sql = `SELECT id FROM folders WHERE name = ? AND parent_id = ? AND user_id = ?`;
    return await db.get(sql, [name, parentId, userId]);
}

export async function findFolderByPath(db, startFolderId, pathParts, userId) {
    let currentParentId = startFolderId;
    for (const part of pathParts) {
        if (!part) continue;
        const sql = `SELECT id FROM folders WHERE name = ? AND parent_id = ? AND user_id = ? AND is_deleted = 0`;
        const folder = await db.get(sql, [part, currentParentId, userId]);

        if (folder) {
            currentParentId = folder.id;
        } else {
            return null; 
        }
    }
    return currentParentId;
}

export async function getAllFolders(db, userId) {
    const sql = "SELECT id, name, parent_id FROM folders WHERE user_id = ? AND is_deleted = 0 ORDER BY parent_id, name ASC";
    const rows = await db.all(sql, [userId]);
    return rows.map(folder => ({
        ...folder,
        encrypted_id: encrypt(folder.id)
    }));
}

// --- 文件/文件夾移動與重命名 (核心邏輯) ---

export async function moveItem(db, storage, itemId, itemType, targetFolderId, userId, options = {}, depth = 0) {
    const { resolutions = {}, pathPrefix = '' } = options;
    const report = { moved: 0, skipped: 0, errors: 0 };

    const table = itemType === 'folder' ? 'folders' : 'files';
    const idColumn = itemType === 'folder' ? 'id' : 'message_id';
    const nameColumn = itemType === 'folder' ? 'name' : 'fileName';
    const selectId = itemType === 'folder' ? 'id' : `${SAFE_SELECT_ID_AS_TEXT}`;
    
    const sql = `SELECT ${selectId}, ${nameColumn} as name, '${itemType}' as type FROM ${table} WHERE ${idColumn} = ? AND user_id = ?`;
    const sourceItem = await db.get(sql, [itemId.toString(), userId]);

    if (!sourceItem) {
        report.errors++;
        return report;
    }
    
    const sourceItemId = itemType === 'folder' ? parseInt(sourceItem.id, 10) : BigInt(sourceItem.id);
    const currentPath = path.posix.join(pathPrefix, sourceItem.name);
    const existingItemInTarget = await findItemInFolder(db, sourceItem.name, targetFolderId, userId);
    let resolutionAction = resolutions[currentPath] || (existingItemInTarget ? 'skip_default' : 'move');

    switch (resolutionAction) {
        case 'skip':
        case 'skip_default':
            report.skipped++;
            return report;

        case 'rename':
            const newName = await findAvailableName(db, sourceItem.name, targetFolderId, userId, itemType === 'folder');
            if (itemType === 'folder') {
                await renameAndMoveFolder(db, storage, sourceItemId, newName, targetFolderId, userId);
            } else {
                await renameAndMoveFile(db, storage, sourceItemId, newName, targetFolderId, userId);
            }
            report.moved++;
            return report;

        case 'overwrite':
            if (!existingItemInTarget) {
                report.skipped++;
                return report;
            }
            const targetId = existingItemInTarget.type === 'folder' ? parseInt(existingItemInTarget.id, 10) : BigInt(existingItemInTarget.id);
            await unifiedDelete(db, storage, targetId, existingItemInTarget.type, userId);
            await moveItems(db, storage, itemType === 'file' ? [sourceItemId] : [], itemType === 'folder' ? [sourceItemId] : [], targetFolderId, userId);
            report.moved++;
            return report;

        case 'merge':
            if (!existingItemInTarget || existingItemInTarget.type !== 'folder' || itemType !== 'folder') {
                report.skipped++;
                return report;
            }
            const targetFolderIdInt = parseInt(existingItemInTarget.id, 10);
            const { folders: childFolders, files: childFiles } = await getFolderContents(db, sourceItemId, userId);
            let allChildrenProcessedSuccessfully = true;

            for (const childFolder of childFolders) {
                const childReport = await moveItem(db, storage, childFolder.id, 'folder', targetFolderIdInt, userId, { ...options, pathPrefix: currentPath }, depth + 1);
                report.moved += childReport.moved; report.skipped += childReport.skipped; report.errors += childReport.errors;
                if (childReport.skipped > 0 || childReport.errors > 0) allChildrenProcessedSuccessfully = false;
            }
            for (const childFile of childFiles) {
                const childReport = await moveItem(db, storage, BigInt(childFile.id), 'file', targetFolderIdInt, userId, { ...options, pathPrefix: currentPath }, depth + 1);
                report.moved += childReport.moved; report.skipped += childReport.skipped; report.errors += childReport.errors;
                if (childReport.skipped > 0 || childReport.errors > 0) allChildrenProcessedSuccessfully = false;
            }
            
            if (allChildrenProcessedSuccessfully) {
                await unifiedDelete(db, storage, sourceItemId, 'folder', userId);
            }
            return report;

        default: // 'move'
            await moveItems(db, storage, itemType === 'file' ? [sourceItemId] : [], itemType === 'folder' ? [sourceItemId] : [], targetFolderId, userId);
            report.moved++;
            return report;
    }
}

export async function unifiedDelete(db, storage, itemId, itemType, userId, explicitFileIds = null, explicitFolderIds = null) {
    let filesForStorage = [];
    let foldersForStorage = [];
    
    if (explicitFileIds || explicitFolderIds) {
        if (explicitFileIds && explicitFileIds.length > 0) {
             filesForStorage.push(...await getFilesByIds(db, explicitFileIds, userId));
        }
        if (explicitFolderIds && explicitFolderIds.length > 0) {
             for(const fid of explicitFolderIds) {
                 const deletionData = await getFolderDeletionData(db, fid, userId);
                 filesForStorage.push(...deletionData.files);
                 foldersForStorage.push(...deletionData.folders);
             }
        }
    } else {
        if (itemType === 'folder') {
            const deletionData = await getFolderDeletionData(db, itemId, userId);
            filesForStorage.push(...deletionData.files);
            foldersForStorage.push(...deletionData.folders);
        } else {
            filesForStorage.push(...await getFilesByIds(db, [itemId], userId));
        }
    }
    
    // 物理刪除 (如果 storage 對象存在且支持)
    if (storage && storage.remove) {
        try {
            await storage.remove(filesForStorage, foldersForStorage, userId);
        } catch (err) {
            console.error("實體檔案刪除失敗:", err);
        }
    }
    
    // 數據庫刪除
    const fileIdsToDelete = filesForStorage.map(f => BigInt(f.message_id));
    let folderIdsToDelete = foldersForStorage.map(f => f.id);
    
    if (explicitFolderIds) {
        folderIdsToDelete = [...new Set([...folderIdsToDelete, ...explicitFolderIds])];
    } else if (itemType === 'folder') {
        folderIdsToDelete.push(itemId);
    }

    await executeDeletion(db, fileIdsToDelete, folderIdsToDelete, userId);
}

export async function moveItems(db, storage, fileIds = [], folderIds = [], targetFolderId, userId) {
    // 物理移動 (僅 S3/WebDAV 支持)
    if (storage && (storage.type === 'webdav' || storage.type === 's3')) {
        const client = storage.type === 'webdav' ? storage.getClient() : null;
        const targetPathParts = await getFolderPath(db, targetFolderId, userId);
        const targetFullPath = path.posix.join('/', ...targetPathParts.slice(1).map(p => p.name));

        const filesToMove = await getFilesByIds(db, fileIds, userId);
        for (const file of filesToMove) {
            const oldRelativePath = file.file_id;
            const newRelativePath = path.posix.join(targetFullPath, file.fileName);
            
            try {
                if (storage.type === 'webdav' && client) {
                    await client.moveFile(oldRelativePath, newRelativePath);
                }
                // S3 移動通常是 Copy + Delete，由 storage 層封裝，這裡簡化假設 storage 有 moveFile 接口
                // 或者需要在 storage 模塊中實現通用接口。
                
                await db.run('UPDATE files SET file_id = ? WHERE message_id = ?', [newRelativePath, file.message_id.toString()]);
            } catch (err) {
                console.error(`物理移動文件失敗: ${file.fileName}`, err);
                // 繼續執行，不中斷 DB 更新 (視需求而定)
            }
        }
        
        const foldersToMove = (await getItemsByIds(db, folderIds, userId)).filter(i => i.type === 'folder');
        for (const folder of foldersToMove) {
            const oldPathParts = await getFolderPath(db, folder.id, userId);
            const oldFullPath = path.posix.join('/', ...oldPathParts.slice(1).map(p => p.name));
            const newFullPath = path.posix.join(targetFullPath, folder.name);

            try {
                 if (storage.type === 'webdav' && client) {
                    await client.moveFile(oldFullPath, newFullPath);
                 }
                
                // 更新子文件路徑
                const descendantFiles = await getFilesRecursive(db, folder.id, userId);
                for (const file of descendantFiles) {
                    const updatedFileId = file.file_id.replace(oldFullPath, newFullPath);
                    await db.run('UPDATE files SET file_id = ? WHERE message_id = ?', [updatedFileId, file.message_id.toString()]);
                }
            } catch (err) {
                 console.error(`物理移動文件夾失敗: ${folder.name}`, err);
            }
        }
    }

    // 數據庫更新
    if (fileIds.length > 0) {
        const place = fileIds.map(() => '?').join(',');
        await db.run(`UPDATE files SET folder_id = ? WHERE message_id IN (${place}) AND user_id = ?`, [targetFolderId, ...fileIds.map(id => id.toString()), userId]);
    }
    if (folderIds.length > 0) {
        const place = folderIds.map(() => '?').join(',');
        await db.run(`UPDATE folders SET parent_id = ? WHERE id IN (${place}) AND user_id = ?`, [targetFolderId, ...folderIds, userId]);
    }
    return { success: true };
}

export async function deleteSingleFolder(db, folderId, userId) {
    const result = await db.run(`DELETE FROM folders WHERE id = ? AND user_id = ?`, [folderId, userId]);
    return { success: true, changes: result.meta.changes };
}

export async function getFolderDeletionData(db, folderId, userId) {
    let filesToDelete = [];
    let foldersToDeleteIds = [folderId];

    async function findContentsRecursive(currentFolderId) {
        const sqlFiles = `SELECT ${SAFE_SELECT_MESSAGE_ID}, ${ALL_FILE_COLUMNS} FROM files WHERE folder_id = ? AND user_id = ?`;
        const files = await db.all(sqlFiles, [currentFolderId, userId]);
        filesToDelete.push(...files);
        
        const sqlFolders = `SELECT id FROM folders WHERE parent_id = ? AND user_id = ?`;
        const subFolders = await db.all(sqlFolders, [currentFolderId, userId]);
        
        for (const subFolder of subFolders) {
            foldersToDeleteIds.push(subFolder.id);
            await findContentsRecursive(subFolder.id);
        }
    }

    await findContentsRecursive(folderId);

    const allUserFolders = await db.all("SELECT id, name, parent_id FROM folders WHERE user_id = ?", [userId]);
    const folderMap = new Map(allUserFolders.map(f => [f.id, f]));
    
    function buildPath(fId) {
        let pathParts = [];
        let current = folderMap.get(fId);
        if (!current) return null;
        while(current && current.parent_id) {
            pathParts.unshift(current.name);
            current = folderMap.get(current.parent_id);
        }
        return path.posix.join('/', ...pathParts);
    }

    const foldersToDeleteWithPaths = foldersToDeleteIds.map(id => {
        const p = buildPath(id);
        return p ? { id: id, path: p } : null;
    }).filter(item => item !== null);

    return { files: filesToDelete, folders: foldersToDeleteWithPaths };
}

export async function executeDeletion(db, fileIds, folderIds, userId) {
    if (fileIds.length === 0 && folderIds.length === 0) return { success: true };
    
    // D1 暫時使用順序執行模擬事務
    if (fileIds.length > 0) {
        const stringFileIds = Array.from(new Set(fileIds)).map(id => id.toString());
        const place = stringFileIds.map(() => '?').join(',');
        await db.run(`DELETE FROM files WHERE message_id IN (${place}) AND user_id = ?`, [...stringFileIds, userId]);
    }
    if (folderIds.length > 0) {
        const place = Array.from(new Set(folderIds)).map(() => '?').join(',');
        await db.run(`DELETE FROM folders WHERE id IN (${place}) AND user_id = ?`, [...new Set(folderIds), userId]);
    }
    return { success: true };
}

export async function addFile(db, fileData, folderId = 1, userId, storageType) {
    const { message_id, fileName, mimetype, file_id, thumb_file_id, date, size } = fileData;
    const sql = `INSERT INTO files (message_id, fileName, mimetype, file_id, thumb_file_id, date, size, folder_id, user_id, storage_type)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const result = await db.run(sql, [message_id.toString(), fileName, mimetype, file_id, thumb_file_id, date, size, folderId, userId, storageType]);
    return { success: true, id: result.meta.last_row_id, fileId: message_id };
}

export async function updateFile(db, fileId, updates, userId) {
    const fields = [];
    const values = [];
    const validKeys = ['fileName', 'mimetype', 'file_id', 'thumb_file_id', 'size', 'date', 'message_id'];

    for (const key in updates) {
        if (Object.hasOwnProperty.call(updates, key) && validKeys.includes(key)) {
            fields.push(`${key} = ?`);
            values.push(key === 'message_id' ? updates[key].toString() : updates[key]);
        }
    }
    if (fields.length === 0) return { success: true, changes: 0 };
    
    values.push(fileId.toString(), userId);
    const sql = `UPDATE files SET ${fields.join(', ')} WHERE message_id = ? AND user_id = ?`;
    const result = await db.run(sql, values);
    return { success: true, changes: result.meta.changes };
}

export async function getFilesByIds(db, messageIds, userId) {
    if (!messageIds || messageIds.length === 0) return [];
    const stringMessageIds = messageIds.map(id => id.toString());
    const placeholders = stringMessageIds.map(() => '?').join(',');
    const sql = `SELECT ${SAFE_SELECT_MESSAGE_ID}, ${ALL_FILE_COLUMNS} FROM files WHERE message_id IN (${placeholders}) AND user_id = ?`;
    return await db.all(sql, [...stringMessageIds, userId]);
}

export async function getFileByShareToken(db, token) {
    const getShareSql = `SELECT ${SAFE_SELECT_MESSAGE_ID}, ${ALL_FILE_COLUMNS}, share_password, share_expires_at FROM files WHERE share_token = ?`;
    const row = await db.get(getShareSql, [token]);
    if (!row) return null;
    if (row.share_expires_at && Date.now() > row.share_expires_at) return null;
    return row;
}

export async function getFolderByShareToken(db, token) {
    const getShareSql = "SELECT *, password as share_password FROM folders WHERE share_token = ?";
    const row = await db.get(getShareSql, [token]);
    if (!row) return null;
    if (row.share_expires_at && Date.now() > row.share_expires_at) return null;
    return row;
}

export async function findFileInSharedFolder(db, fileId, folderToken) {
    const sql = `
        WITH RECURSIVE shared_folder_tree(id) AS (
            SELECT id FROM folders WHERE share_token = ? AND password IS NULL
            UNION ALL
            SELECT f.id FROM folders f
            JOIN shared_folder_tree sft ON f.parent_id = sft.id
            WHERE f.password IS NULL
        )
        SELECT ${SAFE_SELECT_MESSAGE_ID}, ${ALL_FILE_COLUMNS} FROM files f
        WHERE f.message_id = ? AND f.folder_id IN (SELECT id FROM shared_folder_tree);
    `;
    return await db.get(sql, [folderToken, fileId.toString()]);
}

export async function renameFile(db, storage, messageId, newFileName, userId) {
    const files = await getFilesByIds(db, [messageId], userId);
    const file = files[0];
    if (!file) return { success: false, message: '文件未找到。' };

    // 物理重命名 (WebDAV/S3)
    if (storage && (storage.type === 'webdav' || storage.type === 's3')) {
        const oldRelativePath = file.file_id;
        const newRelativePath = path.posix.join(path.posix.dirname(oldRelativePath), newFileName);

        try {
            if (storage.type === 'webdav') {
                const client = storage.getClient();
                await client.moveFile(oldRelativePath, newRelativePath);
            }
            // S3: 需在 Storage 層實現 rename/move
            
            const sql = `UPDATE files SET fileName = ?, file_id = ? WHERE message_id = ? AND user_id = ?`;
            await db.run(sql, [newFileName, newRelativePath, messageId.toString(), userId]);
            return { success: true };
        } catch(err) {
            throw new Error(`實體檔案重命名失敗: ${err.message}`);
        }
    }

    const sql = `UPDATE files SET fileName = ? WHERE message_id = ? AND user_id = ?`;
    const result = await db.run(sql, [newFileName, messageId.toString(), userId]);
    if (result.meta.changes === 0) return { success: false, message: '文件未找到。' };
    return { success: true };
}

export async function renameAndMoveFile(db, storage, messageId, newFileName, targetFolderId, userId) {
    const files = await getFilesByIds(db, [messageId], userId);
    const file = files[0];
    if (!file) throw new Error('File not found');

    if (storage && (storage.type === 'webdav' || storage.type === 's3')) {
        const targetPathParts = await getFolderPath(db, targetFolderId, userId);
        const targetRelativePath = path.posix.join('/', ...targetPathParts.slice(1).map(p => p.name));
        const newRelativePath = path.posix.join(targetRelativePath, newFileName);
        const oldRelativePath = file.file_id;
        
        try {
            if (storage.type === 'webdav') {
                const client = storage.getClient();
                await client.moveFile(oldRelativePath, newRelativePath);
            }
            const sql = `UPDATE files SET fileName = ?, file_id = ?, folder_id = ? WHERE message_id = ? AND user_id = ?`;
            await db.run(sql, [newFileName, newRelativePath, targetFolderId, messageId.toString(), userId]);
            return { success: true };
        } catch(err) {
            throw new Error(`實體檔案移動失敗: ${err.message}`);
        }
    }

    const sql = `UPDATE files SET fileName = ?, folder_id = ? WHERE message_id = ? AND user_id = ?`;
    await db.run(sql, [newFileName, targetFolderId, messageId.toString(), userId]);
    return { success: true };
}

export async function renameFolder(db, storage, folderId, newFolderName, userId) {
    const folder = await db.get("SELECT * FROM folders WHERE id=? AND user_id=?", [folderId, userId]);
    if (!folder) return { success: false, message: '資料夾未找到。'};
    
    if (storage && (storage.type === 'webdav' || storage.type === 's3')) {
        const oldPathParts = await getFolderPath(db, folderId, userId);
        const oldFullPath = path.posix.join('/', ...oldPathParts.slice(1).map(p => p.name));
        const newFullPath = path.posix.join(path.posix.dirname(oldFullPath), newFolderName);

        try {
            if (storage.type === 'webdav') {
                const client = storage.getClient();
                await client.moveFile(oldFullPath, newFullPath);
            }
            
            const descendantFiles = await getFilesRecursive(db, folderId, userId);
            for (const file of descendantFiles) {
                const updatedFileId = file.file_id.replace(oldFullPath, newFullPath);
                await db.run('UPDATE files SET file_id = ? WHERE message_id = ?', [updatedFileId, file.message_id.toString()]);
            }
        } catch(e) {
            throw new Error(`實體資料夾重命名失敗: ${e.message}`);
        }
    }

    const sql = `UPDATE folders SET name = ? WHERE id = ? AND user_id = ?`;
    const result = await db.run(sql, [newFolderName, folderId, userId]);
    if (result.meta.changes === 0) return { success: false, message: '資料夾未找到。' };
    return { success: true };
}

export async function renameAndMoveFolder(db, storage, folderId, newName, targetFolderId, userId) {
    const folder = await db.get("SELECT * FROM folders WHERE id=? AND user_id=?", [folderId, userId]);
    if (!folder) throw new Error('Folder not found');

    if (storage && (storage.type === 'webdav' || storage.type === 's3')) {
        const oldPathParts = await getFolderPath(db, folderId, userId);
        const oldFullPath = path.posix.join('/', ...oldPathParts.slice(1).map(p => p.name));

        const targetPathParts = await getFolderPath(db, targetFolderId, userId);
        const targetBasePath = path.posix.join('/', ...targetPathParts.slice(1).map(p => p.name));
        const newFullPath = path.posix.join(targetBasePath, newName);

        try {
            if (storage.type === 'webdav') {
                const client = storage.getClient();
                await client.moveFile(oldFullPath, newFullPath);
            }

            const descendantFiles = await getFilesRecursive(db, folderId, userId);
            for (const file of descendantFiles) {
                const updatedFileId = file.file_id.replace(oldFullPath, newFullPath);
                await db.run('UPDATE files SET file_id = ? WHERE message_id = ?', [updatedFileId, file.message_id.toString()]);
            }
        } catch(err) {
            throw new Error(`實體資料夾移動失敗: ${err.message}`);
        }
    }

    const sql = `UPDATE folders SET name = ?, parent_id = ? WHERE id = ? AND user_id = ?`;
    await db.run(sql, [newName, targetFolderId, folderId, userId]);
    return { success: true };
}

export async function setFolderPassword(db, folderId, password, userId) {
    const sql = `UPDATE folders SET password = ? WHERE id = ? AND user_id = ?`;
    const result = await db.run(sql, [password, folderId, userId]);
    if (result.meta.changes === 0) throw new Error('Folder not found');
    return { success: true };
}

export async function verifyFolderPassword(db, folderId, password, userId) {
    const folder = await getFolderDetails(db, folderId, userId);
    if (!folder || !folder.password) throw new Error('Folder is not locked');
    return await bcrypt.compare(password, folder.password);
}

export async function createShareLink(db, itemId, itemType, expiresIn, userId, password = null, customExpiresAt = null) {
    // Workers 中可以使用 crypto.getRandomValues 或 Web Crypto API，這裡假設有 polyfill 或 node:crypto
    // 簡單的隨機 Token 生成
    const tokenArray = new Uint8Array(4);
    crypto.getRandomValues(tokenArray);
    const token = Array.from(tokenArray).map(b => b.toString(16).padStart(2, '0')).join('');

    let expiresAt = null;
    if (expiresIn === 'custom' && customExpiresAt) {
        expiresAt = parseInt(customExpiresAt, 10);
    } else {
        const now = Date.now();
        const hours = (h) => h * 60 * 60 * 1000;
        const days = (d) => d * 24 * hours(1);
        switch (expiresIn) {
            case '1h': expiresAt = now + hours(1); break;
            case '3h': expiresAt = now + hours(3); break;
            case '24h': expiresAt = now + hours(24); break;
            case '7d': expiresAt = now + days(7); break;
            case '0': expiresAt = null; break;
            default: expiresAt = now + hours(24);
        }
    }

    const table = itemType === 'folder' ? 'folders' : 'files';
    const idColumn = itemType === 'folder' ? 'id' : 'message_id';
    let hashedPassword = null;
    if (password && password.length > 0) {
        const salt = await bcrypt.genSalt(10);
        hashedPassword = await bcrypt.hash(password, salt);
    }

    const sql = `UPDATE ${table} SET share_token = ?, share_expires_at = ?, share_password = ? WHERE ${idColumn} = ? AND user_id = ?`;
    const stringItemId = itemType === 'folder' ? itemId : itemId.toString();
    const result = await db.run(sql, [token, expiresAt, hashedPassword, stringItemId, userId]);
    
    if (result.meta.changes === 0) return { success: false, message: '項目未找到。' };
    return { success: true, token };
}

export async function deleteFilesByIds(db, messageIds, userId) {
    if (!messageIds || messageIds.length === 0) return { success: true, changes: 0 };
    const stringMessageIds = messageIds.map(id => id.toString());
    const placeholders = stringMessageIds.map(() => '?').join(',');
    const sql = `DELETE FROM files WHERE message_id IN (${placeholders}) AND user_id = ?`;
    const result = await db.run(sql, [...stringMessageIds, userId]);
    return { success: true, changes: result.meta.changes };
}

export async function getActiveShares(db, userId) {
    const now = Date.now();
    const sqlFiles = `SELECT ${SAFE_SELECT_ID_AS_TEXT}, fileName as name, 'file' as type, share_token, share_expires_at FROM files WHERE share_token IS NOT NULL AND (share_expires_at IS NULL OR share_expires_at > ?) AND user_id = ?`;
    const sqlFolders = `SELECT id, name, 'folder' as type, share_token, share_expires_at FROM folders WHERE share_token IS NOT NULL AND (share_expires_at IS NULL OR share_expires_at > ?) AND user_id = ?`;

    const files = await db.all(sqlFiles, [now, userId]);
    const folders = await db.all(sqlFolders, [now, userId]);
    return [...files, ...folders];
}

export async function cancelShare(db, itemId, itemType, userId) {
    const table = itemType === 'folder' ? 'folders' : 'files';
    const idColumn = itemType === 'folder' ? 'id' : 'message_id';
    const sql = `UPDATE ${table} SET share_token = NULL, share_expires_at = NULL, share_password = NULL WHERE ${idColumn} = ? AND user_id = ?`;
    const stringItemId = itemType === 'folder' ? itemId : itemId.toString();
    const result = await db.run(sql, [stringItemId, userId]);
    if (result.meta.changes === 0) return { success: false, message: '項目未找到' };
    return { success: true };
}

export async function getConflictingItems(db, itemsToMove, destinationFolderId, userId) {
    const fileConflicts = new Set();
    const folderConflicts = new Set();
    const destContents = await getChildrenOfFolder(db, destinationFolderId, userId);
    const destMap = new Map(destContents.map(item => [item.name, item.type]));

    for (const item of itemsToMove) {
        const destType = destMap.get(item.name);
        if (destType) {
            if (item.type === 'folder' && destType === 'folder') {
                folderConflicts.add(item.name);
            } else {
                fileConflicts.add(item.name);
            }
        }
    }
    return { fileConflicts: Array.from(fileConflicts), folderConflicts: Array.from(folderConflicts) };
}

export async function checkFullConflict(db, name, folderId, userId) {
    const sql = `
        SELECT name FROM (
            SELECT name FROM folders WHERE name = ? AND parent_id = ? AND user_id = ? AND is_deleted = 0
            UNION ALL
            SELECT fileName as name FROM files WHERE fileName = ? AND folder_id = ? AND user_id = ? AND is_deleted = 0
        ) LIMIT 1
    `;
    const row = await db.get(sql, [name, folderId, userId, name, folderId, userId]);
    return !!row;
}

export async function findFileInFolder(db, fileName, folderId, userId) {
    const sql = `SELECT ${SAFE_SELECT_MESSAGE_ID} FROM files WHERE fileName = ? AND folder_id = ? AND user_id = ? AND is_deleted = 0`;
    return await db.get(sql, [fileName, folderId, userId]);
}

export async function findItemInFolder(db, name, folderId, userId) {
    const sql = `
        SELECT id, name, 'folder' as type FROM folders WHERE name = ? AND parent_id = ? AND user_id = ? AND is_deleted = 0
        UNION ALL
        SELECT ${SAFE_SELECT_ID_AS_TEXT}, fileName as name, 'file' as type FROM files WHERE fileName = ? AND folder_id = ? AND user_id = ? AND is_deleted = 0
    `;
    return await db.get(sql, [name, folderId, userId, name, folderId, userId]);
}

export async function findAvailableName(db, originalName, folderId, userId, isFolder) {
    let newName = originalName;
    let counter = 1;
    const nameWithoutExt = isFolder ? originalName : path.parse(originalName).name;
    const ext = isFolder ? '' : path.parse(originalName).ext;

    while (await findItemInFolder(db, newName, folderId, userId)) {
        newName = `${nameWithoutExt} (${counter})${ext}`;
        counter++;
    }
    return newName;
}

export async function findFileByFileId(db, fileId, userId) {
    const sql = `SELECT ${SAFE_SELECT_MESSAGE_ID} FROM files WHERE file_id = ? AND user_id = ?`;
    return await db.get(sql, [fileId, userId]);
}

export async function getRootFolder(db, userId) {
    return await db.get("SELECT id FROM folders WHERE user_id = ? AND parent_id IS NULL", [userId]);
}

export async function findOrCreateFolderByPath(db, fullPath, userId) {
    if (!fullPath || fullPath === '/') {
        const root = await getRootFolder(db, userId);
        return root.id;
    }
    const pathParts = fullPath.split('/').filter(p => p);
    let parentId = (await getRootFolder(db, userId)).id;

    for (const part of pathParts) {
        let folder = await findFolderByName(db, part, parentId, userId);
        if (folder) {
            parentId = folder.id;
        } else {
            const result = await createFolder(db, part, parentId, userId);
            parentId = result.id;
        }
    }
    return parentId;
}

export async function resolvePathToFolderId(db, startFolderId, pathParts, userId) {
    let currentParentId = startFolderId;

    for (const part of pathParts) {
        if (!part) continue;
        const lockId = `${userId}-${currentParentId}-${part}`;
        // 簡單的自旋鎖，防止並發創建
        while (creatingFolders.has(lockId)) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        creatingFolders.add(lockId);
        try {
            const row = await db.get("SELECT id, is_deleted FROM folders WHERE name = ? AND parent_id = ? AND user_id = ?", [part, currentParentId, userId]);
            if (row) {
                if (row.is_deleted) {
                    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
                    const newName = `${part}_deleted_${timestamp}`;
                    await renameFolder(db, null, row.id, newName, userId); // 不傳 storage 避免物理移動
                    const newFolder = await createFolder(db, part, currentParentId, userId);
                    currentParentId = newFolder.id;
                } else {
                    currentParentId = row.id;
                }
            } else {
                const newFolder = await createFolder(db, part, currentParentId, userId);
                currentParentId = newFolder.id;
            }
        } finally {
            creatingFolders.delete(lockId);
        }
    }
    return currentParentId;
}

export async function createAuthToken(db, userId, token, expiresAt) {
    const sql = `INSERT INTO auth_tokens (user_id, token, expires_at) VALUES (?, ?, ?)`;
    const result = await db.run(sql, [userId, token, expiresAt]);
    return { id: result.meta.last_row_id };
}

export async function findAuthToken(db, token) {
    const sql = `SELECT t.id, t.user_id, t.expires_at, u.username, u.is_admin 
                 FROM auth_tokens t
                 JOIN users u ON t.user_id = u.id
                 WHERE t.token = ?`;
    return await db.get(sql, [token]);
}

export async function deleteAuthToken(db, token) {
    const result = await db.run(`DELETE FROM auth_tokens WHERE token = ?`, [token]);
    return { changes: result.meta.changes };
}

export async function deleteExpiredAuthTokens(db) {
    const now = Date.now();
    const result = await db.run(`DELETE FROM auth_tokens WHERE expires_at <= ?`, [now]);
    return { changes: result.meta.changes };
}

export async function getTrashContents(db, userId) {
    const sqlFolders = `SELECT id, name, deleted_at, 'folder' as type FROM folders WHERE user_id = ? AND is_deleted = 1 ORDER BY deleted_at DESC`;
    const sqlFiles = `SELECT ${SAFE_SELECT_MESSAGE_ID}, ${SAFE_SELECT_ID_AS_TEXT}, fileName as name, size, deleted_at, 'file' as type FROM files WHERE user_id = ? AND is_deleted = 1 ORDER BY deleted_at DESC`;

    const folders = await db.all(sqlFolders, [userId]);
    const files = await db.all(sqlFiles, [userId]);

    return {
        folders: folders.map(f => ({ ...f, encrypted_id: encrypt(f.id) })),
        files: files
    };
}

export async function softDeleteItems(db, fileIds = [], folderIds = [], userId) {
    const now = Date.now();
    // 順序執行模擬事務
    if (fileIds.length > 0) {
        const stringFileIds = fileIds.map(id => id.toString());
        const place = stringFileIds.map(() => '?').join(',');
        await db.run(`UPDATE files SET is_deleted = 1, deleted_at = ? WHERE message_id IN (${place}) AND user_id = ?`, [now, ...stringFileIds, userId]);
    }
    if (folderIds.length > 0) {
        const place = folderIds.map(() => '?').join(',');
        await db.run(`UPDATE folders SET is_deleted = 1, deleted_at = ? WHERE id IN (${place}) AND user_id = ?`, [now, ...folderIds, userId]);
    }
    return { success: true };
}

export async function restoreItems(db, fileIds = [], folderIds = [], userId) {
    if (fileIds.length > 0) {
        const stringFileIds = fileIds.map(id => id.toString());
        const place = stringFileIds.map(() => '?').join(',');
        await db.run(`UPDATE files SET is_deleted = 0, deleted_at = NULL WHERE message_id IN (${place}) AND user_id = ?`, [...stringFileIds, userId]);
    }
    if (folderIds.length > 0) {
        const place = folderIds.map(() => '?').join(',');
        await db.run(`UPDATE folders SET is_deleted = 0, deleted_at = NULL WHERE id IN (${place}) AND user_id = ?`, [...folderIds, userId]);
    }
    return { success: true };
}

export async function cleanupTrash(db, storage, retentionDays = 30) {
    const cutoffDate = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    
    const expiredFilesSql = `SELECT ${SAFE_SELECT_MESSAGE_ID}, user_id FROM files WHERE is_deleted = 1 AND deleted_at < ?`;
    const expiredFoldersSql = `SELECT id, user_id FROM folders WHERE is_deleted = 1 AND deleted_at < ?`;

    const files = await db.all(expiredFilesSql, [cutoffDate]);
    const folders = await db.all(expiredFoldersSql, [cutoffDate]);
    
    const itemsByUser = {};
    files.forEach(f => {
        if(!itemsByUser[f.user_id]) itemsByUser[f.user_id] = { files: [], folders: [] };
        itemsByUser[f.user_id].files.push(BigInt(f.message_id));
    });
    folders.forEach(f => {
        if(!itemsByUser[f.user_id]) itemsByUser[f.user_id] = { files: [], folders: [] };
        itemsByUser[f.user_id].folders.push(f.id);
    });
    
    for (const userId in itemsByUser) {
        const { files, folders } = itemsByUser[userId];
        if (files.length > 0 || folders.length > 0) {
            await unifiedDelete(db, storage, null, null, parseInt(userId), files, folders);
        }
    }
    return { filesCount: files.length, foldersCount: folders.length };
}

export async function processTrashConflict(db, storage, fileName, folderId, userId) {
    const row = await db.get(`SELECT ${SAFE_SELECT_MESSAGE_ID}, fileName FROM files WHERE fileName = ? AND folder_id = ? AND user_id = ? AND is_deleted = 1`, [fileName, folderId, userId]);
    if (row) {
        const ext = path.extname(fileName);
        const nameBody = path.basename(fileName, ext);
        const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
        const newName = `${nameBody}_deleted_${timestamp}${ext}`;
        await renameFile(db, storage, BigInt(row.message_id), newName, userId);
        return true;
    }
    return false;
}

export async function getFolderDetails(db, folderId, userId) {
    const sql = `SELECT id, name, parent_id, password, password IS NOT NULL as is_locked, is_deleted FROM folders WHERE id = ? AND user_id = ?`;
    return await db.get(sql, [folderId, userId]);
}

export async function getFolderContents(db, folderId, userId) {
    const sqlFolders = `SELECT id, name, parent_id, 'folder' as type, password IS NOT NULL as is_locked FROM folders WHERE parent_id = ? AND user_id = ? AND is_deleted = 0 ORDER BY name ASC`;
    const sqlFiles = `SELECT ${SAFE_SELECT_MESSAGE_ID}, ${ALL_FILE_COLUMNS}, ${SAFE_SELECT_ID_AS_TEXT}, fileName as name, 'file' as type FROM files WHERE folder_id = ? AND user_id = ? AND is_deleted = 0 ORDER BY name ASC`;
    
    const folders = await db.all(sqlFolders, [folderId, userId]);
    const files = await db.all(sqlFiles, [folderId, userId]);

    return {
        folders: folders.map(f => ({ ...f, encrypted_id: encrypt(f.id) })),
        files: files
    };
}
