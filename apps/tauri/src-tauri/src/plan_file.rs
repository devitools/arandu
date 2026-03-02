use std::path::PathBuf;

fn get_plans_dir(app_data_dir: &PathBuf) -> PathBuf {
    app_data_dir.join("plans")
}

pub fn get_plan_path(app_data_dir: &PathBuf, session_id: &str) -> PathBuf {
    get_plans_dir(app_data_dir).join(format!("{}.md", session_id))
}

fn ensure_plans_dir(app_data_dir: &PathBuf) -> Result<(), String> {
    let dir = get_plans_dir(app_data_dir);
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create plans directory: {}", e))
}

pub fn write_plan(app_data_dir: &PathBuf, session_id: &str, markdown: &str) -> Result<(), String> {
    ensure_plans_dir(app_data_dir)?;
    let path = get_plan_path(app_data_dir, session_id);
    std::fs::write(&path, markdown)
        .map_err(|e| format!("Failed to write plan: {}", e))
}

pub fn read_plan(app_data_dir: &PathBuf, session_id: &str) -> Result<String, String> {
    let path = get_plan_path(app_data_dir, session_id);
    if !path.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read plan: {}", e))
}

pub fn delete_plan(app_data_dir: &PathBuf, session_id: &str) -> Result<(), String> {
    let path = get_plan_path(app_data_dir, session_id);
    if path.exists() {
        std::fs::remove_file(&path)
            .map_err(|e| format!("Failed to delete plan: {}", e))?;
    }
    Ok(())
}

// --- Tauri commands ---

#[tauri::command]
pub fn plan_write(
    session_id: String,
    markdown: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let app_data = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    write_plan(&app_data, &session_id, &markdown)
}

#[tauri::command]
pub fn plan_read(
    session_id: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let app_data = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    read_plan(&app_data, &session_id)
}

#[tauri::command]
pub fn plan_path(
    session_id: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let app_data = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let path = get_plan_path(&app_data, &session_id);
    Ok(path.to_string_lossy().to_string())
}

use tauri::Manager;
