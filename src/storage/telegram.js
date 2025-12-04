// src/storage/telegram.js

export default class TelegramStorage {
    constructor(token, chatId) {
        this.token = token;
        this.chatId = chatId;
        this.apiBase = `https://api.telegram.org/bot${token}`;
    }

    /**
     * 上传文件到 Telegram
     * @param {ReadableStream | Blob} fileStream - 文件流或 Blob
     * @param {string} fileName - 文件名
     * @param {string} mimeType - MIME 类型
     * @param {number|string} userId - 上传的用户 ID (可选，用于日志或分流)
     * @param {number|string} folderId - 文件夹 ID (可选)
     * @param {string} caption - 消息标题
     */
    async upload(fileStream, fileName, mimeType, userId, folderId, caption = '') {
        if (!this.token) throw new Error('Telegram Bot Token 未配置');

        // Workers 的 FormData 需要 Blob 或 File 对象
        // 如果传入的是 ReadableStream，先转换为 Blob
        let filePayload = fileStream;
        if (fileStream instanceof ReadableStream) {
            filePayload = await new Response(fileStream).blob();
        }

        const formData = new FormData();
        // 优先使用环境变量中的 CHAT_ID
        formData.append('chat_id', this.chatId);
        
        // 根据文件类型选择 API
        const isImage = mimeType.startsWith('image/');
        const method = isImage ? 'sendPhoto' : 'sendDocument';
        const fieldName = isImage ? 'photo' : 'document';

        formData.append(fieldName, filePayload, fileName);
        if (caption) formData.append('caption', caption);

        // 发送请求
        const response = await fetch(`${this.apiBase}/${method}`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Telegram API Error: ${response.status} ${errText}`);
        }

        const data = await response.json();
        if (!data.ok) {
            throw new Error(`Telegram API Failed: ${data.description}`);
        }

        // 解析返回结果
        const msg = data.result;
        const msgId = msg.message_id;
        
        // 获取 file_id (用于后续下载)
        let fileId, thumbId;
        
        if (isImage && msg.photo && msg.photo.length > 0) {
            // 取最大的图片
            const largestPhoto = msg.photo[msg.photo.length - 1];
            fileId = largestPhoto.file_id;
            // 取最小的做缩略图
            thumbId = msg.photo[0].file_id;
        } else if (msg.document) {
            fileId = msg.document.file_id;
            if (msg.document.thumb) {
                thumbId = msg.document.thumb.file_id;
            }
        } else {
            // 兜底：可能是 audio/video 等
            fileId = (msg.audio || msg.video || msg.voice || {}).file_id;
        }

        if (!fileId) throw new Error('无法从 Telegram 响应中获取 file_id');

        return {
            fileId: fileId, // 这是 Telegram 的 file_id
            messageId: msgId, // 这是 chat 中的 message_id
            thumbId: thumbId
        };
    }

    /**
     * 获取文件下载流
     * @param {string} fileId - Telegram file_id
     */
    async download(fileId) {
        // 1. 获取文件路径 (getFile)
        const pathRes = await fetch(`${this.apiBase}/getFile?file_id=${fileId}`);
        const pathData = await pathRes.json();
        
        if (!pathData.ok || !pathData.result.file_path) {
            throw new Error('无法获取 Telegram 文件路径');
        }

        const filePath = pathData.result.file_path;
        const downloadUrl = `https://api.telegram.org/file/bot${this.token}/${filePath}`;

        // 2. 请求文件流
        const fileRes = await fetch(downloadUrl);
        if (!fileRes.ok) throw new Error('下载文件流失败');

        return {
            stream: fileRes.body,
            contentType: fileRes.headers.get('content-type'),
            headers: {
                'Content-Length': fileRes.headers.get('content-length')
            }
        };
    }

    /**
     * 删除文件 (实际上是删除消息)
     * @param {Array} files - 文件对象列表
     */
    async remove(files) {
        if (!files || files.length === 0) return;

        // 并发删除
        await Promise.all(files.map(async (file) => {
            try {
                // 需要 message_id 才能删除
                // file.message_id 此时应该是存入数据库的真实 message_id
                // 但注意：数据库里的 message_id 可能是 BigInt 转换的字符串
                // 这里的 file.file_id 是 TG 的 file_id，无法用于删除消息
                
                // 如果数据库 files 表的 message_id 字段存的是 Telegram 的 Message ID
                // 那么可以直接用。如果存的是自定义 ID，则此功能无法实现（因为没有记录 TG Msg ID）
                // 假设：files.message_id 就是 Telegram Message ID
                
                await fetch(`${this.apiBase}/deleteMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: this.chatId,
                        message_id: file.message_id
                    })
                });
            } catch (e) {
                console.error(`删除消息失败 ${file.message_id}:`, e);
            }
        }));
    }
}
