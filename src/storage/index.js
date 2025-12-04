// src/storage/index.js

import TelegramStorage from './telegram.js';
import WebdavStorage from './webdav.js';
import S3Storage from './s3.js';

/**
 * 初始化存储适配器
 * @param {Object} config - 完整的系统配置对象
 * @returns {Object} 初始化的存储实例 (TelegramStorage | WebdavStorage | S3Storage)
 */
export function initStorage(config) {
    const mode = config.storageMode || 'telegram';

    switch (mode) {
        case 'webdav':
            // 确保传入了 webdav 配置部分
            return new WebdavStorage(config.webdav || {});
        case 's3':
            // 确保传入了 s3 配置部分
            return new S3Storage(config.s3 || {});
        case 'telegram':
        default:
            // Telegram 通常依赖环境变量 (BOT_TOKEN, CHAT_ID)，不需要动态配置对象
            return new TelegramStorage();
    }
}

/**
 * 获取存储实例 (辅助函数，用于某些非请求上下文，但在 Worker 中主要用 initStorage)
 */
export function getStorage(config) {
    return initStorage(config);
}
