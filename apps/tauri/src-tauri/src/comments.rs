use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

pub struct CommentsDb(pub Mutex<Connection>);

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Comment {
    pub id: String,
    pub block_ids: Vec<String>,
    pub text: String,
    pub timestamp: i64,
    pub resolved: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CommentsData {
    pub file_hash: String,
    pub comments: Vec<Comment>,
}

#[derive(Debug, Deserialize)]
struct LegacyCommentsFile {
    #[allow(dead_code)]
    version: String,
    file_hash: String,
    comments: Vec<Comment>,
}

fn now_epoch() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

fn has_table(conn: &Connection, name: &str) -> bool {
    conn.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1")
        .and_then(|mut s| s.query_row(params![name], |_| Ok(())))
        .is_ok()
}

fn has_column(conn: &Connection, table: &str, column: &str) -> bool {
    conn.prepare(&format!("SELECT {} FROM {} LIMIT 0", column, table))
        .is_ok()
}

pub fn init_db(app_data_dir: &PathBuf) -> Result<Connection, String> {
    std::fs::create_dir_all(app_data_dir)
        .map_err(|e| format!("Failed to create app data dir: {}", e))?;

    let old_path = app_data_dir.join("comments.db");
    let db_path = app_data_dir.join("arandu.db");
    if old_path.exists() && !db_path.exists() {
        std::fs::rename(&old_path, &db_path)
            .map_err(|e| format!("Failed to migrate database: {}", e))?;
    }

    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;

    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| format!("Failed to set WAL mode: {}", e))?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| format!("Failed to enable foreign keys: {}", e))?;

    let needs_migration = has_table(&conn, "sessions") && has_column(&conn, "sessions", "workspace_path");

    if needs_migration {
        migrate_v1_to_v2(&conn)?;
    } else if !has_table(&conn, "workspaces") {
        create_schema_v2(&conn)?;
    }

    if has_table(&conn, "sessions") && !has_column(&conn, "sessions", "acp_preferences_json") {
        conn.execute_batch(
            "ALTER TABLE sessions ADD COLUMN acp_preferences_json TEXT NOT NULL DEFAULT '{}';"
        ).map_err(|e| format!("Failed to add acp_preferences_json column: {}", e))?;
    }

    if has_table(&conn, "sessions") && !has_column(&conn, "sessions", "provider") {
        conn.execute_batch(
            "ALTER TABLE sessions ADD COLUMN provider TEXT NOT NULL DEFAULT 'copilot';"
        ).map_err(|e| format!("Failed to add provider column: {}", e))?;
    }

    if !has_table(&conn, "workspace_acp_defaults") {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS workspace_acp_defaults (
                workspace_path  TEXT    PRIMARY KEY,
                preferences_json TEXT   NOT NULL DEFAULT '{}'
            );"
        ).map_err(|e| format!("Failed to create workspace_acp_defaults table: {}", e))?;
    }

    Ok(conn)
}

