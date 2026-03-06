use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SessionRecord {
    pub id: String,
    pub workspace_path: String,
    pub acp_session_id: Option<String>,
    pub acp_preferences_json: String,
    pub name: String,
    pub initial_prompt: String,
    pub plan_markdown: String,
    pub plan_file_path: Option<String>,
    pub phase: String,
    pub chat_panel_size: Option<f64>,
    pub created_at: String,
    pub updated_at: String,
}

pub fn init_sessions_table(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS sessions (
            id              TEXT PRIMARY KEY,
            workspace_path  TEXT NOT NULL,
            acp_session_id  TEXT,
            acp_preferences_json TEXT NOT NULL DEFAULT '{}',
            name            TEXT NOT NULL,
            initial_prompt  TEXT NOT NULL,
            plan_markdown   TEXT DEFAULT '',
            plan_file_path  TEXT,
            phase           TEXT DEFAULT 'idle',
            chat_panel_size REAL,
            created_at      TEXT NOT NULL,
            updated_at      TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_path);
        CREATE TABLE IF NOT EXISTS workspace_acp_defaults (
            workspace_path TEXT PRIMARY KEY,
            acp_preferences_json TEXT NOT NULL DEFAULT '{}',
            updated_at TEXT NOT NULL
        );",
    )
    .map_err(|e| format!("Failed to create sessions table: {}", e))?;

    // Migration: add plan_file_path column to existing tables
    let has_column: bool = conn
        .prepare("SELECT plan_file_path FROM sessions LIMIT 0")
        .is_ok();
    if !has_column {
        conn.execute_batch("ALTER TABLE sessions ADD COLUMN plan_file_path TEXT;")
            .map_err(|e| format!("Migration failed: {}", e))?;
    }

    // Migration: add chat_panel_size column
    let has_chat_panel_size: bool = conn
        .prepare("SELECT chat_panel_size FROM sessions LIMIT 0")
        .is_ok();
    if !has_chat_panel_size {
        conn.execute_batch("ALTER TABLE sessions ADD COLUMN chat_panel_size REAL;")
            .map_err(|e| format!("Migration failed: {}", e))?;
    }

    // Migration: add acp_preferences_json column
    let has_acp_preferences_json: bool = conn
        .prepare("SELECT acp_preferences_json FROM sessions LIMIT 0")
        .is_ok();
    if !has_acp_preferences_json {
        conn.execute_batch(
            "ALTER TABLE sessions ADD COLUMN acp_preferences_json TEXT NOT NULL DEFAULT '{}';",
        )
        .map_err(|e| format!("Migration failed: {}", e))?;
    }

    // Ensure workspace ACP defaults table exists for older DBs.
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS workspace_acp_defaults (
            workspace_path TEXT PRIMARY KEY,
            acp_preferences_json TEXT NOT NULL DEFAULT '{}',
            updated_at TEXT NOT NULL
        );",
    )
    .map_err(|e| format!("Failed to create workspace_acp_defaults table: {}", e))?;

    Ok(())
}

