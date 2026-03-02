use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SessionRecord {
    pub id: String,
    pub workspace_path: String,
    pub acp_session_id: Option<String>,
    pub name: String,
    pub initial_prompt: String,
    pub plan_markdown: String,
    pub plan_file_path: Option<String>,
    pub phase: String,
    pub created_at: String,
    pub updated_at: String,
}

pub fn init_sessions_table(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS sessions (
            id              TEXT PRIMARY KEY,
            workspace_path  TEXT NOT NULL,
            acp_session_id  TEXT,
            name            TEXT NOT NULL,
            initial_prompt  TEXT NOT NULL,
            plan_markdown   TEXT DEFAULT '',
            plan_file_path  TEXT,
            phase           TEXT DEFAULT 'idle',
            created_at      TEXT NOT NULL,
            updated_at      TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_path);"
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

    Ok(())
}

pub fn list_sessions(conn: &Connection, workspace_path: &str) -> Result<Vec<SessionRecord>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, workspace_path, acp_session_id, name, initial_prompt,
                    plan_markdown, plan_file_path, phase, created_at, updated_at
             FROM sessions WHERE workspace_path = ?1
             ORDER BY updated_at DESC"
        )
        .map_err(|e| format!("Query prepare error: {}", e))?;

    let rows = stmt
        .query_map(params![workspace_path], |row| {
            Ok(SessionRecord {
                id: row.get(0)?,
                workspace_path: row.get(1)?,
                acp_session_id: row.get(2)?,
                name: row.get(3)?,
                initial_prompt: row.get(4)?,
                plan_markdown: row.get(5)?,
                plan_file_path: row.get(6)?,
                phase: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })
        .map_err(|e| format!("Query error: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row error: {}", e))?;

    Ok(rows)
}

pub fn get_session(conn: &Connection, id: &str) -> Result<SessionRecord, String> {
    conn.query_row(
        "SELECT id, workspace_path, acp_session_id, name, initial_prompt,
                plan_markdown, plan_file_path, phase, created_at, updated_at
         FROM sessions WHERE id = ?1",
        params![id],
        |row| {
            Ok(SessionRecord {
                id: row.get(0)?,
                workspace_path: row.get(1)?,
                acp_session_id: row.get(2)?,
                name: row.get(3)?,
                initial_prompt: row.get(4)?,
                plan_markdown: row.get(5)?,
                plan_file_path: row.get(6)?,
                phase: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
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
        "INSERT INTO sessions (id, workspace_path, name, initial_prompt, plan_markdown, phase, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, '', 'idle', ?5, ?5)",
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
    let valid = ["idle", "planning", "reviewing", "executing"];
    if !valid.contains(&phase) {
        return Err(format!("Invalid phase: {}. Must be one of: {:?}", phase, valid));
    }
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE sessions SET phase = ?1, updated_at = ?2 WHERE id = ?3",
        params![phase, now, id],
    )
    .map_err(|e| format!("Update phase error: {}", e))?;
    Ok(())
}

pub fn update_plan_file_path(conn: &Connection, id: &str, plan_file_path: &str) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE sessions SET plan_file_path = ?1, updated_at = ?2 WHERE id = ?3",
        params![plan_file_path, now, id],
    )
    .map_err(|e| format!("Update plan_file_path error: {}", e))?;
    Ok(())
}

pub fn delete_session(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM sessions WHERE id = ?1", params![id])
        .map_err(|e| format!("Delete error: {}", e))?;
    Ok(())
}

// --- Tauri commands ---

use crate::comments::CommentsDb;

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
pub fn session_get(
    id: String,
    db: tauri::State<CommentsDb>,
) -> Result<SessionRecord, String> {
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
pub fn session_delete(
    id: String,
    db: tauri::State<CommentsDb>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    delete_session(&conn, &id)
}