fn create_schema_v2(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS workspaces (
            id              TEXT    PRIMARY KEY,
            path            TEXT    NOT NULL UNIQUE,
            display_name    TEXT    NOT NULL,
            workspace_type  TEXT    NOT NULL DEFAULT 'directory'
                                    CHECK (workspace_type IN ('file', 'directory')),
            last_accessed   INTEGER NOT NULL,
            created_at      INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_workspaces_last_accessed ON workspaces(last_accessed DESC);

        CREATE TABLE IF NOT EXISTS sessions (
            id              TEXT    PRIMARY KEY,
            workspace_id    TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            acp_session_id  TEXT,
            provider        TEXT    NOT NULL DEFAULT 'copilot'
                                    CHECK (provider IN ('copilot', 'claude')),
            name            TEXT    NOT NULL,
            initial_prompt  TEXT    NOT NULL DEFAULT '',
            plan_file_path  TEXT,
            phase           TEXT    NOT NULL DEFAULT 'idle'
                                    CHECK (phase IN ('idle', 'planning', 'reviewing', 'executing', 'done')),
            acp_preferences_json TEXT NOT NULL DEFAULT '{}',
            created_at      INTEGER NOT NULL,
            updated_at      INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_id, updated_at DESC);

        CREATE TABLE IF NOT EXISTS workspace_acp_defaults (
            workspace_path  TEXT    PRIMARY KEY,
            preferences_json TEXT   NOT NULL DEFAULT '{}'
        );

        CREATE TABLE IF NOT EXISTS messages (
            id              TEXT    PRIMARY KEY,
            session_id      TEXT    NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            role            TEXT    NOT NULL CHECK (role IN ('user', 'assistant')),
            content         TEXT    NOT NULL,
            message_type    TEXT    CHECK (message_type IS NULL OR message_type IN ('thinking', 'tool', 'notice')),
            tool_call_id    TEXT,
            tool_title      TEXT,
            tool_status     TEXT,
            created_at      INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);

        CREATE TABLE IF NOT EXISTS comments (
            id              TEXT    PRIMARY KEY,
            workspace_id    TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            file_path       TEXT    NOT NULL,
            text            TEXT    NOT NULL,
            resolved        INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0, 1)),
            created_at      INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_comments_workspace ON comments(workspace_id);
        CREATE INDEX IF NOT EXISTS idx_comments_file ON comments(file_path);
        CREATE INDEX IF NOT EXISTS idx_comments_unresolved ON comments(file_path) WHERE resolved = 0;

        CREATE TABLE IF NOT EXISTS comment_blocks (
            comment_id      TEXT    NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
            block_id        TEXT    NOT NULL,
            PRIMARY KEY (comment_id, block_id)
        );
        CREATE INDEX IF NOT EXISTS idx_comment_blocks_block ON comment_blocks(block_id);

        CREATE TABLE IF NOT EXISTS file_hashes (
            file_path       TEXT    PRIMARY KEY,
            file_hash       TEXT    NOT NULL
        );

        CREATE TABLE IF NOT EXISTS app_settings (
            key             TEXT    PRIMARY KEY,
            value           TEXT    NOT NULL
        );"
    ).map_err(|e| format!("Failed to create schema: {}", e))
}

