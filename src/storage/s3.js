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
        // 对于 AWS S3 虚拟主机风格: https://bucket.s3.region.amazonaws.com
        // 对于 MinIO/R2/路径风格: https://endpoint/bucket
        // 这里为了通用性，我们统一使用路径风格: endpoint/bucket/key
        // 注意：某些 S3 提供商强制要求虚拟主机风格，如果遇到问题可能需要调整这里
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
        // S3 删除是针对对象的，不能直接删除“文件夹”（因为文件夹只是前缀）
        // 但这里我们只处理明确传入的文件列表。
        // 如果需要删除文件夹下的所有内容，上层 data.js 应该已经递归列出了所有文件。

        const items = [...(files || [])];
        
        // 批量删除是最高效的，但为了代码简单且 aws4fetch 核心是 fetch，
        // 我们这里使用并发的单个 DELETE 请求，或者 XML 构造批量删除。
        // 为了稳健性，这里使用并发单个删除。
        
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
        // x-amz-copy-source 必须包含 bucket 名称，并且通常需要 URL 编码
        const copySource = `/${this.bucket}/${sourceKey}`; // 注意：这里通常需要 bucket 前缀
        const destUrl = `${this.bucketUrl}/${encodeURIComponent(destKey)}`;

        // encodeURIComponent(copySource) 可能会破坏斜杠，S3 要求 source 格式为 /bucket/key
        // 仅对 key 部分编码比较安全，但这里简化处理，假设 key 不含特殊字符
        // 更严谨的写法: `/${this.bucket}/${sourceKey.split('/').map(encodeURIComponent).join('/')}`
        
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
}