pub fn list_sessions(
    conn: &Connection,
    workspace_path: &str,
) -> Result<Vec<SessionRecord>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, workspace_path, acp_session_id, acp_preferences_json, name, initial_prompt,
                    plan_markdown, plan_file_path, phase, chat_panel_size, created_at, updated_at
             FROM sessions WHERE workspace_path = ?1
             ORDER BY updated_at DESC",
        )
        .map_err(|e| format!("Query prepare error: {}", e))?;

    let rows = stmt
        .query_map(params![workspace_path], |row| {
            Ok(SessionRecord {
                id: row.get(0)?,
                workspace_path: row.get(1)?,
                acp_session_id: row.get(2)?,
                acp_preferences_json: row.get(3)?,
                name: row.get(4)?,
                initial_prompt: row.get(5)?,
                plan_markdown: row.get(6)?,
                plan_file_path: row.get(7)?,
                phase: row.get(8)?,
                chat_panel_size: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        })
        .map_err(|e| format!("Query error: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row error: {}", e))?;

    Ok(rows)
}

pub fn get_session(conn: &Connection, id: &str) -> Result<SessionRecord, String> {
    conn.query_row(
        "SELECT id, workspace_path, acp_session_id, acp_preferences_json, name, initial_prompt,
                plan_markdown, plan_file_path, phase, chat_panel_size, created_at, updated_at
         FROM sessions WHERE id = ?1",
        params![id],
        |row| {
            Ok(SessionRecord {
                id: row.get(0)?,
                workspace_path: row.get(1)?,
                acp_session_id: row.get(2)?,
                acp_preferences_json: row.get(3)?,
                name: row.get(4)?,
                initial_prompt: row.get(5)?,
                plan_markdown: row.get(6)?,
                plan_file_path: row.get(7)?,
                phase: row.get(8)?,
                chat_panel_size: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        },
    )
    .map_err(|e| format!("Session not found: {}", e))
}

pub fn create_session(
    conn: &Connection,
    workspace_path: &str,
    name: &str,
    initial_prompt: &str,
) -> Result<SessionRecord, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO sessions (id, workspace_path, acp_preferences_json, name, initial_prompt, plan_markdown, phase, created_at, updated_at)
         VALUES (?1, ?2, '{}', ?3, ?4, '', 'idle', ?5, ?5)",
        params![id, workspace_path, name, initial_prompt, now],
    )
    .map_err(|e| format!("Insert error: {}", e))?;

    get_session(conn, &id)
}

pub fn update_session_acp_id(
    conn: &Connection,
    id: &str,
    acp_session_id: &str,
) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE sessions SET acp_session_id = ?1, updated_at = ?2 WHERE id = ?3",
        params![acp_session_id, now, id],
    )
    .map_err(|e| format!("Update error: {}", e))?;
    Ok(())
}

pub fn update_session_acp_preferences(
    conn: &Connection,
    id: &str,
    acp_preferences_json: &str,
) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE sessions SET acp_preferences_json = ?1, updated_at = ?2 WHERE id = ?3",
        params![acp_preferences_json, now, id],
    )
    .map_err(|e| format!("Update ACP preferences error: {}", e))?;
    Ok(())
}

pub fn get_workspace_acp_defaults(
    conn: &Connection,
    workspace_path: &str,
) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT acp_preferences_json FROM workspace_acp_defaults WHERE workspace_path = ?1",
        params![workspace_path],
        |row| row.get(0),
    )
    .optional()
    .map_err(|e| format!("Read workspace ACP defaults error: {}", e))
}

pub fn set_workspace_acp_defaults(
    conn: &Connection,
    workspace_path: &str,
    acp_preferences_json: &str,
) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO workspace_acp_defaults (workspace_path, acp_preferences_json, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(workspace_path) DO UPDATE SET
            acp_preferences_json = excluded.acp_preferences_json,
            updated_at = excluded.updated_at",
        params![workspace_path, acp_preferences_json, now],
    )
    .map_err(|e| format!("Write workspace ACP defaults error: {}", e))?;
    Ok(())
}

pub fn delete_workspace_acp_defaults(
    conn: &Connection,
    workspace_path: &str,
) -> Result<(), String> {
    conn.execute(
        "DELETE FROM workspace_acp_defaults WHERE workspace_path = ?1",
        params![workspace_path],
    )
    .map_err(|e| format!("Delete workspace ACP defaults error: {}", e))?;
    Ok(())
}

pub fn update_plan(conn: &Connection, id: &str, markdown: &str) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE sessions SET plan_markdown = ?1, updated_at = ?2 WHERE id = ?3",
        params![markdown, now, id],
    )
    .map_err(|e| format!("Update plan error: {}", e))?;
    Ok(())
}

pub fn update_phase(conn: &Connection, id: &str, phase: &str) -> Result<(), String> {
    let valid = ["idle", "planning", "reviewing", "executing", "done"];
    if !valid.contains(&phase) {
        return Err(format!(
            "Invalid phase: {}. Must be one of: {:?}",
            phase, valid
        ));
    }
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE sessions SET phase = ?1, updated_at = ?2 WHERE id = ?3",
        params![phase, now, id],
    )
    .map_err(|e| format!("Update phase error: {}", e))?;
    Ok(())
}

