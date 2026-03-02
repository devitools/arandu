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

pub fn init_db(app_data_dir: &PathBuf) -> Result<Connection, String> {
    std::fs::create_dir_all(app_data_dir)
        .map_err(|e| format!("Failed to create app data dir: {}", e))?;

    let db_path = app_data_dir.join("comments.db");
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;

    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| format!("Failed to set WAL mode: {}", e))?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS comments (
            id          TEXT PRIMARY KEY,
            file_path   TEXT NOT NULL,
            block_ids   TEXT NOT NULL,
            text        TEXT NOT NULL,
            timestamp   INTEGER NOT NULL,
            resolved    INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_comments_file_path ON comments(file_path);
        CREATE TABLE IF NOT EXISTS file_hashes (
            file_path   TEXT PRIMARY KEY,
            file_hash   TEXT NOT NULL
        );"
    ).map_err(|e| format!("Failed to create tables: {}", e))?;

    Ok(conn)
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
            "SELECT id, block_ids, text, timestamp, resolved FROM comments WHERE file_path = ?1",
        )
        .map_err(|e| format!("Query prepare error: {}", e))?;

    let comments = stmt
        .query_map(params![file_path], |row| {
            let block_ids_json: String = row.get(1)?;
            let block_ids: Vec<String> =
                serde_json::from_str(&block_ids_json).unwrap_or_default();
            Ok(Comment {
                id: row.get(0)?,
                block_ids,
                text: row.get(2)?,
                timestamp: row.get(3)?,
                resolved: row.get::<_, i32>(4)? != 0,
            })
        })
        .map_err(|e| format!("Query error: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row error: {}", e))?;

    Ok(CommentsData {
        file_hash,
        comments,
    })
}

pub fn save_comments(
    conn: &Connection,
    file_path: &str,
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
        let block_ids_json =
            serde_json::to_string(&comment.block_ids).map_err(|e| format!("JSON error: {}", e))?;
        tx.execute(
            "INSERT INTO comments (id, file_path, block_ids, text, timestamp, resolved) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                comment.id,
                file_path,
                block_ids_json,
                comment.text,
                comment.timestamp,
                comment.resolved as i32,
            ],
        )
        .map_err(|e| format!("Insert error: {}", e))?;
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

    let data = CommentsData {
        file_hash: legacy.file_hash,
        comments: legacy.comments,
    };

    save_comments(conn, markdown_path, &data)?;

    let _ = std::fs::remove_file(&json_pathbuf);

    Ok(true)
}
