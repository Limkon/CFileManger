// src/config.js

// 定义在 KV 中存储配置的键名
const CONFIG_KEY = 'system_config';

export default class ConfigManager {
    /**
     * @param {KVNamespace} kv - Cloudflare KV 绑定对象
     */
    constructor(kv) {
        this.kv = kv;
        // 简单的内存缓存，减少 KV 读取费用 (Cloudflare Workers 实例重启前有效)
        this.cachedConfig = null;
    }

    /**
     * 加载配置
     * 优先从内存获取，否则从 KV 读取并合并默认值
     */
    async load() {
        if (this.cachedConfig) {
            return this.cachedConfig;
        }

        try {
            // 从 KV 获取配置，指定类型为 json
            const data = await this.kv.get(CONFIG_KEY, 'json');
            
            // 默认配置结构
            const defaults = {
                storageMode: 'telegram', // 默认存储模式
                uploadMode: 'stream',    // Workers 强制使用流式上传
                webdav: {},              // WebDAV 配置对象
                s3: {}                   // S3 配置对象
            };

            // 合并配置：默认值 < KV数据
            this.cachedConfig = { ...defaults, ...(data || {}) };
            
            // 强制覆盖 uploadMode，因为 Workers 不支持本地磁盘缓冲
            this.cachedConfig.uploadMode = 'stream';

            return this.cachedConfig;
        } catch (error) {
            console.error('加载配置失败:', error);
            // 发生错误时返回安全默认值
            return {
                storageMode: 'telegram',
                uploadMode: 'stream',
                webdav: {},
                s3: {}
            };
        }
    }

    /**
     * 保存配置
     * @param {Object} newConfig - 要更新的配置片段
     */
    async save(newConfig) {
        try {
            // 先获取当前完整配置
            const current = await this.load();
            
            // 合并新旧配置
            const merged = { ...current, ...newConfig };
            
            // 写入 KV
            await this.kv.put(CONFIG_KEY, JSON.stringify(merged));
            
            // 更新内存缓存
            this.cachedConfig = merged;
            
            return true;
        } catch (error) {
            console.error('保存配置失败:', error);
            return false;
        }
    }
}
