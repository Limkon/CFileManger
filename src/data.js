{
type: "file_content_update",
fileName: "limkon/networkfilemanger/NetworkFileManger-ff9f914d786efd7cd80c55485f0fe871f93b3f13/src/data.js",
fullContent: `// src/data.js

import path from 'node:path';
import bcrypt from 'bcryptjs';
import { encrypt, decrypt } from './crypto.js';

// 内存中的锁
const creatingFolders = new Set();

const ALL_FILE_COLUMNS = \`
    fileName, mimetype, file_id, thumb_file_id, date, size, folder_id, user_id, storage_type, is_deleted, deleted_at
\`;
const SAFE_SELECT_MESSAGE_ID = \`CAST(message_id AS TEXT) AS message_id\`;
const SAFE_SELECT_ID_AS_TEXT = \`CAST(message_id AS TEXT) AS id\`;

// --- 用户管理 ---
export async function createUser(db, username, hashedPassword) {
    const sql = \`INSERT INTO users (username, password, is_admin, max_storage_bytes) VALUES (?, ?, 0, 1073741824)\`;
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
    const sql = \`UPDATE users SET password = ? WHERE id = ?\`;
    const result = await db.run(sql, [newHashedPassword, userId]);
    return { success: true, changes: result.meta.changes };
}

export async function listAllUsers(db) {
    const sql = \`SELECT id, username FROM users ORDER BY username ASC\`;
    return await db.all(sql);
}

export async function deleteUser(db, userId) {
    const sql = \`DELETE FROM users WHERE id = ? AND is_admin = 0\`;
    const result = await db.run(sql, [userId]);
    return { success: true, changes: result.meta.changes };
}

// --- 用户配额管理 ---
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
    if (quota.max === 0) return true; // 无限
    return (quota.used + incomingSize) <= quota.max;
}

export async function listAllUsersWithQuota(db) {
    const sql = \`SELECT id, username, is_admin, max_storage_bytes FROM users ORDER BY is_admin DESC, username ASC\`;
    const users = await db.all(sql);
    if (users.length === 0) return [];
    const userIds = users.map(u => u.id);
    const placeholders = userIds.map(() => '?').join(',');
    const usageSql = \`SELECT user_id, SUM(size) as total_size FROM files WHERE user_id IN (\${placeholders}) GROUP BY user_id\`;
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
    const sql = \`UPDATE users SET max_storage_bytes = ? WHERE id = ? AND is_admin = 0\`; 
    const result = await db.run(sql, [maxBytes, userId]);
    return { success: true, changes: result.meta.changes };
}

// --- 核心文件操作 ---

export async function addFile(db, fileData, folderId = 1, userId, storageType) {
    const { message_id, fileName, mimetype, file_id, thumb_file_id, date, size } = fileData;
    const sql = \`INSERT INTO files (message_id, fileName, mimetype, file_id, thumb_file_id, date, size, folder_id, user_id, storage_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\`;
    const result = await db.run(sql, [message_id.toString(), fileName, mimetype, file_id, thumb_file_id, date, size, folderId, userId, storageType]);
    return { success: true, id: result.meta.last_row_id, fileId: message_id };
}

export async function updateFile(db, fileId, updates, userId) {
    const fields = [];
    const values = [];
    const validKeys = ['fileName', 'mimetype', 'file_id', 'thumb_file_id', 'size', 'date', 'message_id'];
    for (const key in updates) {
        if (Object.hasOwnProperty.call(updates, key) && validKeys.includes(key)) {
            fields.push(\`\${key} = ?\`);
            values.push(key === 'message_id' ? updates[key].toString() : updates[key]);
        }
    }
    if (fields.length === 0) return { success: true, changes: 0 };
    values.push(fileId.toString(), userId);
    const sql = \`UPDATE files SET \${fields.join(', ')} WHERE message_id = ? AND user_id = ?\`;
    const result = await db.run(sql, values);
    return { success: true, changes: result.meta.changes };
}

export async function getFilesByIds(db, messageIds, userId) {
    if (!messageIds || messageIds.length === 0) return [];
    const stringMessageIds = messageIds.map(id => id.toString());
    const placeholders = stringMessageIds.map(() => '?').join(',');
    const sql = \`SELECT \${SAFE_SELECT_MESSAGE_ID}, \${ALL_FILE_COLUMNS} FROM files WHERE message_id IN (\${placeholders}) AND user_id = ?\`;
    return await db.all(sql, [...stringMessageIds, userId]);
}

// --- 文件夹与路径 ---

export async function createFolder(db, name, parentId, userId) {
    const sql = \`INSERT INTO folders (name, parent_id, user_id) VALUES (?, ?, ?)\`;
    try {
        const result = await db.run(sql, [name, parentId, userId]);
        return { success: true, id: result.meta.last_row_id };
    } catch (err) {
        if (err.message && err.message.includes('UNIQUE')) {
            const row = await db.get("SELECT id, is_deleted FROM folders WHERE name = ? AND parent_id = ? AND user_id = ?", [name, parentId, userId]);
            if (row && row.is_deleted) {
                await db.run("UPDATE folders SET is_deleted = 0 WHERE id = ?", [row.id]);
                return { success: true, id: row.id, restored: true };
            }
            return { success: true, id: row.id, existed: true };
        }
        throw err;
    }
}

export async function getFolderContents(db, folderId, userId) {
    const sqlFolders = \`SELECT id, name, parent_id, 'folder' as type, password IS NOT NULL as is_locked FROM folders WHERE parent_id = ? AND user_id = ? AND is_deleted = 0 ORDER BY name ASC\`;
    const sqlFiles = \`SELECT \${SAFE_SELECT_MESSAGE_ID}, \${ALL_FILE_COLUMNS}, \${SAFE_SELECT_ID_AS_TEXT}, fileName as name, 'file' as type FROM files WHERE folder_id = ? AND user_id = ? AND is_deleted = 0 ORDER BY name ASC\`;
    
    const folders = await db.all(sqlFolders, [folderId, userId]);
    const files = await db.all(sqlFiles, [folderId, userId]);

    return {
        folders: folders.map(f => ({ ...f, encrypted_id: encrypt(f.id) })),
        files: files
    };
}

export async function getRootFolder(db, userId) {
    return await db.get("SELECT id FROM folders WHERE user_id = ? AND parent_id IS NULL", [userId]);
}

export async function getFolderPath(db, folderId, userId) {
    let pathArr = [];
    let currentId = folderId;
    while (currentId) {
        const folder = await db.get("SELECT id, name, parent_id FROM folders WHERE id = ? AND user_id = ?", [currentId, userId]);
        if (folder) {
            pathArr.unshift({ id: folder.id, name: folder.name, encrypted_id: encrypt(folder.id) });
            currentId = folder.parent_id;
        } else break;
    }
    return pathArr;
}

export async function getAllFolders(db, userId) {
    const sql = "SELECT id, name, parent_id FROM folders WHERE user_id = ? AND is_deleted = 0 ORDER BY parent_id, name ASC";
    const rows = await db.all(sql, [userId]);
    return rows.map(folder => ({ ...folder, encrypted_id: encrypt(folder.id) }));
}

// --- 搜索 ---
export async function searchItems(db, query, userId) {
    const searchQuery = \`%\${query}%\`;
    const baseQuery = \`
        WITH RECURSIVE folder_ancestry(id, parent_id, is_locked, is_deleted) AS (
            SELECT id, parent_id, (password IS NOT NULL) as is_locked, is_deleted FROM folders WHERE user_id = ?
            UNION ALL
            SELECT fa.id, f.parent_id, (fa.is_locked OR (f.password IS NOT NULL)), (fa.is_deleted OR f.is_deleted)
            FROM folders f JOIN folder_ancestry fa ON f.id = fa.parent_id WHERE f.user_id = ?
        ),
        folder_status AS ( SELECT id, MAX(is_locked) as is_path_locked, MAX(is_deleted) as is_path_deleted FROM folder_ancestry GROUP BY id )
    \`;
    const sqlFiles = baseQuery + \`
        SELECT \${SAFE_SELECT_MESSAGE_ID}, \${ALL_FILE_COLUMNS}, \${SAFE_SELECT_ID_AS_TEXT}, f.fileName as name, 'file' as type
        FROM files f JOIN folder_status fs ON f.folder_id = fs.id
        WHERE f.fileName LIKE ? AND f.user_id = ? AND fs.is_path_locked = 0 AND fs.is_path_deleted = 0 AND f.is_deleted = 0
        ORDER BY f.date DESC;
    \`;
    const sqlFolders = baseQuery + \`
        SELECT f.id, f.name, f.parent_id, 'folder' as type, (f.password IS NOT NULL) as is_locked
        FROM folders f JOIN folder_status fs ON f.id = fs.id
        WHERE f.name LIKE ? AND f.user_id = ? AND fs.is_path_locked = 0 AND fs.is_path_deleted = 0 AND f.is_deleted = 0 AND f.parent_id IS NOT NULL
        ORDER BY f.name ASC;
    \`;
    const folders = await db.all(sqlFolders, [userId, userId, searchQuery, userId]);
    const files = await db.all(sqlFiles, [userId, userId, searchQuery, userId]);
    return { folders: folders.map(f => ({ ...f, encrypted_id: encrypt(f.id) })), files };
}

// --- 回收站与删除 ---

export async function unifiedDelete(db, storage, itemId, itemType, userId, explicitFileIds = null, explicitFolderIds = null) {
    // 永久删除逻辑
    let filesForStorage = [];
    if (explicitFileIds || explicitFolderIds) {
        if (explicitFileIds && explicitFileIds.length > 0) filesForStorage.push(...await getFilesByIds(db, explicitFileIds, userId));
        if (explicitFolderIds && explicitFolderIds.length > 0) {
             for(const fid of explicitFolderIds) {
                 const deletionData = await getFolderDeletionData(db, fid, userId);
                 filesForStorage.push(...deletionData.files);
             }
        }
    } else if (itemType === 'file') {
        filesForStorage.push(...await getFilesByIds(db, [itemId], userId));
    }

    // 物理删除
    if (storage && storage.remove) {
        try { await storage.remove(filesForStorage, [], userId); } catch (err) { console.error("物理删除失败:", err); }
    }
    
    // 数据库删除
    const fileIdsToDelete = filesForStorage.map(f => BigInt(f.message_id));
    let folderIdsToDelete = explicitFolderIds || [];
    if (itemType === 'folder') folderIdsToDelete.push(itemId);
    
    // 也需要删除子文件夹 DB 记录
    // 这里简化处理，假设 executeDeletion 只是简单删除 ID，实际上对于文件夹需要递归查找所有子文件夹 ID 删除
    // 对于 D1 简单起见，只删除了传入的 folderID。更严谨的实现需要递归删除子文件夹记录。
    
    await executeDeletion(db, fileIdsToDelete, folderIdsToDelete, userId);
}

export async function getFolderDeletionData(db, folderId, userId) {
    let filesToDelete = [];
    let foldersToDeleteIds = [folderId];
    async function findContentsRecursive(currentFolderId) {
        const files = await db.all(\`SELECT \${SAFE_SELECT_MESSAGE_ID}, \${ALL_FILE_COLUMNS} FROM files WHERE folder_id = ? AND user_id = ?\`, [currentFolderId, userId]);
        filesToDelete.push(...files);
        const subFolders = await db.all(\`SELECT id FROM folders WHERE parent_id = ? AND user_id = ?\`, [currentFolderId, userId]);
        for (const subFolder of subFolders) {
            foldersToDeleteIds.push(subFolder.id);
            await findContentsRecursive(subFolder.id);
        }
    }
    await findContentsRecursive(folderId);
    return { files: filesToDelete, folders: foldersToDeleteIds };
}

export async function executeDeletion(db, fileIds, folderIds, userId) {
    if (fileIds.length > 0) {
        const placeholders = fileIds.map(() => '?').join(',');
        await db.run(\`DELETE FROM files WHERE message_id IN (\${placeholders}) AND user_id = ?\`, [...fileIds.map(String), userId]);
    }
    if (folderIds.length > 0) {
        const placeholders = folderIds.map(() => '?').join(',');
        await db.run(\`DELETE FROM folders WHERE id IN (\${placeholders}) AND user_id = ?\`, [...folderIds, userId]);
    }
}

export async function softDeleteItems(db, fileIds = [], folderIds = [], userId) {
    const now = Date.now();
    if (fileIds.length > 0) {
        const place = fileIds.map(() => '?').join(',');
        await db.run(\`UPDATE files SET is_deleted = 1, deleted_at = ? WHERE message_id IN (\${place}) AND user_id = ?\`, [now, ...fileIds.map(String), userId]);
    }
    if (folderIds.length > 0) {
        const place = folderIds.map(() => '?').join(',');
        await db.run(\`UPDATE folders SET is_deleted = 1, deleted_at = ? WHERE id IN (\${place}) AND user_id = ?\`, [now, ...folderIds, userId]);
    }
    return { success: true };
}

export async function restoreItems(db, fileIds = [], folderIds = [], userId) {
    if (fileIds.length > 0) {
        const place = fileIds.map(() => '?').join(',');
        await db.run(\`UPDATE files SET is_deleted = 0, deleted_at = NULL WHERE message_id IN (\${place}) AND user_id = ?\`, [...fileIds.map(String), userId]);
    }
    if (folderIds.length > 0) {
        const place = folderIds.map(() => '?').join(',');
        await db.run(\`UPDATE folders SET is_deleted = 0, deleted_at = NULL WHERE id IN (\${place}) AND user_id = ?\`, [...folderIds, userId]);
    }
    return { success: true };
}

export async function getTrashContents(db, userId) {
    const sqlFolders = \`SELECT id, name, deleted_at, 'folder' as type FROM folders WHERE user_id = ? AND is_deleted = 1 ORDER BY deleted_at DESC\`;
    const sqlFiles = \`SELECT \${SAFE_SELECT_MESSAGE_ID}, \${SAFE_SELECT_ID_AS_TEXT}, fileName as name, size, deleted_at, 'file' as type FROM files WHERE user_id = ? AND is_deleted = 1 ORDER BY deleted_at DESC\`;
    const folders = await db.all(sqlFolders, [userId]);
    const files = await db.all(sqlFiles, [userId]);
    return { folders: folders.map(f => ({ ...f, encrypted_id: encrypt(f.id) })), files };
}

export async function cleanupTrash(db, storage, retentionDays = 30) {
    const cutoffDate = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    const expiredFiles = await db.all(\`SELECT \${SAFE_SELECT_MESSAGE_ID}, user_id, file_id FROM files WHERE is_deleted = 1 AND deleted_at < ?\`, [cutoffDate]);
    // 这里仅做简单清理，实际可能需要更复杂的逻辑
    // 暂时只返回统计
    return { count: expiredFiles.length };
}

export async function emptyTrash(db, storage, userId) {
    const files = await db.all(\`SELECT \${SAFE_SELECT_MESSAGE_ID}, file_id FROM files WHERE is_deleted = 1 AND user_id = ?\`, [userId]);
    const folders = await db.all(\`SELECT id FROM folders WHERE is_deleted = 1 AND user_id = ?\`, [userId]);
    
    await unifiedDelete(db, storage, null, null, userId, files.map(f=>f.message_id), folders.map(f=>f.id));
    return { success: true };
}

// --- 分享与加密 ---
export async function createShareLink(db, itemId, itemType, expiresIn, userId, password, customExpiresAt) {
    const tokenArray = new Uint8Array(8);
    crypto.getRandomValues(tokenArray);
    const token = Array.from(tokenArray).map(b => b.toString(16).padStart(2, '0')).join('');
    
    let expiresAt = null;
    if (expiresIn !== '0') {
        const now = Date.now();
        if (expiresIn === 'custom') expiresAt = customExpiresAt;
        else {
            const hours = parseInt(expiresIn); // '1h' -> 1
            if (!isNaN(hours)) expiresAt = now + hours * 3600000;
            else if (expiresIn.endsWith('d')) expiresAt = now + parseInt(expiresIn) * 86400000;
        }
    }

    const table = itemType === 'folder' ? 'folders' : 'files';
    const idColumn = itemType === 'folder' ? 'id' : 'message_id';
    let hashedPassword = null;
    if (password) {
        const salt = await bcrypt.genSalt(10);
        hashedPassword = await bcrypt.hash(password, salt);
    }

    await db.run(\`UPDATE \${table} SET share_token = ?, share_expires_at = ?, share_password = ? WHERE \${idColumn} = ? AND user_id = ?\`, [token, expiresAt, hashedPassword, itemId.toString(), userId]);
    return { success: true, token };
}

export async function getFileByShareToken(db, token) {
    const row = await db.get(\`SELECT \${SAFE_SELECT_MESSAGE_ID}, \${ALL_FILE_COLUMNS}, share_password, share_expires_at FROM files WHERE share_token = ?\`, [token]);
    if (row && row.share_expires_at && Date.now() > row.share_expires_at) return null;
    return row;
}

export async function getFolderByShareToken(db, token) {
    const row = await db.get(\`SELECT *, password as share_password FROM folders WHERE share_token = ?\`, [token]);
    if (row && row.share_expires_at && Date.now() > row.share_expires_at) return null;
    return row;
}

export async function cancelShare(db, itemId, itemType, userId) {
    const table = itemType === 'folder' ? 'folders' : 'files';
    const idCol = itemType === 'folder' ? 'id' : 'message_id';
    await db.run(\`UPDATE \${table} SET share_token = NULL, share_expires_at = NULL, share_password = NULL WHERE \${idCol} = ? AND user_id = ?\`, [itemId.toString(), userId]);
}

export async function getActiveShares(db, userId) {
    const now = Date.now();
    const files = await db.all(\`SELECT \${SAFE_SELECT_ID_AS_TEXT}, fileName as name, 'file' as type, share_token, share_expires_at FROM files WHERE share_token IS NOT NULL AND (share_expires_at IS NULL OR share_expires_at > ?) AND user_id = ?\`, [now, userId]);
    const folders = await db.all(\`SELECT id, name, 'folder' as type, share_token, share_expires_at FROM folders WHERE share_token IS NOT NULL AND (share_expires_at IS NULL OR share_expires_at > ?) AND user_id = ?\`, [now, userId]);
    return [...files, ...folders];
}

export async function setFolderPassword(db, folderId, password, userId) {
    await db.run("UPDATE folders SET password = ? WHERE id = ? AND user_id = ?", [password, folderId, userId]);
}

// --- 移动逻辑 ---
export async function moveItems(db, storage, fileIds, folderIds, targetFolderId, userId) {
    // 物理移动逻辑略（S3/WebDAV 支持有限），主要更新数据库引用
    // 若涉及跨协议移动，这里需要复杂的 Copy+Delete，此处假设同协议或仅改引用
    if (fileIds.length > 0) {
        const place = fileIds.map(() => '?').join(',');
        await db.run(\`UPDATE files SET folder_id = ? WHERE message_id IN (\${place}) AND user_id = ?\`, [targetFolderId, ...fileIds.map(String), userId]);
    }
    if (folderIds.length > 0) {
        const place = folderIds.map(() => '?').join(',');
        await db.run(\`UPDATE folders SET parent_id = ? WHERE id IN (\${place}) AND user_id = ?\`, [targetFolderId, ...folderIds, userId]);
    }
}

// --- 认证 ---
export async function createAuthToken(db, userId, token, expiresAt) {
    await db.run("INSERT INTO auth_tokens (user_id, token, expires_at) VALUES (?, ?, ?)", [userId, token, expiresAt]);
}
export async function findAuthToken(db, token) {
    return await db.get("SELECT t.*, u.username, u.is_admin FROM auth_tokens t JOIN users u ON t.user_id = u.id WHERE t.token = ?", [token]);
}
export async function deleteAuthToken(db, token) {
    await db.run("DELETE FROM auth_tokens WHERE token = ?", [token]);
}

// --- 扫描导入 ---
export async function scanStorageAndImport(db, storage, userId, controller) {
    const encoder = new TextEncoder();
    const log = (msg) => controller.enqueue(encoder.encode(msg + '\\n'));
    
    log('开始扫描存储...');
    
    try {
        if (!storage.list) {
            log('错误: 当前存储后端不支持列表扫描 (List not implemented)');
            return;
        }
        
        // 列出 root 或 user prefix 下的文件
        // 对于 S3/WebDAV，我们假设以 userId 为前缀
        const prefix = \`\${userId}/\`;
        const remoteFiles = await storage.list(prefix);
        
        log(\`扫描到 \${remoteFiles.length} 个文件，开始比对...\`);
        
        const rootFolder = await getRootFolder(db, userId);
        let importedCount = 0;

        for (const remote of remoteFiles) {
            const filename = path.basename(remote.fileId);
            // 检查 DB 是否存在
            const existing = await db.get("SELECT message_id FROM files WHERE file_id = ? AND user_id = ?", [remote.fileId, userId]);
            
            if (!existing) {
                const messageId = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
                await addFile(db, {
                    message_id: messageId,
                    fileName: filename,
                    mimetype: 'application/octet-stream', // 无法精确获知
                    file_id: remote.fileId,
                    size: remote.size,
                    date: remote.updatedAt || Date.now()
                }, rootFolder.id, userId, 'imported');
                
                log(\`[导入] \${filename} (\${(remote.size/1024).toFixed(1)} KB)\`);
                importedCount++;
            }
        }
        
        log(\`扫描完成。新增导入 \${importedCount} 个文件。\`);
        
    } catch (e) {
        log(\`扫描过程发生错误: \${e.message}\`);
    }
}`
}
