// src/schema.js

export const INIT_SQL = `
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        is_admin INTEGER DEFAULT 0,
        max_storage_bytes INTEGER DEFAULT 1073741824
    );

    CREATE TABLE IF NOT EXISTS folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        parent_id INTEGER,
        user_id INTEGER NOT NULL,
        share_token TEXT,
        share_expires_at INTEGER,
        password TEXT,
        share_password TEXT,
        is_deleted INTEGER DEFAULT 0,
        deleted_at INTEGER,
        FOREIGN KEY (parent_id) REFERENCES folders (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        UNIQUE(name, parent_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS files (
        message_id TEXT PRIMARY KEY,
        fileName TEXT NOT NULL,
        mimetype TEXT,
        file_id TEXT NOT NULL,
        thumb_file_id TEXT,
        size INTEGER,
        date INTEGER NOT NULL,
        share_token TEXT,
        share_expires_at INTEGER,
        folder_id INTEGER NOT NULL DEFAULT 1,
        user_id INTEGER NOT NULL,
        storage_type TEXT NOT NULL DEFAULT 'telegram',
        share_password TEXT,
        is_deleted INTEGER DEFAULT 0,
        deleted_at INTEGER,
        UNIQUE(fileName, folder_id, user_id),
        FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS auth_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );
`;
