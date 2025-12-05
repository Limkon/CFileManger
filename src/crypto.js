// src/crypto.js
import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';

let SECRET_KEY = null;
const IV_LENGTH = 16; 

export function initCrypto(secret) {
    try {
        const keyMaterial = secret || 'default-insecure-secret-fallback-key';
        // 强制转换为字符串，防止传入 undefined 导致 crash
        const secretStr = String(keyMaterial);
        SECRET_KEY = crypto.createHash('sha256').update(secretStr).digest();
    } catch (e) {
        console.error("Crypto Init Failed:", e);
        // 终极保底：生成一个全 0 的密钥，防止系统崩溃
        SECRET_KEY = Buffer.alloc(32, 0);
    }
}

export function encrypt(text) {
    if (text === null || text === undefined) return null;
    
    // 关键修复：如果密钥未设置，立即尝试使用默认值初始化
    if (!SECRET_KEY) {
        console.warn("⚠️ SECRET_KEY missing in encrypt(), using lazy default.");
        initCrypto('lazy-default-key-emergency');
    }

    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv('aes-256-cbc', SECRET_KEY, iv);
        let encrypted = cipher.update(String(text));
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return iv.toString('hex') + ':' + encrypted.toString('hex');
    } catch (e) {
        console.error("Encrypt execution failed:", e);
        return null;
    }
}

export function decrypt(text) {
    if (!text) return null;
    
    if (!SECRET_KEY) {
        initCrypto('lazy-default-key-emergency');
    }

    try {
        const textParts = text.split(':');
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
