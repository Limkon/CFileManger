// src/schema.js

export const INIT_SQL = `
-- 用戶表
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    max_storage_bytes INTEGER DEFAULT 1073741824, -- 默認 1GB
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- 資料夾表
CREATE TABLE IF NOT EXISTS folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    parent_id INTEGER,
    user_id INTEGER NOT NULL,
    is_deleted INTEGER DEFAULT 0,
    deleted_at INTEGER,
    password TEXT, -- 資料夾密碼 (哈希值)
    share_token TEXT,
    share_expires_at INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY(parent_id) REFERENCES folders(id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    UNIQUE(name, parent_id, user_id, is_deleted)
);

-- 文件表
CREATE TABLE IF NOT EXISTS files (
    message_id TEXT PRIMARY KEY, -- 使用字符串存儲大整數 ID
    fileName TEXT NOT NULL,
    mimetype TEXT,
    file_id TEXT NOT NULL, -- 存儲後端的路徑或 ID
    thumb_file_id TEXT,
    size INTEGER,
    date INTEGER,
    folder_id INTEGER,
    user_id INTEGER NOT NULL,
    storage_type TEXT DEFAULT 'telegram',
    is_deleted INTEGER DEFAULT 0,
    deleted_at INTEGER,
    share_token TEXT,
    share_expires_at INTEGER,
    share_password TEXT,
    FOREIGN KEY(folder_id) REFERENCES folders(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
);

-- 認證 Token 表 (用於記住登錄)
CREATE TABLE IF NOT EXISTS auth_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
);

-- 索引優化
CREATE INDEX IF NOT EXISTS idx_files_folder ON files(folder_id);
CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_folders_user ON folders(user_id);
`;
