import { S3Storage } from './s3.js';
import { WebDAVStorage } from './webdav.js';
import { TelegramStorage } from './telegram.js';

/**
 * 存储后端工厂函数
 * 根据配置初始化对应的存储实例
 * @param {Object} config - 全局配置对象 (包含了 s3, webdav, telegram, storageMode 等配置)
 * @param {Object} env - Cloudflare Worker 环境变量 (用于获取绑定，如 R2_BUCKET)
 */
export function initStorage(config, env) {
    // 优先检查环境变量中的 R2 绑定
    // 如果 config.storageMode 未指定或为 'r2'，且 env.BUCKET 存在，则使用 R2
    if ((!config.storageMode || config.storageMode === 'r2') && env.BUCKET) {
        // R2 被视为一种特殊的 S3 兼容存储，但使用绑定的 bucket 对象
        return new S3Storage({
            bucket: env.BUCKET,
            // R2 绑定不需要 endpoint/accessKey 等，但在 S3Storage 类中需要适配处理
            isR2Binding: true 
        });
    }

    // 根据 storageMode 选择后端
    switch (config.storageMode) {
        case 's3':
            if (!config.s3) throw new Error("S3 存储模式已启用，但未找到 S3 配置。");
            return new S3Storage(config.s3);
        
        case 'webdav':
            if (!config.webdav) throw new Error("WebDAV 存储模式已启用，但未找到 WebDAV 配置。");
            return new WebDAVStorage(config.webdav);
        
        case 'telegram':
            // Telegram 配置通常来自环境变量，但也可能通过 config 传递
            const tgConfig = config.telegram || {
                botToken: env.TG_BOT_TOKEN,
                chatId: env.TG_CHAT_ID
            };
            if (!tgConfig.botToken || !tgConfig.chatId) {
                throw new Error("Telegram 存储模式已启用，但未找到 Bot Token 或 Chat ID (请检查环境变量 TG_BOT_TOKEN 和 TG_CHAT_ID)。");
            }
            return new TelegramStorage(tgConfig);

        default:
            // 默认回退逻辑
            if (env.BUCKET) {
                return new S3Storage({ bucket: env.BUCKET, isR2Binding: true });
            }
            // 如果没有任何配置，抛出错误
            throw new Error(`未知的存储模式: ${config.storageMode}，且未检测到 R2 绑定 (env.BUCKET)。请在设置中配置存储后端。`);
    }
}
