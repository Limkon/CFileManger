// public/manager.js

document.addEventListener('DOMContentLoaded', () => {
    // =================================================================================
    // 1. 狀態變量與配置
    // =================================================================================
    let currentFolderId = null; // 當前資料夾的加密 ID
    let currentPath = [];       // 麵包屑導航數據
    let items = [];             // 當前資料夾內容緩存
    let selectedItems = new Set(); // 選中的項目 ID (格式: "file:123" 或 "folder:456")
    let isMultiSelectMode = false; // 多選模式標記
    let viewMode = localStorage.getItem('viewMode') || 'grid'; // 視圖模式: 'grid' | 'list'

    // =================================================================================
    // 2. DOM 元素引用
    // =================================================================================
    const itemGrid = document.getElementById('itemGrid');
    const itemListView = document.getElementById('itemListView');
    const itemListBody = document.getElementById('itemListBody');
    const breadcrumb = document.getElementById('breadcrumb');
    const searchInput = document.getElementById('searchInput');
    const searchForm = document.getElementById('searchForm');
    
    // 上傳相關
    const uploadModal = document.getElementById('uploadModal');
    const uploadForm = document.getElementById('uploadForm');
    const folderSelect = document.getElementById('folderSelect');
    const progressBar = document.getElementById('progressBar');
    const progressArea = document.getElementById('progressArea');
    const fileInput = document.getElementById('fileInput');
    const folderInput = document.getElementById('folderInput');
    
    // 配額顯示
    const quotaUsedEl = document.getElementById('quotaUsed');
    const quotaMaxEl = document.getElementById('quotaMax');
    const quotaBar = document.getElementById('quotaBar');
    
    // 菜單與交互
    const contextMenu = document.getElementById('contextMenu');
    const viewSwitchBtn = document.getElementById('view-switch-btn');
    const dropZone = document.getElementById('dropZone');
    const dropZoneOverlay = document.getElementById('dropZoneOverlay');

    // =================================================================================
    // 3. 初始化邏輯
    // =================================================================================
    
    // 解析 URL 獲取當前資料夾 ID (路徑格式: /view/:encryptedId)
    const pathParts = window.location.pathname.split('/');
    if (pathParts[1] === 'view' && pathParts[2]) {
        currentFolderId = pathParts[2];
    }

    // 應用視圖設置並加載數據
    updateViewModeUI();
    loadFolder(currentFolderId);
    updateQuota();

    // =================================================================================
    // 4. 核心數據加載與渲染
    // =================================================================================

    /**
     * 加載資料夾內容
     * @param {string} encryptedId - 加密的資料夾 ID
     */
    async function loadFolder(encryptedId) {
        if (!encryptedId) return;
        
        // 清空選區
        selectedItems.clear();
        updateContextMenuState();
        
        try {
            // 請求後端 API
            const res = await axios.get(`/api/folder/${encryptedId}`);
            const data = res.data;
            
            // 合併文件和資料夾
            items = [...data.contents.folders, ...data.contents.files];
            currentPath = data.path;
            
            // 渲染界面
            renderBreadcrumb();
            renderItems(items);
            updateFolderSelectForUpload(data.contents.folders);
            
            // 更新瀏覽器 URL (如果 ID 發生變化)
            const newUrl = `/view/${encryptedId}`;
            if (window.location.pathname !== newUrl) {
                window.history.pushState({ id: encryptedId }, '', newUrl);
            }
            currentFolderId = encryptedId;

            // 處理搜索框重置
            if (searchInput.value) {
                searchInput.value = '';
            }
            
        } catch (error) {
            console.error(error);
            const msg = error.response?.data?.message || error.message;
            itemGrid.innerHTML = `<div class="error-msg" style="text-align:center; padding:20px; color:#dc3545;">加載失敗: ${msg}</div>`;
            itemListBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#dc3545;">加載失敗: ${msg}</td></tr>`;
        }
    }

    /**
     * 更新用戶配額顯示
     */
    async function updateQuota() {
        try {
            const res = await axios.get('/api/user/quota');
            const { used, max } = res.data;
            
            quotaUsedEl.textContent = formatSize(used);
            
            // 處理 max 為 0 或字符串的情況
            const maxVal = parseInt(max);
            const isUnlimited = maxVal === 0;
            
            quotaMaxEl.textContent = isUnlimited ? '無限' : formatSize(maxVal);
            
            if (!isUnlimited && maxVal > 0) {
                const percent = Math.min(100, Math.round((used / maxVal) * 100));
                quotaBar.style.width = `${percent}%`;
                
                // 根據使用比例變色
                if (percent > 90) quotaBar.style.backgroundColor = '#dc3545'; // 紅
                else if (percent > 70) quotaBar.style.backgroundColor = '#ffc107'; // 黃
                else quotaBar.style.backgroundColor = '#28a745'; // 綠
            } else {
                quotaBar.style.width = '0%'; // 無限容量時不顯示進度條
            }
        } catch (error) {
            console.warn('獲取配額失敗', error);
            quotaUsedEl.textContent = '-';
            quotaMaxEl.textContent = '-';
        }
    }

    /**
     * 渲染麵包屑導航
     */
    function renderBreadcrumb() {
        breadcrumb.innerHTML = '';
        
        // 首頁鏈接
        const rootLi = document.createElement('a');
        rootLi.href = '#';
        rootLi.innerHTML = '<i class="fas fa-home"></i> 首頁';
        rootLi.onclick = (e) => { 
            e.preventDefault(); 
            // 獲取路徑數組中的第一個元素（根目錄）的 ID
            if(currentPath.length > 0) loadFolder(currentPath[0].encrypted_id); 
        };
        breadcrumb.appendChild(rootLi);

        // 路徑節點
        currentPath.forEach((folder, index) => {
            const sep = document.createElement('span');
            sep.className = 'separator';
            sep.textContent = '/';
            breadcrumb.appendChild(sep);

            const a = document.createElement('a');
            a.textContent = folder.name;
            
            if (index === currentPath.length - 1) {
                a.classList.add('active'); // 當前目錄不可點擊
            } else {
                a.href = '#';
                a.onclick = (e) => { 
                    e.preventDefault(); 
                    loadFolder(folder.encrypted_id); 
                };
            }
            breadcrumb.appendChild(a);
        });
    }

    /**
     * 渲染文件列表 (同時處理網格和列表視圖)
     */
    function renderItems(itemsToRender) {
        itemGrid.innerHTML = '';
        itemListBody.innerHTML = '';
        
        if (itemsToRender.length === 0) {
            itemGrid.innerHTML = '<div class="empty-folder" style="text-align:center; padding:50px; color:#999;"><i class="fas fa-folder-open" style="font-size:48px; margin-bottom:10px;"></i><p>此資料夾為空</p></div>';
            itemListBody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:#999;">此資料夾為空</td></tr>`;
            return;
        }

        itemsToRender.forEach(item => {
            itemGrid.appendChild(createGridItem(item));
            itemListBody.appendChild(createListItem(item));
        });
    }

    // 創建網格視圖單元
    function createGridItem(item) {
        const div = document.createElement('div');
        div.className = 'grid-item';
        div.dataset.id = getItemId(item);
        div.onclick = (e) => handleItemClick(e, item, div);
        div.oncontextmenu = (e) => handleContextMenu(e, item);
        div.ondblclick = () => handleItemDblClick(item);

        const iconClass = getIconClass(item);
        const iconColor = item.type === 'folder' ? '#fbc02d' : '#007bff';

        div.innerHTML = `
            <div class="item-icon">
                <i class="${iconClass}" style="color: ${iconColor};"></i>
                ${item.is_locked ? '<i class="fas fa-lock lock-badge"></i>' : ''}
            </div>
            <div class="item-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
            ${isMultiSelectMode ? '<div class="select-checkbox"><i class="fas fa-check"></i></div>' : ''}
        `;
        
        if (selectedItems.has(getItemId(item))) div.classList.add('selected');
        return div;
    }

    // 創建列表視圖行
    function createListItem(item) {
        const div = document.createElement('div');
        div.className = 'list-row';
        div.dataset.id = getItemId(item);
        div.onclick = (e) => handleItemClick(e, item, div);
        div.oncontextmenu = (e) => handleContextMenu(e, item);
        div.ondblclick = () => handleItemDblClick(item);

        const iconClass = getIconClass(item);
        const dateStr = item.date ? new Date(item.date).toLocaleString() : '-';
        const sizeStr = item.size !== undefined ? formatSize(item.size) : '-';

        div.innerHTML = `
            <div class="list-col list-col-icon"><i class="${iconClass}"></i></div>
            <div class="list-col list-col-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
            <div class="list-col list-col-size">${sizeStr}</div>
            <div class="list-col list-col-date">${dateStr}</div>
        `;
        
        if (selectedItems.has(getItemId(item))) div.classList.add('selected');
        return div;
    }

    // 獲取文件圖標
    function getIconClass(item) {
        if (item.type === 'folder') return 'fas fa-folder';
        const ext = item.name.split('.').pop().toLowerCase();
        if (['jpg','jpeg','png','gif','bmp','webp'].includes(ext)) return 'fas fa-image';
        if (['mp4','mov','avi','mkv','webm'].includes(ext)) return 'fas fa-video';
        if (['mp3','wav','ogg','flac'].includes(ext)) return 'fas fa-music';
        if (['pdf'].includes(ext)) return 'fas fa-file-pdf';
        if (['zip','rar','7z','tar','gz'].includes(ext)) return 'fas fa-file-archive';
        if (['txt','md','js','html','css','json','py','java'].includes(ext)) return 'fas fa-file-alt';
        if (['xls','xlsx','csv'].includes(ext)) return 'fas fa-file-excel';
        if (['doc','docx'].includes(ext)) return 'fas fa-file-word';
        if (['ppt','pptx'].includes(ext)) return 'fas fa-file-powerpoint';
        return 'fas fa-file';
    }

    // =================================================================================
    // 5. 交互事件處理
    // =================================================================================

    // 項目點擊（選擇邏輯）
    function handleItemClick(e, item, el) {
        const id = getItemId(item);
        
        // Ctrl 鍵或多選模式下進行切換選擇
        if (e.ctrlKey || isMultiSelectMode) {
            if (selectedItems.has(id)) {
                selectedItems.delete(id);
                el.classList.remove('selected');
            } else {
                selectedItems.add(id);
                el.classList.add('selected');
            }
        } else {
            // 單選模式：清除其他選擇
            document.querySelectorAll('.selected').forEach(x => x.classList.remove('selected'));
            selectedItems.clear();
            selectedItems.add(id);
            el.classList.add('selected');
        }
        updateContextMenuState();
    }

    // 項目雙擊（打開或下載）
    function handleItemDblClick(item) {
        if (item.type === 'folder') {
            loadFolder(item.encrypted_id);
        } else {
            // 下載文件 (新窗口打開下載代理)
            window.open(`/download/proxy/${item.message_id}`, '_blank');
        }
    }

    // 右鍵菜單
    function handleContextMenu(e, item) {
        e.preventDefault();
        const id = getItemId(item);
        
        // 如果右鍵點擊的不是當前選中的項目，則切換選中狀態
        if (!selectedItems.has(id)) {
            document.querySelectorAll('.selected').forEach(x => x.classList.remove('selected'));
            selectedItems.clear();
            selectedItems.add(id);
            
            // 同步視覺狀態
            const selector = viewMode === 'grid' ? `.grid-item[data-id="${id}"]` : `.list-row[data-id="${id}"]`;
            const el = document.querySelector(selector);
            if(el) el.classList.add('selected');
        }
        updateContextMenuState();
        
        // 計算菜單位置（防止溢出屏幕）
        let x = e.clientX;
        let y = e.clientY;
        const menuWidth = 200; 
        const menuHeight = 350;
        
        if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10;
        if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10;

        contextMenu.style.top = `${y}px`;
        contextMenu.style.left = `${x}px`;
        contextMenu.classList.add('show');
        
        // 點擊任意處關閉菜單
        document.addEventListener('click', () => contextMenu.classList.remove('show'), { once: true });
    }

    // 更新右鍵菜單按鈕狀態
    function updateContextMenuState() {
        const count = selectedItems.size;
        const isSingle = count === 1;
        let firstType = null;
        
        if (isSingle) {
            const idStr = Array.from(selectedItems)[0];
            firstType = parseItemId(idStr)[0];
        }

        // 設置按鈕可用性
        const setDisabled = (id, disabled) => {
            const btn = document.getElementById(id);
            if (btn) btn.disabled = disabled;
        };

        setDisabled('openBtn', !(isSingle && firstType === 'folder'));
        setDisabled('downloadBtn', !(isSingle && firstType === 'file'));
        setDisabled('renameBtn', !isSingle);
        setDisabled('deleteBtn', count === 0);
        
        // 暫未實現或未開放的功能：
        setDisabled('previewBtn', true); // 預覽暫時禁用
        setDisabled('shareBtn', true);   // 分享暫時禁用
        setDisabled('moveBtn', true);    // 移動暫時禁用
        setDisabled('lockBtn', true);    // 加密暫時禁用
    }

    // =================================================================================
    // 6. 工具欄按鈕事件
    // =================================================================================

    // 新建資料夾
    document.getElementById('createFolderBtn').addEventListener('click', async () => {
        const name = prompt('請輸入資料夾名稱:');
        if (name && name.trim()) {
            try {
                await axios.post('/api/folder/create', { 
                    name: name.trim(), 
                    parentId: currentFolderId 
                });
                loadFolder(currentFolderId);
            } catch (error) {
                alert('創建失敗: ' + (error.response?.data?.message || error.message));
            }
        }
    });

    // 刪除按鈕
    document.getElementById('deleteBtn').addEventListener('click', async () => {
        if (selectedItems.size === 0) return;
        
        if (!confirm(`確定要刪除選中的 ${selectedItems.size} 個項目嗎？`)) return;
        
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
            alert('刪除失敗: ' + (error.response?.data?.message || error.message));
        }
    });

    // 重命名按鈕
    document.getElementById('renameBtn').addEventListener('click', async () => {
        if (selectedItems.size !== 1) return;
        
        const idStr = Array.from(selectedItems)[0];
        const [type, id] = parseItemId(idStr);
        const item = items.find(i => getItemId(i) === idStr);
        
        if (!item) return;

        const newName = prompt('重命名:', item.name);
        if (newName && newName !== item.name) {
            try {
                await axios.post('/api/rename', { type, id, name: newName });
                loadFolder(currentFolderId);
            } catch (error) {
                alert('重命名失敗: ' + (error.response?.data?.message || error.message));
            }
        }
    });

    // 下載按鈕 (工具欄和右鍵共用)
    document.getElementById('downloadBtn').addEventListener('click', () => {
        if (selectedItems.size !== 1) return;
        const idStr = Array.from(selectedItems)[0];
        const [type, id] = parseItemId(idStr);
        
        if (type !== 'file') return alert('只能下載文件');
        window.open(`/download/proxy/${id}`, '_blank');
    });

    // 視圖切換
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
            viewSwitchBtn.title = "切換到列表視圖";
        } else {
            itemGrid.style.display = 'none';
            itemListView.style.display = 'block';
            viewSwitchBtn.innerHTML = '<i class="fas fa-th-large"></i>';
            viewSwitchBtn.title = "切換到網格視圖";
        }
    }

    // 搜索
    searchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const q = searchInput.value.trim();
        if(!q) return loadFolder(currentFolderId);
        
        try {
            const res = await axios.get(`/api/search?q=${encodeURIComponent(q)}`);
            // 搜索結果混合文件和資料夾
            items = [...res.data.folders, ...res.data.files];
            
            // 渲染搜索結果
            renderItems(items);
            
            // 更新麵包屑為搜索狀態
            breadcrumb.innerHTML = '<span><i class="fas fa-search"></i> 搜索結果</span>';
            const backBtn = document.createElement('a');
            backBtn.href = '#';
            backBtn.className = 'upload-link-btn';
            backBtn.style.marginLeft = '10px';
            backBtn.style.display = 'inline-block';
            backBtn.innerHTML = '<i class="fas fa-times"></i> 退出搜索';
            backBtn.onclick = (ev) => {
                ev.preventDefault();
                searchInput.value = '';
                loadFolder(currentFolderId);
            };
            breadcrumb.appendChild(backBtn);
            
        } catch(e) {
            alert('搜索失敗: ' + (e.response?.data?.message || e.message));
        }
    });

    // =================================================================================
    // 7. 上傳功能
    // =================================================================================

    document.getElementById('showUploadModalBtn').addEventListener('click', () => {
        uploadModal.style.display = 'block';
    });
    
    document.getElementById('closeUploadModalBtn').addEventListener('click', () => {
        uploadModal.style.display = 'none';
    });
    
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // 合併文件輸入和資料夾輸入的文件
        const allFiles = [...fileInput.files, ...folderInput.files];
        
        if (allFiles.length === 0) return alert('請選擇至少一個文件');
        
        // 獲取上傳目標（下拉框選擇的ID 或 當前目錄ID）
        const targetEncryptedId = folderSelect.value || currentFolderId;
        const formData = new FormData();
        
        allFiles.forEach(f => formData.append('files', f));

        // UI 狀態更新
        progressArea.style.display = 'block';
        progressBar.style.width = '0%';
        progressBar.textContent = '0%';
        
        try {
            // 通過 URL 參數傳遞目標文件夾 ID，確保 worker.js 能正確讀取
            await axios.post(`/upload?folderId=${targetEncryptedId}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (p) => {
                    const percent = Math.round((p.loaded * 100) / p.total);
                    progressBar.style.width = percent + '%';
                    progressBar.textContent = percent + '%';
                }
            });
            
            alert('上傳成功');
            uploadModal.style.display = 'none';
            uploadForm.reset();
            progressArea.style.display = 'none';
            
            // 刷新視圖和配額
            loadFolder(currentFolderId);
            updateQuota();
            
        } catch (error) {
            alert('上傳失敗: ' + (error.response?.data?.message || error.message));
            progressArea.style.display = 'none';
        }
    });

    // 更新上傳彈窗中的目標文件夾下拉框
    function updateFolderSelectForUpload(folders) {
        folderSelect.innerHTML = `<option value="${currentFolderId}">當前資料夾</option>`;
        if (folders) {
            folders.forEach(f => {
                const op = document.createElement('option');
                op.value = f.encrypted_id;
                op.textContent = f.name;
                folderSelect.appendChild(op);
            });
        }
    }

    // =================================================================================
    // 8. 其他輔助功能
    // =================================================================================

    // 退出登錄
    document.getElementById('logoutBtn').addEventListener('click', () => {
        window.location.href = '/logout';
    });

    // 拖拽上傳提示 (瀏覽器對拖拽直接讀取 File 對象有嚴格限制，這裡僅做引導)
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
        alert('請點擊工具欄的「上傳文件」按鈕進行上傳。'); 
    });

    // 生成唯一 ID
    function getItemId(item) { 
        return item.type === 'file' ? `file:${item.message_id}` : `folder:${item.id}`; 
    }

    // 解析 ID
    function parseItemId(str) { 
        const p = str.split(':'); 
        return [p[0], p[1]]; 
    }

    // HTML 轉義
    function escapeHtml(text) { 
        if (!text) return '';
        return text.replace(/[&<>"']/g, m => ({ 
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' 
        })[m]); 
    }

    // 格式化文件大小
    function formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
});
