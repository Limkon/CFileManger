// public/manager.js

document.addEventListener('DOMContentLoaded', () => {
    // --- 状态变量 ---
    let currentFolderId = null; // 加密后的 ID
    let currentPath = [];
    let items = []; // 当前文件夹内容
    let selectedItems = new Set(); // 选中的项目 ID (例如 "file:123" 或 "folder:456")
    let isMultiSelectMode = false;
    let viewMode = localStorage.getItem('viewMode') || 'grid'; // 'grid' | 'list'
    let clipboard = null; // { action: 'move'|'copy', items: [...] } (注：API 暂仅支持移动)

    // --- DOM 元素 ---
    const itemGrid = document.getElementById('itemGrid');
    const itemListView = document.getElementById('itemListView');
    const itemListBody = document.getElementById('itemListBody');
    const breadcrumb = document.getElementById('breadcrumb');
    const searchInput = document.getElementById('searchInput');
    const contextMenu = document.getElementById('contextMenu');
    const uploadModal = document.getElementById('uploadModal');
    const uploadForm = document.getElementById('uploadForm');
    const folderSelect = document.getElementById('folderSelect');
    const progressBar = document.getElementById('progressBar');
    const progressArea = document.getElementById('progressArea');
    const quotaUsedEl = document.getElementById('quotaUsed');
    const quotaMaxEl = document.getElementById('quotaMax');
    const quotaBar = document.getElementById('quotaBar');
    const viewSwitchBtn = document.getElementById('view-switch-btn');
    const previewModal = document.getElementById('previewModal');
    const modalContent = document.getElementById('modalContent');
    const dropZone = document.getElementById('dropZone');
    const dropZoneOverlay = document.getElementById('dropZoneOverlay');

    // --- 初始化 ---
    
    // 从 URL 获取当前文件夹 ID ( /view/:encryptedId )
    const pathParts = window.location.pathname.split('/');
    // 如果是 /view/xxx，取最后一段；如果是 /，则由 worker 重定向
    if (pathParts[1] === 'view' && pathParts[2]) {
        currentFolderId = pathParts[2];
    }

    // 初始化视图模式
    updateViewModeUI();
    
    // 加载数据
    loadFolder(currentFolderId);
    updateQuota();

    // --- 核心功能函数 ---

    async function loadFolder(encryptedId) {
        if (!encryptedId) return;
        
        showLoading();
        try {
            const res = await axios.get(`/api/folder/${encryptedId}`);
            const data = res.data;
            
            items = [...data.contents.folders, ...data.contents.files];
            currentPath = data.path;
            
            renderBreadcrumb();
            renderItems(items);
            updateFolderSelectForUpload(data.contents.folders);
            
            // 更新 URL (如果不是当前页)
            const newUrl = `/view/${encryptedId}`;
            if (window.location.pathname !== newUrl) {
                window.history.pushState({ id: encryptedId }, '', newUrl);
            }
            currentFolderId = encryptedId;
        } catch (error) {
            console.error(error);
            itemGrid.innerHTML = `<div class="error-msg">加载失败: ${error.response?.data?.message || error.message}</div>`;
        }
    }

    function renderBreadcrumb() {
        breadcrumb.innerHTML = '';
        
        // 根目录
        const rootLi = document.createElement('a');
        rootLi.href = '#';
        rootLi.innerHTML = '<i class="fas fa-home"></i> 首页';
        rootLi.onclick = (e) => { e.preventDefault(); loadFolder(currentPath[0]?.encrypted_id); };
        if (currentPath.length === 0) rootLi.classList.add('active');
        breadcrumb.appendChild(rootLi);

        currentPath.forEach((folder, index) => {
            const sep = document.createElement('span');
            sep.className = 'separator';
            sep.textContent = '/';
            breadcrumb.appendChild(sep);

            const a = document.createElement('a');
            a.textContent = folder.name;
            if (index === currentPath.length - 1) {
                a.classList.add('active');
            } else {
                a.href = '#';
                a.onclick = (e) => { e.preventDefault(); loadFolder(folder.encrypted_id); };
            }
            breadcrumb.appendChild(a);
        });
    }

    function renderItems(itemsToRender) {
        itemGrid.innerHTML = '';
        itemListBody.innerHTML = '';
        
        if (itemsToRender.length === 0) {
            const emptyMsg = '<div class="empty-folder">此文件夹为空</div>';
            itemGrid.innerHTML = emptyMsg;
            itemListBody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:20px;">此文件夹为空</td></tr>`;
            return;
        }

        // 网格视图渲染
        itemsToRender.forEach(item => {
            const el = createGridItem(item);
            itemGrid.appendChild(el);
        });

        // 列表视图渲染
        itemsToRender.forEach(item => {
            const el = createListItem(item);
            itemListBody.appendChild(el);
        });
    }

    function createGridItem(item) {
        const div = document.createElement('div');
        div.className = 'grid-item';
        div.dataset.id = getItemId(item);
        div.dataset.type = item.type;
        div.onclick = (e) => handleItemClick(e, item, div);
        div.oncontextmenu = (e) => handleContextMenu(e, item);
        div.ondblclick = () => handleItemDblClick(item);

        const iconClass = getIconClass(item);
        const iconColor = item.type === 'folder' ? '#fbc02d' : '#007bff'; // 文件夹黄色，文件蓝色

        div.innerHTML = `
            <div class="item-icon">
                <i class="${iconClass}" style="color: ${iconColor};"></i>
                ${item.is_locked ? '<i class="fas fa-lock lock-badge"></i>' : ''}
            </div>
            <div class="item-name">${escapeHtml(item.name)}</div>
            ${isMultiSelectMode ? '<div class="select-checkbox"><i class="fas fa-check"></i></div>' : ''}
        `;
        
        if (selectedItems.has(getItemId(item))) {
            div.classList.add('selected');
        }

        return div;
    }

    function createListItem(item) {
        const tr = document.createElement('div');
        tr.className = 'list-row';
        tr.dataset.id = getItemId(item);
        tr.onclick = (e) => handleItemClick(e, item, tr);
        tr.oncontextmenu = (e) => handleContextMenu(e, item);
        tr.ondblclick = () => handleItemDblClick(item);

        const iconClass = getIconClass(item);
        const dateStr = item.date ? new Date(item.date).toLocaleString() : '-';
        const sizeStr = item.size ? formatSize(item.size) : '-';

        tr.innerHTML = `
            <div class="list-col list-col-icon"><i class="${iconClass}"></i></div>
            <div class="list-col list-col-name">${escapeHtml(item.name)}</div>
            <div class="list-col list-col-size">${sizeStr}</div>
            <div class="list-col list-col-date">${dateStr}</div>
        `;

        if (selectedItems.has(getItemId(item))) {
            tr.classList.add('selected');
        }
        return tr;
    }

    function getIconClass(item) {
        if (item.type === 'folder') return 'fas fa-folder';
        // 简单文件类型图标映射
        const ext = item.name.split('.').pop().toLowerCase();
        if (['jpg','jpeg','png','gif'].includes(ext)) return 'fas fa-image';
        if (['mp4','mov','avi'].includes(ext)) return 'fas fa-video';
        if (['mp3','wav'].includes(ext)) return 'fas fa-music';
        if (['pdf'].includes(ext)) return 'fas fa-file-pdf';
        if (['zip','rar','7z'].includes(ext)) return 'fas fa-file-archive';
        if (['txt','md','js','html','css'].includes(ext)) return 'fas fa-file-alt';
        return 'fas fa-file';
    }

    // --- 交互逻辑 ---

    function handleItemClick(e, item, el) {
        const id = getItemId(item);
        
        if (e.ctrlKey || isMultiSelectMode) {
            // 多选模式
            if (selectedItems.has(id)) {
                selectedItems.delete(id);
                el.classList.remove('selected');
            } else {
                selectedItems.add(id);
                el.classList.add('selected');
            }
        } else {
            // 单选
            document.querySelectorAll('.selected').forEach(x => x.classList.remove('selected'));
            selectedItems.clear();
            selectedItems.add(id);
            el.classList.add('selected');
        }
        updateContextMenuState();
    }

    function handleItemDblClick(item) {
        if (item.type === 'folder') {
            loadFolder(item.encrypted_id);
        } else {
            // 预览或下载
            previewFile(item);
        }
    }

    function handleContextMenu(e, item) {
        e.preventDefault();
        
        // 如果右键点击了未选中的项目，且当前不是多选状态，则选中该项目
        const id = getItemId(item);
        if (!selectedItems.has(id)) {
            document.querySelectorAll('.selected').forEach(x => x.classList.remove('selected'));
            selectedItems.clear();
            selectedItems.add(id);
            // 重新渲染选中状态
            const selector = viewMode === 'grid' ? `.grid-item[data-id="${id}"]` : `.list-row[data-id="${id}"]`;
            const el = document.querySelector(selector);
            if(el) el.classList.add('selected');
        }

        updateContextMenuState();
        
        // 显示菜单
        const x = e.clientX;
        const y = e.clientY;
        contextMenu.style.top = `${y}px`;
        contextMenu.style.left = `${x}px`;
        contextMenu.classList.add('show');
        
        // 点击其他地方关闭
        document.addEventListener('click', closeContextMenu, { once: true });
    }

    function closeContextMenu() {
        contextMenu.classList.remove('show');
    }

    // --- 操作逻辑 ---

    // 1. 新建文件夹
    document.getElementById('createFolderBtn').addEventListener('click', async () => {
        const name = prompt('请输入文件夹名称:');
        if (name) {
            try {
                // 需要 decrypt 解密 currentFolderId 得到 parentId (int)
                // 但这里我们传递 encrypted_parent_id 给 API，由后端解密
                // 或者我们假设 API 接受 encrypted_id
                // 查看 worker.js，我们需要添加对应 API
                await axios.post('/api/folder/create', { 
                    name, 
                    parentId: currentFolderId // 这里的 currentFolderId 是 encrypted 的
                });
                loadFolder(currentFolderId);
            } catch (error) {
                alert('创建失败: ' + (error.response?.data?.message || error.message));
            }
        }
    });

    // 2. 删除
    document.getElementById('deleteBtn').addEventListener('click', async () => {
        if (!confirm(`确定要删除选中的 ${selectedItems.size} 个项目吗？`)) return;
        
        const files = [];
        const folders = [];
        
        selectedItems.forEach(id => {
            const [type, realId] = parseItemId(id);
            if (type === 'file') files.push(realId);
            else folders.push(realId);
        });

        try {
            await axios.post('/api/delete', { files, folders });
            selectedItems.clear();
            loadFolder(currentFolderId);
            updateQuota();
        } catch (error) {
            alert('删除失败: ' + (error.response?.data?.message || error.message));
        }
    });

    // 3. 重命名
    document.getElementById('renameBtn').addEventListener('click', async () => {
        if (selectedItems.size !== 1) return;
        const idStr = Array.from(selectedItems)[0];
        const [type, id] = parseItemId(idStr);
        const item = items.find(i => getItemId(i) === idStr);
        
        const newName = prompt('重命名:', item.name);
        if (newName && newName !== item.name) {
            try {
                await axios.post('/api/rename', { type, id, name: newName });
                loadFolder(currentFolderId);
            } catch (error) {
                alert('重命名失败: ' + (error.response?.data?.message || error.message));
            }
        }
    });

    // 4. 上传
    document.getElementById('showUploadModalBtn').addEventListener('click', () => {
        uploadModal.style.display = 'block';
    });
    document.getElementById('closeUploadModalBtn').addEventListener('click', () => {
        uploadModal.style.display = 'none';
    });

    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const files = document.getElementById('fileInput').files;
        // 注意：WebkitDirectory 输入在 folderInput
        const folderFiles = document.getElementById('folderInput').files;
        
        const allFiles = [...files, ...folderFiles];
        if (allFiles.length === 0) return alert('请选择文件');

        // 获取选中的目标文件夹 ID (解密后的真实 ID 需要后端处理，这里传 encrypted)
        // uploadForm 中的 select value 应该是 encrypted id
        const targetEncryptedId = folderSelect.value || currentFolderId;

        const formData = new FormData();
        allFiles.forEach(f => formData.append('files', f));
        
        // 传递 folderId 参数 (worker.js 需要解析)
        // 注意：worker.js 需要能够处理 query param 或 body param 的 folderId
        // 这里我们通过 URL 参数传递 folderId (如果 worker 支持) 或者放入 formData
        // 假设 worker.js 接收 formData 中的 folderId 字段 (需要修改 worker logic 接收)
        // 或者我们通过 URL query: /upload?folderId=...
        // 这里使用 Query String 比较稳妥，因为 FormData 的混合解析可能复杂
        
        // 然而，currentFolderId 是加密的。worker.js 需要解密。
        // 我们假设 worker.js 的 /upload 路由会处理 ?folderId=ENCRYPTED_ID
        
        progressArea.style.display = 'block';
        
        try {
            await axios.post(`/upload?folderId=${targetEncryptedId}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (progressEvent) => {
                    const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    progressBar.style.width = percent + '%';
                    progressBar.textContent = percent + '%';
                }
            });
            
            alert('上传成功');
            uploadModal.style.display = 'none';
            uploadForm.reset();
            progressArea.style.display = 'none';
            progressBar.style.width = '0%';
            loadFolder(currentFolderId);
            updateQuota();
        } catch (error) {
            alert('上传失败: ' + (error.response?.data?.message || error.message));
            progressArea.style.display = 'none';
        }
    });

    // 5. 视图切换
    viewSwitchBtn.addEventListener('click', () => {
        viewMode = viewMode === 'grid' ? 'list' : 'grid';
        localStorage.setItem('viewMode', viewMode);
        updateViewModeUI();
        renderItems(items);
    });

    function updateViewModeUI() {
        if (viewMode === 'grid') {
            itemGrid.style.display = 'grid';
            itemListView.style.display = 'none';
            viewSwitchBtn.innerHTML = '<i class="fas fa-list"></i>';
        } else {
            itemGrid.style.display = 'none';
            itemListView.style.display = 'block';
            viewSwitchBtn.innerHTML = '<i class="fas fa-th-large"></i>';
        }
    }

    // 6. 下载
    document.getElementById('downloadBtn').addEventListener('click', () => {
        if (selectedItems.size !== 1) return;
        const idStr = Array.from(selectedItems)[0];
        const [type, id] = parseItemId(idStr);
        if (type !== 'file') return alert('只能下载文件');
        
        // 使用 window.open 或创建 a 标签下载
        // id 这里是 message_id (string)
        window.open(`/download/proxy/${id}`, '_blank');
    });

    // --- 辅助函数 ---

    function getItemId(item) {
        // 统一 ID 格式: "file:123" 或 "folder:456"
        // 文件的 id 是 message_id, 文件夹 id 是 id
        if (item.type === 'file') return `file:${item.message_id}`;
        return `folder:${item.id}`;
    }

    function parseItemId(idStr) {
        const parts = idStr.split(':');
        return [parts[0], parts[1]];
    }

    function escapeHtml(text) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    function formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function updateQuota() {
        // 调用后端 API 获取配额
        // 假设 worker.js 没有单独的 quota API，但 /api/folder/root 或 similar 可能返回
        // 我们可以在 /api/folder 返回中带上 quota info，或者单独调用
        // 这里暂且不做，或假设有一个 /api/user/quota
        // 目前 worker.js 暂未实现 /api/user/quota，需要补充
    }

    function showLoading() {
        itemGrid.innerHTML = '<div class="loading">加载中...</div>';
    }

    function updateFolderSelectForUpload(folders) {
        folderSelect.innerHTML = `<option value="${currentFolderId}">当前文件夹</option>`;
        folders.forEach(f => {
            const option = document.createElement('option');
            option.value = f.encrypted_id;
            option.textContent = f.name;
            folderSelect.appendChild(option);
        });
    }

    function updateContextMenuState() {
        const count = selectedItems.size;
        const isSingle = count === 1;
        const selectedArr = Array.from(selectedItems);
        const firstType = isSingle ? parseItemId(selectedArr[0])[0] : null;

        document.getElementById('openBtn').disabled = !(isSingle && firstType === 'folder');
        document.getElementById('downloadBtn').disabled = !(isSingle && firstType === 'file');
        document.getElementById('renameBtn').disabled = !isSingle;
        document.getElementById('deleteBtn').disabled = count === 0;
        document.getElementById('moveBtn').disabled = count === 0;
        // ... 其他按钮状态更新
    }

    // --- 拖拽上传支持 ---
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZoneOverlay.style.display = 'flex';
    });
    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZoneOverlay.style.display = 'none';
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZoneOverlay.style.display = 'none';
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            document.getElementById('fileInput').files = files; // 这是一个 hack，可能不工作
            // 更好的方式是直接调用上传逻辑
            // populate upload modal and show it
            uploadModal.style.display = 'block';
            // 实际上 input[type=file] 是只读的，不能直接赋值
            // 我们需要构建一个新的 FormData 流程或提示用户
            alert('请在上传窗口中选择文件 (浏览器限制拖拽直接上传)'); 
        }
    });

    // 搜索
    const searchForm = document.getElementById('searchForm');
    searchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const q = searchInput.value.trim();
        if(!q) return loadFolder(currentFolderId);
        
        showLoading();
        try {
            const res = await axios.get(`/api/search?q=${encodeURIComponent(q)}`);
            // 假设后端返回 { folders: [], files: [] }
            items = [...res.data.folders, ...res.data.files];
            renderItems(items);
            breadcrumb.innerHTML = '<span>搜索结果</span>';
        } catch(e) {
            alert('搜索失败');
        }
    });

    // 退出登录
    document.getElementById('logoutBtn').addEventListener('click', () => {
        window.location.href = '/logout';
    });
});
