use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SessionRecord {
    pub id: String,
    pub workspace_id: String,
    pub acp_session_id: Option<String>,
    pub name: String,
    pub initial_prompt: String,
    pub plan_file_path: Option<String>,
    pub phase: String,
    pub acp_preferences_json: String,
    pub created_at: i64,
    pub updated_at: i64,
}

fn row_to_session(row: &rusqlite::Row) -> rusqlite::Result<SessionRecord> {
    Ok(SessionRecord {
        id: row.get(0)?,
        workspace_id: row.get(1)?,
        acp_session_id: row.get(2)?,
        name: row.get(3)?,
        initial_prompt: row.get(4)?,
        plan_file_path: row.get(5)?,
        phase: row.get(6)?,
        acp_preferences_json: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

const SESSION_COLUMNS: &str = "id, workspace_id, acp_session_id, name, initial_prompt, plan_file_path, phase, acp_preferences_json, created_at, updated_at";

pub fn list_sessions(conn: &Connection, workspace_id: &str) -> Result<Vec<SessionRecord>, String> {
    let sql = format!(
        "SELECT {} FROM sessions WHERE workspace_id = ?1 ORDER BY updated_at DESC",
        SESSION_COLUMNS
    );
    let mut stmt = conn.prepare(&sql)
        .map_err(|e| format!("Query prepare error: {}", e))?;

    let rows = stmt
        .query_map(params![workspace_id], row_to_session)
        .map_err(|e| format!("Query error: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row error: {}", e))?;

    Ok(rows)
}

pub fn get_session(conn: &Connection, id: &str) -> Result<SessionRecord, String> {
    let sql = format!("SELECT {} FROM sessions WHERE id = ?1", SESSION_COLUMNS);
    conn.query_row(&sql, params![id], row_to_session)
        .map_err(|e| format!("Session not found: {}", e))
}

pub fn create_session(
    conn: &Connection,
    workspace_id: &str,
    name: &str,
    initial_prompt: &str,
) -> Result<SessionRecord, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = crate::comments::now();

    conn.execute(
        "INSERT INTO sessions (id, workspace_id, name, initial_prompt, phase, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'idle', ?5, ?5)",
        params![id, workspace_id, name, initial_prompt, now],
    )
    .map_err(|e| format!("Insert error: {}", e))?;

    get_session(conn, &id)
}

pub fn update_session_acp_id(
    conn: &Connection,
    id: &str,
    acp_session_id: &str,
) -> Result<(), String> {
    let now = crate::comments::now();
    conn.execute(
        "UPDATE sessions SET acp_session_id = ?1, updated_at = ?2 WHERE id = ?3",
        params![acp_session_id, now, id],
    )
    .map_err(|e| format!("Update error: {}", e))?;
    Ok(())
}

pub fn update_phase(conn: &Connection, id: &str, phase: &str) -> Result<(), String> {
    let valid = ["idle", "planning", "reviewing", "executing", "done"];
    if !valid.contains(&phase) {
        return Err(format!("Invalid phase: {}. Must be one of: {:?}", phase, valid));
    }
    let now = crate::comments::now();
    conn.execute(
        "UPDATE sessions SET phase = ?1, updated_at = ?2 WHERE id = ?3",
        params![phase, now, id],
    )
    .map_err(|e| format!("Update phase error: {}", e))?;
    Ok(())
}

pub fn update_plan_file_path(conn: &Connection, id: &str, plan_file_path: &str) -> Result<(), String> {
    let now = crate::comments::now();
    conn.execute(
        "UPDATE sessions SET plan_file_path = ?1, updated_at = ?2 WHERE id = ?3",
        params![plan_file_path, now, id],
    )
    .map_err(|e| format!("Update plan_file_path error: {}", e))?;
    Ok(())
}

pub fn update_acp_preferences(conn: &Connection, id: &str, json: &str) -> Result<(), String> {
    let now = crate::comments::now();
    conn.execute(
        "UPDATE sessions SET acp_preferences_json = ?1, updated_at = ?2 WHERE id = ?3",
        params![json, now, id],
    )
    .map_err(|e| format!("Update acp_preferences error: {}", e))?;
    Ok(())
}

pub fn get_workspace_acp_defaults(conn: &Connection, workspace_path: &str) -> Result<Option<String>, String> {
    match conn.query_row(
        "SELECT preferences_json FROM workspace_acp_defaults WHERE workspace_path = ?1",
        params![workspace_path],
        |row| row.get::<_, String>(0),
    ) {
        Ok(json) => Ok(Some(json)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("Query error: {}", e)),
    }
}

pub fn set_workspace_acp_defaults(conn: &Connection, workspace_path: &str, json: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO workspace_acp_defaults (workspace_path, preferences_json)
         VALUES (?1, ?2)
         ON CONFLICT(workspace_path) DO UPDATE SET preferences_json = excluded.preferences_json",
        params![workspace_path, json],
    )
    .map_err(|e| format!("Upsert workspace_acp_defaults error: {}", e))?;
    Ok(())
}

pub fn delete_session(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM sessions WHERE id = ?1", params![id])
        .map_err(|e| format!("Delete error: {}", e))?;
    Ok(())
}

pub fn count_sessions_batch(conn: &Connection, workspace_ids: &[String]) -> Result<Vec<(String, i64)>, String> {
    if workspace_ids.is_empty() {
        return Ok(Vec::new());
    }

    const MAX_VARS: usize = 999;
    let mut results: Vec<(String, i64)> = Vec::new();

    for chunk in workspace_ids.chunks(MAX_VARS) {
        let placeholders: Vec<String> = (1..=chunk.len()).map(|i| format!("?{}", i)).collect();
        let sql = format!(
            "SELECT workspace_id, COUNT(*) FROM sessions WHERE workspace_id IN ({}) GROUP BY workspace_id HAVING COUNT(*) > 0",
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

// --- Workspace table ---

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkspaceRecord {
    pub id: String,
    pub path: String,
    pub display_name: String,
    pub workspace_type: String,
    pub last_accessed: i64,
    pub created_at: i64,
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
    let now = crate::comments::now();
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
    let now = crate::comments::now();
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
    workspace_ids: Vec<String>,
    db: tauri::State<CommentsDb>,
) -> Result<Vec<(String, i64)>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    count_sessions_batch(&conn, &workspace_ids)
}

#[tauri::command]
pub fn session_list(
    workspace_id: String,
    db: tauri::State<CommentsDb>,
) -> Result<Vec<SessionRecord>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    list_sessions(&conn, &workspace_id)
}

#[tauri::command]
pub fn session_create(
    workspace_id: String,
    name: String,
    initial_prompt: String,
    db: tauri::State<CommentsDb>,
) -> Result<SessionRecord, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    create_session(&conn, &workspace_id, &name, &initial_prompt)
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
    app: tauri::AppHandle,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    // CASCADE handles messages deletion automatically
    delete_session(&conn, &id)?;
    let app_data = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    crate::plan_file::delete_plan(&app_data, &id)
}

#[tauri::command]
pub fn forget_workspace_data(
    workspace_id: String,
    workspace_path: String,
    workspace_type: String,
    db: tauri::State<CommentsDb>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    match workspace_type.as_str() {
        "directory" => {
            // Collect session IDs for plan file cleanup before CASCADE deletes them
            let session_ids: Vec<String> = {
                let mut stmt = conn
                    .prepare("SELECT id FROM sessions WHERE workspace_id = ?1")
                    .map_err(|e| format!("Query error: {}", e))?;
                let ids = stmt.query_map(params![workspace_id], |row| row.get(0))
                    .map_err(|e| format!("Query error: {}", e))?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|e| format!("Row error: {}", e))?;
                ids
            };

            // Delete comments by file path pattern (not FK-based)
            crate::comments::delete_comments_for_workspace(&conn, &workspace_path)?;

            // Delete sessions (CASCADE deletes messages)
            conn.execute("DELETE FROM sessions WHERE workspace_id = ?1", params![workspace_id])
                .map_err(|e| format!("Delete sessions error: {}", e))?;

            // Delete workspace ACP defaults
            conn.execute("DELETE FROM workspace_acp_defaults WHERE workspace_path = ?1", params![workspace_path])
                .map_err(|e| format!("Delete workspace_acp_defaults error: {}", e))?;

            // Clean up plan files from disk
            let app_data = app.path().app_data_dir()
                .map_err(|e| format!("Failed to get app data dir: {}", e))?;
            for id in &session_ids {
                let _ = crate::plan_file::delete_plan(&app_data, id);
            }
        }
        "file" => {
            crate::comments::delete_comments_for_file(&conn, &workspace_path)?;
        }
        other => return Err(format!("Invalid workspace_type: {}", other)),
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

#[tauri::command]
pub fn session_update_acp_preferences(
    id: String,
    acp_preferences_json: String,
    db: tauri::State<CommentsDb>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    update_acp_preferences(&conn, &id, &acp_preferences_json)
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
