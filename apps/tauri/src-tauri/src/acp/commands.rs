use std::collections::HashMap;
use tokio::sync::Mutex;
use tauri::{AppHandle, State};

use super::connection::AcpConnection;
use super::types::*;

pub struct AcpState(pub Mutex<HashMap<String, AcpConnection>>);

impl Default for AcpState {
    fn default() -> Self {
        Self(Mutex::new(HashMap::new()))
    }
}

#[tauri::command]
pub async fn acp_connect(
    workspace_id: String,
    cwd: String,
    app_handle: AppHandle,
    state: State<'_, AcpState>,
) -> Result<(), String> {
    let mut connections = state.0.lock().await;
    if connections.contains_key(&workspace_id) {
        return Ok(());
    }

    let binary = std::env::var("COPILOT_PATH").unwrap_or_else(|_| "copilot".to_string());
    let conn = AcpConnection::spawn(
        &binary,
        &["--acp", "--stdio"],
        &cwd,
        workspace_id.clone(),
        app_handle,
    )
    .await?;

    let init_params = InitializeParams {
        protocol_version: 1,
        client_capabilities: serde_json::json!({}),
    };

    conn.send_request(
        "initialize",
        Some(serde_json::to_value(&init_params).map_err(|e| e.to_string())?),
    )
    .await?;

    conn.send_notification("initialized", None).await?;

    connections.insert(workspace_id, conn);
    Ok(())
}

#[tauri::command]
pub async fn acp_disconnect(
    workspace_id: String,
    state: State<'_, AcpState>,
) -> Result<(), String> {
    let mut connections = state.0.lock().await;
    if let Some(conn) = connections.remove(&workspace_id) {
        conn.shutdown().await;
    }
    Ok(())
}

#[tauri::command]
pub async fn acp_new_session(
    workspace_id: String,
    cwd: String,
    state: State<'_, AcpState>,
) -> Result<SessionInfo, String> {
    let connections = state.0.lock().await;
    let conn = connections
        .get(&workspace_id)
        .ok_or("Not connected")?;

    let params = NewSessionParams {
        cwd,
        mcp_servers: vec![],
    };

    let result = conn
        .send_request(
            "session/new",
            Some(serde_json::to_value(&params).map_err(|e| e.to_string())?),
        )
        .await?;

    let info: SessionInfo = serde_json::from_value(result)
        .map_err(|e| format!("Failed to parse session info: {}", e))?;
    Ok(info)
}

#[tauri::command]
pub async fn acp_list_sessions(
    workspace_id: String,
    cwd: String,
    state: State<'_, AcpState>,
) -> Result<Vec<SessionSummary>, String> {
    let connections = state.0.lock().await;
    let conn = connections
        .get(&workspace_id)
        .ok_or("Not connected")?;

    let params = ListSessionsParams { cwd };

    let result = conn
        .send_request(
            "session/list",
            Some(serde_json::to_value(&params).map_err(|e| e.to_string())?),
        )
        .await?;

    let sessions: Vec<SessionSummary> = if let Some(arr) = result.get("sessions") {
        serde_json::from_value(arr.clone()).unwrap_or_default()
    } else {
        serde_json::from_value(result).unwrap_or_default()
    };

    Ok(sessions)
}

#[tauri::command]
pub async fn acp_load_session(
    workspace_id: String,
    session_id: String,
    cwd: String,
    state: State<'_, AcpState>,
) -> Result<SessionInfo, String> {
    let connections = state.0.lock().await;
    let conn = connections
        .get(&workspace_id)
        .ok_or("Not connected")?;

    let params = LoadSessionParams {
        session_id: session_id.clone(),
        cwd,
        mcp_servers: vec![],
    };

    let result = conn
        .send_request(
            "session/load",
            Some(serde_json::to_value(&params).map_err(|e| e.to_string())?),
        )
        .await?;

    let mut info: SessionInfo = serde_json::from_value(result)
        .map_err(|e| format!("Failed to parse session info: {}", e))?;

    if info.session_id.is_empty() {
        info.session_id = session_id;
    }
    Ok(info)
}

#[tauri::command]
pub async fn acp_send_prompt(
    workspace_id: String,
    session_id: String,
    text: String,
    state: State<'_, AcpState>,
) -> Result<(), String> {
    let connections = state.0.lock().await;
    let conn = connections
        .get(&workspace_id)
        .ok_or("Not connected")?;

    let params = PromptParams {
        session_id,
        prompt: vec![PromptContent {
            r#type: "text".to_string(),
            text,
        }],
    };

    conn.send_request(
        "session/prompt",
        Some(serde_json::to_value(&params).map_err(|e| e.to_string())?),
    )
    .await?;

    Ok(())
}

#[tauri::command]
pub async fn acp_set_mode(
    workspace_id: String,
    session_id: String,
    mode: String,
    state: State<'_, AcpState>,
) -> Result<(), String> {
    let connections = state.0.lock().await;
    let conn = connections
        .get(&workspace_id)
        .ok_or("Not connected")?;

    let params = SetSessionModeParams {
        session_id,
        mode_id: mode,
    };

    conn.send_request(
        "session/set_mode",
        Some(serde_json::to_value(&params).map_err(|e| e.to_string())?),
    )
    .await?;

    Ok(())
}

#[tauri::command]
pub async fn acp_cancel(
    workspace_id: String,
    session_id: String,
    state: State<'_, AcpState>,
) -> Result<(), String> {
    let connections = state.0.lock().await;
    let conn = connections
        .get(&workspace_id)
        .ok_or("Not connected")?;

    let params = CancelParams { session_id };

    conn.send_notification(
        "session/cancel",
        Some(serde_json::to_value(&params).map_err(|e| e.to_string())?),
    )
    .await?;

    Ok(())
}

pub async fn disconnect_all(state: &AcpState) {
    let mut connections = state.0.lock().await;
    for (id, conn) in connections.drain() {
        eprintln!("[acp] Disconnecting workspace {}", id);
        conn.shutdown().await;
    }
}
