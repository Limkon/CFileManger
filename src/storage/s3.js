// src/storage/s3.js
import { AwsClient } from 'aws4fetch';

export default class S3Storage {
    constructor(config) {
        this.bucket = config.bucket;
        this.region = config.region || 'auto';
        this.endpoint = config.endpoint || `https://s3.${this.region}.amazonaws.com`;
        
        // 确保 endpoint 不带结尾斜杠
        if (this.endpoint.endsWith('/')) {
            this.endpoint = this.endpoint.slice(0, -1);
        }

        // 初始化 AwsClient
        this.client = new AwsClient({
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
            region: this.region,
            service: 's3'
        });

        // 构造 Bucket 基础 URL
        this.bucketUrl = `${this.endpoint}/${this.bucket}`;
    }

    /**
     * 辅助函数：标准化 Key (去除开头的 /)
     */
    _normalizeKey(key) {
        return key.startsWith('/') ? key.slice(1) : key;
    }

    /**
     * 上传文件
     * @param {ReadableStream|File} fileStream 
     * @param {string} fileName 
     * @param {string} type 
     * @param {number} userId 
     * @param {number} folderId 
     * @param {object} config 
     * @param {string} folderPath - 相对路径 (例如 "Docs/Work/")
     */
    async upload(fileStream, fileName, type, userId, folderId, config, folderPath = '') {
        // 构造物理存储路径: userId/Folder/SubFolder/fileName
        const key = `${userId}/${folderPath}${fileName}`;
        const normalizedKey = this._normalizeKey(key);
        const url = `${this.bucketUrl}/${encodeURIComponent(normalizedKey)}`;

        const response = await this.client.fetch(url, {
            method: 'PUT',
            headers: {
                'Content-Type': type || 'application/octet-stream'
            },
            body: fileStream
        });

        if (!response.ok) {
            throw new Error(`S3 上传失败: ${response.status} ${response.statusText}`);
        }

        return {
            fileId: key, // 数据库存储的标识 (保留原始路径)
            thumbId: null
        };
    }

    /**
     * 创建物理文件夹 (创建一个以 / 结尾的空对象)
     * 这样在 S3 浏览器中也能看到目录结构
     */
    async createDir(folderPath, userId) {
        // folderPath 例如 "MyDocs/Work/"
        const key = `${userId}/${folderPath}`; 
        
        // 确保以 / 结尾
        const safeKey = key.endsWith('/') ? key : key + '/';
        const normalizedKey = this._normalizeKey(safeKey);
        
        const url = `${this.bucketUrl}/${encodeURIComponent(normalizedKey)}`;
        
        // 上传 0 字节内容
        await this.client.fetch(url, {
            method: 'PUT',
            body: ''
        });
    }

    /**
     * 下载文件
     */
    async download(fileId) {
        const normalizedKey = this._normalizeKey(fileId);
        const url = `${this.bucketUrl}/${encodeURIComponent(normalizedKey)}`;

        const response = await this.client.fetch(url, {
            method: 'GET'
        });

        if (!response.ok) {
            throw new Error(`S3 下载失败: ${response.status} ${response.statusText}`);
        }

        return {
            stream: response.body,
            contentType: response.headers.get('content-type'),
            headers: {
                'Content-Length': response.headers.get('content-length'),
                'ETag': response.headers.get('etag'),
                'Last-Modified': response.headers.get('last-modified')
            }
        };
    }

    /**
     * 删除文件或文件夹
     */
    async remove(files, folders) {
        const items = [...(files || [])];
        
        // S3 删除文件夹比较麻烦(需要清空内容)，且我们是逻辑删除优先
        // 这里主要负责物理删除文件对象
        
        const deletePromises = items.map(async (item) => {
            const fileId = item.file_id; 
            if (!fileId) return;

            const normalizedKey = this._normalizeKey(fileId);
            const url = `${this.bucketUrl}/${encodeURIComponent(normalizedKey)}`;
            
            try {
                await this.client.fetch(url, { method: 'DELETE' });
            } catch (e) {
                console.warn(`S3 删除失败 (${fileId}):`, e.message);
            }
        });

        await Promise.all(deletePromises);
    }

    /**
     * 移动文件
     * S3 不支持原生的重命名/移动目录操作 (需要 Copy + Delete 所有子对象)
     * 为了性能和稳定性，S3 模式下仅更新数据库路径，不进行物理移动
     */
    async moveFile(oldPath, newPath) {
        // 留空，由 data.js 逻辑控制跳过
        return;
    }

    /**
     * 列出文件 (List Objects V2)
     * 用于扫描导入功能
     * @param {string} prefix - 前缀 (通常是 userId/)
     */
    async list(prefix = '') {
        const normalizedPrefix = this._normalizeKey(prefix);
        // 使用 list-type=2 (ListObjectsV2)
        const url = `${this.bucketUrl}?list-type=2&prefix=${encodeURIComponent(normalizedPrefix)}`;

        const response = await this.client.fetch(url, { method: 'GET' });
        if (!response.ok) {
            // 尝试 V1 兼容
            const v1Url = `${this.bucketUrl}?prefix=${encodeURIComponent(normalizedPrefix)}`;
            const v1Response = await this.client.fetch(v1Url, { method: 'GET' });
            if (!v1Response.ok) return []; // 失败或是空桶，返回空数组
            return await this._parseListXml(await v1Response.text());
        }

        const text = await response.text();
        return await this._parseListXml(text);
    }

    async _parseListXml(text) {
        // 简单 XML 解析 (Workers 中没有 DOMParser，使用正则提取)
        const contents = [];
        // 匹配 <Contents>...</Contents> 块
        const contentRegex = /<Contents>(.*?)<\/Contents>/gs;
        let contentMatch;

        while ((contentMatch = contentRegex.exec(text)) !== null) {
            const contentBody = contentMatch[1];
            
            const keyMatch = contentBody.match(/<Key>(.*?)<\/Key>/);
            const sizeMatch = contentBody.match(/<Size>(\d+)<\/Size>/);
            
            if (keyMatch) {
                const key = keyMatch[1];
                // 忽略以 / 结尾的文件夹占位符，只导入文件
                if (!key.endsWith('/')) {
                    contents.push({
                        fileId: key, 
                        size: sizeMatch ? parseInt(sizeMatch[1]) : 0,
                        updatedAt: Date.now() // 简化处理
                    });
                }
            }
        }
        
        return contents;
    }
}
