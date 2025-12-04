// public/manager.js

document.addEventListener('DOMContentLoaded', () => {
    let currentFolderId = null; 
    let currentPath = [];       
    let items = [];             
    let selectedItems = new Set(); 
    let isMultiSelectMode = false; 
    let viewMode = localStorage.getItem('viewMode') || 'grid'; 
    let isTrashMode = false; // 新增：回收站模式

    const itemGrid = document.getElementById('itemGrid');
    const itemListView = document.getElementById('itemListView');
    const itemListBody = document.getElementById('itemListBody');
    const breadcrumb = document.getElementById('breadcrumb');
    const searchInput = document.getElementById('searchInput');
    const searchForm = document.getElementById('searchForm');
    
    // 模态框与按钮
    const uploadModal = document.getElementById('uploadModal');
    const uploadForm = document.getElementById('uploadForm');
    const folderSelect = document.getElementById('folderSelect');
    const progressBar = document.getElementById('progressBar');
    const progressArea = document.getElementById('progressArea');
    const fileInput = document.getElementById('fileInput');
    const folderInput = document.getElementById('folderInput');
    
    const quotaUsedEl = document.getElementById('quotaUsed');
    const quotaMaxEl = document.getElementById('quotaMax');
    const quotaBar = document.getElementById('quotaBar');
    
    const contextMenu = document.getElementById('contextMenu');
    const viewSwitchBtn = document.getElementById('view-switch-btn');
    const trashBtn = document.getElementById('trashBtn'); // 回收站按钮
    const trashBanner = document.getElementById('trashBanner'); // 回收站横幅
    const emptyTrashBtn = document.getElementById('emptyTrashBtn'); // 清空回收站按钮
    const dropZone = document.getElementById('dropZone');
    const dropZoneOverlay = document.getElementById('dropZoneOverlay');

    // Move Modal
    const moveModal = document.getElementById('moveModal');
    const folderTree = document.getElementById('folderTree');
    const confirmMoveBtn = document.getElementById('confirmMoveBtn');
    const cancelMoveBtn = document.getElementById('cancelMoveBtn');
    let selectedMoveTargetId = null;

    // Share Modal
    const shareModal = document.getElementById('shareModal');
    const confirmShareBtn = document.getElementById('confirmShareBtn');
    const cancelShareBtn = document.getElementById('cancelShareBtn');
    const closeShareModalBtn = document.getElementById('closeShareModalBtn');
    const expiresInSelect = document.getElementById('expiresInSelect');
    const customExpiresInput = document.getElementById('customExpiresInput');
    const sharePasswordInput = document.getElementById('sharePasswordInput');
    const shareResult = document.getElementById('shareResult');
    const shareLinkContainer = document.getElementById('shareLinkContainer');
    const copyLinkBtn = document.getElementById('copyLinkBtn');

    // Preview Modal
    const previewModal = document.getElementById('previewModal');
    const modalContent = document.getElementById('modalContent');
    const closePreviewBtn = document.querySelector('#previewModal .close-button');

    const pathParts = window.location.pathname.split('/');
    if (pathParts[1] === 'view' && pathParts[2]) {
        currentFolderId = pathParts[2];
    }

    updateViewModeUI();
    loadFolder(currentFolderId);
    updateQuota();

    async function loadFolder(encryptedId) {
        if (!encryptedId && !isTrashMode) return;
        
        isTrashMode = false; // 正常加载文件夹时退出回收站模式
        trashBanner.style.display = 'none';
        selectedItems.clear();
        updateContextMenuState();
        
        try {
            const res = await axios.get(`/api/folder/${encryptedId}`);
            const data = res.data;
            items = [...data.contents.folders, ...data.contents.files];
            currentPath = data.path;
            
            renderBreadcrumb();
            renderItems(items);
            updateFolderSelectForUpload(data.contents.folders);
            
            const newUrl = `/view/${encryptedId}`;
            if (window.location.pathname !== newUrl) {
                window.history.pushState({ id: encryptedId }, '', newUrl);
            }
            currentFolderId = encryptedId;
            if (searchInput.value) searchInput.value = '';
        } catch (error) {
            console.error(error);
        }
    }

    // 加载回收站
    async function loadTrash() {
        isTrashMode = true;
        currentFolderId = null; // 回收站没有目录结构
        selectedItems.clear();
        updateContextMenuState();
        trashBanner.style.display = 'flex';
        breadcrumb.innerHTML = '<span><i class="fas fa-trash-restore"></i> 回收站</span>';
        
        try {
            const res = await axios.get('/api/trash');
            items = [...res.data.folders, ...res.data.files];
            renderItems(items);
        } catch (e) {
            alert('加载回收站失败');
        }
    }
    
    trashBtn.addEventListener('click', loadTrash);

    emptyTrashBtn.addEventListener('click', async () => {
        if(confirm('确定要清空回收站吗？此操作无法撤销。')) {
            try {
                await axios.post('/api/trash/empty');
                loadTrash();
                updateQuota();
            } catch(e) { alert('操作失败'); }
        }
    });

    async function updateQuota() {
        try {
            const res = await axios.get('/api/user/quota');
            const { used, max } = res.data;
            quotaUsedEl.textContent = formatSize(used);
            const maxVal = parseInt(max);
            const isUnlimited = maxVal === 0;
            quotaMaxEl.textContent = isUnlimited ? '无限' : formatSize(maxVal);
            if (!isUnlimited && maxVal > 0) {
                const percent = Math.min(100, Math.round((used / maxVal) * 100));
                quotaBar.style.width = `${percent}%`;
                if (percent > 90) quotaBar.style.backgroundColor = '#dc3545';
                else if (percent > 70) quotaBar.style.backgroundColor = '#ffc107';
                else quotaBar.style.backgroundColor = '#28a745';
            } else {
                quotaBar.style.width = '0%';
            }
        } catch (error) {}
    }

    function renderBreadcrumb() {
        if(isTrashMode) return; 
        breadcrumb.innerHTML = '';
        const rootLi = document.createElement('a');
        rootLi.href = '#';
        rootLi.innerHTML = '<i class="fas fa-home"></i> 首頁';
        rootLi.onclick = (e) => { e.preventDefault(); if(currentPath.length > 0) loadFolder(currentPath[0].encrypted_id); };
        breadcrumb.appendChild(rootLi);
        currentPath.forEach((folder, index) => {
            const sep = document.createElement('span');
            sep.className = 'separator'; sep.textContent = '/';
            breadcrumb.appendChild(sep);
            const a = document.createElement('a');
            a.textContent = folder.name;
            if (index === currentPath.length - 1) { a.classList.add('active'); } 
            else { a.href = '#'; a.onclick = (e) => { e.preventDefault(); loadFolder(folder.encrypted_id); }; }
            breadcrumb.appendChild(a);
        });
    }

    function renderItems(itemsToRender) {
        itemGrid.innerHTML = '';
        itemListBody.innerHTML = '';
        if (itemsToRender.length === 0) {
            itemGrid.innerHTML = '<div class="empty-folder" style="text-align:center; padding:50px; color:#999;"><i class="fas fa-folder-open" style="font-size:48px; margin-bottom:10px;"></i><p>此位置为空</p></div>';
            itemListBody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:#999;">为空</td></tr>`;
            return;
        }
        itemsToRender.forEach(item => {
            itemGrid.appendChild(createGridItem(item));
            itemListBody.appendChild(createListItem(item));
        });
    }

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

    function createListItem(item) {
        const div = document.createElement('div');
        div.className = 'list-row list-item';
        if(isTrashMode) div.classList.add('deleted');
        div.dataset.id = getItemId(item);
        div.onclick = (e) => handleItemClick(e, item, div);
        div.oncontextmenu = (e) => handleContextMenu(e, item);
        div.ondblclick = () => handleItemDblClick(item);

        const iconClass = getIconClass(item);
        const dateStr = item.date ? new Date(item.date).toLocaleString() : (item.deleted_at ? new Date(item.deleted_at).toLocaleString() : '-');
        const sizeStr = item.size !== undefined ? formatSize(item.size) : '-';

        div.innerHTML = `
            <div class="list-icon"><i class="${iconClass}" style="color: ${item.type === 'folder' ? '#fbc02d' : '#555'}"></i></div>
            <div class="list-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
            <div class="list-size">${sizeStr}</div>
            <div class="list-date">${dateStr}</div>
        `;
        if (selectedItems.has(getItemId(item))) div.classList.add('selected');
        return div;
    }

    function getIconClass(item) {
        if (item.type === 'folder') return 'fas fa-folder';
        const ext = item.name.split('.').pop().toLowerCase();
        if (['jpg','jpeg','png','gif','bmp','webp'].includes(ext)) return 'fas fa-file-image';
        if (['mp4','mov','avi','mkv','webm'].includes(ext)) return 'fas fa-file-video';
        if (['mp3','wav','ogg','flac'].includes(ext)) return 'fas fa-file-audio';
        if (['pdf'].includes(ext)) return 'fas fa-file-pdf';
        if (['zip','rar','7z','tar','gz'].includes(ext)) return 'fas fa-file-archive';
        if (['txt','md','js','html','css','json','py','java'].includes(ext)) return 'fas fa-file-alt';
        return 'fas fa-file';
    }

    function handleItemClick(e, item, el) {
        const id = getItemId(item);
        if (e.ctrlKey || isMultiSelectMode) {
            if (selectedItems.has(id)) { selectedItems.delete(id); el.classList.remove('selected'); } 
            else { selectedItems.add(id); el.classList.add('selected'); }
        } else {
            document.querySelectorAll('.selected').forEach(x => x.classList.remove('selected'));
            selectedItems.clear(); selectedItems.add(id); el.classList.add('selected');
        }
        updateContextMenuState();
    }

    function handleItemDblClick(item) {
        if(isTrashMode) return; // 回收站项目不可直接打开
        if (item.type === 'folder') { loadFolder(item.encrypted_id); } 
        else { 
            const ext = item.name.split('.').pop().toLowerCase();
            if (['txt', 'md', 'js', 'html', 'css', 'json', 'xml', 'py', 'java'].includes(ext)) {
                 window.open(`/editor.html?id=${item.message_id}&name=${encodeURIComponent(item.name)}`, '_blank');
            } else { window.open(`/download/proxy/${item.message_id}`, '_blank'); }
        }
    }

    function handleContextMenu(e, item) {
        e.preventDefault();
        const id = getItemId(item);
        if (!selectedItems.has(id)) {
            document.querySelectorAll('.selected').forEach(x => x.classList.remove('selected'));
            selectedItems.clear(); selectedItems.add(id);
            const selector = viewMode === 'grid' ? `.grid-item[data-id="${id}"]` : `.list-row[data-id="${id}"]`;
            const el = document.querySelector(selector); if(el) el.classList.add('selected');
        }
        updateContextMenuState();
        
        let x = e.clientX; let y = e.clientY;
        const menuWidth = 200; const menuHeight = 350;
        if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10;
        if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10;
        contextMenu.style.top = `${y}px`; contextMenu.style.left = `${x}px`;
        contextMenu.style.display = 'flex';
        document.addEventListener('click', () => contextMenu.style.display = 'none', { once: true });
    }

    function updateContextMenuState() {
        const count = selectedItems.size;
        const isSingle = count === 1;
        let firstType = null;
        if (isSingle) firstType = parseItemId(Array.from(selectedItems)[0])[0];

        // 切换模式：回收站 vs 正常
        const normalBtns = document.querySelectorAll('.normal-mode-btn');
        const trashBtns = document.querySelectorAll('.trash-mode-btn');

        if (isTrashMode) {
            normalBtns.forEach(b => b.style.display = 'none');
            trashBtns.forEach(b => b.style.display = 'flex');
        } else {
            normalBtns.forEach(b => b.style.display = 'flex');
            trashBtns.forEach(b => b.style.display = 'none');
            
            // 正常模式下的具体禁用逻辑
            const setDisabled = (id, disabled) => { const btn = document.getElementById(id); if (btn) btn.disabled = disabled; };
            setDisabled('openBtn', !(isSingle && firstType === 'folder'));
            setDisabled('downloadBtn', !(isSingle && firstType === 'file'));
            setDisabled('renameBtn', !isSingle);
            setDisabled('deleteBtn', count === 0);
            setDisabled('previewBtn', !isSingle || firstType === 'folder'); 
            setDisabled('shareBtn', !isSingle);
            setDisabled('moveBtn', count === 0); 
            setDisabled('lockBtn', !(isSingle && firstType === 'folder')); 
        }
        
        // 更新恢复/永久删除按钮状态
        if(isTrashMode) {
             // 回收站模式下，只要选中就能操作
        }

        const infoEl = document.getElementById('selectionInfo');
        if (count > 0) { infoEl.style.display = 'block'; infoEl.textContent = `已选中 ${count} 个项目`; } 
        else { infoEl.style.display = 'none'; }
    }

    // --- 按钮逻辑 ---
    document.getElementById('createFolderBtn').addEventListener('click', async () => {
        const name = prompt('请输入文件夹名称:');
        if (name && name.trim()) {
            try { await axios.post('/api/folder/create', { name: name.trim(), parentId: currentFolderId }); loadFolder(currentFolderId); } 
            catch (error) { alert('创建失败'); }
        }
    });
    document.getElementById('textEditBtn').addEventListener('click', () => {
        if (selectedItems.size === 1) {
             const [type, id] = parseItemId(Array.from(selectedItems)[0]);
             if (type === 'file') {
                 const item = items.find(i => getItemId(i) === Array.from(selectedItems)[0]);
                 window.open(`/editor.html?id=${id}&name=${encodeURIComponent(item.name)}`, '_blank');
                 return;
             }
        }
        alert('请先上传一个文本文件，然后选中它进行编辑。');
    });
    document.getElementById('deleteBtn').addEventListener('click', async () => {
        if (selectedItems.size === 0) return;
        if (!confirm(`确定要删除选中的 ${selectedItems.size} 个项目吗？`)) return;
        const files = []; const folders = [];
        selectedItems.forEach(id => { const [type, realId] = parseItemId(id); if (type === 'file') files.push(realId); else folders.push(realId); });
        try { await axios.post('/api/delete', { files, folders, permanent: false }); selectedItems.clear(); loadFolder(currentFolderId); updateQuota(); } 
        catch (error) { alert('删除失败'); }
    });
    // 恢复按钮
    document.getElementById('restoreBtn').addEventListener('click', async () => {
        if (selectedItems.size === 0) return;
        const files = []; const folders = [];
        selectedItems.forEach(id => { const [type, realId] = parseItemId(id); if (type === 'file') files.push(realId); else folders.push(realId); });
        try { await axios.post('/api/trash/restore', { files, folders }); selectedItems.clear(); loadTrash(); updateQuota(); } 
        catch (error) { alert('恢复失败'); }
    });
    // 永久删除
    document.getElementById('deleteForeverBtn').addEventListener('click', async () => {
        if (selectedItems.size === 0) return;
        if (!confirm('确定要永久删除吗？此操作无法撤销！')) return;
        const files = []; const folders = [];
        selectedItems.forEach(id => { const [type, realId] = parseItemId(id); if (type === 'file') files.push(realId); else folders.push(realId); });
        try { await axios.post('/api/delete', { files, folders, permanent: true }); selectedItems.clear(); loadTrash(); updateQuota(); } 
        catch (error) { alert('永久删除失败'); }
    });

    document.getElementById('renameBtn').addEventListener('click', async () => {
        if (selectedItems.size !== 1) return;
        const idStr = Array.from(selectedItems)[0]; const [type, id] = parseItemId(idStr); const item = items.find(i => getItemId(i) === idStr);
        const newName = prompt('重命名:', item.name);
        if (newName && newName !== item.name) {
            try { await axios.post('/api/rename', { type, id, name: newName }); loadFolder(currentFolderId); } catch (error) { alert('重命名失败'); }
        }
    });
    document.getElementById('downloadBtn').addEventListener('click', () => {
        if (selectedItems.size !== 1) return;
        const [type, id] = parseItemId(Array.from(selectedItems)[0]);
        if (type !== 'file') return alert('只能下载文件');
        window.open(`/download/proxy/${id}`, '_blank');
    });
    document.getElementById('openBtn').addEventListener('click', () => {
         if (selectedItems.size !== 1) return;
         const item = items.find(i => getItemId(i) === Array.from(selectedItems)[0]);
         if(item && item.type === 'folder') loadFolder(item.encrypted_id);
    });
    document.getElementById('previewBtn').addEventListener('click', async () => {
        if (selectedItems.size !== 1) return;
        const idStr = Array.from(selectedItems)[0]; const [type, id] = parseItemId(idStr); const item = items.find(i => getItemId(i) === idStr);
        if (!item || type !== 'file') return;
        const ext = item.name.split('.').pop().toLowerCase();
        const downloadUrl = `/download/proxy/${id}`;
        let content = '';
        if (['jpg','jpeg','png','gif','webp','svg'].includes(ext)) content = `<img src="${downloadUrl}" style="max-width:100%; max-height:80vh;">`;
        else if (['mp4','webm'].includes(ext)) content = `<video src="${downloadUrl}" controls style="max-width:100%; max-height:80vh;"></video>`;
        else if (['mp3','wav','ogg'].includes(ext)) content = `<audio src="${downloadUrl}" controls></audio>`;
        else if (['txt','md','json','js','css','html','xml','log'].includes(ext)) {
             try {
                 modalContent.innerHTML = '<p>正在加载...</p>'; previewModal.style.display = 'flex';
                 const res = await axios.get(downloadUrl, { responseType: 'text' });
                 content = `<pre>${escapeHtml(res.data)}</pre>`;
             } catch(e) { content = `<p style="color:red">无法预览: ${e.message}</p>`; }
        } else content = `<div class="no-preview"><i class="fas fa-file" style="font-size:48px;margin-bottom:20px;"></i><p>不支持预览</p><a href="${downloadUrl}" class="upload-link-btn">下载文件</a></div>`;
        modalContent.innerHTML = content; previewModal.style.display = 'flex';
    });
    closePreviewBtn.onclick = () => previewModal.style.display = 'none';
    
    document.getElementById('lockBtn').addEventListener('click', async () => {
        if (selectedItems.size !== 1) return;
        const item = items.find(i => getItemId(i) === Array.from(selectedItems)[0]);
        if (item.type !== 'folder') return;
        const password = prompt('设置文件夹密码 (留空则不设置):');
        if (password === null) return;
        try { await axios.post('/api/folder/lock', { folderId: item.encrypted_id, password: password }); alert('设置成功'); loadFolder(currentFolderId); } 
        catch (e) { alert('操作失败'); }
    });

    viewSwitchBtn.addEventListener('click', () => {
        viewMode = viewMode === 'grid' ? 'list' : 'grid';
        localStorage.setItem('viewMode', viewMode);
        updateViewModeUI();
        renderItems(items);
    });

    function updateViewModeUI() {
        if (viewMode === 'grid') {
            itemGrid.style.display = 'grid'; itemListView.style.display = 'none';
            viewSwitchBtn.innerHTML = '<i class="fas fa-list"></i>';
        } else {
            itemGrid.style.display = 'none'; itemListView.style.display = 'block';
            viewSwitchBtn.innerHTML = '<i class="fas fa-th-large"></i>';
        }
    }
    
    searchForm.addEventListener('submit', async (e) => {
        e.preventDefault(); const q = searchInput.value.trim(); if(!q) return loadFolder(currentFolderId);
        try {
            const res = await axios.get(`/api/search?q=${encodeURIComponent(q)}`);
            items = [...res.data.folders, ...res.data.files];
            renderItems(items);
            breadcrumb.innerHTML = '<span><i class="fas fa-search"></i> 搜索结果</span><a href="#" onclick="location.reload()" style="margin-left:10px;">退出搜索</a>';
        } catch(e) { alert('搜索失败'); }
    });
    
    // Move
    async function loadAllFolders() {
        try {
            const res = await axios.get('/api/folders');
            folderTree.innerHTML = '';
            const rootDiv = document.createElement('div');
            rootDiv.className = 'folder-item'; rootDiv.textContent = '/ (根目录)';
            rootDiv.dataset.id = res.data.find(f => !f.parent_id)?.encrypted_id || (currentPath.length>0?currentPath[0].encrypted_id:'');
            rootDiv.onclick = () => selectMoveTarget(rootDiv); folderTree.appendChild(rootDiv);
            res.data.forEach(f => {
                const div = document.createElement('div'); div.className = 'folder-item'; div.style.paddingLeft = '20px';
                div.innerHTML = `<i class="fas fa-folder" style="color:#fbc02d;"></i> ${escapeHtml(f.name)}`;
                div.dataset.id = f.encrypted_id; div.onclick = () => selectMoveTarget(div); folderTree.appendChild(div);
            });
        } catch (e) {}
    }
    function selectMoveTarget(el) {
        document.querySelectorAll('.folder-item.selected').forEach(e => e.classList.remove('selected'));
        el.classList.add('selected'); selectedMoveTargetId = el.dataset.id; confirmMoveBtn.disabled = false;
    }
    document.getElementById('moveBtn').addEventListener('click', () => {
        if (selectedItems.size === 0) return; selectedMoveTargetId = null; confirmMoveBtn.disabled = true; moveModal.style.display = 'flex'; loadAllFolders();
    });
    confirmMoveBtn.addEventListener('click', async () => {
        if (!selectedMoveTargetId) return;
        const files = []; const folders = [];
        selectedItems.forEach(id => { const [type, realId] = parseItemId(id); if (type === 'file') files.push(realId); else folders.push(realId); });
        try {
            confirmMoveBtn.textContent = '移动中...';
            await axios.post('/api/move', { files, folders, targetFolderId: selectedMoveTargetId });
            moveModal.style.display = 'none'; selectedItems.clear(); loadFolder(currentFolderId);
        } catch (e) { alert('移动失败'); } finally { confirmMoveBtn.textContent = '确定移动'; }
    });
    cancelMoveBtn.onclick = () => moveModal.style.display = 'none';
    
    // Share
    document.getElementById('shareBtn').addEventListener('click', () => {
        if (selectedItems.size !== 1) return;
        shareModal.style.display = 'flex'; document.getElementById('shareOptions').style.display = 'block'; shareResult.style.display = 'none';
        sharePasswordInput.value = ''; customExpiresInput.style.display = 'none'; expiresInSelect.value = '24h';
    });
    expiresInSelect.addEventListener('change', () => { customExpiresInput.style.display = expiresInSelect.value === 'custom' ? 'block' : 'none'; });
    confirmShareBtn.addEventListener('click', async () => {
        const [type, id] = parseItemId(Array.from(selectedItems)[0]);
        const expiresIn = expiresInSelect.value;
        let customTime = null;
        if (expiresIn === 'custom') { const d = new Date(customExpiresInput.value); if (isNaN(d.getTime())) return alert('时间无效'); customTime = d.getTime(); }
        try {
            const res = await axios.post('/api/share/create', { itemId: id, itemType: type, expiresIn, customExpiresAt: customTime, password: sharePasswordInput.value });
            if (res.data.success) {
                document.getElementById('shareOptions').style.display = 'none'; shareResult.style.display = 'block';
                const link = `${window.location.origin}${res.data.link}`;
                shareLinkContainer.textContent = link; copyLinkBtn.dataset.link = link;
            }
        } catch (e) { alert('分享失败'); }
    });
    copyLinkBtn.addEventListener('click', () => navigator.clipboard.writeText(copyLinkBtn.dataset.link).then(() => alert('已复制')));
    closeShareModalBtn.onclick = cancelShareBtn.onclick = () => shareModal.style.display = 'none';

    // Upload
    document.getElementById('showUploadModalBtn').addEventListener('click', () => uploadModal.style.display = 'block');
    document.getElementById('closeUploadModalBtn').addEventListener('click', () => uploadModal.style.display = 'none');
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const allFiles = [...fileInput.files, ...folderInput.files];
        if (allFiles.length === 0) return alert('请选择文件');
        const targetEncryptedId = folderSelect.value || currentFolderId;
        const formData = new FormData();
        allFiles.forEach(f => formData.append('files', f));
        progressArea.style.display = 'block'; progressBar.style.width = '0%'; progressBar.textContent = '0%';
        try {
            await axios.post(`/upload?folderId=${targetEncryptedId}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (p) => { const percent = Math.round((p.loaded * 100) / p.total); progressBar.style.width = percent + '%'; progressBar.textContent = percent + '%'; }
            });
            alert('上传成功'); uploadModal.style.display = 'none'; uploadForm.reset(); progressArea.style.display = 'none';
            loadFolder(currentFolderId); updateQuota();
        } catch (error) { alert('上传失败'); progressArea.style.display = 'none'; }
    });
    function updateFolderSelectForUpload(folders) {
        folderSelect.innerHTML = `<option value="${currentFolderId}">当前文件夹</option>`;
        if (folders) folders.forEach(f => { const op = document.createElement('option'); op.value = f.encrypted_id; op.textContent = f.name; folderSelect.appendChild(op); });
    }

    document.getElementById('logoutBtn').addEventListener('click', () => window.location.href = '/logout');
    document.getElementById('multiSelectToggleBtn').addEventListener('click', () => {
        isMultiSelectMode = !isMultiSelectMode;
        document.body.classList.toggle('selection-mode-active', isMultiSelectMode);
        document.getElementById('multiSelectToggleBtn').classList.toggle('active', isMultiSelectMode);
        renderItems(items); contextMenu.style.display = 'none';
    });
    document.getElementById('selectAllBtn').addEventListener('click', () => {
        if (selectedItems.size === items.length) { selectedItems.clear(); document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected')); } 
        else { items.forEach(item => selectedItems.add(getItemId(item))); document.querySelectorAll('.item-card, .list-item').forEach(el => el.classList.add('selected')); }
        updateContextMenuState(); contextMenu.style.display = 'none';
    });
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZoneOverlay.style.display = 'flex'; });
    dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZoneOverlay.style.display = 'none'; });
    dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZoneOverlay.style.display = 'none'; alert('请使用上传按钮'); });

    function getItemId(item) { return item.type === 'file' ? `file:${item.message_id}` : `folder:${item.id}`; }
    function parseItemId(str) { const p = str.split(':'); return [p[0], p[1]]; }
    function escapeHtml(text) { if (!text) return ''; return text.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]); }
    function formatSize(bytes) { if (bytes === 0) return '0 B'; const k = 1024; const sizes = ['B', 'KB', 'MB', 'GB', 'TB']; const i = Math.floor(Math.log(bytes) / Math.log(k)); return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]; }
});
