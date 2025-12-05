// public/manager.js

document.addEventListener('DOMContentLoaded', () => {
    // =============================================================================
    // 1. 初始化与状态变量
    // =============================================================================
    
    // --- Axios 拦截器 ---
    axios.interceptors.response.use(
        (response) => response,
        (error) => {
            if (error.response && error.response.status === 401) {
                window.location.href = '/login';
                return new Promise(() => {});
            }
            if (!error.response && error.request) {
                // 网络错误通常也重定向或提示
                console.error('Network error:', error);
            }
            return Promise.reject(error);
        }
    );

    // --- 状态变量 ---
    let isMultiSelectMode = false;
    let isTrashMode = false;
    let currentFolderId = 1; // 逻辑参考ID
    let currentEncryptedFolderId = null; // API用ID
    let currentFolderContents = { folders: [], files: [] };
    let selectedItems = new Map(); // Map<id, {type, name, encrypted_id}>
    let moveTargetFolderId = null;
    let moveTargetEncryptedFolderId = null;
    let isSearchMode = false;
    const MAX_TELEGRAM_SIZE = 1000 * 1024 * 1024; // 1GB (Worker限制)
    let foldersLoaded = false;
    let currentView = 'grid';
    let currentSort = { key: 'name', order: 'asc' };
    let passwordPromise = {};

    const EDITABLE_EXTENSIONS = [
        '.txt', '.md', '.json', '.js', '.css', '.html', '.xml', '.yaml', '.yml', 
        '.log', '.ini', '.cfg', '.conf', '.sh', '.bat', '.py', '.java', '.c', 
        '.cpp', '.h', '.hpp', '.cs', '.php', '.rb', '.go', '.rs', '.ts', '.sql'
    ];

    // =============================================================================
    // 2. DOM 元素引用
    // =============================================================================
    const body = document.body;
    const dropZone = document.getElementById('dropZone');
    const container = document.querySelector('.container');
    const dragUploadProgressArea = document.getElementById('dragUploadProgressArea');
    
    // 修复：如果HTML中缺少拖拽区域元素，手动插入
    if (container && dragUploadProgressArea && dropZone && dropZone.parentNode) {
        // 确保进度条在拖拽区之后
        dropZone.parentNode.insertBefore(dragUploadProgressArea, dropZone.nextSibling);
    }

    const homeLink = document.getElementById('homeLink');
    const itemGrid = document.getElementById('itemGrid');
    const breadcrumb = document.getElementById('breadcrumb');
    const contextMenu = document.getElementById('contextMenu');
    const selectionInfo = document.getElementById('selectionInfo');
    const multiSelectToggleBtn = document.getElementById('multiSelectToggleBtn');
    const createFolderBtn = document.getElementById('createFolderBtn');
    const searchForm = document.getElementById('searchForm');
    const searchInput = document.getElementById('searchInput');
    const openBtn = document.getElementById('openBtn');
    const previewBtn = document.getElementById('previewBtn');
    const shareBtn = document.getElementById('shareBtn');
    const renameBtn = document.getElementById('renameBtn');
    const moveBtn = document.getElementById('moveBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const deleteBtn = document.getElementById('deleteBtn');
    const selectAllBtn = document.getElementById('selectAllBtn');
    const textEditBtn = document.getElementById('textEditBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const changePasswordBtn = document.getElementById('changePasswordBtn');
    const previewModal = document.getElementById('previewModal');
    const modalContent = document.getElementById('modalContent');
    const closeModal = document.querySelector('.close-button');
    const moveModal = document.getElementById('moveModal');
    const folderTree = document.getElementById('folderTree');
    const confirmMoveBtn = document.getElementById('confirmMoveBtn');
    const cancelMoveBtn = document.getElementById('cancelMoveBtn');
    
    // 冲突模态框
    const conflictModal = document.getElementById('conflictModal');
    const conflictModalTitle = document.getElementById('conflictModalTitle');
    const conflictFileName = document.getElementById('conflictFileName');
    const conflictOptions = document.getElementById('conflictOptions');
    const applyToAllContainer = document.getElementById('applyToAllContainer');
    const applyToAllCheckbox = document.getElementById('applyToAllCheckbox');
    
    // 文件夹冲突模态框
    const folderConflictModal = document.getElementById('folderConflictModal');
    const folderConflictName = document.getElementById('folderConflictName');
    const folderConflictOptions = document.getElementById('folderConflictOptions');
    const applyToAllFoldersContainer = document.getElementById('applyToAllFoldersContainer');
    const applyToAllFoldersCheckbox = document.getElementById('applyToAllFoldersCheckbox');
    
    // 分享与上传模态框
    const shareModal = document.getElementById('shareModal');
    const uploadModal = document.getElementById('uploadModal');
    const showUploadModalBtn = document.getElementById('showUploadModalBtn');
    const closeUploadModalBtn = document.getElementById('closeUploadModalBtn');
    const uploadForm = document.getElementById('uploadForm');
    const fileInput = document.getElementById('fileInput');
    const folderInput = document.getElementById('folderInput');
    const uploadSubmitBtn = document.getElementById('uploadSubmitBtn');
    const fileListContainer = document.getElementById('file-selection-list');
    const folderSelect = document.getElementById('folderSelect');
    const uploadNotificationArea = document.getElementById('uploadNotificationArea');
    const dragUploadProgressBar = document.getElementById('dragUploadProgressBar');
    
    // 视图与列表
    const viewSwitchBtn = document.getElementById('view-switch-btn');
    const itemListView = document.getElementById('itemListView');
    const itemListBody = document.getElementById('itemListBody');
    const listHeader = document.querySelector('.list-header');
    
    // 菜单分隔符与锁
    const contextMenuSeparator1 = document.getElementById('contextMenuSeparator1');
    const contextMenuSeparator2 = document.getElementById('contextMenuSeparator2');
    const contextMenuSeparatorTop = document.getElementById('contextMenuSeparatorTop');
    const lockBtn = document.getElementById('lockBtn');
    
    // 密码模态框
    const passwordModal = document.getElementById('passwordModal');
    const passwordModalTitle = document.getElementById('passwordModalTitle');
    const passwordPromptText = document.getElementById('passwordPromptText');
    const passwordForm = document.getElementById('passwordForm');
    const passwordInput = document.getElementById('passwordInput');
    const oldPasswordContainer = document.getElementById('oldPasswordContainer');
    const oldPasswordInput = document.getElementById('oldPasswordInput');
    const confirmPasswordContainer = document.getElementById('confirmPasswordContainer');
    const confirmPasswordInput = document.getElementById('confirmPasswordInput');
    const passwordSubmitBtn = document.getElementById('passwordSubmitBtn');
    const passwordCancelBtn = document.getElementById('passwordCancelBtn');
    
    // 回收站与配额
    const trashBtn = document.getElementById('trashBtn');
    const trashBanner = document.getElementById('trashBanner');
    const emptyTrashBtn = document.getElementById('emptyTrashBtn');
    const restoreBtn = document.getElementById('restoreBtn');
    const deleteForeverBtn = document.getElementById('deleteForeverBtn');
    const quotaUsedEl = document.getElementById('quotaUsed');
    const quotaMaxEl = document.getElementById('quotaMax');
    const quotaBar = document.getElementById('quotaBar');

    // =============================================================================
    // 3. 辅助函数 (Helper Functions)
    // =============================================================================

    function isEditableFile(fileName) {
        if (!fileName) return false;
        const lowerCaseFileName = fileName.toLowerCase();
        return EDITABLE_EXTENSIONS.some(ext => lowerCaseFileName.endsWith(ext));
    }

    function formatBytes(bytes, decimals = 2) {
        if (!bytes || bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }
    
    function formatDateTime(timestamp) {
        if (!timestamp) return '—';
        return new Date(timestamp).toLocaleString('zh-CN', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hour12: false
        }).replace(/\//g, '-');
    }

    function showNotification(message, type = 'info', container = null) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;

        if (container) {
            notification.classList.add('local');
            container.innerHTML = '';
            container.appendChild(notification);
        } else {
            notification.classList.add('global');
            const existingNotif = document.querySelector('.notification.global');
            if (existingNotif) existingNotif.remove();
            document.body.appendChild(notification);
            setTimeout(() => {
                if (notification.parentElement) notification.parentElement.removeChild(notification);
            }, 5000);
        }
    }
    
    function getFileIconClass(mimetype, fileName) {
        const lowerFileName = (fileName || '').toLowerCase();
        const archiveExtensions = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso', 'dmg'];
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff'];

        for (const ext of archiveExtensions) if (lowerFileName.endsWith('.' + ext)) return 'fa-file-archive';
        for (const ext of imageExtensions) if (lowerFileName.endsWith('.' + ext)) return 'fa-file-image';

        if (!mimetype) return 'fa-file';
        if (mimetype.startsWith('image/')) return 'fa-file-image';
        if (mimetype.startsWith('video/')) return 'fa-file-video';
        if (mimetype.startsWith('audio/')) return 'fa-file-audio';
        if (mimetype.includes('pdf')) return 'fa-file-pdf';
        if (mimetype.includes('archive') || mimetype.includes('zip')) return 'fa-file-archive';
        if (mimetype.startsWith('text/')) return 'fa-file-alt';
        
        return 'fa-file';
    }

    // =============================================================================
    // 4. 核心逻辑函数 (Core Logic) - 使用 function 声明以支持提升
    // =============================================================================

    async function updateQuota() {
        try {
            const res = await axios.get('/api/user/quota');
            if (res.data.success) {
                const { used, max } = res.data;
                const percent = max > 0 ? Math.min(100, (used / max) * 100) : 100;
                
                if(quotaUsedEl) quotaUsedEl.textContent = formatBytes(used);
                if(quotaMaxEl) quotaMaxEl.textContent = formatBytes(max);
                if(quotaBar) {
                    quotaBar.style.width = `${percent}%`;
                    quotaBar.classList.remove('warning', 'danger');
                    if (percent > 90) quotaBar.classList.add('danger');
                    else if (percent > 70) quotaBar.classList.add('warning');
                }
            }
        } catch (e) { console.error('更新配额失败', e); }
    }

    async function loadFolderContents(encryptedFolderId) {
        if (isTrashMode) {
            await loadTrashContents();
            return;
        }

        try {
            isSearchMode = false;
            if (searchInput) searchInput.value = '';
            
            currentEncryptedFolderId = encryptedFolderId; 

            const res = await axios.get(`/api/folder/${encryptedFolderId}`);
            
            if (res.data.locked) {
                // 处理加密文件夹
                const folderName = res.data.path && res.data.path.length > 0 ? res.data.path[res.data.path.length-1].name : '未知文件夹';
                const { password } = await promptForPassword(`文件夹 "${folderName}" 已加密`, '请输入密码以访问:');
                if (password === null) { 
                    // 用户取消，尝试返回上一级
                    const parent = res.data.path.length > 1 ? res.data.path[res.data.path.length - 2] : null;
                    if (parent && parent.encrypted_id) {
                       // 如果已经在浏览历史中，可以使用 back，否则重新加载父级
                       history.back();
                    } else {
                       window.location.href = '/';
                    }
                    return;
                }
                try {
                    const currentFolderOriginalId = res.data.path[res.data.path.length - 1].id;
                    await axios.post(`/api/folder/${currentFolderOriginalId}/verify`, { password });
                    await loadFolderContents(encryptedFolderId);
                } catch (error) {
                    alert('密码错误！');
                    // 错误后返回上一级或首页
                    window.location.href = '/';
                }
                return;
            }

            currentFolderContents = res.data.contents;
            // 更新 currentFolderId 仅做参考，实际操作使用 encryptedId
            if(res.data.path.length > 0) {
                currentFolderId = res.data.path[res.data.path.length - 1].id;
            }

            // 清理已消失的选择
            const currentIds = new Set([...res.data.contents.folders.map(f => String(f.id)), ...res.data.contents.files.map(f => String(f.id))]);
            selectedItems.forEach((_, key) => {
                if (!currentIds.has(key)) selectedItems.delete(key);
            });
            
            renderBreadcrumb(res.data.path);
            renderItems(currentFolderContents.folders, currentFolderContents.files);
            
            if(trashBanner) trashBanner.style.display = 'none';
            if(itemGrid) itemGrid.classList.remove('trash-mode');
            
            updateContextMenu();
            updateQuota();
        } catch (error) {
            console.error('加载内容失败', error);
            if(itemGrid) itemGrid.innerHTML = '<p>加载内容失败。</p>';
            if(itemListBody) itemListBody.innerHTML = '<p>加载内容失败。</p>';
        }
    }

    async function loadTrashContents() {
        try {
            isSearchMode = false;
            const res = await axios.get('/api/trash');
            currentFolderContents = res.data;
            
            if(breadcrumb) breadcrumb.innerHTML = '<span><i class="fas fa-trash-alt"></i> 回收站</span>';
            
            renderItems(currentFolderContents.folders, currentFolderContents.files);
            selectedItems.clear();
            
            if(trashBanner) trashBanner.style.display = 'flex';
            if(itemGrid) itemGrid.classList.add('trash-mode');
            
            updateContextMenu();
            updateQuota();
        } catch (error) {
            showNotification('无法加载回收站', 'error');
        }
    }

    function renderBreadcrumb(path) {
        if(!breadcrumb) return;
        breadcrumb.innerHTML = '';
        if(!path || path.length === 0) return;
        path.forEach((p, index) => {
            if (index > 0) breadcrumb.innerHTML += '<span class="separator">/</span>';
            if (p.id === null) {
                breadcrumb.innerHTML += `<span>${p.name}</span>`;
                return;
            }
            const link = document.createElement(index === path.length - 1 && !isSearchMode ? 'span' : 'a');
            link.textContent = p.name === '/' ? '根目录' : p.name;
            if (link.tagName === 'A') {
                link.href = '#';
                link.dataset.encryptedFolderId = p.encrypted_id;
            }
            breadcrumb.appendChild(link);
        });
    }

    function renderItems(folders, files) {
        if (!itemGrid || !itemListBody) return;
        
        const parentGrid = itemGrid;
        const parentList = itemListBody;

        parentGrid.innerHTML = '';
        parentList.innerHTML = '';

        const { folders: sortedFolders, files: sortedFiles } = sortItems(folders, files);
        const allItems = [...sortedFolders, ...sortedFiles];
        
        if (allItems.length === 0) {
            const msg = isTrashMode ? '回收站是空的。' : (isSearchMode ? '找不到符合条件的文件。' : '这个文件夹是空的。');
            if (currentView === 'grid') parentGrid.innerHTML = `<p>${msg}</p>`;
            else parentList.innerHTML = `<div class="list-item"><p>${msg}</p></div>`;
            return;
        }

        allItems.forEach(item => {
            if (currentView === 'grid') parentGrid.appendChild(createItemCard(item));
            else parentList.appendChild(createListItem(item));
        });
        updateSortIndicator();
    }

    function createItemCard(item) {
        const card = document.createElement('div');
        card.className = 'item-card';
        if (isTrashMode) card.classList.add('deleted');
        card.dataset.id = item.id;
        card.dataset.type = item.type;
        card.dataset.name = item.name === '/' ? '根目录' : item.name;
        if (item.type === 'folder') {
            card.dataset.isLocked = item.is_locked;
            card.dataset.encryptedFolderId = item.encrypted_id;
        }
        card.setAttribute('tabindex', '0');

        let iconHtml = '';
        if (item.type === 'file') {
            const fullFile = currentFolderContents.files.find(f => f.id === item.id) || item;
            if (!isTrashMode && fullFile.storage_type === 'telegram' && fullFile.thumb_file_id) {
                iconHtml = `<img src="/thumbnail/${item.id}" alt="缩略图" loading="lazy">`;
            } else if (!isTrashMode && fullFile.mimetype && fullFile.mimetype.startsWith('image/')) {
                 iconHtml = `<img src="/download/proxy/${item.id}" alt="图片" loading="lazy">`;
            } else if (!isTrashMode && fullFile.mimetype && fullFile.mimetype.startsWith('video/')) {
                 iconHtml = `<video src="/download/proxy/${item.id}#t=0.1" preload="metadata" muted></video>`;
            } else {
                 iconHtml = `<i class="fas ${getFileIconClass(item.mimetype, item.name)}"></i>`;
            }
        } else { 
            iconHtml = `<i class="fas ${item.is_locked ? 'fa-lock' : 'fa-folder'}"></i>`;
        }

        card.innerHTML = `<div class="item-icon">${iconHtml}</div><div class="item-info"><h5 title="${item.name}">${item.name === '/' ? '根目录' : item.name}</h5></div>`;
        if (selectedItems.has(String(item.id))) card.classList.add('selected');
        return card;
    }

    function createListItem(item) {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'list-item';
        if (isTrashMode) itemDiv.classList.add('deleted');
        itemDiv.dataset.id = item.id;
        itemDiv.dataset.type = item.type;
        itemDiv.dataset.name = item.name === '/' ? '根目录' : item.name;
        if (item.type === 'folder') {
            itemDiv.dataset.isLocked = item.is_locked;
            itemDiv.dataset.encryptedFolderId = item.encrypted_id;
        }
        itemDiv.setAttribute('tabindex', '0');

        const icon = item.type === 'folder' ? (item.is_locked ? 'fa-lock' : 'fa-folder') : getFileIconClass(item.mimetype, item.name);
        const name = item.name === '/' ? '根目录' : item.name;
        const size = item.type === 'file' && item.size ? formatBytes(item.size) : '—';
        const dateLabel = isTrashMode && item.deleted_at ? formatDateTime(item.deleted_at) : (item.date ? formatDateTime(item.date) : '—');

        itemDiv.innerHTML = `
            <div class="list-icon"><i class="fas ${icon}"></i></div>
            <div class="list-name" title="${name}">${name}</div>
            <div class="list-size">${size}</div>
            <div class="list-date">${dateLabel}</div>
        `;
        if (selectedItems.has(String(item.id))) {
            itemDiv.classList.add('selected');
        }
        return itemDiv;
    }

    function updateContextMenu(targetItem = null) {
        if (!contextMenu) return;
        
        const count = selectedItems.size;
        const hasSelection = count > 0;
        const singleSelection = count === 1;
        const firstSelectedItem = hasSelection ? selectedItems.values().next().value : null;

        if (selectionInfo) {
            selectionInfo.textContent = hasSelection ? `已选择 ${count} 个项目` : '';
            selectionInfo.style.display = hasSelection ? 'block' : 'none';
        }
        if (contextMenuSeparatorTop) contextMenuSeparatorTop.style.display = hasSelection ? 'block' : 'none';
        
        const normalBtns = document.querySelectorAll('.normal-mode-btn');
        const trashBtns = document.querySelectorAll('.trash-mode-btn');

        if (isTrashMode) {
            normalBtns.forEach(btn => btn.style.display = 'none');
            if (hasSelection) {
                trashBtns.forEach(btn => btn.style.display = 'flex');
            } else {
                trashBtns.forEach(btn => btn.style.display = 'none');
            }
            if(multiSelectToggleBtn) multiSelectToggleBtn.style.display = 'block';
        } else {
            trashBtns.forEach(btn => btn.style.display = 'none');
            
            if (multiSelectToggleBtn) {
                if (isMultiSelectMode) {
                    multiSelectToggleBtn.innerHTML = '<i class="fas fa-times"></i> <span class="button-text">退出多选模式</span>';
                    multiSelectToggleBtn.style.display = 'block';
                } else {
                    multiSelectToggleBtn.innerHTML = '<i class="fas fa-check-square"></i> <span class="button-text">进入多选模式</span>';
                    multiSelectToggleBtn.style.display = !targetItem ? 'block' : 'none';
                }
            }

            const generalButtons = [createFolderBtn, textEditBtn];

            if (hasSelection) {
                generalButtons.forEach(btn => { if(btn) btn.style.display = 'none'; });
                normalBtns.forEach(btn => {
                    if (btn.id !== 'createFolderBtn' && btn.id !== 'textEditBtn') {
                         btn.style.display = 'flex';
                    }
                });
                if(selectAllBtn) selectAllBtn.style.display = 'block';
                if(contextMenuSeparator2) contextMenuSeparator2.style.display = 'block';
        
                const isSingleEditableFile = singleSelection && firstSelectedItem.type === 'file' && isEditableFile(firstSelectedItem.name);
                if (textEditBtn) {
                    textEditBtn.style.display = isSingleEditableFile ? 'flex' : 'none';
                    if (isSingleEditableFile) {
                        textEditBtn.innerHTML = '<i class="fas fa-edit"></i> <span class="button-text">编辑文件</span>';
                        textEditBtn.title = '编辑文本文件';
                    }
                }
                if(contextMenuSeparator1) contextMenuSeparator1.style.display = isSingleEditableFile ? 'block' : 'none';

                const containsLockedFolder = Array.from(selectedItems.keys()).some(id => {
                    const itemEl = document.querySelector(`.item-card[data-id="${id}"], .list-item[data-id="${id}"]`);
                    return itemEl && itemEl.dataset.type === 'folder' && (itemEl.dataset.isLocked === 'true' || itemEl.dataset.isLocked === '1');
                });
                const isSingleLockedFolder = singleSelection && firstSelectedItem.type === 'folder' && containsLockedFolder;
                
                if(singleSelection && openBtn){
                    if(firstSelectedItem.type === 'folder'){
                        openBtn.innerHTML = '<i class="fas fa-folder-open"></i> <span class="button-text">打开</span>';
                    } else {
                        openBtn.innerHTML = '<i class="fas fa-external-link-alt"></i> <span class="button-text">打开</span>';
                    }
                }
                if(openBtn) openBtn.disabled = !singleSelection;
                if(previewBtn) previewBtn.disabled = !singleSelection || firstSelectedItem.type === 'folder';
                if(renameBtn) renameBtn.disabled = !singleSelection;
                if(moveBtn) moveBtn.disabled = count === 0 || isSearchMode || containsLockedFolder;
                if(shareBtn) shareBtn.disabled = !singleSelection || isSingleLockedFolder;
                if(downloadBtn) downloadBtn.disabled = count === 0 || containsLockedFolder;
                if(deleteBtn) deleteBtn.disabled = count === 0 || containsLockedFolder;
                
                if(lockBtn) {
                    lockBtn.disabled = !singleSelection || firstSelectedItem.type !== 'folder';
                    if(singleSelection && firstSelectedItem.type === 'folder'){
                         const isLocked = containsLockedFolder;
                         lockBtn.innerHTML = isLocked ? '<i class="fas fa-unlock"></i> <span class="button-text">管理密码</span>' : '<i class="fas fa-lock"></i> <span class="button-text">加密</span>';
                         lockBtn.title = isLocked ? '修改或移除密码' : '设定密码';
                    }
                }

            } else {
                generalButtons.forEach(btn => { if(btn) btn.style.display = 'block'; });
                normalBtns.forEach(btn => {
                    if (btn.id !== 'createFolderBtn' && btn.id !== 'textEditBtn') {
                        btn.style.display = 'none';
                    }
                });
                if(selectAllBtn) selectAllBtn.style.display = 'block';
                if(contextMenuSeparator2) contextMenuSeparator2.style.display = 'block';
                if (textEditBtn) {
                    textEditBtn.innerHTML = '<i class="fas fa-file-alt"></i> <span class="button-text">新建文件</span>';
                    textEditBtn.title = '新建文本文件';
                }
                if(contextMenuSeparator1) contextMenuSeparator1.style.display = 'none';
            }
        }
    }

    function updateSortIndicator() {
        if(!listHeader) return;
        listHeader.querySelectorAll('[data-sort]').forEach(el => {
            el.classList.remove('sort-asc', 'sort-desc');
            const icon = el.querySelector('.sort-icon');
            if(icon) icon.remove();
        });
        const activeHeader = listHeader.querySelector(`[data-sort="${currentSort.key}"]`);
        if (activeHeader) {
            activeHeader.classList.add(currentSort.order === 'asc' ? 'sort-asc' : 'sort-desc');
            const icon = document.createElement('i');
            icon.className = `fas fa-caret-${currentSort.order === 'asc' ? 'up' : 'down'} sort-icon`;
            activeHeader.appendChild(icon);
        }
    }

    function sortItems(folders, files) {
        const { key, order } = currentSort;
        const direction = order === 'asc' ? 1 : -1;

        const sortedFolders = [...folders].sort((a, b) => {
            if (key === 'name') return a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true }) * direction;
            return a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true });
        });

        const sortedFiles = [...files].sort((a, b) => {
            if (key === 'name') return a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true }) * direction;
            if (key === 'size') return (a.size - b.size) * direction;
            if (key === 'date') return (a.date - b.date) * direction;
            return 0;
        });
        return { folders: sortedFolders, files: sortedFiles };
    }

    function rerenderSelection() {
        document.querySelectorAll('.item-card, .list-item').forEach(el => {
            el.classList.toggle('selected', selectedItems.has(el.dataset.id));
        });
    }
    
    async function loadFoldersForSelect() {
        if (foldersLoaded) return;
        try {
            const res = await axios.get('/api/folders');
            const folders = res.data;
            const folderMap = new Map(folders.map(f => [f.id, { ...f, children: [] }]));
            const tree = [];
            folderMap.forEach(f => {
                if (f.parent_id && folderMap.has(f.parent_id)) folderMap.get(f.parent_id).children.push(f);
                else tree.push(f);
            });

            folderSelect.innerHTML = '';
            const buildOptions = (node, prefix = '') => {
                const option = document.createElement('option');
                // 关键：使用 encrypted_id 作为值
                option.value = node.encrypted_id; 
                option.textContent = prefix + (node.name === '/' ? '根目录' : node.name);
                folderSelect.appendChild(option);
                node.children.sort((a,b) => a.name.localeCompare(b.name)).forEach(child => buildOptions(child, prefix + '　'));
            };
            tree.sort((a,b) => a.name.localeCompare(b.name)).forEach(buildOptions);

            foldersLoaded = true;
        } catch (error) { }
    }
    
    // =============================================================================
    // 5. 上传与冲突处理逻辑 (Upload Logic)
    // =============================================================================

    async function handleConflict(conflicts, operationType = '文件') {
        const resolutions = {};
        let applyToAllAction = null;
        let aborted = false;

        for (const conflictName of conflicts) {
            if (applyToAllAction) {
                resolutions[conflictName] = applyToAllAction;
                continue;
            }

            const action = await new Promise((resolve) => {
                conflictModalTitle.textContent = `${operationType}冲突`;
                conflictFileName.textContent = conflictName;
                applyToAllContainer.style.display = conflicts.length > 1 ? 'block' : 'none';
                applyToAllCheckbox.checked = false;
                conflictModal.style.display = 'flex';

                conflictOptions.onclick = (e) => {
                    const chosenAction = e.target.dataset.action;
                    if (!chosenAction) return;

                    conflictModal.style.display = 'none';
                    conflictOptions.onclick = null;
                    
                    if (applyToAllCheckbox.checked) {
                        applyToAllAction = chosenAction;
                    }
                    resolve(chosenAction);
                };
            });

            if (action === 'abort') {
                aborted = true;
                break;
            }
            resolutions[conflictName] = action;
        }

        return { aborted, resolutions };
    }

    async function performUpload(url, formData, isDrag = false) {
        const progressBar = isDrag ? dragUploadProgressBar : document.getElementById('progressBar');
        const progressArea = isDrag ? dragUploadProgressArea : document.getElementById('progressArea');
        const submitBtn = isDrag ? null : uploadSubmitBtn;
        const notificationContainer = isDrag ? null : uploadNotificationArea;
    
        if(progressArea) progressArea.style.display = 'block';
        if(progressBar) {
            progressBar.style.width = '0%';
            progressBar.textContent = '0%';
        }
        if (submitBtn) submitBtn.disabled = true;
    
        try {
            const res = await axios.post(url, formData, {
                onUploadProgress: p => {
                    const percent = Math.round((p.loaded * 100) / p.total);
                    if(progressBar) {
                        progressBar.style.width = percent + '%';
                        progressBar.textContent = percent + '%';
                    }
                }
            });
            if (res.data.success) {
                if (!isDrag && uploadModal) uploadModal.style.display = 'none';
                
                if (res.data.skippedAll) {
                    showNotification('没有文件被上传，所有冲突的项目都已被跳过。', 'info');
                } else {
                    showNotification('上传成功！', 'success');
                }
                if(fileInput) fileInput.value = '';
                if(folderInput) folderInput.value = '';
                loadFolderContents(currentEncryptedFolderId);
            } else {
                showNotification(res.data.message, 'error', notificationContainer);
            }
        } catch (error) {
            if (error.response) {
                 showNotification(error.response?.data?.message || '服务器错误', 'error', notificationContainer);
            }
        } finally {
            if (submitBtn) submitBtn.disabled = false;
            setTimeout(() => { if(progressArea) progressArea.style.display = 'none'; }, 2000);
        }
    }

    async function uploadFiles(allFilesData, targetFolderId, isDrag = false) {
        if (allFilesData.length === 0) {
            showNotification('请选择文件或文件夹。', 'error', !isDrag ? uploadNotificationArea : null);
            return;
        }

        const MAX_FILENAME_BYTES = 255; 
        const encoder = new TextEncoder();
        const longFileNames = allFilesData.filter(data => {
            const fileName = data.relativePath.split('/').pop();
            return encoder.encode(fileName).length > MAX_FILENAME_BYTES;
        });

        if (longFileNames.length > 0) {
            const fileNames = longFileNames.map(data => `"${data.relativePath.split('/').pop()}"`).join(', ');
            showNotification(`部分文件名过长 (超过 ${MAX_FILENAME_BYTES} 字节)，无法上传: ${fileNames}`, 'error', !isDrag ? uploadNotificationArea : null);
            return;
        }

        const notificationContainer = isDrag ? null : uploadNotificationArea;
        const oversizedFiles = allFilesData.filter(data => data.file.size > MAX_TELEGRAM_SIZE);
        if (oversizedFiles.length > 0) {
            const fileNames = oversizedFiles.map(data => `"${data.file.name}"`).join(', ');
            showNotification(`文件 ${fileNames} 过大，超过 ${formatBytes(MAX_TELEGRAM_SIZE)} 的限制。`, 'error', notificationContainer);
            return;
        }

        const filesToCheck = allFilesData.map(data => ({ relativePath: data.relativePath }));

        let existenceData = [];
        try {
            // 此API调用依赖后端数据层过滤掉 is_deleted=1 的文件
            const res = await axios.post('/api/check-existence', { files: filesToCheck, folderId: targetFolderId });
            existenceData = res.data.files;
        } catch (error) {
            // 如果 API 404 (旧版后端) 或其他错误，尝试直接上传，不阻断流程
            if (error.response && error.response.status !== 404) {
                 showNotification(error.response?.data?.message || '检查文件冲突时出错', 'error', notificationContainer);
                 return;
            }
        }

        const resolutions = {};
        const conflicts = existenceData ? existenceData.filter(f => f.exists).map(f => f.relativePath) : [];
        
        if (conflicts.length > 0) {
            const conflictResult = await handleConflict(conflicts, '文件');
            if (conflictResult.aborted) {
                showNotification('上传操作已取消。', 'info', notificationContainer);
                return;
            }
            Object.assign(resolutions, conflictResult.resolutions);
        }

        const formData = new FormData();
        allFilesData.forEach(data => {
            formData.append(data.relativePath, data.file);
        });
        
        const params = new URLSearchParams();
        params.append('folderId', targetFolderId);
        params.append('resolutions', JSON.stringify(resolutions));

        if (!isDrag) {
            const captionInput = document.getElementById('uploadCaption');
            if (captionInput && captionInput.value) {
                params.append('caption', captionInput.value);
            }
        }
        
        const uploadUrl = `/upload?${params.toString()}`;
        await performUpload(uploadUrl, formData, isDrag);
    }

    function promptForPassword(title, text, showOldPassword = false, showConfirm = false) {
        return new Promise((resolve, reject) => {
            passwordPromise.resolve = resolve;
            passwordPromise.reject = reject;
            if(passwordModalTitle) passwordModalTitle.textContent = title;
            if(passwordPromptText) passwordPromptText.textContent = text;
            if(oldPasswordContainer) oldPasswordContainer.style.display = showOldPassword ? 'block' : 'none';
            if(confirmPasswordContainer) confirmPasswordContainer.style.display = showConfirm ? 'block' : 'none';
            if(passwordInput) {
                passwordInput.value = '';
                passwordInput.focus();
            }
            if(oldPasswordInput) oldPasswordInput.value = '';
            if(confirmPasswordInput) confirmPasswordInput.value = '';
            if(passwordModal) passwordModal.style.display = 'flex';
        });
    }

    // =============================================================================
    // 6. 事件绑定 (Event Listeners)
    // =============================================================================

    // 状态追踪
    body.classList.add('using-mouse');
    window.addEventListener('keydown', (e) => {
        if (['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(e.key)) {
            body.classList.remove('using-mouse');
            body.classList.add('using-keyboard');
        }
    });
    window.addEventListener('mousemove', () => {
        if (!body.classList.contains('using-mouse')) {
            body.classList.remove('using-keyboard');
            body.classList.add('using-mouse');
        }
    });
    window.addEventListener('mousedown', () => {
        body.classList.remove('using-keyboard');
        body.classList.add('using-mouse');
    });

    // Item 点击与双击
    const handleItemClick = (e) => {
        const target = e.target.closest('.item-card, .list-item');
        if (!target) return;
        const id = target.dataset.id;
        const type = target.dataset.type;
        const name = target.dataset.name;
        const encrypted_id = target.dataset.encryptedFolderId;

        if (isMultiSelectMode || e.ctrlKey || e.metaKey) {
            if (selectedItems.has(id)) selectedItems.delete(id);
            else selectedItems.set(id, { type, name, encrypted_id });
        } else {
            selectedItems.clear();
            selectedItems.set(id, { type, name, encrypted_id });
        }
        rerenderSelection();
        updateContextMenu();
    };

    const handleItemDblClick = async (e) => {
        if (isMultiSelectMode || isTrashMode) return;

        const target = e.target.closest('.item-card, .list-item');
        if (target && target.dataset.type === 'folder') {
            const folderId = parseInt(target.dataset.id, 10);
            const isLocked = target.dataset.isLocked === 'true' || target.dataset.isLocked === '1';
            const encryptedId = target.dataset.encryptedFolderId;

            if (!encryptedId) return;

            if (isLocked) {
                try {
                    const { password } = await promptForPassword(`文件夹 "${target.dataset.name}" 已加密`, '请输入密码以访问:');
                    if (password === null) return;
                    await axios.post(`/api/folder/${folderId}/verify`, { password });
                    window.history.pushState(null, '', `/view/${encryptedId}`);
                    loadFolderContents(encryptedId);
                } catch (error) { alert(error.response?.data?.message || '验证失败'); }
            } else {
                window.history.pushState(null, '', `/view/${encryptedId}`);
                loadFolderContents(encryptedId);
            }
        } else if (target && target.dataset.type === 'file') {
            if (selectedItems.size !== 1) {
                selectedItems.clear();
                selectedItems.set(target.dataset.id, { type: 'file', name: target.dataset.name });
                rerenderSelection();
            }
            if(previewBtn) previewBtn.click();
        }
    };

    if (itemGrid) {
        itemGrid.addEventListener('click', handleItemClick);
        itemGrid.addEventListener('dblclick', handleItemDblClick);
    }
    if (itemListBody) {
        itemListBody.addEventListener('click', handleItemClick);
        itemListBody.addEventListener('dblclick', handleItemDblClick);
    }

    // 视图切换
    if (viewSwitchBtn) viewSwitchBtn.addEventListener('click', () => switchView(currentView === 'grid' ? 'list' : 'grid'));

    // 多选模式
    if (multiSelectToggleBtn) {
        multiSelectToggleBtn.addEventListener('click', () => {
            isMultiSelectMode = !isMultiSelectMode;
            document.body.classList.toggle('selection-mode-active', isMultiSelectMode);
            if (!isMultiSelectMode) {
                selectedItems.clear();
                rerenderSelection();
            }
            updateContextMenu();
            contextMenu.style.display = 'none';
        });
    }

    // 面包屑导航
    if (breadcrumb) {
        breadcrumb.addEventListener('click', e => {
            e.preventDefault();
            const link = e.target.closest('a');
            if (link && link.dataset.encryptedFolderId) {
                if (isTrashMode) {
                    isTrashMode = false;
                    if(trashBtn) trashBtn.classList.remove('active');
                }
                const encryptedId = link.dataset.encryptedFolderId;
                window.history.pushState(null, '', `/view/${encryptedId}`);
                loadFolderContents(encryptedId);
            }
        });
    }

    // 浏览器后退/前进
    window.addEventListener('popstate', () => {
        if (document.getElementById('itemGrid')) {
            const pathParts = window.location.pathname.split('/');
            const viewIndex = pathParts.indexOf('view');
            if (viewIndex !== -1 && pathParts.length > viewIndex + 1) {
                const encryptedId = pathParts[viewIndex + 1];
                loadFolderContents(encryptedId);
            } else {
                window.location.href = '/';
            }
        }
    });

    // 上传相关按钮
    if (showUploadModalBtn) {
        showUploadModalBtn.addEventListener('click', async () => {
            await loadFoldersForSelect();
            // 默认选中当前加密 ID
            if(folderSelect) folderSelect.value = currentEncryptedFolderId;
            if(uploadNotificationArea) uploadNotificationArea.innerHTML = '';
            if(uploadForm) uploadForm.reset();
            if(fileListContainer) fileListContainer.innerHTML = '';
            if(uploadSubmitBtn) uploadSubmitBtn.style.display = 'block';
            if(uploadModal) uploadModal.style.display = 'flex';
        });
    }
    if (closeUploadModalBtn) closeUploadModalBtn.addEventListener('click', () => uploadModal.style.display = 'none');

    if (fileInput) {
        fileInput.addEventListener('change', () => {
            fileListContainer.innerHTML = '';
            if (fileInput.files.length > 0) {
                for (const file of fileInput.files) {
                    const li = document.createElement('li');
                    li.textContent = file.name;
                    fileListContainer.appendChild(li);
                }
                uploadSubmitBtn.style.display = 'block';
                folderInput.value = '';
            }
        });
    }
    
    if (folderInput) {
        folderInput.addEventListener('change', (e) => {
            const files = e.target.files;
            if (files.length > 0) {
                const folderName = files[0].webkitRelativePath.split('/')[0];
                fileListContainer.innerHTML = `<li>已选择文件夹: <b>${folderName}</b> (包含 ${files.length} 个文件)</li>`;
                uploadSubmitBtn.style.display = 'block';
                fileInput.value = '';
            }
        });
    }

    if (uploadForm) {
        uploadForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const filesToProcess = folderInput.files.length > 0 ? folderInput.files : fileInput.files;
            const targetFolderId = folderSelect.value;
            const allFilesData = Array.from(filesToProcess).map(f => ({
                relativePath: f.webkitRelativePath || f.name,
                file: f
            }));
            uploadFiles(allFilesData, targetFolderId, false);
        });
    }

    // 拖拽上传
    if (dropZone) {
        // 键盘导航
        dropZone.addEventListener('keydown', handleKeyDown);
        dropZone.addEventListener('focusin', (e) => {
            const target = e.target.closest('.item-card, .list-item');
            if (target && body.classList.contains('using-keyboard') && !isMultiSelectMode) {
                selectedItems.clear();
                selectedItems.set(target.dataset.id, { type: target.dataset.type, name: target.dataset.name, encrypted_id: target.dataset.encryptedFolderId });
                rerenderSelection();
                updateContextMenu();
            }
        });

        // 右键菜单
        dropZone.addEventListener('contextmenu', e => {
            e.preventDefault();
            const targetItem = e.target.closest('.item-card, .list-item');
    
            if (targetItem && !isMultiSelectMode && !e.ctrlKey && !e.metaKey) {
                if (!selectedItems.has(targetItem.dataset.id)) {
                    selectedItems.clear();
                    selectedItems.set(targetItem.dataset.id, {
                        type: targetItem.dataset.type,
                        name: targetItem.dataset.name,
                        encrypted_id: targetItem.dataset.encryptedFolderId
                    });
                    rerenderSelection();
                }
            } else if (!targetItem) {
                if (!isMultiSelectMode) {
                  selectedItems.clear();
                  rerenderSelection();
                }
            }
    
            updateContextMenu(targetItem);
    
            if(contextMenu) {
                contextMenu.style.display = 'flex';
                const { clientX: mouseX, clientY: mouseY } = e;
                const { x, y } = dropZone.getBoundingClientRect();
                let menuX = mouseX - x;
                let menuY = mouseY - y + dropZone.scrollTop;
                const menuWidth = contextMenu.offsetWidth;
                const menuHeight = contextMenu.offsetHeight;
                const dropZoneWidth = dropZone.clientWidth;
        
                if (menuX + menuWidth > dropZoneWidth) menuX = dropZoneWidth - menuWidth - 5;
                if (menuY + menuHeight > dropZone.scrollHeight) menuY = dropZone.scrollHeight - menuHeight - 5;
                if (menuY < dropZone.scrollTop) menuY = dropZone.scrollTop;

                contextMenu.style.top = `${menuY}px`;
                contextMenu.style.left = `${menuX}px`;
            }
        });
        
        window.addEventListener('click', (e) => {
            if (contextMenu && !contextMenu.contains(e.target)) contextMenu.style.display = 'none';
        });

        // 拖拽事件
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'));
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'));
        });

        dropZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('dragover');
            if (isTrashMode) return;
    
            const items = e.dataTransfer.items;
            if (!items || items.length === 0) return;
    
            const getFileWithRelativePath = (entry) => {
                return new Promise((resolve, reject) => {
                    if (entry.isFile) {
                        entry.file(file => {
                            const relativePath = entry.fullPath.startsWith('/') ? entry.fullPath.substring(1) : entry.fullPath;
                            resolve([{
                                relativePath: relativePath,
                                file: file
                            }]);
                        }, err => reject(err));
                    } else if (entry.isDirectory) {
                        const dirReader = entry.createReader();
                        let allEntries = [];
                        const readEntries = () => {
                            dirReader.readEntries(async (entries) => {
                                if (entries.length === 0) {
                                    try {
                                        const filesDataArrays = await Promise.all(allEntries.map(getFileWithRelativePath));
                                        resolve(filesDataArrays.flat());
                                    } catch (error) { reject(error); }
                                } else {
                                    allEntries.push(...entries);
                                    readEntries();
                                }
                            }, err => reject(err));
                        };
                        readEntries();
                    } else { resolve([]); }
                });
            };
        
            try {
                const entries = Array.from(items).map(item => item.webkitGetAsEntry());
                const filesDataPromises = entries.map(getFileWithRelativePath);
                const filesDataArrays = await Promise.all(filesDataPromises);
                const allFilesData = filesDataArrays.flat().filter(Boolean);
                
                if (allFilesData.length > 0) {
                    // 关键修正：使用当前加密ID上传
                    uploadFiles(allFilesData, currentEncryptedFolderId, true);
                } else {
                    showNotification('找不到可上传的文件。', 'warn');
                }
            } catch (error) {
                showNotification('读取拖放的文件夹时出错。', 'error');
            }
        });
    }

    // 回收站操作
    if (trashBtn) {
        trashBtn.addEventListener('click', () => {
            if (!isTrashMode) {
                isTrashMode = true;
                trashBtn.classList.add('active');
                if(itemGrid) itemGrid.innerHTML = '<p>正在加载回收站...</p>';
                if(itemListBody) itemListBody.innerHTML = '<p>正在加载回收站...</p>';
                loadTrashContents();
            } else {
                isTrashMode = false;
                trashBtn.classList.remove('active');
                window.location.href = '/';
            }
        });
    }
    
    if (emptyTrashBtn) {
        emptyTrashBtn.addEventListener('click', async () => {
            if (!confirm('确定要清空回收站吗？此操作无法撤销！')) return;
            try {
                await axios.post('/api/trash/empty');
                showNotification('回收站已清空', 'success');
                loadTrashContents();
            } catch (e) {
                showNotification('清空失败: ' + (e.response?.data?.message || e.message), 'error');
            }
        });
    }
    
    if (restoreBtn) {
        restoreBtn.addEventListener('click', async () => {
            if (selectedItems.size === 0) return;
            if(contextMenu) contextMenu.style.display = 'none';
            const filesToRestore = [], foldersToRestore = [];
            selectedItems.forEach((item, id) => {
                if (item.type === 'file') filesToRestore.push(id);
                else foldersToRestore.push(parseInt(id));
            });
            
            try {
                // 后端会自动处理重名，这里只需发起请求
                await axios.post('/api/trash/restore', { files: filesToRestore, folders: foldersToRestore });
                showNotification('已还原选定项目', 'success');
                loadTrashContents(); 
            } catch (e) {
                showNotification('还原失败: ' + (e.response?.data?.message || e.message), 'error');
            }
        });
    }
    
    if (deleteForeverBtn) {
        deleteForeverBtn.addEventListener('click', async () => {
            if (selectedItems.size === 0) return;
            if(contextMenu) contextMenu.style.display = 'none';
            if (!confirm('确定要永久删除这些项目吗？此操作无法撤销！')) return;
            
            const filesToDelete = [], foldersToDelete = [];
            selectedItems.forEach((item, id) => {
                if (item.type === 'file') filesToDelete.push(id);
                else foldersToDelete.push(parseInt(id));
            });
            
            try {
                await axios.post('/api/delete', { 
                    files: filesToDelete, 
                    folders: foldersToDelete,
                    permanent: true 
                });
                showNotification('已永久删除', 'success');
                loadTrashContents();
            } catch (e) {
                showNotification('删除失败: ' + (e.response?.data?.message || e.message), 'error');
            }
        });
    }
    
    // 监听消息
    window.addEventListener('message', (event) => {
        if (event.data === 'refresh-files') loadFolderContents(currentEncryptedFolderId);
    });
    
    // =============================================================================
    // 7. 初始化入口 (Initialization)
    // =============================================================================
    if (document.getElementById('itemGrid')) {
        const pathParts = window.location.pathname.split('/');
        const viewIndex = pathParts.indexOf('view');
        let encryptedId;
        if (viewIndex !== -1 && pathParts.length > viewIndex + 1) {
            encryptedId = pathParts[viewIndex + 1];
        }
        if (encryptedId) loadFolderContents(encryptedId);
        else window.location.href = '/'; // 默认跳回根目录
    }
});