fn migrate_v1_to_v2(conn: &Connection) -> Result<(), String> {
    eprintln!("[db] Migrating schema v1 → v2");

    conn.pragma_update(None, "foreign_keys", &"OFF")
        .map_err(|e| format!("Failed to disable FK for migration: {}", e))?;

    let tx = conn.unchecked_transaction()
        .map_err(|e| format!("Migration transaction error: {}", e))?;

    // --- workspaces: convert TEXT timestamps to INTEGER ---
    tx.execute_batch(
        "CREATE TABLE workspaces_v2 (
            id              TEXT    PRIMARY KEY,
            path            TEXT    NOT NULL UNIQUE,
            display_name    TEXT    NOT NULL,
            workspace_type  TEXT    NOT NULL DEFAULT 'directory'
                                    CHECK (workspace_type IN ('file', 'directory')),
            last_accessed   INTEGER NOT NULL,
            created_at      INTEGER NOT NULL
        );
        INSERT INTO workspaces_v2 (id, path, display_name, workspace_type, last_accessed, created_at)
            SELECT id, path, display_name, workspace_type,
                   CAST(strftime('%s', last_accessed) AS INTEGER),
                   CAST(strftime('%s', created_at) AS INTEGER)
            FROM workspaces;
        DROP TABLE workspaces;
        ALTER TABLE workspaces_v2 RENAME TO workspaces;
        CREATE INDEX idx_workspaces_last_accessed ON workspaces(last_accessed DESC);"
    ).map_err(|e| format!("Migrate workspaces: {}", e))?;

    // --- sessions: rename workspace_path → workspace_id, drop plan_markdown/chat_panel_size ---
    tx.execute_batch(
        "CREATE TABLE sessions_v2 (
            id              TEXT    PRIMARY KEY,
            workspace_id    TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            acp_session_id  TEXT,
            name            TEXT    NOT NULL,
            initial_prompt  TEXT    NOT NULL DEFAULT '',
            plan_file_path  TEXT,
            phase           TEXT    NOT NULL DEFAULT 'idle'
                                    CHECK (phase IN ('idle', 'planning', 'reviewing', 'executing', 'done')),
            created_at      INTEGER NOT NULL,
            updated_at      INTEGER NOT NULL
        );"
    ).map_err(|e| format!("Create sessions_v2: {}", e))?;

    // Map workspace_path → workspace id via workspaces table
    tx.execute_batch(
        "INSERT OR IGNORE INTO sessions_v2 (id, workspace_id, acp_session_id, name, initial_prompt, plan_file_path, phase, created_at, updated_at)
            SELECT s.id, w.id, s.acp_session_id, s.name, s.initial_prompt,
                   s.plan_file_path,
                   COALESCE(s.phase, 'idle'),
                   CAST(strftime('%s', s.created_at) AS INTEGER),
                   CAST(strftime('%s', s.updated_at) AS INTEGER)
            FROM sessions s
            INNER JOIN workspaces w ON w.path = s.workspace_path;
        DROP TABLE sessions;
        ALTER TABLE sessions_v2 RENAME TO sessions;
        CREATE INDEX idx_sessions_workspace ON sessions(workspace_id, updated_at DESC);"
    ).map_err(|e| format!("Migrate sessions: {}", e))?;

    // --- messages: add FK, convert timestamps (table may not exist on v0.12.0) ---
    if has_table(&tx, "messages") {
        tx.execute_batch(
            "CREATE TABLE messages_v2 (
                id              TEXT    PRIMARY KEY,
                session_id      TEXT    NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                role            TEXT    NOT NULL CHECK (role IN ('user', 'assistant')),
                content         TEXT    NOT NULL,
                message_type    TEXT    CHECK (message_type IS NULL OR message_type IN ('thinking', 'tool', 'notice')),
                tool_call_id    TEXT,
                tool_title      TEXT,
                tool_status     TEXT,
                created_at      INTEGER NOT NULL
            );
            INSERT OR IGNORE INTO messages_v2 (id, session_id, role, content, message_type, tool_call_id, tool_title, tool_status, created_at)
                SELECT m.id, m.session_id, m.role, m.content, m.message_type,
                       m.tool_call_id, m.tool_title, m.tool_status,
                       CAST(strftime('%s', m.created_at) AS INTEGER)
                FROM messages m
                WHERE m.session_id IN (SELECT id FROM sessions);
            DROP TABLE messages;
            ALTER TABLE messages_v2 RENAME TO messages;
            CREATE INDEX idx_messages_session ON messages(session_id, created_at);"
        ).map_err(|e| format!("Migrate messages: {}", e))?;
    } else {
        tx.execute_batch(
            "CREATE TABLE messages (
                id              TEXT    PRIMARY KEY,
                session_id      TEXT    NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                role            TEXT    NOT NULL CHECK (role IN ('user', 'assistant')),
                content         TEXT    NOT NULL,
                message_type    TEXT    CHECK (message_type IS NULL OR message_type IN ('thinking', 'tool', 'notice')),
                tool_call_id    TEXT,
                tool_title      TEXT,
                tool_status     TEXT,
                created_at      INTEGER NOT NULL
            );
            CREATE INDEX idx_messages_session ON messages(session_id, created_at);"
        ).map_err(|e| format!("Create messages table: {}", e))?;
    }

    // --- comments: add workspace_id FK, normalize block_ids → comment_blocks ---
    tx.execute_batch(
        "CREATE TABLE comments_v2 (
            id              TEXT    PRIMARY KEY,
            workspace_id    TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            file_path       TEXT    NOT NULL,
            text            TEXT    NOT NULL,
            resolved        INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0, 1)),
            created_at      INTEGER NOT NULL
        );
        CREATE TABLE comment_blocks (
            comment_id      TEXT    NOT NULL REFERENCES comments_v2(id) ON DELETE CASCADE,
            block_id        TEXT    NOT NULL,
            PRIMARY KEY (comment_id, block_id)
        );"
    ).map_err(|e| format!("Create comments_v2: {}", e))?;

    // Migrate comments: resolve workspace_id from file_path prefix match
    {
        let mut stmt = tx.prepare(
            "SELECT c.id, c.file_path, c.block_ids, c.text, c.timestamp, c.resolved
             FROM comments c"
        ).map_err(|e| format!("Prepare comments migration: {}", e))?;

        let rows: Vec<(String, String, String, String, i64, i32)> = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, i32>(5)?,
                ))
            })
            .map_err(|e| format!("Query comments: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Collect comments: {}", e))?;

        for (id, file_path, block_ids_json, text, timestamp, resolved) in &rows {
            // Find workspace whose path is a prefix of the file_path
            let workspace_id: Option<String> = tx.query_row(
                "SELECT id FROM workspaces WHERE ?1 LIKE path || '/%' OR ?1 = path ORDER BY LENGTH(path) DESC LIMIT 1",
                params![file_path],
                |row| row.get(0),
            ).ok();

            let ws_id = match workspace_id {
                Some(id) => id,
                None => continue,
            };

            // Convert timestamp from ms to seconds
            let created_at = timestamp / 1000;

            tx.execute(
                "INSERT OR IGNORE INTO comments_v2 (id, workspace_id, file_path, text, resolved, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![id, ws_id, file_path, text, resolved, created_at],
            ).map_err(|e| format!("Insert comment_v2: {}", e))?;

            let block_ids: Vec<String> = serde_json::from_str(block_ids_json).unwrap_or_default();
            for block_id in &block_ids {
                tx.execute(
                    "INSERT OR IGNORE INTO comment_blocks (comment_id, block_id) VALUES (?1, ?2)",
                    params![id, block_id],
                ).map_err(|e| format!("Insert comment_block: {}", e))?;
            }
        }
    }

    tx.execute_batch(
        "DROP TABLE comments;
         ALTER TABLE comments_v2 RENAME TO comments;
         CREATE INDEX idx_comments_workspace ON comments(workspace_id);
         CREATE INDEX idx_comments_file ON comments(file_path);
         CREATE INDEX idx_comments_unresolved ON comments(file_path) WHERE resolved = 0;
         CREATE INDEX idx_comment_blocks_block ON comment_blocks(block_id);"
    ).map_err(|e| format!("Finalize comments migration: {}", e))?;

    // --- app_settings table ---
    tx.execute_batch(
        "CREATE TABLE IF NOT EXISTS app_settings (
            key    TEXT PRIMARY KEY,
            value  TEXT NOT NULL
        );"
    ).map_err(|e| format!("Create app_settings: {}", e))?;

    tx.commit().map_err(|e| format!("Migration commit: {}", e))?;

    conn.pragma_update(None, "foreign_keys", &"ON")
        .map_err(|e| format!("Failed to re-enable FK: {}", e))?;

    eprintln!("[db] Migration v1 → v2 complete");
    Ok(())
}

