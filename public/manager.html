// public/manager.js

document.addEventListener('DOMContentLoaded', () => {
    // =================================================================================
    // 1. 状态与变量
    // =================================================================================
    let currentFolderId = null;
    let currentPath = [];
    let items = []; // 当前文件夹下的所有项目
    let selectedItems = new Set(); // 存储选中的 ID (格式: "file:123" 或 "folder:456")
    let isMultiSelectMode = false;
    let viewMode = localStorage.getItem('viewMode') || 'grid'; // 'grid' or 'list'
    let isTrashMode = false;
    let lastClickIndex = -1; // 用于 Shift 多选

    // DOM 元素引用
    const itemGrid = document.getElementById('itemGrid');
    const itemListView = document.getElementById('itemListView');
    const itemListBody = document.getElementById('itemListBody');
    const breadcrumbEl = document.getElementById('breadcrumb');
    const searchForm = document.getElementById('searchForm');
    const searchInput = document.getElementById('searchInput');
    const viewSwitchBtn = document.getElementById('view-switch-btn');
    const selectionInfo = document.getElementById('selectionInfo');
    
    // 按钮引用
    const multiSelectToggleBtn = document.getElementById('multiSelectToggleBtn');
    const selectAllBtn = document.getElementById('selectAllBtn');
    const showUploadModalBtn = document.getElementById('showUploadModalBtn');
    const trashBtn = document.getElementById('trashBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const restoreBtn = document.getElementById('restoreBtn');
    const deleteForeverBtn = document.getElementById('deleteForeverBtn');
    const emptyTrashBtn = document.getElementById('emptyTrashBtn');
    
    // 模态框引用
    const uploadModal = document.getElementById('uploadModal');
    const moveModal = document.getElementById('moveModal');
    const shareModal = document.getElementById('shareModal');
    const previewModal = document.getElementById('previewModal');
    const conflictModal = document.getElementById('conflictModal');
    const contextMenu = document.getElementById('contextMenu');

    // 移动相关变量
    let selectedMoveTargetId = null;

    // 初始化
    init();

    function init() {
        const pathParts = window.location.pathname.split('/');
        // URL 格式 /view/:encryptedId
        if (pathParts[1] === 'view' && pathParts[2]) {
            loadFolder(pathParts[2]);
        } else {
            // 默认加载根目录（通常后端会重定向，这里做个兜底）
            window.location.href = '/'; 
        }
        setupEventListeners();
        updateViewMode();
        updateUserQuota();
    }

    // =================================================================================
    // 2. 核心加载与渲染
    // =================================================================================

    async function loadFolder(encryptedId) {
        if (!encryptedId) return;
        currentFolderId = encryptedId;
        isTrashMode = false;
        document.getElementById('trashBanner').style.display = 'none';
        updateToolbarState();

        TaskManager.show('正在加载...', 'fas fa-spinner fa-spin');
        try {
            const res = await axios.get(`/api/folder/${encryptedId}?t=${Date.now()}`);
            const data = res.data;
            
            currentPath = data.path;
            items = [...data.contents.folders, ...data.contents.files];
            
            renderBreadcrumb();
            renderItems(items);
            selectedItems.clear();
            updateSelectionUI();
            
            // 更新 URL (不刷新页面)
            history.pushState({ id: encryptedId }, '', `/view/${encryptedId}`);
            TaskManager.success('就绪');
        } catch (error) {
            console.error(error);
            if (error.response && error.response.status === 401) window.location.href = '/login';
            else TaskManager.error('加载失败');
        }
    }

    async function loadTrash() {
        currentFolderId = 'trash';
        isTrashMode = true;
        currentPath = [{ name: '回收站', id: 'trash' }];
        document.getElementById('trashBanner').style.display = 'flex';
        updateToolbarState();

        TaskManager.show('加载回收站...', 'fas fa-trash');
        try {
            const res = await axios.get('/api/trash');
            const data = res.data;
            items = [...data.folders, ...data.files];
            renderBreadcrumb();
            renderItems(items);
            selectedItems.clear();
            updateSelectionUI();
            TaskManager.success('回收站');
        } catch (error) {
            TaskManager.error('加载回收站失败');
        }
    }

    function renderBreadcrumb() {
        breadcrumbEl.innerHTML = '';
        currentPath.forEach((folder, index) => {
            const li = document.createElement('li');
            if (index === currentPath.length - 1) {
                li.textContent = folder.name;
                li.classList.add('active');
            } else {
                const a = document.createElement('a');
                a.href = 'javascript:void(0)';
                a.textContent = folder.name;
                a.onclick = () => loadFolder(folder.encrypted_id);
                li.appendChild(a);
            }
            breadcrumbEl.appendChild(li);
        });
    }

    function renderItems(itemsToRender) {
        itemGrid.innerHTML = '';
        itemListBody.innerHTML = '';

        if (itemsToRender.length === 0) {
            const emptyMsg = `<div class="empty-state"><i class="fas fa-folder-open"></i><p>此位置为空</p></div>`;
            if (viewMode === 'grid') itemGrid.innerHTML = emptyMsg;
            else itemListBody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:30px; color:#999;">此位置为空</td></tr>`;
            return;
        }

        itemsToRender.forEach(item => {
            itemGrid.appendChild(createGridItem(item));
            itemListBody.appendChild(createListItem(item)); // 修正后的列表渲染
        });
    }

    // 创建网格视图项
    function createGridItem(item) {
        const div = document.createElement('div');
        div.className = 'grid-item item-card';
        if(isTrashMode) div.classList.add('deleted');
        div.dataset.id = getItemId(item);
        
        div.onclick = (e) => handleItemClick(e, item, div);
        div.oncontextmenu = (e) => handleContextMenu(e, item);
        div.ondblclick = () => handleItemDblClick(item);

        const iconClass = getIconClass(item);
        const iconColor = item.type === 'folder' ? '#fbc02d' : '#007bff';

        div.innerHTML = `
            <div class="item-icon"><i class="${iconClass}" style="color: ${iconColor};"></i>${item.is_locked ? '<i class="fas fa-lock lock-badge"></i>' : ''}</div>
            <div class="item-info"><h5 title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</h5></div>
            ${isMultiSelectMode ? '<div class="select-checkbox"><i class="fas fa-check"></i></div>' : ''}
        `;
        
        if (selectedItems.has(getItemId(item))) div.classList.add('selected');
        return div;
    }

    // 创建列表视图项 (修复版: 使用 tr/td)
    function createListItem(item) {
        const tr = document.createElement('tr');
        tr.className = 'list-row list-item';
        if(isTrashMode) tr.classList.add('deleted');
        tr.dataset.id = getItemId(item);
        
        tr.onclick = (e) => handleItemClick(e, item, tr);
        tr.oncontextmenu = (e) => handleContextMenu(e, item);
        tr.ondblclick = () => handleItemDblClick(item);

        const iconClass = getIconClass(item);
        const dateStr = item.date ? new Date(item.date).toLocaleString() : (item.deleted_at ? new Date(item.deleted_at).toLocaleString() : '-');
        const sizeStr = item.size !== undefined ? formatSize(item.size) : '-';

        // 核心修复：使用 td 包裹内容，适配 table 结构
        tr.innerHTML = `
            <td><div class="list-icon"><i class="${iconClass}" style="color: ${item.type === 'folder' ? '#fbc02d' : '#555'}"></i></div></td>
            <td><div class="list-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div></td>
            <td>${sizeStr}</td>
            <td>${dateStr}</td>
        `;
        
        if (selectedItems.has(getItemId(item))) tr.classList.add('selected');
        return tr;
    }

    // =================================================================================
    // 3. 交互与事件处理
    // =================================================================================

    function setupEventListeners() {
        // 视图切换
        viewSwitchBtn.addEventListener('click', () => {
            viewMode = viewMode === 'grid' ? 'list' : 'grid';
            localStorage.setItem('viewMode', viewMode);
            updateViewMode();
        });

        // 搜索
        searchForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const q = searchInput.value.trim();
            if (!q) return loadFolder(currentFolderId);
            
            TaskManager.show('搜索中...');
            try {
                const res = await axios.get(`/api/search?q=${encodeURIComponent(q)}`);
                items = [...res.data.folders, ...res.data.files];
                currentPath = [{ name: `搜索: "${q}"`, id: 'search' }];
                renderBreadcrumb();
                renderItems(items);
                TaskManager.success('搜索完成');
            } catch(e) { TaskManager.error('搜索失败'); }
        });

        // 多选模式
        multiSelectToggleBtn.addEventListener('click', () => {
            isMultiSelectMode = !isMultiSelectMode;
            multiSelectToggleBtn.classList.toggle('active', isMultiSelectMode);
            renderItems(items); // 重新渲染以显示/隐藏复选框
        });

        selectAllBtn.addEventListener('click', () => {
            if (selectedItems.size === items.length) selectedItems.clear();
            else items.forEach(i => selectedItems.add(getItemId(i)));
            updateSelectionUI();
        });

        // 模态框关闭按钮
        document.querySelectorAll('.close-button').forEach(btn => {
            btn.onclick = function() { this.closest('.modal').style.display = 'none'; }
        });
        window.onclick = (e) => {
            if (e.target.classList.contains('modal')) e.target.style.display = 'none';
        };

        // 上传
        showUploadModalBtn.addEventListener('click', () => {
            const select = document.getElementById('folderSelect');
            select.innerHTML = `<option value="${currentFolderId}">当前文件夹</option>`; // 简化版，实际可列出树形结构
            uploadModal.style.display = 'block';
        });

        const uploadForm = document.getElementById('uploadForm');
        uploadForm.addEventListener('submit', handleUpload);

        // 回收站操作
        trashBtn.addEventListener('click', loadTrash);
        restoreBtn.addEventListener('click', () => handleTrashAction('restore'));
        deleteForeverBtn.addEventListener('click', () => handleTrashAction('delete'));
        emptyTrashBtn.addEventListener('click', async () => {
            if(!confirm('确定清空回收站吗？此操作不可撤销。')) return;
            try { await axios.post('/api/trash/empty'); loadTrash(); TaskManager.success('回收站已清空'); }
            catch(e) { TaskManager.error('操作失败'); }
        });

        // 退出登录
        logoutBtn.addEventListener('click', () => window.location.href = '/logout');

        // 上下文菜单全局点击关闭
        document.addEventListener('click', (e) => {
            if (!contextMenu.contains(e.target)) contextMenu.style.display = 'none';
        });

        // Drop Zone
        const dropZone = document.getElementById('dropZoneOverlay');
        window.addEventListener('dragenter', () => dropZone.style.display = 'flex');
        dropZone.addEventListener('dragleave', (e) => { if(e.relatedTarget === null) dropZone.style.display = 'none'; });
        dropZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            dropZone.style.display = 'none';
            if (isTrashMode) return alert('回收站模式下无法上传');
            // 简单的拖拽上传处理，直接复用上传逻辑可能需要封装
            const files = e.dataTransfer.files;
            if(files.length > 0) processUploadFiles(files, currentFolderId);
        });
        window.addEventListener('dragover', e => e.preventDefault());
    }

    function updateViewMode() {
        if (viewMode === 'grid') {
            itemGrid.style.display = 'grid';
            itemListView.style.display = 'none';
            viewSwitchBtn.innerHTML = '<i class="fas fa-list"></i>';
        } else {
            itemGrid.style.display = 'none';
            itemListView.style.display = 'block';
            viewSwitchBtn.innerHTML = '<i class="fas fa-th-large"></i>';
        }
        renderItems(items);
    }

    function handleItemClick(e, item, element) {
        if (e.target.closest('.select-checkbox')) return; // Checkbox click handled natively or via bubble logic

        const id = getItemId(item);
        
        if (e.ctrlKey || isMultiSelectMode) {
            if (selectedItems.has(id)) selectedItems.delete(id);
            else selectedItems.add(id);
        } else if (e.shiftKey && lastClickIndex !== -1) {
            // Shift 多选逻辑
            const currentIndex = items.indexOf(item);
            const start = Math.min(lastClickIndex, currentIndex);
            const end = Math.max(lastClickIndex, currentIndex);
            selectedItems.clear();
            for(let i=start; i<=end; i++) selectedItems.add(getItemId(items[i]));
        } else {
            // 单选
            selectedItems.clear();
            selectedItems.add(id);
        }
        
        lastClickIndex = items.indexOf(item);
        updateSelectionUI();
    }

    function handleItemDblClick(item) {
        if (item.type === 'folder') {
            loadFolder(item.encrypted_id);
        } else {
            previewFile(item);
        }
    }

    function updateSelectionUI() {
        // 更新高亮
        document.querySelectorAll('.item-card, .list-item').forEach(el => {
            if (selectedItems.has(el.dataset.id)) el.classList.add('selected');
            else el.classList.remove('selected');
        });

        // 更新选中信息栏
        if (selectedItems.size > 0) {
            selectionInfo.style.display = 'block';
            selectionInfo.textContent = `已选中 ${selectedItems.size} 项`;
        } else {
            selectionInfo.style.display = 'none';
        }
    }

    // =================================================================================
    // 4. 上传逻辑 (带冲突检测)
    // =================================================================================

    async function handleUpload(e) {
        e.preventDefault();
        const fileInput = document.getElementById('fileInput');
        const folderInput = document.getElementById('folderInput');
        const targetId = document.getElementById('folderSelect').value;
        
        const files = [...fileInput.files, ...folderInput.files];
        if (files.length === 0) return alert('请选择文件');
        
        uploadModal.style.display = 'none';
        processUploadFiles(files, targetId);
    }

    async function processUploadFiles(fileList, targetFolderId) {
        const total = fileList.length;
        let processed = 0;
        let conflictMode = 'rename'; // 默认为重命名，如果用户选择了 applyToAll 可能会变
        let applyToAll = false;

        TaskManager.show(`准备上传 ${total} 个文件...`);

        for (const file of fileList) {
            // 1. 检查文件是否存在 (验重)
            try {
                // 如果已经应用了“全部跳过”或“全部覆盖”或“全部重命名”，则不需要每次弹窗，但如果是overwrite/skip需要知道是否存在
                let skipThis = false;
                let overwriteThis = false;
                
                // 只有在没有 "全部应用" 的情况下，或者 "全部应用" 但模式是 Overwrite/Skip 时需要检测
                // 为了简化，我们每次都检测是否存在
                const checkRes = await axios.post('/api/file/check', { 
                    folderId: targetFolderId, fileName: file.name 
                });

                if (checkRes.data.exists) {
                    if (applyToAll) {
                        if (conflictMode === 'skip') skipThis = true;
                        else if (conflictMode === 'overwrite') overwriteThis = true;
                        // rename 是默认后端行为
                    } else {
                        // 弹出冲突模态框
                        const result = await showConflictModal(file.name);
                        if (result.choice === 'cancel') {
                            TaskManager.error('上传已取消');
                            return;
                        }
                        if (result.applyToAll) {
                            applyToAll = true;
                            conflictMode = result.choice;
                        }

                        if (result.choice === 'skip') skipThis = true;
                        else if (result.choice === 'overwrite') overwriteThis = true;
                    }
                }

                if (skipThis) {
                    processed++;
                    updateProgress(processed, total);
                    continue; 
                }

                // 2. 执行上传
                const formData = new FormData();
                formData.append('file', file);
                
                // 构造查询参数
                let query = `?folderId=${encodeURIComponent(targetFolderId)}`;
                if (overwriteThis || (applyToAll && conflictMode === 'overwrite')) query += '&conflictMode=overwrite';
                else query += '&conflictMode=rename'; // 默认

                await axios.post('/upload' + query, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });

                processed++;
                updateProgress(processed, total);

            } catch (err) {
                console.error(err);
                TaskManager.error(`上传 ${file.name} 失败`);
            }
        }
        
        loadFolder(currentFolderId); // 刷新
        updateUserQuota();
    }

    function showConflictModal(filename) {
        return new Promise((resolve) => {
            const modal = document.getElementById('conflictModal');
            const msg = document.getElementById('conflictMessage');
            const chk = document.getElementById('applyToAllCheckbox');
            
            msg.textContent = `目标文件夹中已存在: ${filename}`;
            chk.checked = false;
            modal.style.display = 'flex'; // flex for centering

            const handleChoice = (choice) => {
                modal.style.display = 'none';
                resolve({ choice, applyToAll: chk.checked });
                cleanup();
            };

            const renameBtn = document.getElementById('conflictRenameBtn');
            const overwriteBtn = document.getElementById('conflictOverwriteBtn');
            const skipBtn = document.getElementById('conflictSkipBtn');
            const cancelBtn = document.getElementById('conflictCancelBtn');

            const cleanup = () => {
                renameBtn.onclick = null;
                overwriteBtn.onclick = null;
                skipBtn.onclick = null;
                cancelBtn.onclick = null;
            };

            renameBtn.onclick = () => handleChoice('rename');
            overwriteBtn.onclick = () => handleChoice('overwrite');
            skipBtn.onclick = () => handleChoice('skip');
            cancelBtn.onclick = () => handleChoice('cancel');
        });
    }

    function updateProgress(current, total) {
        const pct = Math.round((current / total) * 100);
        const taskText = document.getElementById('taskText');
        const taskProgress = document.getElementById('taskProgress');
        taskText.textContent = `上传中 ${current}/${total}`;
        taskProgress.style.width = `${pct}%`;
        if (current === total) {
            setTimeout(() => TaskManager.success('上传完成'), 1000);
        }
    }

    // =================================================================================
    // 5. 上下文菜单与文件操作
    // =================================================================================

    function handleContextMenu(e, item) {
        e.preventDefault();
        // 如果右键的项目不在当前选中列表中，则选中它（单选）
        if (!selectedItems.has(getItemId(item))) {
            selectedItems.clear();
            selectedItems.add(getItemId(item));
            updateSelectionUI();
        }
        
        // 显示菜单
        contextMenu.style.top = `${e.pageY}px`;
        contextMenu.style.left = `${e.pageX}px`;
        contextMenu.style.display = 'block';

        // 根据选中项类型显示/隐藏某些菜单项
        // (此处可扩展: 如果是回收站模式，只显示还原/删除)
        if (isTrashMode) {
            document.querySelectorAll('.normal-mode-btn').forEach(el => el.style.display = 'none');
            // 回收站右键暂未特殊定制，使用顶部栏按钮即可
        } else {
            document.querySelectorAll('.normal-mode-btn').forEach(el => el.style.display = 'block');
        }
    }

    // 绑定菜单按钮事件
    document.getElementById('openBtn').onclick = () => {
        const id = selectedItems.values().next().value;
        const item = items.find(i => getItemId(i) === id);
        if (item) handleItemDblClick(item);
    };

    document.getElementById('downloadBtn').onclick = () => {
        selectedItems.forEach(id => {
            const [type, realId] = parseItemId(id);
            if (type === 'file') {
                const item = items.find(i => getItemId(i) === id);
                // 代理下载
                window.open(`/download/proxy/${item.message_id}`, '_blank');
            }
        });
    };

    document.getElementById('deleteBtn').onclick = () => {
        const itemsToDelete = Array.from(selectedItems).map(id => {
            const [type, realId] = parseItemId(id);
            return { type, id: realId };
        });
        if (itemsToDelete.length === 0) return;

        if (!confirm(`确定删除这 ${itemsToDelete.length} 项吗？`)) return;

        const files = itemsToDelete.filter(i => i.type === 'file').map(i => i.id);
        const folders = itemsToDelete.filter(i => i.type === 'folder').map(i => i.id);

        axios.post('/api/delete', { files, folders, permanent: isTrashMode })
            .then(() => {
                TaskManager.success('删除成功');
                if (isTrashMode) loadTrash(); else loadFolder(currentFolderId);
            })
            .catch(() => TaskManager.error('删除失败'));
    };
    
    // 还原逻辑
    async function handleTrashAction(action) {
        const itemsToProcess = Array.from(selectedItems).map(id => {
            const [type, realId] = parseItemId(id);
            return { type, id: realId };
        });
        if (itemsToProcess.length === 0) return alert('请先选择项目');

        const files = itemsToProcess.filter(i => i.type === 'file').map(i => i.id);
        const folders = itemsToProcess.filter(i => i.type === 'folder').map(i => i.id);
        
        if (action === 'restore') {
             await axios.post('/api/trash/restore', { files, folders });
             loadTrash();
             TaskManager.success('已还原');
        } else {
             // 永久删除
             if(!confirm('永久删除无法恢复，确定吗？')) return;
             await axios.post('/api/delete', { files, folders, permanent: true });
             loadTrash();
             TaskManager.success('已永久删除');
        }
    }

    // 新建文件夹
    document.getElementById('ctxCreateFolderBtn').onclick = async () => {
        const name = prompt('请输入文件夹名称:');
        if (name) {
            try {
                await axios.post('/api/folder/create', { name, parentId: currentFolderId });
                loadFolder(currentFolderId);
            } catch(e) { alert(e.response?.data?.message || '创建失败'); }
        }
    };
    
    // 重命名
    document.getElementById('renameBtn').onclick = async () => {
        const id = selectedItems.values().next().value;
        const item = items.find(i => getItemId(i) === id);
        if(!item) return;
        
        const newName = prompt('重命名:', item.name || item.fileName);
        if(newName && newName !== item.name) {
            try {
                await axios.post('/api/rename', { type: item.type, id: item.id || item.message_id, name: newName });
                loadFolder(currentFolderId);
            } catch(e) { alert('重命名失败'); }
        }
    };
    
    // 分享
    document.getElementById('shareBtn').onclick = () => {
        const id = selectedItems.values().next().value;
        const item = items.find(i => getItemId(i) === id);
        if(!item) return;
        
        // 绑定分享模态框逻辑
        shareModal.style.display = 'block';
        document.getElementById('shareResult').style.display = 'none';
        document.getElementById('shareOptions').style.display = 'block';
        
        document.getElementById('confirmShareBtn').onclick = async () => {
            const expiresIn = document.getElementById('expiresInSelect').value;
            const password = document.getElementById('sharePasswordInput').value;
            let customTime = null;
            if(expiresIn === 'custom') {
                const dt = document.getElementById('customExpiresInput').value;
                if(dt) customTime = new Date(dt).getTime();
            }
            
            try {
                const res = await axios.post('/api/share/create', {
                    itemId: item.id || item.message_id,
                    itemType: item.type,
                    expiresIn, password, customExpiresAt: customTime
                });
                
                document.getElementById('shareOptions').style.display = 'none';
                document.getElementById('shareResult').style.display = 'block';
                const linkDiv = document.getElementById('shareLinkContainer');
                const fullLink = window.location.origin + res.data.link;
                linkDiv.innerHTML = `<a href="${fullLink}" target="_blank">${fullLink}</a>`;
                
                document.getElementById('copyLinkBtn').onclick = () => {
                    navigator.clipboard.writeText(fullLink);
                    alert('链接已复制');
                };
            } catch(e) { alert('分享创建失败'); }
        };
    };

    // 移动 (包含验重逻辑)
    const confirmMoveBtn = document.getElementById('confirmMoveBtn');
    document.getElementById('moveBtn').onclick = () => {
        moveModal.style.display = 'block';
        loadFolderTreeForMove();
    };

    async function loadFolderTreeForMove() {
        const container = document.getElementById('folderTree');
        container.innerHTML = '加载中...';
        try {
            const res = await axios.get('/api/folders'); // 后端需要提供获取所有文件夹树的接口
            // 简单渲染平铺列表或递归树，这里假设返回平铺列表
            let html = '<ul class="folder-tree">';
            // 增加根目录
            html += `<li><div class="tree-item" data-id="${currentFolderId === 'root' ? '' : ''}"><i class="fas fa-home"></i> 根目录 (/)</div></li>`; // 需要后端支持根目录 ID 识别
            
            res.data.forEach(f => {
                html += `<li><div class="tree-item" data-id="${f.encrypted_id}"><i class="fas fa-folder"></i> ${escapeHtml(f.name)}</div></li>`;
            });
            html += '</ul>';
            container.innerHTML = html;
            
            // 绑定点击选择
            container.querySelectorAll('.tree-item').forEach(el => {
                el.onclick = () => {
                    container.querySelectorAll('.tree-item').forEach(x => x.classList.remove('selected'));
                    el.classList.add('selected');
                    selectedMoveTargetId = el.dataset.id;
                    confirmMoveBtn.disabled = false;
                };
            });
        } catch(e) { container.innerHTML = '加载失败'; }
    }

    // 核心修改：移动确认逻辑（带验重）
    if(confirmMoveBtn) confirmMoveBtn.addEventListener('click', async () => {
        if (!selectedMoveTargetId) return;
        
        const files = []; const folders = [];
        const fileNames = []; const folderNames = []; // 新增：分别记录文件名和文件夹名
        
        selectedItems.forEach(id => { 
            const [type, realId] = parseItemId(id); 
            const originalItem = items.find(i => getItemId(i) === id);
            if (originalItem) {
                if (type === 'file') { 
                    files.push(realId); 
                    fileNames.push(originalItem.name); 
                } else { 
                    folders.push(realId); 
                    folderNames.push(originalItem.name); 
                }
            }
        });
        
        try {
            confirmMoveBtn.textContent = '正在检查冲突...';
            confirmMoveBtn.disabled = true;
            
            // 1. 获取目标文件夹内容以进行比对
            const targetRes = await axios.get(`/api/folder/${selectedMoveTargetId}?t=${Date.now()}`);
            const targetContents = targetRes.data.contents;
            
            // 2. 构建目标集合
            const targetFileNames = new Set(targetContents.files.map(f => f.fileName));
            const targetFolderNames = new Set(targetContents.folders.map(f => f.name));
            
            // 3. 计算冲突
            const fileConflicts = fileNames.filter(name => targetFileNames.has(name));
            const folderConflicts = folderNames.filter(name => targetFolderNames.has(name));
            const conflicts = [...fileConflicts, ...folderConflicts]; 
            
            let conflictMode = 'rename'; 
            
            if (conflicts.length > 0) {
                // 弹出冲突对话框
                const result = await showConflictModal(`检测到 ${conflicts.length} 个同名项目 (例如: ${conflicts[0]})`);
                if (result.choice === 'cancel') {
                    confirmMoveBtn.textContent = '确定移动';
                    confirmMoveBtn.disabled = false;
                    moveModal.style.display = 'none';
                    return;
                }
                conflictMode = result.choice;
            }

            confirmMoveBtn.textContent = '移动中...';
            TaskManager.show('正在移动...', 'fas fa-arrows-alt'); 
            
            // 4. 发送移动请求
            await axios.post('/api/move', { 
                files, folders, targetFolderId: selectedMoveTargetId, conflictMode: conflictMode 
            });
            
            TaskManager.success('移动完成');
            moveModal.style.display = 'none';
            selectedItems.clear();
            loadFolder(currentFolderId);
        } catch (e) {
            alert('移动失败: ' + (e.response?.data?.message || e.message));
            TaskManager.error('移动失败');
        } finally {
            confirmMoveBtn.textContent = '确定移动';
            confirmMoveBtn.disabled = false;
        }
    });

    // 预览
    function previewFile(item) {
        const mime = item.mimetype || '';
        const modalContent = document.getElementById('modalContent');
        previewModal.style.display = 'block';
        modalContent.innerHTML = '<div style="text-align:center; padding:50px;"><i class="fas fa-spinner fa-spin fa-3x"></i></div>';
        
        const dlUrl = `/download/proxy/${item.message_id}`;
        
        if (mime.startsWith('image/')) {
            modalContent.innerHTML = `<img src="${dlUrl}" style="max-width:100%; max-height:80vh;">`;
        } else if (mime.startsWith('video/')) {
            modalContent.innerHTML = `<video src="${dlUrl}" controls style="max-width:100%; max-height:80vh;"></video>`;
        } else if (mime.startsWith('text/') || mime === 'application/json' || mime.includes('javascript')) {
            // 简单文本预览，实际可能需要 fetch 内容
            fetch(dlUrl).then(r => r.text()).then(txt => {
                modalContent.innerHTML = `<pre style="background:#f5f5f5; padding:10px; overflow:auto; max-height:80vh;">${escapeHtml(txt)}</pre>`;
            });
        } else {
            modalContent.innerHTML = `<div style="text-align:center; padding:50px;"><i class="fas fa-file fa-5x"></i><p>${item.name}</p><a href="${dlUrl}" class="btn primary-btn">下载文件</a></div>`;
        }
    }

    // =================================================================================
    // 6. 辅助函数
    // =================================================================================
    
    function getItemId(item) {
        if (item.type === 'folder') return `folder:${item.id}`;
        return `file:${item.message_id}`; // Files use message_id string
    }

    function parseItemId(idStr) {
        const parts = idStr.split(':');
        return [parts[0], parts[1]];
    }

    function getIconClass(item) {
        if (item.type === 'folder') return 'fas fa-folder';
        const map = {
            'image': 'fas fa-file-image',
            'video': 'fas fa-file-video',
            'audio': 'fas fa-file-audio',
            'text': 'fas fa-file-alt',
            'pdf': 'fas fa-file-pdf',
            'zip': 'fas fa-file-archive',
            'rar': 'fas fa-file-archive'
        };
        for (const k in map) {
            if (item.mimetype && item.mimetype.includes(k)) return map[k];
        }
        return 'fas fa-file';
    }

    function formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function escapeHtml(text) {
        if (!text) return text;
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function updateToolbarState() {
        if (isTrashMode) {
            document.querySelector('.normal-mode-btn').style.display = 'none';
        } else {
            document.querySelector('.normal-mode-btn').style.display = 'flex';
        }
    }

    async function updateUserQuota() {
        try {
            const res = await axios.get('/api/user/quota');
            const { max, used } = res.data;
            const pct = Math.min(100, Math.round((used / max) * 100));
            document.getElementById('quotaUsed').textContent = formatSize(used);
            document.getElementById('quotaMax').textContent = formatSize(max);
            document.getElementById('quotaBar').style.width = `${pct}%`;
            if (pct > 90) document.getElementById('quotaBar').style.backgroundColor = 'red';
        } catch(e) {}
    }
});

// 全局任务管理器
const TaskManager = {
    show: (text, iconClass) => {
        document.getElementById('taskStatusBar').style.display = 'flex';
        document.getElementById('taskText').textContent = text;
        if(iconClass) document.getElementById('taskIcon').className = iconClass;
        document.getElementById('taskProgress').style.width = '0%';
    },
    success: (text) => {
        document.getElementById('taskText').textContent = text;
        document.getElementById('taskIcon').className = 'fas fa-check-circle';
        document.getElementById('taskProgress').style.width = '100%';
        setTimeout(() => document.getElementById('taskStatusBar').style.display = 'none', 2000);
    },
    error: (text) => {
        document.getElementById('taskText').textContent = text;
        document.getElementById('taskIcon').className = 'fas fa-times-circle';
        document.getElementById('taskIcon').style.color = 'red';
        setTimeout(() => document.getElementById('taskStatusBar').style.display = 'none', 3000);
    }
};
