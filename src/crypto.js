// src/crypto.js
import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

// 默认密钥，稍后通过 initCrypto 覆盖
let SECRET_KEY = 'a8e2a32e9b1c7d5f6a7b3c4d5e8f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f';
let KEY = crypto.createHash('sha256').update(String(SECRET_KEY)).digest('base64').substring(0, 32);

/**
 * 初始化加密模块，注入环境变量中的 SECRET
 * @param {string} secretEnv - 从 env 获取的 SESSION_SECRET
 */
export function initCrypto(secretEnv) {
    if (secretEnv) {
        SECRET_KEY = secretEnv;
        KEY = crypto.createHash('sha256').update(String(SECRET_KEY)).digest('base64').substring(0, 32);
    }
}

/**
 * 加密函数
 * @param {string | number} text 要加密的文字或数字
 * @returns {string} 加密后的字串
 */
export function encrypt(text) {
    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(KEY), iv);
        let encrypted = cipher.update(String(text));
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        // 使用 Base64 URL 安全编码
        return iv.toString('base64url') + ':' + encrypted.toString('base64url');
    } catch (error) {
        console.error("加密失败:", error);
        return String(text); // 加密失败时返回原文字(转字符串)
    }
}

/**
 * 解密函数
 * @param {string} text 要解密的字串
 * @returns {string|null} 解密后的字串，若失败则为 null
 */
export function decrypt(text) {
    if (!text) return null;
    try {
        const textParts = text.split(':');
        if (textParts.length < 2) return null; // 格式不正确
        const iv = Buffer.from(textParts.shift(), 'base64url');
        const encryptedText = Buffer.from(textParts.join(':'), 'base64url');
        const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(KEY), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (error) {
        // console.error(`解密失败: "${text}"`, error); // 可选：减少日志噪音
        return null;
    }
}