pub fn load_comments(conn: &Connection, file_path: &str) -> Result<CommentsData, String> {
    let file_hash: String = conn
        .query_row(
            "SELECT file_hash FROM file_hashes WHERE file_path = ?1",
            params![file_path],
            |row| row.get(0),
        )
        .unwrap_or_default();

    let mut stmt = conn
        .prepare(
            "SELECT c.id, c.text, c.created_at, c.resolved
             FROM comments c WHERE c.file_path = ?1",
        )
        .map_err(|e| format!("Query prepare error: {}", e))?;

    let comments = stmt
        .query_map(params![file_path], |row| {
            let id: String = row.get(0)?;
            Ok((id, row.get::<_, String>(1)?, row.get::<_, i64>(2)?, row.get::<_, i32>(3)?))
        })
        .map_err(|e| format!("Query error: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row error: {}", e))?;

    let mut result = Vec::with_capacity(comments.len());
    for (id, text, created_at, resolved) in comments {
        let mut block_stmt = conn
            .prepare("SELECT block_id FROM comment_blocks WHERE comment_id = ?1")
            .map_err(|e| format!("Prepare block_ids: {}", e))?;
        let block_ids: Vec<String> = block_stmt
            .query_map(params![id], |row| row.get(0))
            .map_err(|e| format!("Query block_ids: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Row block_ids: {}", e))?;

        result.push(Comment {
            id,
            block_ids,
            text,
            timestamp: created_at,
            resolved: resolved != 0,
        });
    }

    Ok(CommentsData {
        file_hash,
        comments: result,
    })
}

