// storage/index.js
const telegramStorage = require('./telegram');
// 移除 local storage 引用
// const localStorage = require('./local'); 
const webdavStorage = require('./webdav');
const s3Storage = require('./s3');
const db = require('../database.js'); // 引入数据库以使用 KV

// 内存缓存配置，避免每次同步调用都查库
let cachedConfig = {
    storageMode: 'telegram', // 默认改为 telegram
    uploadMode: 'stream',
    webdav: {},
    s3: {}
};

// 初始化函数：从数据库加载配置到缓存
async function init() {
    try {
        const config = await db.getConfig();
        if (config) {
            // 合并配置，确保新字段有默认值
            cachedConfig = { ...cachedConfig, ...config };
            
            // 确保对象字段存在
            if (!cachedConfig.webdav || Array.isArray(cachedConfig.webdav)) cachedConfig.webdav = {};
            if (!cachedConfig.s3 || Array.isArray(cachedConfig.s3)) cachedConfig.s3 = {};
            
            // 初始化客户端
            if (cachedConfig.storageMode === 'webdav') webdavStorage.resetClient();
            if (cachedConfig.storageMode === 's3') s3Storage.resetClient();
            
            console.log(`[Config] 配置加载成功，当前模式: ${cachedConfig.storageMode}`);
        }
    } catch (error) {
        console.error("读取 KV 设定失败:", error);
    }
}

// 同步读取 (返回缓存)
function readConfig() {
    return cachedConfig;
}

// 异步写入 (写入 KV 并更新缓存)
async function writeConfig(newConfigPart) {
    try {
        const newConfig = { ...cachedConfig, ...newConfigPart };
        
        await db.saveConfig(newConfig);
        cachedConfig = newConfig; // 更新缓存
        
        // 重置客户端
        if (newConfig.storageMode === 'webdav') webdavStorage.resetClient();
        if (newConfig.storageMode === 's3') s3Storage.resetClient();
        
        return true;
    } catch (error) {
        console.error("写入 KV 设定失败:", error);
        return false;
    }
}

function getStorage() {
    // 根据缓存的配置返回对应的 storage 模块
    if (cachedConfig.storageMode === 'webdav') {
        return webdavStorage;
    }
    if (cachedConfig.storageMode === 's3') {
        return s3Storage;
    }
    // 默认为 telegram，local 已被移除
    return telegramStorage;
}

// 包装成异步函数以保持 API 一致性，虽然内部只更新了缓存标记
async function setStorageMode(mode) {
    if (['telegram', 'webdav', 's3'].includes(mode)) {
        return await writeConfig({ storageMode: mode });
    }
    return false;
}

async function setUploadMode(mode) {
    if (['stream', 'buffer'].includes(mode)) {
        return await writeConfig({ uploadMode: mode });
    }
    return false;
}

module.exports = {
    init,
    getStorage,
    setStorageMode,
    setUploadMode, 
    readConfig,
    writeConfig
};
