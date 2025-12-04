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
     */
    async upload(fileStream, fileName, type, userId) {
        // 构造存储路径: userId/fileName
        const key = `${userId}/${fileName}`;
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
     * 下载文件
     * @param {string} fileId 
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
     * @param {Array} files 
     * @param {Array} folders 
     */
    async remove(files, folders) {
        const items = [...(files || [])];
        
        const deletePromises = items.map(async (item) => {
            const fileId = item.file_id || item.path; // 兼容逻辑
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
     * 移动文件 (Copy + Delete)
     * @param {string} oldPath 
     * @param {string} newPath 
     */
    async moveFile(oldPath, newPath) {
        const sourceKey = this._normalizeKey(oldPath);
        const destKey = this._normalizeKey(newPath);

        // 1. Copy Object
        const copySource = `/${this.bucket}/${sourceKey}`; 
        const destUrl = `${this.bucketUrl}/${encodeURIComponent(destKey)}`;
        
        const copySourceHeader = encodeURI(copySource);

        const copyRes = await this.client.fetch(destUrl, {
            method: 'PUT',
            headers: {
                'x-amz-copy-source': copySourceHeader
            }
        });

        if (!copyRes.ok) {
            throw new Error(`S3 移动(复制)失败: ${copyRes.status} ${copyRes.statusText}`);
        }

        // 2. Delete Old Object
        const oldUrl = `${this.bucketUrl}/${encodeURIComponent(sourceKey)}`;
        const delRes = await this.client.fetch(oldUrl, { method: 'DELETE' });

        if (!delRes.ok) {
            console.warn(`S3 移动(删除旧文件)失败，可能产生了残留文件: ${oldPath}`);
        }
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
            // 尝试 V1
            const v1Url = `${this.bucketUrl}?prefix=${encodeURIComponent(normalizedPrefix)}`;
            const v1Response = await this.client.fetch(v1Url, { method: 'GET' });
            if (!v1Response.ok) throw new Error(`S3 List 失败: ${response.status}`);
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
                contents.push({
                    fileId: keyMatch[1], // Key
                    size: sizeMatch ? parseInt(sizeMatch[1]) : 0,
                    updatedAt: Date.now() // 简化处理
                });
            }
        }
        
        return contents;
    }
}