pub fn save_comments(
    conn: &Connection,
    file_path: &str,
    workspace_id: &str,
    data: &CommentsData,
) -> Result<(), String> {
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("Transaction error: {}", e))?;

    tx.execute(
        "DELETE FROM comments WHERE file_path = ?1",
        params![file_path],
    )
    .map_err(|e| format!("Delete error: {}", e))?;

    for comment in &data.comments {
        tx.execute(
            "INSERT INTO comments (id, workspace_id, file_path, text, resolved, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                comment.id,
                workspace_id,
                file_path,
                comment.text,
                comment.resolved as i32,
                comment.timestamp,
            ],
        )
        .map_err(|e| format!("Insert error: {}", e))?;

        for block_id in &comment.block_ids {
            tx.execute(
                "INSERT INTO comment_blocks (comment_id, block_id) VALUES (?1, ?2)",
                params![comment.id, block_id],
            )
            .map_err(|e| format!("Insert block error: {}", e))?;
        }
    }

    tx.execute(
        "INSERT OR REPLACE INTO file_hashes (file_path, file_hash) VALUES (?1, ?2)",
        params![file_path, data.file_hash],
    )
    .map_err(|e| format!("Hash update error: {}", e))?;

    tx.commit()
        .map_err(|e| format!("Commit error: {}", e))?;

    Ok(())
}

pub fn delete_comments_for_file(conn: &Connection, file_path: &str) -> Result<(), String> {
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("Transaction error: {}", e))?;
    tx.execute("DELETE FROM comments WHERE file_path = ?1", params![file_path])
        .map_err(|e| format!("Delete comments error: {}", e))?;
    tx.execute("DELETE FROM file_hashes WHERE file_path = ?1", params![file_path])
        .map_err(|e| format!("Delete file_hashes error: {}", e))?;
    tx.commit()
        .map_err(|e| format!("Commit error: {}", e))?;
    Ok(())
}

pub fn delete_comments_for_workspace(conn: &Connection, workspace_path: &str) -> Result<(), String> {
    let pattern = format!("{}/%", workspace_path);
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("Transaction error: {}", e))?;
    tx.execute("DELETE FROM comments WHERE file_path LIKE ?1", params![pattern])
        .map_err(|e| format!("Delete comments error: {}", e))?;
    tx.execute("DELETE FROM file_hashes WHERE file_path LIKE ?1", params![pattern])
        .map_err(|e| format!("Delete file_hashes error: {}", e))?;
    tx.commit()
        .map_err(|e| format!("Commit error: {}", e))?;
    Ok(())
}

pub fn count_unresolved_batch(conn: &Connection, file_paths: &[String]) -> Result<Vec<(String, i64)>, String> {
    let mut results = Vec::with_capacity(file_paths.len());
    let mut stmt = conn
        .prepare("SELECT COUNT(*) FROM comments WHERE file_path = ?1 AND resolved = 0")
        .map_err(|e| format!("Prepare error: {}", e))?;
    for path in file_paths {
        let count: i64 = stmt
            .query_row(params![path], |row| row.get(0))
            .unwrap_or(0);
        if count > 0 {
            results.push((path.clone(), count));
        }
    }
    Ok(results)
}

pub fn migrate_json_file(conn: &Connection, markdown_path: &str) -> Result<bool, String> {
    let json_path = format!("{}.comments.json", markdown_path);
    let json_pathbuf = PathBuf::from(&json_path);

    if !json_pathbuf.exists() {
        return Ok(false);
    }

    let content = std::fs::read_to_string(&json_pathbuf)
        .map_err(|e| format!("Failed to read legacy file: {}", e))?;

    let legacy: LegacyCommentsFile =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse legacy file: {}", e))?;

    if legacy.comments.is_empty() {
        let _ = std::fs::remove_file(&json_pathbuf);
        return Ok(false);
    }

    // Find workspace for this file path
    let workspace_id: String = conn.query_row(
        "SELECT id FROM workspaces WHERE ?1 LIKE path || '/%' OR ?1 = path ORDER BY LENGTH(path) DESC LIMIT 1",
        params![markdown_path],
        |row| row.get(0),
    ).unwrap_or_else(|_| "unknown".to_string());

    let data = CommentsData {
        file_hash: legacy.file_hash,
        comments: legacy.comments,
    };

    save_comments(conn, markdown_path, &workspace_id, &data)?;

    let _ = std::fs::remove_file(&json_pathbuf);

    Ok(true)
}

// --- app_settings helpers ---

pub fn get_setting(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        params![key],
        |row| row.get(0),
    ).ok()
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?1, ?2)",
        params![key, value],
    ).map_err(|e| format!("Set setting error: {}", e))?;
    Ok(())
}

pub fn has_setting(conn: &Connection, key: &str) -> bool {
    get_setting(conn, key).is_some()
}

pub fn now() -> i64 {
    now_epoch()
}
