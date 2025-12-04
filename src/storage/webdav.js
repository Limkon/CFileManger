// src/storage/webdav.js

export default class WebdavStorage {
    constructor(config) {
        // 移除 URL 结尾的斜杠，确保路径拼接正确
        this.url = config.url ? config.url.replace(/\/$/, '') : '';
        this.username = config.username || '';
        this.password = config.password || '';
    }

    /**
     * 获取 WebDAV 客户端实例
     * data.js 中调用了 storage.getClient().moveFile(...)
     * 因此返回 this 自身即可
     */
    getClient() {
        return this;
    }

    /**
     * 发送 WebDAV 请求的辅助方法
     */
    async _request(method, relativePath, headers = {}, body = null) {
        if (!this.url) throw new Error('WebDAV URL 未配置');
        
        // 确保 relativePath 以 / 开头
        const path = relativePath.startsWith('/') ? relativePath : '/' + relativePath;
        // 对路径进行编码，但保留 / 符号
        const encodedPath = path.split('/').map(encodeURIComponent).join('/');
        const fullUrl = this.url + encodedPath;
        
        const auth = btoa(`${this.username}:${this.password}`);
        
        const fetchHeaders = {
            'Authorization': `Basic ${auth}`,
            ...headers
        };

        const response = await fetch(fullUrl, {
            method,
            headers: fetchHeaders,
            body
        });

        return response;
    }

    /**
     * 上传文件
     * @param {ReadableStream|File} fileStream - 文件流
     * @param {string} fileName - 文件名
     * @param {string} type - MIME 类型
     * @param {number} userId - 用户ID
     * @returns {Promise<{fileId: string}>}
     */
    async upload(fileStream, fileName, type, userId) {
        // 为了避免文件名冲突，建议使用 /<userId>/<fileName> 结构，这里简化为根目录
        // 实际存储路径建议包含用户隔离
        const storagePath = `/${userId}/${fileName}`;

        // 确保目录存在 (MKCOL) - 简化的容错处理，尝试创建用户目录
        await this._request('MKCOL', `/${userId}`).catch(() => {});

        const response = await this._request('PUT', storagePath, {
            'Content-Type': type || 'application/octet-stream'
        }, fileStream);

        if (!response.ok) {
            throw new Error(`WebDAV 上传失败: ${response.status} ${response.statusText}`);
        }

        return {
            fileId: storagePath, // 数据库将保存这个路径
            thumbId: null
        };
    }

    /**
     * 下载文件
     * @param {string} fileId - 存储在数据库中的路径 (如 /1/image.png)
     */
    async download(fileId) {
        const response = await this._request('GET', fileId);
        
        if (!response.ok) {
            throw new Error(`WebDAV 下载失败: ${response.status} ${response.statusText}`);
        }

        return {
            stream: response.body,
            contentType: response.headers.get('content-type'),
            headers: {
                'Content-Length': response.headers.get('content-length'),
                'ETag': response.headers.get('etag')
            }
        };
    }

    /**
     * 删除文件或文件夹
     * @param {Array} files - 文件列表
     * @param {Array} folders - 文件夹列表
     */
    async remove(files, folders) {
        const items = [...(files || []), ...(folders || [])];
        
        for (const item of items) {
            // file_id 存储的是 WebDAV 路径；如果是 folder，需要通过 path 构建逻辑获取
            // 这里假设 item 只有 file_id (files) 或需要删除的逻辑在 data.js 已处理好路径
            // data.js 传入的 folders 包含 path 属性 (由 getFolderDeletionData 构建)
            
            let pathToDelete = null;
            if (item.file_id) pathToDelete = item.file_id;
            else if (item.path) pathToDelete = item.path; // data.js 传递的文件夹 path

            if (pathToDelete) {
                try {
                    await this._request('DELETE', pathToDelete);
                } catch (e) {
                    console.warn(`WebDAV 删除失败 (${pathToDelete}):`, e.message);
                }
            }
        }
    }

    /**
     * 移动文件 (WebDAV MOVE)
     * @param {string} oldPath 
     * @param {string} newPath 
     */
    async moveFile(oldPath, newPath) {
        // Destination Header 必须是完整的 URL
        const destPath = newPath.startsWith('/') ? newPath : '/' + newPath;
        const encodedDestPath = destPath.split('/').map(encodeURIComponent).join('/');
        const destinationUrl = this.url + encodedDestPath;

        const response = await this._request('MOVE', oldPath, {
            'Destination': destinationUrl,
            'Overwrite': 'T'
        });

        if (!response.ok) {
            throw new Error(`WebDAV 移动失败: ${response.status} ${response.statusText}`);
        }
    }
}
