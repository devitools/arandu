use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use indexmap::IndexMap;
use tokio::sync::Mutex;
use tauri::{AppHandle, State, Emitter};

use super::connection::AcpConnection;
use super::types::*;

pub struct AcpState {
    pub connections: Mutex<HashMap<String, AcpConnection>>,
    pub configs: Mutex<HashMap<String, ConnectionConfig>>,
}

impl Default for AcpState {
    fn default() -> Self {
        Self {
            connections: Mutex::new(HashMap::new()),
            configs: Mutex::new(HashMap::new()),
        }
    }
}

// ---------------------------------------------------------------------------
// Per-session ACP architecture (new, coexists with AcpState during migration)
// ---------------------------------------------------------------------------

pub struct AcpSessionInstance {
    pub connection: Arc<AcpConnection>,
    /// Copilot-internal session UUID returned by session/new or session/load
    pub acp_session_id: String,
    /// Our local DB session UUID (sessions.id)
    #[allow(dead_code)]
    pub arandu_session_id: String,
    pub last_activity: Arc<Mutex<Instant>>,
}

pub struct AcpSessionStore {
    /// Ordered by insertion time; key = arandu_session_id
    pub instances: Mutex<IndexMap<String, AcpSessionInstance>>,
    pub configs: Mutex<HashMap<String, SessionConnectionConfig>>,
    pub max_instances: usize,
}

impl Default for AcpSessionStore {
    fn default() -> Self {
        Self {
            instances: Mutex::new(IndexMap::new()),
            configs: Mutex::new(HashMap::new()),
            max_instances: 10,
        }
    }
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct SessionConnectionConfig {
    pub binary: String,
    pub cwd: String,
    pub gh_token: Option<String>,
}


#[tauri::command]
pub async fn acp_connect(
    workspace_id: String,
    cwd: String,
    binary_path: Option<String>,
    gh_token: Option<String>,
    app_handle: AppHandle,
    state: State<'_, AcpState>,
) -> Result<(), String> {
    let existing = {
        let mut connections = state.connections.lock().await;
        connections.remove(&workspace_id)
    };
    if let Some(existing) = existing {
        if existing.is_alive().await {
            state.connections.lock().await.insert(workspace_id.clone(), existing);
            return Ok(());
        }
        existing.shutdown().await;
        state.configs.lock().await.remove(&workspace_id);
    }

    let binary = binary_path
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| std::env::var("COPILOT_PATH").unwrap_or_else(|_| "copilot".to_string()));

    let config = ConnectionConfig {
        binary: binary.clone(),
        cwd: cwd.clone(),
        gh_token: gh_token.clone(),
    };

    let _ = app_handle.emit("acp:connection-status", &ConnectionStatusEvent {
        workspace_id: workspace_id.clone(),
        status: "connecting".to_string(),
        attempt: None,
    });

