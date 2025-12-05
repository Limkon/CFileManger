import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';

// 使用一个硬编码的默认值，彻底避免 undefined 问题
// 在生产环境中，请依然配置环境变量 SESSION_SECRET
let SECRET_KEY = crypto.createHash('sha256').update('default-fallback-key-2024').digest();
const IV_LENGTH = 16; 

export function initCrypto(secret) {
    try {
        if (secret) {
            // 只有当 secret 存在且不为空时才更新密钥
            SECRET_KEY = crypto.createHash('sha256').update(String(secret)).digest();
        }
    } catch (e) {
        console.error("Crypto Init Warning:", e);
        // 如果出错，保持上面的默认值不变，不抛出异常
    }
}

export function encrypt(text) {
    if (text === null || text === undefined) return null;

    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv('aes-256-cbc', SECRET_KEY, iv);
        
        // 强制转为字符串，防止数字类型报错
        let encrypted = cipher.update(String(text));
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return iv.toString('hex') + ':' + encrypted.toString('hex');
    } catch (e) {
        console.error("Encrypt error:", e);
        return null;
    }
}

export function decrypt(text) {
    if (!text) return null;

    try {
        const textParts = text.split(':');
        if (textParts.length !== 2) return null;
        
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        
        const decipher = crypto.createDecipheriv('aes-256-cbc', SECRET_KEY, iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (e) {
        return null;
    }
}