pub fn update_plan_file_path(
    conn: &Connection,
    id: &str,
    plan_file_path: &str,
) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE sessions SET plan_file_path = ?1, updated_at = ?2 WHERE id = ?3",
        params![plan_file_path, now, id],
    )
    .map_err(|e| format!("Update plan_file_path error: {}", e))?;
    Ok(())
}

pub fn update_chat_panel_size(conn: &Connection, id: &str, size: f64) -> Result<(), String> {
    conn.execute(
        "UPDATE sessions SET chat_panel_size = ?1 WHERE id = ?2",
        params![size, id],
    )
    .map_err(|e| format!("Update chat_panel_size error: {}", e))?;
    Ok(())
}

pub fn delete_session(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM sessions WHERE id = ?1", params![id])
        .map_err(|e| format!("Delete error: {}", e))?;
    Ok(())
}

pub fn count_sessions_batch(
    conn: &Connection,
    workspace_paths: &[String],
) -> Result<Vec<(String, i64)>, String> {
    if workspace_paths.is_empty() {
        return Ok(Vec::new());
    }

    const MAX_VARS: usize = 999;
    let mut results: Vec<(String, i64)> = Vec::new();

    for chunk in workspace_paths.chunks(MAX_VARS) {
        let placeholders: Vec<String> = (1..=chunk.len()).map(|i| format!("?{}", i)).collect();
        let sql = format!(
            "SELECT workspace_path, COUNT(*) FROM sessions WHERE workspace_path IN ({}) GROUP BY workspace_path HAVING COUNT(*) > 0",
            placeholders.join(", ")
        );
        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| format!("Prepare error: {}", e))?;
        let params: Vec<&dyn rusqlite::ToSql> =
            chunk.iter().map(|p| p as &dyn rusqlite::ToSql).collect();
        let rows = stmt
            .query_map(params.as_slice(), |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
            })
            .map_err(|e| format!("Query error: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Row error: {}", e))?;
        results.extend(rows);
    }

    Ok(results)
}

pub fn delete_workspace_sessions(
    conn: &Connection,
    workspace_path: &str,
) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare("SELECT id FROM sessions WHERE workspace_path = ?1")
        .map_err(|e| format!("Query error: {}", e))?;
    let ids: Vec<String> = stmt
        .query_map(params![workspace_path], |row| row.get(0))
        .map_err(|e| format!("Query error: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row error: {}", e))?;

    conn.execute(
        "DELETE FROM sessions WHERE workspace_path = ?1",
        params![workspace_path],
    )
    .map_err(|e| format!("Delete error: {}", e))?;

    Ok(ids)
}

// --- Tauri commands ---

use crate::comments::CommentsDb;
use tauri::Manager;

#[tauri::command]
pub fn count_workspace_sessions(
    workspace_paths: Vec<String>,
    db: tauri::State<CommentsDb>,
) -> Result<Vec<(String, i64)>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    count_sessions_batch(&conn, &workspace_paths)
}

#[tauri::command]
pub fn session_list(
    workspace_path: String,
    db: tauri::State<CommentsDb>,
) -> Result<Vec<SessionRecord>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    list_sessions(&conn, &workspace_path)
}

#[tauri::command]
pub fn session_create(
    workspace_path: String,
    name: String,
    initial_prompt: String,
    db: tauri::State<CommentsDb>,
) -> Result<SessionRecord, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    create_session(&conn, &workspace_path, &name, &initial_prompt)
}

#[tauri::command]
pub fn session_get(id: String, db: tauri::State<CommentsDb>) -> Result<SessionRecord, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    get_session(&conn, &id)
}

#[tauri::command]
pub fn session_update_acp_id(
    id: String,
    acp_session_id: String,
    db: tauri::State<CommentsDb>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    update_session_acp_id(&conn, &id, &acp_session_id)
}

#[tauri::command]
pub fn session_update_acp_preferences(
    id: String,
    acp_preferences_json: String,
    db: tauri::State<CommentsDb>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    update_session_acp_preferences(&conn, &id, &acp_preferences_json)
}

#[tauri::command]
pub fn workspace_acp_defaults_get(
    workspace_path: String,
    db: tauri::State<CommentsDb>,
) -> Result<Option<String>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    get_workspace_acp_defaults(&conn, &workspace_path)
}