    let conn = AcpConnection::spawn(
        &binary,
        &["--acp", "--stdio"],
        &cwd,
        gh_token,
        workspace_id.clone(),
        app_handle.clone(),
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
    conn.emit_status("connected", None);
    conn.emit_log("info", "connect", &format!("Connected via {}", binary));

    state.configs.lock().await.insert(workspace_id.clone(), config);
    state.connections.lock().await.insert(workspace_id, conn);
    Ok(())
}

#[tauri::command]
pub async fn acp_disconnect(
    workspace_id: String,
    state: State<'_, AcpState>,
) -> Result<(), String> {
    state.configs.lock().await.remove(&workspace_id);
    let conn = state.connections.lock().await.remove(&workspace_id);
    if let Some(conn) = conn {
        conn.emit_log("info", "disconnect", "Disconnected by user");
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
    let connections = state.connections.lock().await;
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
    let connections = state.connections.lock().await;
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
    let connections = state.connections.lock().await;
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
    let connections = state.connections.lock().await;
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

    conn.send_request_with_timeout(
        "session/prompt",
        Some(serde_json::to_value(&params).map_err(|e| e.to_string())?),
        std::time::Duration::from_secs(600),
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
    let connections = state.connections.lock().await;
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
    let connections = state.connections.lock().await;
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

#[tauri::command]
pub async fn acp_check_health(
    workspace_id: String,
    app_handle: AppHandle,
    state: State<'_, AcpState>,
) -> Result<String, String> {
    let existing = {
        let mut connections = state.connections.lock().await;
        connections.remove(&workspace_id)
    };
    let status = if let Some(conn) = existing {
        if conn.is_alive().await {
            conn.emit_status("connected", None);
            state.connections.lock().await.insert(workspace_id.clone(), conn);
            "connected"
        } else {
            conn.emit_status("disconnected", None);
            conn.shutdown().await;
            state.configs.lock().await.remove(&workspace_id);
            "disconnected"
        }
    } else {
        let event = ConnectionStatusEvent {
            workspace_id: workspace_id.clone(),
            status: "disconnected".to_string(),
            attempt: None,
        };
        let _ = app_handle.emit("acp:connection-status", &event);
        "disconnected"
    };
    Ok(status.to_string())
}

pub async fn disconnect_all(state: &AcpState) {
    state.configs.lock().await.clear();
    let mut connections = state.connections.lock().await;
    for (id, conn) in connections.drain() {
        eprintln!("[acp] Disconnecting workspace {}", id);
        conn.shutdown().await;
    }
}

// ---------------------------------------------------------------------------
// Per-session commands (new architecture)
// ---------------------------------------------------------------------------

/// Spawn a dedicated copilot process for the given Arandu session, then
/// initialize the ACP connection and create (or load) an ACP session.
/// If the store already has a live instance for this session, returns early.
/// Enforces the max_instances cap using LRU eviction.
#[tauri::command]
pub async fn acp_session_connect(
    session_id: String,
    workspace_path: String,
    binary_path: Option<String>,
    gh_token: Option<String>,
    acp_session_id: Option<String>,
    app_handle: AppHandle,
    store: State<'_, AcpSessionStore>,
) -> Result<String, String> {
    eprintln!("[acp] acp_session_connect: session={} workspace={}", session_id, workspace_path);

    // Return early if already alive (extract Arc before awaiting to avoid holding lock)
    {
        let check = {
            let instances = store.instances.lock().await;
            instances.get(&session_id).map(|inst| (Arc::clone(&inst.connection), inst.acp_session_id.clone()))
        };
        if let Some((conn, acp_id)) = check {
            if conn.is_alive().await {
                eprintln!("[acp] session={} already connected, returning existing acp_id={}", session_id, acp_id);
                return Ok(acp_id);
            }
        }
    }

    let binary = binary_path
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| std::env::var("COPILOT_PATH").unwrap_or_else(|_| "copilot".to_string()));

    emit_session_status(&app_handle, &session_id, "connecting");

    // Enforce cap: evict oldest if at limit (extract before awaiting to avoid holding lock)
    let evicted = {
        let mut instances = store.instances.lock().await;
        if instances.len() >= store.max_instances {
            let evict_key = instances.keys().next().cloned().unwrap_or_default();
            if !evict_key.is_empty() {
                instances.shift_remove(&evict_key).map(|old| (evict_key, old))
            } else { None }
        } else { None }
    };
    if let Some((evict_key, old)) = evicted {
        emit_session_status(&app_handle, &evict_key, "disconnected");
        eprintln!("[acp] Evicting session {} (cap)", evict_key);
        old.connection.shutdown().await;
        store.configs.lock().await.remove(&evict_key);
    }

    let conn = AcpConnection::spawn(
        &binary,
        &["--acp", "--stdio"],
        &workspace_path,
        gh_token.clone(),
        session_id.clone(),
        app_handle.clone(),
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

    // Create or load the ACP session
    let info: SessionInfo = if let Some(ref existing_id) = acp_session_id {
        // Suppress replay messages from session/load — the frontend loads history from SQLite
        conn.set_suppress_updates(true);
        let params = LoadSessionParams {
            session_id: existing_id.clone(),
            cwd: workspace_path.clone(),
            mcp_servers: vec![],
        };
        let result = conn
            .send_request("session/load", Some(serde_json::to_value(&params).map_err(|e| e.to_string())?))
            .await?;
        conn.set_suppress_updates(false);
        let mut info: SessionInfo = serde_json::from_value(result)
            .map_err(|e| format!("Failed to parse session info: {}", e))?;
        if info.session_id.is_empty() {
            info.session_id = existing_id.clone();
        }
        info
    } else {
        let params = NewSessionParams {
            cwd: workspace_path.clone(),
            mcp_servers: vec![],
        };
        let result = conn
            .send_request("session/new", Some(serde_json::to_value(&params).map_err(|e| e.to_string())?))
            .await?;
        serde_json::from_value(result)
            .map_err(|e| format!("Failed to parse session info: {}", e))?
    };

    let copilot_session_id = info.session_id.clone();
    eprintln!("[acp] session={} connected — copilot_session_id={} binary={}", session_id, copilot_session_id, binary);

    conn.emit_status("connected", None);
    conn.emit_log("info", "connect", &format!("Session connected via {}", binary));

    {
        let mut payload = serde_json::json!({});
        if let Some(ref modes) = info.modes {
            payload["availableModes"] = serde_json::to_value(&modes.available_modes).unwrap_or_default();
            payload["currentModeId"] = serde_json::json!(modes.current_mode_id);
        }
        if let Some(ref config_val) = info.config_options {
            if let Some(opts) = config_val.get("availableConfigOptions") {
                payload["availableConfigOptions"] = opts.clone();
            }
            if let Some(sel) = config_val.get("selectedConfigOptions") {
                payload["selectedConfigOptions"] = sel.clone();
            }
        }
        let _ = app_handle.emit("acp:session-update", SessionUpdateEvent {
            workspace_id: session_id.clone(),
            session_id: copilot_session_id.clone(),
            update_type: "session_info_update".to_string(),
            payload,
        });
    }

    let instance = AcpSessionInstance {
        connection: Arc::new(conn),
        acp_session_id: copilot_session_id.clone(),
        arandu_session_id: session_id.clone(),
        last_activity: Arc::new(Mutex::new(Instant::now())),
    };

    store.instances.lock().await.insert(session_id.clone(), instance);
    store.configs.lock().await.insert(session_id, SessionConnectionConfig {
        binary,
        cwd: workspace_path,
        gh_token,
    });

    Ok(copilot_session_id)
}

#[tauri::command]
pub async fn acp_session_disconnect(
    session_id: String,
    app_handle: AppHandle,
    store: State<'_, AcpSessionStore>,
) -> Result<(), String> {
    eprintln!("[acp] acp_session_disconnect: session={}", session_id);
    store.configs.lock().await.remove(&session_id);
    let inst = store.instances.lock().await.shift_remove(&session_id);
    if let Some(inst) = inst {
        inst.connection.emit_log("info", "disconnect", "Disconnected by user");
        inst.connection.shutdown().await;
    }
    emit_session_status(&app_handle, &session_id, "disconnected");
    Ok(())
}

#[tauri::command]
pub async fn acp_session_status(
    session_id: String,
    app_handle: AppHandle,
    store: State<'_, AcpSessionStore>,
) -> Result<String, String> {
    let conn = {
        let instances = store.instances.lock().await;
        instances.get(&session_id).map(|inst| Arc::clone(&inst.connection))
    };
    if let Some(conn) = conn {
        if conn.is_alive().await {
            return Ok("connected".to_string());
        }
        // Dead — remove and clean up
        let removed = store.instances.lock().await.shift_remove(&session_id);
        if let Some(inst) = removed {
            inst.connection.shutdown().await;
        }
        store.configs.lock().await.remove(&session_id);
        emit_session_status(&app_handle, &session_id, "disconnected");
        return Ok("disconnected".to_string());
    }
    emit_session_status(&app_handle, &session_id, "disconnected");
    Ok("disconnected".to_string())
}

#[tauri::command]
pub async fn acp_session_send_prompt(
    session_id: String,
    text: String,
    app_handle: AppHandle,
    store: State<'_, AcpSessionStore>,
) -> Result<(), String> {
    eprintln!("[acp] acp_session_send_prompt: session={} text={:.60}", session_id, text);

    // Extract what we need and release the lock BEFORE the long-running send_prompt
    let (conn, acp_id) = {
        let instances = store.instances.lock().await;
        let inst = instances.get(&session_id).ok_or("Session not connected")?;
        *inst.last_activity.lock().await = Instant::now();
        (Arc::clone(&inst.connection), inst.acp_session_id.clone())
    };

    // Emit optimistic status
    emit_session_status(&app_handle, &session_id, "streaming");

    // send_prompt saves the user message to DB then forwards to copilot
    let result = conn
        .send_prompt(acp_id, text, std::time::Duration::from_secs(600))
        .await?;

    eprintln!("[acp] session={} prompt result: {}", session_id, serde_json::to_string(&result).unwrap_or_default().chars().take(500).collect::<String>());
    Ok(())
}

#[tauri::command]
pub async fn acp_session_set_mode(
    session_id: String,
    mode: String,
    store: State<'_, AcpSessionStore>,
) -> Result<(), String> {
    let (conn, acp_id) = {
        let instances = store.instances.lock().await;
        let inst = instances.get(&session_id).ok_or("Session not connected")?;
        (Arc::clone(&inst.connection), inst.acp_session_id.clone())
    };
    let params = SetSessionModeParams { session_id: acp_id, mode_id: mode };
    conn.send_request("session/set_mode", Some(serde_json::to_value(&params).map_err(|e| e.to_string())?))
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn acp_session_set_config_option(
    session_id: String,
    config_id: String,
    option_id: String,
    store: State<'_, AcpSessionStore>,
) -> Result<(), String> {
    let (conn, acp_id) = {
        let instances = store.instances.lock().await;
        let inst = instances.get(&session_id).ok_or("Session not connected")?;
        (Arc::clone(&inst.connection), inst.acp_session_id.clone())
    };
    let params = SetConfigOptionParams { session_id: acp_id, config_id, value: option_id };
    conn.send_request("session/set_config_option", Some(serde_json::to_value(&params).map_err(|e| e.to_string())?))
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn acp_session_cancel(
    session_id: String,
    store: State<'_, AcpSessionStore>,
) -> Result<(), String> {
    let (conn, acp_id) = {
        let instances = store.instances.lock().await;
        let inst = instances.get(&session_id).ok_or("Session not connected")?;
        (Arc::clone(&inst.connection), inst.acp_session_id.clone())
    };
    let params = CancelParams { session_id: acp_id };
    conn.send_notification("session/cancel", Some(serde_json::to_value(&params).map_err(|e| e.to_string())?))
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn acp_session_list_active(
    store: State<'_, AcpSessionStore>,
) -> Result<Vec<String>, String> {
    let checks: Vec<(String, Arc<AcpConnection>)> = {
        let instances = store.instances.lock().await;
        instances.iter().map(|(id, inst)| (id.clone(), Arc::clone(&inst.connection))).collect()
    };
    let mut active = Vec::new();
    for (id, conn) in checks {
        if conn.is_alive().await {
            active.push(id);
        }
    }
    Ok(active)
}

#[tauri::command]
pub async fn acp_session_check_health(
    session_id: String,
    app_handle: AppHandle,
    store: State<'_, AcpSessionStore>,
) -> Result<String, String> {
    let conn = {
        let instances = store.instances.lock().await;
        instances.get(&session_id).map(|inst| Arc::clone(&inst.connection))
    };
    if let Some(conn) = conn {
        if conn.is_alive().await {
            emit_session_status(&app_handle, &session_id, "connected");
            return Ok("connected".to_string());
        }
        let removed = store.instances.lock().await.shift_remove(&session_id);
        if let Some(inst) = removed {
            inst.connection.shutdown().await;
        }
        store.configs.lock().await.remove(&session_id);
    }
    emit_session_status(&app_handle, &session_id, "disconnected");
    Ok("disconnected".to_string())
}

#[tauri::command]
pub async fn acp_session_refresh_info(
    session_id: String,
    app_handle: AppHandle,
    store: State<'_, AcpSessionStore>,
) -> Result<(), String> {
    let (conn, acp_id) = {
        let instances = store.instances.lock().await;
        let inst = instances.get(&session_id).ok_or("Session not connected")?;
        (Arc::clone(&inst.connection), inst.acp_session_id.clone())
    };

    conn.set_suppress_updates(true);
    let params = LoadSessionParams {
        session_id: acp_id.clone(),
        cwd: store.configs.lock().await.get(&session_id)
            .map(|c| c.cwd.clone())
            .unwrap_or_default(),
        mcp_servers: vec![],
    };
    let result = conn
        .send_request("session/load", Some(serde_json::to_value(&params).map_err(|e| e.to_string())?))
        .await;

    conn.set_suppress_updates(false);

    let result = result?;
    let info: SessionInfo = serde_json::from_value(result)
        .map_err(|e| format!("Failed to parse session info: {}", e))?;

    let mut payload = serde_json::json!({});
    if let Some(ref modes) = info.modes {
        payload["availableModes"] = serde_json::to_value(&modes.available_modes).unwrap_or_default();
        payload["currentModeId"] = serde_json::json!(modes.current_mode_id);
    }
    if let Some(ref config_val) = info.config_options {
        if let Some(opts) = config_val.get("availableConfigOptions") {
            payload["availableConfigOptions"] = opts.clone();
        }
        if let Some(sel) = config_val.get("selectedConfigOptions") {
            payload["selectedConfigOptions"] = sel.clone();
        }
    }
    let _ = app_handle.emit("acp:session-update", SessionUpdateEvent {
        workspace_id: session_id,
        session_id: acp_id,
        update_type: "session_info_update".to_string(),
        payload,
    });

    Ok(())
}

pub async fn disconnect_all_sessions(store: &AcpSessionStore) {
    store.configs.lock().await.clear();
    let mut instances = store.instances.lock().await;
    for (id, inst) in instances.drain(..) {
        eprintln!("[acp] Disconnecting session {}", id);
        inst.connection.shutdown().await;
    }
}

fn emit_session_status(app_handle: &AppHandle, session_id: &str, status: &str) {
    let event = serde_json::json!({
        "sessionId": session_id,
        "status": status,
    });
    let _ = app_handle.emit("acp:session-status", &event);
}

