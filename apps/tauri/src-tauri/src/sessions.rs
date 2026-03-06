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

    // Migration: add chat_panel_size column
    let has_chat_panel_size: bool = conn
        .prepare("SELECT chat_panel_size FROM sessions LIMIT 0")
        .is_ok();
    if !has_chat_panel_size {
        conn.execute_batch("ALTER TABLE sessions ADD COLUMN chat_panel_size REAL;")
            .map_err(|e| format!("Migration failed: {}", e))?;
    }

    Ok(())
}

pub fn list_sessions(conn: &Connection, workspace_path: &str) -> Result<Vec<SessionRecord>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, workspace_path, acp_session_id, name, initial_prompt,
                    plan_markdown, plan_file_path, phase, chat_panel_size, created_at, updated_at
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
                chat_panel_size: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
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
                plan_markdown, plan_file_path, phase, chat_panel_size, created_at, updated_at
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
                chat_panel_size: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
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
    let valid = ["idle", "planning", "reviewing", "executing", "done"];
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

pub fn count_sessions_batch(conn: &Connection, workspace_paths: &[String]) -> Result<Vec<(String, i64)>, String> {
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
        let mut stmt = conn.prepare(&sql).map_err(|e| format!("Prepare error: {}", e))?;
        let params: Vec<&dyn rusqlite::ToSql> = chunk.iter().map(|p| p as &dyn rusqlite::ToSql).collect();
        let rows = stmt
            .query_map(params.as_slice(), |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)))
            .map_err(|e| format!("Query error: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Row error: {}", e))?;
        results.extend(rows);
    }

    Ok(results)
}

pub fn delete_workspace_sessions(conn: &Connection, workspace_path: &str) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare("SELECT id FROM sessions WHERE workspace_path = ?1")
        .map_err(|e| format!("Query error: {}", e))?;
    let ids: Vec<String> = stmt
        .query_map(params![workspace_path], |row| row.get(0))
        .map_err(|e| format!("Query error: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row error: {}", e))?;

    conn.execute("DELETE FROM sessions WHERE workspace_path = ?1", params![workspace_path])
        .map_err(|e| format!("Delete error: {}", e))?;

    Ok(ids)
}

// --- Workspace table ---

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkspaceRecord {
    pub id: String,
    pub path: String,
    pub display_name: String,
    pub workspace_type: String, // "directory" | "file"
    pub last_accessed: String,
    pub created_at: String,
}

pub fn init_workspaces_table(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS workspaces (
            id              TEXT PRIMARY KEY,
            path            TEXT NOT NULL UNIQUE,
            display_name    TEXT NOT NULL,
            workspace_type  TEXT NOT NULL DEFAULT 'directory',
            last_accessed   TEXT NOT NULL,
            created_at      TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_workspaces_accessed ON workspaces(last_accessed DESC);"
    )
    .map_err(|e| format!("Failed to create workspaces table: {}", e))
}

fn row_to_workspace(row: &rusqlite::Row) -> rusqlite::Result<WorkspaceRecord> {
    Ok(WorkspaceRecord {
        id: row.get(0)?,
        path: row.get(1)?,
        display_name: row.get(2)?,
        workspace_type: row.get(3)?,
        last_accessed: row.get(4)?,
        created_at: row.get(5)?,
    })
}

pub fn list_workspaces(conn: &Connection) -> Result<Vec<WorkspaceRecord>, String> {
    let mut stmt = conn
        .prepare("SELECT id, path, display_name, workspace_type, last_accessed, created_at FROM workspaces ORDER BY last_accessed DESC")
        .map_err(|e| format!("Query prepare error: {}", e))?;
    let rows = stmt
        .query_map([], row_to_workspace)
        .map_err(|e| format!("Query error: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row error: {}", e))?;
    Ok(rows)
}

pub fn upsert_workspace(conn: &Connection, id: &str, path: &str, display_name: &str, workspace_type: &str) -> Result<WorkspaceRecord, String> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO workspaces (id, path, display_name, workspace_type, last_accessed, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)
         ON CONFLICT(path) DO UPDATE SET display_name=excluded.display_name, last_accessed=excluded.last_accessed",
        params![id, path, display_name, workspace_type, now],
    ).map_err(|e| format!("Upsert workspace error: {}", e))?;
    conn.query_row(
        "SELECT id, path, display_name, workspace_type, last_accessed, created_at FROM workspaces WHERE path = ?1",
        params![path],
        row_to_workspace,
    ).map_err(|e| format!("Fetch workspace error: {}", e))
}

pub fn touch_workspace(conn: &Connection, id: &str) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute("UPDATE workspaces SET last_accessed = ?1 WHERE id = ?2", params![now, id])
        .map_err(|e| format!("Touch workspace error: {}", e))?;
    Ok(())
}

pub fn delete_workspace(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM workspaces WHERE id = ?1", params![id])
        .map_err(|e| format!("Delete workspace error: {}", e))?;
    Ok(())
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
    crate::messages::delete_session_messages(&conn, &id)?;
    delete_session(&conn, &id)?;
    let app_data = app.path().app_data_dir()
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
                delete_workspace_sessions(&conn, &workspace_path)?
            }
            "file" => {
                crate::comments::delete_comments_for_file(&conn, &workspace_path)?;
                return Ok(());
            }
            other => return Err(format!("Invalid workspace_type: {}", other)),
        }
    };

    let app_data = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    for id in &session_ids {
        let _ = crate::plan_file::delete_plan(&app_data, id);
        let conn2 = db.0.lock().map_err(|e| e.to_string())?;
        let _ = crate::messages::delete_session_messages(&conn2, id);
    }

    Ok(())
}

#[tauri::command]
pub fn workspace_list(db: tauri::State<CommentsDb>) -> Result<Vec<WorkspaceRecord>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    list_workspaces(&conn)
}

#[tauri::command]
pub fn workspace_upsert(
    id: String,
    path: String,
    display_name: String,
    workspace_type: String,
    db: tauri::State<CommentsDb>,
) -> Result<WorkspaceRecord, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    upsert_workspace(&conn, &id, &path, &display_name, &workspace_type)
}

#[tauri::command]
pub fn workspace_touch(id: String, db: tauri::State<CommentsDb>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    touch_workspace(&conn, &id)
}

#[tauri::command]
pub fn workspace_delete(id: String, db: tauri::State<CommentsDb>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    delete_workspace(&conn, &id)
}
