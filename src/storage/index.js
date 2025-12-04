// src/storage/index.js

import TelegramStorage from './telegram.js';
import WebdavStorage from './webdav.js';
import S3Storage from './s3.js';

/**
 * 初始化存儲適配器
 * @param {Object} config - 完整的系統配置對象 (來自 KV)
 * @param {Object} env - Cloudflare Workers 的環境變數 (包含 secrets，如 BOT_TOKEN)
 * @returns {Object} 初始化的存儲實例 (TelegramStorage | WebdavStorage | S3Storage)
 */
export function initStorage(config, env) {
    const mode = config.storageMode || 'telegram';

    switch (mode) {
        case 'webdav':
            // 確保傳入了 webdav 配置部分
            return new WebdavStorage(config.webdav || {});
        case 's3':
            // 確保傳入了 s3 配置部分
            return new S3Storage(config.s3 || {});
        case 'telegram':
        default:
            // 優先從環境變數 (env) 獲取 Token，其次從配置 (config) 獲取
            // 在 Cloudflare Workers 中，Secrets 存儲在 env 對象中，而非 process.env
            const token = env?.BOT_TOKEN || config.telegram?.token;
            const chatId = env?.CHAT_ID || config.telegram?.chatId;
            return new TelegramStorage(token, chatId);
    }
}

/**
 * 獲取存儲實例 (輔助函數)
 */
export function getStorage(config, env) {
    return initStorage(config, env);
}
