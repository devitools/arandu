use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MessageRecord {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub message_type: Option<String>,
    pub tool_call_id: Option<String>,
    pub tool_title: Option<String>,
    pub tool_status: Option<String>,
    pub created_at: String,
}

pub fn init_messages_table(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS messages (
            id           TEXT PRIMARY KEY,
            session_id   TEXT NOT NULL,
            role         TEXT NOT NULL,
            content      TEXT NOT NULL,
            message_type TEXT,
            tool_call_id TEXT,
            tool_title   TEXT,
            tool_status  TEXT,
            created_at   TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_messages_session_time
            ON messages(session_id, created_at);"
    )
    .map_err(|e| format!("Failed to create messages table: {}", e))
}

pub fn list_messages(
    conn: &Connection,
    session_id: &str,
    offset: i64,
    limit: i64,
) -> Result<Vec<MessageRecord>, String> {
    // Fetch a page of messages ordered oldest-first within the page,
    // but use a descending outer query so offset 0 returns the LATEST messages.
    let mut stmt = conn
        .prepare(
            "SELECT id, session_id, role, content, message_type,
                    tool_call_id, tool_title, tool_status, created_at
             FROM (
               SELECT * FROM messages
               WHERE session_id = ?1
               ORDER BY created_at DESC
               LIMIT ?2 OFFSET ?3
             )
             ORDER BY created_at ASC",
        )
        .map_err(|e| format!("Prepare error: {}", e))?;

    let rows = stmt
        .query_map(params![session_id, limit, offset], |row| {
            Ok(MessageRecord {
                id: row.get(0)?,
                session_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                message_type: row.get(4)?,
                tool_call_id: row.get(5)?,
                tool_title: row.get(6)?,
                tool_status: row.get(7)?,
                created_at: row.get(8)?,
            })
        })
        .map_err(|e| format!("Query error: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row error: {}", e))?;

    Ok(rows)
}

pub fn save_message(
    conn: &Connection,
    session_id: &str,
    role: &str,
    content: &str,
    message_type: Option<&str>,
    tool_call_id: Option<&str>,
    tool_title: Option<&str>,
    tool_status: Option<&str>,
) -> Result<MessageRecord, String> {
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO messages
            (id, session_id, role, content, message_type, tool_call_id, tool_title, tool_status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![id, session_id, role, content, message_type, tool_call_id, tool_title, tool_status, now],
    )
    .map_err(|e| format!("Insert error: {}", e))?;

    Ok(MessageRecord {
        id,
        session_id: session_id.to_string(),
        role: role.to_string(),
        content: content.to_string(),
        message_type: message_type.map(str::to_string),
        tool_call_id: tool_call_id.map(str::to_string),
        tool_title: tool_title.map(str::to_string),
        tool_status: tool_status.map(str::to_string),
        created_at: now,
    })
}

pub fn delete_session_messages(conn: &Connection, session_id: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM messages WHERE session_id = ?1",
        params![session_id],
    )
    .map_err(|e| format!("Delete error: {}", e))?;
    Ok(())
}

pub fn count_session_messages(conn: &Connection, session_id: &str) -> Result<i64, String> {
    conn.query_row(
        "SELECT COUNT(*) FROM messages WHERE session_id = ?1",
        params![session_id],
        |row| row.get(0),
    )
    .map_err(|e| format!("Count error: {}", e))
}

// --- Tauri commands ---

use crate::comments::CommentsDb;

#[tauri::command]
pub fn messages_list(
    session_id: String,
    offset: Option<i64>,
    limit: Option<i64>,
    db: tauri::State<CommentsDb>,
) -> Result<Vec<MessageRecord>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    list_messages(&conn, &session_id, offset.unwrap_or(0), limit.unwrap_or(50))
}

#[tauri::command]
pub fn messages_count(
    session_id: String,
    db: tauri::State<CommentsDb>,
) -> Result<i64, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    count_session_messages(&conn, &session_id)
}

#[tauri::command]
pub fn messages_delete_session(
    session_id: String,
    db: tauri::State<CommentsDb>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    delete_session_messages(&conn, &session_id)
}