#[tauri::command]
pub fn workspace_acp_defaults_set(
    workspace_path: String,
    acp_preferences_json: String,
    db: tauri::State<CommentsDb>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    set_workspace_acp_defaults(&conn, &workspace_path, &acp_preferences_json)
}

#[tauri::command]
pub fn session_update_plan(
    id: String,
    markdown: String,
    db: tauri::State<CommentsDb>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    update_plan(&conn, &id, &markdown)
}

#[tauri::command]
pub fn session_update_phase(
    id: String,
    phase: String,
    db: tauri::State<CommentsDb>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    update_phase(&conn, &id, &phase)
}

#[tauri::command]
pub fn session_update_plan_file_path(
    id: String,
    plan_file_path: String,
    db: tauri::State<CommentsDb>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    update_plan_file_path(&conn, &id, &plan_file_path)
}

#[tauri::command]
pub fn session_update_chat_panel_size(
    id: String,
    size: f64,
    db: tauri::State<CommentsDb>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    update_chat_panel_size(&conn, &id, size)
}

#[tauri::command]
pub fn session_delete(
    id: String,
    db: tauri::State<CommentsDb>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    delete_session(&conn, &id)?;
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    crate::plan_file::delete_plan(&app_data, &id)
}

#[tauri::command]
pub fn forget_workspace_data(
    workspace_path: String,
    workspace_type: String,
    db: tauri::State<CommentsDb>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let session_ids = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        match workspace_type.as_str() {
            "directory" => {
                crate::comments::delete_comments_for_workspace(&conn, &workspace_path)?;
                delete_workspace_acp_defaults(&conn, &workspace_path)?;
                delete_workspace_sessions(&conn, &workspace_path)?
            }
            "file" => {
                crate::comments::delete_comments_for_file(&conn, &workspace_path)?;
                return Ok(());
            }
            other => return Err(format!("Invalid workspace_type: {}", other)),
        }
    };

    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    for id in &session_ids {
        let _ = crate::plan_file::delete_plan(&app_data, id);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn has_column(conn: &Connection, table: &str, column: &str) -> bool {
        let mut stmt = conn
            .prepare(&format!("PRAGMA table_info({})", table))
            .expect("prepare table_info");
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .expect("query table_info")
            .collect::<Result<Vec<_>, _>>()
            .expect("collect table_info");
        rows.iter().any(|c| c == column)
    }

    #[test]
    fn init_sessions_table_is_idempotent_with_new_columns_and_tables() {
        let conn = Connection::open_in_memory().expect("open in-memory db");

        init_sessions_table(&conn).expect("first init");
        init_sessions_table(&conn).expect("second init");

        assert!(has_column(&conn, "sessions", "acp_preferences_json"));
        assert!(has_column(&conn, "sessions", "chat_panel_size"));

        let table_exists: Option<String> = conn
            .query_row(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'workspace_acp_defaults'",
                [],
                |row| row.get(0),
            )
            .optional()
            .expect("query sqlite_master");
        assert_eq!(table_exists.as_deref(), Some("workspace_acp_defaults"));
    }

    #[test]
    fn persists_session_preferences_and_workspace_defaults() {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        init_sessions_table(&conn).expect("init sessions table");

        let session = create_session(&conn, "/tmp/ws", "name", "prompt").expect("create session");
        update_session_acp_preferences(&conn, &session.id, r#"{"modeId":"plan"}"#)
            .expect("update session acp prefs");

        let loaded = get_session(&conn, &session.id).expect("load session");
        assert_eq!(loaded.acp_preferences_json, r#"{"modeId":"plan"}"#);

        set_workspace_acp_defaults(&conn, "/tmp/ws", r#"{"modeId":"agent"}"#)
            .expect("set workspace defaults");
        let defaults =
            get_workspace_acp_defaults(&conn, "/tmp/ws").expect("get workspace defaults");
        assert_eq!(defaults.as_deref(), Some(r#"{"modeId":"agent"}"#));

        delete_workspace_acp_defaults(&conn, "/tmp/ws").expect("delete workspace defaults");
        let deleted = get_workspace_acp_defaults(&conn, "/tmp/ws").expect("get deleted defaults");
        assert!(deleted.is_none());
    }
}
