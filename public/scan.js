// public/scan.js

document.addEventListener('DOMContentLoaded', () => {
    const userSelect = document.getElementById('user-select');
    const scanWebdavBtn = document.getElementById('scan-webdav-btn');
    // const scanS3Btn = document.getElementById('scan-s3-btn'); // HTML中添加了onclick，这里可简化
    const scanLog = document.getElementById('scan-log');

    // 移除本地扫描逻辑

    // 如果存在 WebDAV 按钮
    if (scanWebdavBtn) {
        scanWebdavBtn.onclick = () => startScan('webdav');
    }
    
    // 暴露 startScan 到全局以便 HTML onclick 调用，或在这里绑定
    window.startScan = startScan;

    // 加载用户列表
    loadUsers();

    async function loadUsers() {
        try {
            const res = await axios.get('/api/admin/users');
            userSelect.innerHTML = '<option value="">-- 请选择用户 --</option>';
            res.data.forEach(user => {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = user.username;
                userSelect.appendChild(option);
            });
        } catch (error) {
            log('加载用户列表失败: ' + error.message, 'error');
        }
    }

    async function startScan(storageType) {
        const userId = userSelect.value;
        if (!userId) {
            alert('请先选择一个用户！');
            return;
        }

        if (!confirm(`确定要扫描 ${storageType.toUpperCase()} 存储并导入文件到选中用户吗？\n这可能需要一些时间。`)) return;

        log(`开始扫描 ${storageType.toUpperCase()} ...`, 'info');
        disableControls(true);

        try {
            // 注意：需要在 worker.js 中补充 POST /api/admin/scan 路由
            const response = await fetch('/api/admin/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, storageType })
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');
                lines.forEach(line => {
                    if (line.trim()) {
                        if (line.includes('Error') || line.includes('失败')) log(line, 'error');
                        else if (line.includes('Found') || line.includes('导入')) log(line, 'success');
                        else log(line, 'info');
                    }
                });
            }
            
            log('扫描完成。', 'success');

        } catch (error) {
            log('请求发生错误: ' + error.message, 'error');
        } finally {
            disableControls(false);
        }
    }

    function log(message, type = 'info') {
        const div = document.createElement('div');
        div.className = `log-${type}`;
        div.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        scanLog.appendChild(div);
        scanLog.scrollTop = scanLog.scrollHeight;
    }

    function disableControls(disabled) {
        userSelect.disabled = disabled;
        if (scanWebdavBtn) scanWebdavBtn.disabled = disabled;
        const s3Btn = document.getElementById('scan-s3-btn');
        if (s3Btn) s3Btn.disabled = disabled;
    }
});
