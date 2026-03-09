use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use indexmap::IndexMap;
use tokio::sync::Mutex;
use tauri::{AppHandle, State, Emitter};

use super::connection::{AcpConnection, ClaudeConnection};
use super::types::*;

// ── AnyConnection — wraps both provider connection types ────────────────────

pub enum AnyConnection {
    Copilot(AcpConnection),
    Claude(ClaudeConnection),
}

impl AnyConnection {
    pub async fn shutdown(&self) {
        match self {
            AnyConnection::Copilot(c) => c.shutdown().await,
            AnyConnection::Claude(c) => c.shutdown().await,
        }
    }

    pub async fn is_alive(&self) -> bool {
        match self {
            AnyConnection::Copilot(c) => c.is_alive().await,
            AnyConnection::Claude(c) => c.is_alive().await,
        }
    }

    pub fn emit_status(&self, status: &str, attempt: Option<u32>) {
        match self {
            AnyConnection::Copilot(c) => c.emit_status(status, attempt),
            AnyConnection::Claude(c) => c.emit_status(status, attempt),
        }
    }

    #[allow(dead_code)]
    pub fn emit_log(&self, level: &str, event: &str, message: &str) {
        match self {
            AnyConnection::Copilot(c) => c.emit_log(level, event, message),
            AnyConnection::Claude(c) => c.emit_log(level, event, message),
        }
    }
}

pub struct AcpState {
    pub connections: Mutex<HashMap<String, AnyConnection>>,
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

pub enum AnySessionConnection {
    Copilot(Arc<AcpConnection>),
    Claude(Arc<ClaudeConnection>),
}

impl AnySessionConnection {
    pub async fn shutdown(&self) {
        match self {
            Self::Copilot(c) => c.shutdown().await,
            Self::Claude(c) => c.shutdown().await,
        }
    }
    pub async fn is_alive(&self) -> bool {
        match self {
            Self::Copilot(c) => c.is_alive().await,
            Self::Claude(c) => c.is_alive().await,
        }
    }
    pub fn emit_status(&self, status: &str, attempt: Option<u32>) {
        match self {
            Self::Copilot(c) => c.emit_status(status, attempt),
            Self::Claude(c) => c.emit_status(status, attempt),
        }
    }
    pub fn emit_log(&self, level: &str, event: &str, message: &str) {
        match self {
            Self::Copilot(c) => c.emit_log(level, event, message),
            Self::Claude(c) => c.emit_log(level, event, message),
        }
    }
}

pub struct AcpSessionInstance {
    pub connection: AnySessionConnection,
    /// Provider-internal session UUID
    pub acp_session_id: String,
    /// Our local DB session UUID (sessions.id)
    #[allow(dead_code)]
    pub arandu_session_id: String,
    pub last_activity: Arc<Mutex<Instant>>,
    pub provider: Provider,
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
    pub provider: Provider,
    pub binary: String,
    pub cwd: String,
    pub gh_token: Option<String>,
    pub model: Option<String>,
    pub skip_permissions: bool,
    pub max_budget_usd: Option<String>,
}


#[tauri::command]
pub async fn acp_connect(
    workspace_id: String,
    cwd: String,
    provider: Option<String>,
    binary_path: Option<String>,
    gh_token: Option<String>,
    model: Option<String>,
    skip_permissions: Option<bool>,
    max_budget_usd: Option<String>,
    app_handle: AppHandle,
    state: State<'_, AcpState>,
) -> Result<(), String> {
    let resolved_provider = match provider.as_deref() {
        Some("claude") => Provider::Claude,
        _ => Provider::Copilot,
    };

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

    let _ = app_handle.emit("acp:connection-status", &ConnectionStatusEvent {
        workspace_id: workspace_id.clone(),
        status: "connecting".to_string(),
        attempt: None,
    });

    let conn = match resolved_provider {
        Provider::Copilot => {
            let binary = binary_path
                .filter(|s| !s.trim().is_empty())
                .unwrap_or_else(|| std::env::var("COPILOT_PATH").unwrap_or_else(|_| "copilot".to_string()));

            let config = ConnectionConfig {
                provider: Provider::Copilot,
                binary: binary.clone(),
                cwd: cwd.clone(),
                gh_token: gh_token.clone(),
                model: None,
                skip_permissions: false,
                max_budget_usd: None,
            };

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
            AnyConnection::Copilot(conn)
        }

        Provider::Claude => {
            let binary = binary_path
                .filter(|s| !s.trim().is_empty())
                .unwrap_or_else(|| std::env::var("CLAUDE_PATH").unwrap_or_else(|_| "claude".to_string()));
            let skip = skip_permissions.unwrap_or(false);

            let config = ConnectionConfig {
                provider: Provider::Claude,
                binary: binary.clone(),
                cwd: cwd.clone(),
                gh_token: None,
                model: model.clone(),
                skip_permissions: skip,
                max_budget_usd: max_budget_usd.clone(),
            };

            let conn = ClaudeConnection::spawn(
                &binary,
                &cwd,
                model.as_deref(),
                skip,
                max_budget_usd.as_deref(),
                None,
                workspace_id.clone(),
                app_handle.clone(),
            )
            .await?;
            conn.emit_status("connected", None);
            conn.emit_log("info", "connect", &format!("Connected via {}", binary));

            state.configs.lock().await.insert(workspace_id.clone(), config);
            AnyConnection::Claude(conn)
        }
    };

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
    let conn = connections.get(&workspace_id).ok_or("Not connected")?;

    match conn {
        AnyConnection::Copilot(c) => {
            let params = NewSessionParams { cwd, mcp_servers: vec![] };
            let result = c
                .send_request("session/new", Some(serde_json::to_value(&params).map_err(|e| e.to_string())?))
                .await?;
            let info: SessionInfo = serde_json::from_value(result)
                .map_err(|e| format!("Failed to parse session info: {}", e))?;
            Ok(info)
        }
        AnyConnection::Claude(c) => {
            // Session ID was captured from system/init when the process started
            let sid = c.get_session_id().await.unwrap_or_default();
            Ok(SessionInfo { session_id: sid, modes: None, config_options: None })
        }
    }
}

#[tauri::command]
pub async fn acp_list_sessions(
    workspace_id: String,
    cwd: String,
    state: State<'_, AcpState>,
) -> Result<Vec<SessionSummary>, String> {
    let connections = state.connections.lock().await;
    let conn = connections.get(&workspace_id).ok_or("Not connected")?;

    match conn {
        AnyConnection::Copilot(c) => {
            let params = ListSessionsParams { cwd };
            let result = c
                .send_request("session/list", Some(serde_json::to_value(&params).map_err(|e| e.to_string())?))
                .await?;
            let sessions: Vec<SessionSummary> = if let Some(arr) = result.get("sessions") {
                serde_json::from_value(arr.clone()).unwrap_or_default()
            } else {
                serde_json::from_value(result).unwrap_or_default()
            };
            Ok(sessions)
        }
        AnyConnection::Claude(_) => {
            // Claude Code has no server-side session listing;
            // Arandu's local SQLite sessions are the source of truth.
            Ok(vec![])
        }
    }
}

#[tauri::command]
pub async fn acp_load_session(
    workspace_id: String,
    session_id: String,
    cwd: String,
    app_handle: AppHandle,
    state: State<'_, AcpState>,
) -> Result<SessionInfo, String> {
    // Check if this workspace is already on the requested session (Claude optimisation)
    {
        let connections = state.connections.lock().await;
        if let Some(AnyConnection::Claude(c)) = connections.get(&workspace_id) {
            if c.get_session_id().await.as_deref() == Some(&session_id) {
                return Ok(SessionInfo { session_id, modes: None, config_options: None });
            }
        }
    }

    let config = state.configs.lock().await.get(&workspace_id).cloned();

    match config.as_ref().map(|c| &c.provider) {
        Some(Provider::Claude) => {
            // For Claude: disconnect the current process and respawn with --resume
            let old = state.connections.lock().await.remove(&workspace_id);
            if let Some(old_conn) = old {
                old_conn.shutdown().await;
            }

            let cfg = config.unwrap();
            let _ = app_handle.emit("acp:connection-status", &ConnectionStatusEvent {
                workspace_id: workspace_id.clone(),
                status: "connecting".to_string(),
                attempt: None,
            });

            let conn = ClaudeConnection::spawn(
                &cfg.binary,
                &cwd,
                cfg.model.as_deref(),
                cfg.skip_permissions,
                cfg.max_budget_usd.as_deref(),
                Some(&session_id),
                workspace_id.clone(),
                app_handle.clone(),
            )
            .await?;
            conn.emit_status("connected", None);
            conn.emit_log("info", "load_session", &format!("Resumed session {}", session_id));

            // Update cwd in stored config
            state.configs.lock().await.entry(workspace_id.clone()).and_modify(|c| c.cwd = cwd);
            state.connections.lock().await.insert(workspace_id, AnyConnection::Claude(conn));

            Ok(SessionInfo { session_id, modes: None, config_options: None })
        }
        _ => {
            // Copilot: JSON-RPC session/load
            let connections = state.connections.lock().await;
            let conn = connections.get(&workspace_id).ok_or("Not connected")?;
            if let AnyConnection::Copilot(c) = conn {
                let params = LoadSessionParams { session_id: session_id.clone(), cwd, mcp_servers: vec![] };
                let result = c
                    .send_request("session/load", Some(serde_json::to_value(&params).map_err(|e| e.to_string())?))
                    .await?;
                let mut info: SessionInfo = serde_json::from_value(result)
                    .map_err(|e| format!("Failed to parse session info: {}", e))?;
                if info.session_id.is_empty() {
                    info.session_id = session_id;
                }
                Ok(info)
            } else {
                Err("Not connected".to_string())
            }
        }
    }
}

#[tauri::command]
pub async fn acp_send_prompt(
    workspace_id: String,
    session_id: String,
    text: String,
    state: State<'_, AcpState>,
) -> Result<(), String> {
    let connections = state.connections.lock().await;
    let conn = connections.get(&workspace_id).ok_or("Not connected")?;

    match conn {
        AnyConnection::Copilot(c) => {
            let params = PromptParams {
                session_id,
                prompt: vec![PromptContent { r#type: "text".to_string(), text }],
            };
            c.send_request_with_timeout(
                "session/prompt",
                Some(serde_json::to_value(&params).map_err(|e| e.to_string())?),
                std::time::Duration::from_secs(600),
            )
            .await?;
        }
        AnyConnection::Claude(c) => {
            c.send_prompt(&text, std::time::Duration::from_secs(600)).await?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn acp_set_mode(
    workspace_id: String,
    session_id: String,
    mode: String,
    app_handle: AppHandle,
    state: State<'_, AcpState>,
) -> Result<(), String> {
    let config = state.configs.lock().await.get(&workspace_id).cloned();

    match config.as_ref().map(|c| &c.provider) {
        Some(Provider::Claude) => {
            // Claude: --agent is a startup flag, so we must respawn with --resume + --agent
            let old = state.connections.lock().await.remove(&workspace_id);
            if let Some(old_conn) = old {
                old_conn.shutdown().await;
            }

            let cfg = config.unwrap();
            let _ = app_handle.emit("acp:connection-status", &ConnectionStatusEvent {
                workspace_id: workspace_id.clone(),
                status: "connecting".to_string(),
                attempt: None,
            });

            // ClaudeConnection::spawn handles all standard flags;
            // --agent is not yet supported via spawn args but the session is resumed via --resume.
            let conn = ClaudeConnection::spawn(
                &cfg.binary,
                &cfg.cwd,
                cfg.model.as_deref(),
                cfg.skip_permissions,
                cfg.max_budget_usd.as_deref(),
                if session_id.is_empty() { None } else { Some(&session_id) },
                workspace_id.clone(),
                app_handle.clone(),
            )
            .await?;
            conn.emit_status("connected", None);
            conn.emit_log("info", "set_mode", &format!("Mode changed to '{}' (new session process, history preserved via --resume)", mode));

            state.connections.lock().await.insert(workspace_id, AnyConnection::Claude(conn));
            Ok(())
        }
        _ => {
            let connections = state.connections.lock().await;
            let conn = connections.get(&workspace_id).ok_or("Not connected")?;
            if let AnyConnection::Copilot(c) = conn {
                let params = SetSessionModeParams { session_id, mode_id: mode };
                c.send_request(
                    "session/set_mode",
                    Some(serde_json::to_value(&params).map_err(|e| e.to_string())?),
                )
                .await?;
            }
            Ok(())
        }
    }
}

#[tauri::command]
pub async fn acp_cancel(
    workspace_id: String,
    session_id: String,
    state: State<'_, AcpState>,
) -> Result<(), String> {
    let connections = state.connections.lock().await;
    let conn = connections.get(&workspace_id).ok_or("Not connected")?;

    match conn {
        AnyConnection::Copilot(c) => {
            let params = CancelParams { session_id };
            c.send_notification(
                "session/cancel",
                Some(serde_json::to_value(&params).map_err(|e| e.to_string())?),
            )
            .await?;
        }
        AnyConnection::Claude(_c) => {
            // For Claude, cancellation is done by the frontend dropping the prompt call;
            // the process continues to run for the next turn.
            // A hard cancel could kill and respawn, but we keep it a no-op here.
        }
    }
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

/// Spawn a provider process for the given session, initialize the connection
/// and create (or load) a provider session.
/// Supports both Copilot (JSON-RPC) and Claude (NDJSON stream).
#[tauri::command]
pub async fn acp_session_connect(
    session_id: String,
    workspace_path: String,
    provider: Option<String>,
    binary_path: Option<String>,
    gh_token: Option<String>,
    model: Option<String>,
    skip_permissions: Option<bool>,
    max_budget_usd: Option<String>,
    acp_session_id: Option<String>,
    app_handle: AppHandle,
    store: State<'_, AcpSessionStore>,
) -> Result<String, String> {
    let resolved_provider = match provider.as_deref() {
        Some("claude") => Provider::Claude,
        _ => Provider::Copilot,
    };
    eprintln!("[acp] acp_session_connect: session={} workspace={} provider={:?}", session_id, workspace_path, resolved_provider);

    // Return early if already alive
    {
        let check = {
            let instances = store.instances.lock().await;
            instances.get(&session_id).map(|inst| inst.acp_session_id.clone())
        };
        if let Some(acp_id) = check {
            let alive = {
                let instances = store.instances.lock().await;
                if let Some(inst) = instances.get(&session_id) {
                    inst.connection.is_alive().await
                } else { false }
            };
            if alive {
                eprintln!("[acp] session={} already connected, returning existing acp_id={}", session_id, acp_id);
                return Ok(acp_id);
            }
        }
    }

    emit_session_status(&app_handle, &session_id, "connecting");

    // Enforce cap: evict oldest if at limit
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

    let (any_conn, provider_session_id) = match resolved_provider {
        Provider::Copilot => {
            let binary = binary_path.clone()
                .filter(|s| !s.trim().is_empty())
                .unwrap_or_else(|| std::env::var("COPILOT_PATH").unwrap_or_else(|_| "copilot".to_string()));

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

            let info: SessionInfo = if let Some(ref existing_id) = acp_session_id {
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

            let sid = info.session_id.clone();
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
                    session_id: sid.clone(),
                    update_type: "session_info_update".to_string(),
                    payload,
                });
            }

            (AnySessionConnection::Copilot(Arc::new(conn)), sid)
        }
        Provider::Claude => {
            let binary = binary_path.clone()
                .filter(|s| !s.trim().is_empty())
                .unwrap_or_else(|| std::env::var("CLAUDE_PATH").unwrap_or_else(|_| "claude".to_string()));

            let conn = ClaudeConnection::spawn(
                &binary,
                &workspace_path,
                model.as_deref(),
                skip_permissions.unwrap_or(false),
                max_budget_usd.as_deref(),
                acp_session_id.as_deref(),
                session_id.clone(),
                app_handle.clone(),
            )
            .await?;

            // Wait briefly for session ID from system/init event
            let mut sid = String::new();
            for _ in 0..20 {
                if let Some(s) = conn.get_session_id().await {
                    sid = s;
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_millis(250)).await;
            }
            if sid.is_empty() {
                sid = acp_session_id.clone().unwrap_or_else(|| format!("claude-{}", session_id));
            }

            conn.emit_status("connected", None);
            conn.emit_log("info", "connect", &format!("Claude session connected via {}", binary));

            (AnySessionConnection::Claude(Arc::new(conn)), sid)
        }
    };

    eprintln!("[acp] session={} connected — provider_session_id={}", session_id, provider_session_id);

    let instance = AcpSessionInstance {
        connection: any_conn,
        acp_session_id: provider_session_id.clone(),
        arandu_session_id: session_id.clone(),
        last_activity: Arc::new(Mutex::new(Instant::now())),
        provider: resolved_provider.clone(),
    };

    store.instances.lock().await.insert(session_id.clone(), instance);
    store.configs.lock().await.insert(session_id, SessionConnectionConfig {
        provider: resolved_provider,
        binary: binary_path.unwrap_or_default(),
        cwd: workspace_path,
        gh_token,
        model,
        skip_permissions: skip_permissions.unwrap_or(false),
        max_budget_usd,
    });

    Ok(provider_session_id)
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
    let alive = {
        let instances = store.instances.lock().await;
        if let Some(inst) = instances.get(&session_id) {
            Some(inst.connection.is_alive().await)
        } else { None }
    };
    if let Some(true) = alive {
        return Ok("connected".to_string());
    }
    if alive.is_some() {
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
pub async fn acp_session_send_prompt(
    session_id: String,
    text: String,
    app_handle: AppHandle,
    store: State<'_, AcpSessionStore>,
) -> Result<(), String> {
    eprintln!("[acp] acp_session_send_prompt: session={} text={:.60}", session_id, text);

    let (provider, acp_id) = {
        let instances = store.instances.lock().await;
        let inst = instances.get(&session_id).ok_or("Session not connected")?;
        *inst.last_activity.lock().await = Instant::now();
        (inst.provider.clone(), inst.acp_session_id.clone())
    };

    emit_session_status(&app_handle, &session_id, "streaming");

    let timeout = std::time::Duration::from_secs(600);

    match provider {
        Provider::Copilot => {
            let conn = {
                let instances = store.instances.lock().await;
                let inst = instances.get(&session_id).ok_or("Session not connected")?;
                match &inst.connection {
                    AnySessionConnection::Copilot(c) => Arc::clone(c),
                    _ => return Err("Provider mismatch".to_string()),
                }
            };
            let result = conn.send_prompt(acp_id, text, timeout).await?;
            eprintln!("[acp] session={} prompt result: {}", session_id, serde_json::to_string(&result).unwrap_or_default().chars().take(500).collect::<String>());
        }
        Provider::Claude => {
            let conn = {
                let instances = store.instances.lock().await;
                let inst = instances.get(&session_id).ok_or("Session not connected")?;
                match &inst.connection {
                    AnySessionConnection::Claude(c) => Arc::clone(c),
                    _ => return Err("Provider mismatch".to_string()),
                }
            };
            conn.send_prompt(&text, timeout).await?;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn acp_session_set_mode(
    session_id: String,
    mode: String,
    store: State<'_, AcpSessionStore>,
) -> Result<(), String> {
    let (provider, acp_id) = {
        let instances = store.instances.lock().await;
        let inst = instances.get(&session_id).ok_or("Session not connected")?;
        (inst.provider.clone(), inst.acp_session_id.clone())
    };
    match provider {
        Provider::Copilot => {
            let conn = {
                let instances = store.instances.lock().await;
                let inst = instances.get(&session_id).ok_or("Session not connected")?;
                match &inst.connection {
                    AnySessionConnection::Copilot(c) => Arc::clone(c),
                    _ => return Err("Provider mismatch".to_string()),
                }
            };
            let params = SetSessionModeParams { session_id: acp_id, mode_id: mode };
            conn.send_request("session/set_mode", Some(serde_json::to_value(&params).map_err(|e| e.to_string())?))
                .await?;
        }
        Provider::Claude => {
            eprintln!("[acp] set_mode is a no-op for Claude provider");
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn acp_session_set_config_option(
    session_id: String,
    config_id: String,
    option_id: String,
    store: State<'_, AcpSessionStore>,
) -> Result<(), String> {
    let provider = {
        let instances = store.instances.lock().await;
        let inst = instances.get(&session_id).ok_or("Session not connected")?;
        inst.provider.clone()
    };
    match provider {
        Provider::Copilot => {
            let (conn, acp_id) = {
                let instances = store.instances.lock().await;
                let inst = instances.get(&session_id).ok_or("Session not connected")?;
                match &inst.connection {
                    AnySessionConnection::Copilot(c) => (Arc::clone(c), inst.acp_session_id.clone()),
                    _ => return Err("Provider mismatch".to_string()),
                }
            };
            let params = SetConfigOptionParams { session_id: acp_id, config_id, value: option_id };
            conn.send_request("session/set_config_option", Some(serde_json::to_value(&params).map_err(|e| e.to_string())?))
                .await?;
        }
        Provider::Claude => {
            eprintln!("[acp] set_config_option is a no-op for Claude provider");
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn acp_session_cancel(
    session_id: String,
    store: State<'_, AcpSessionStore>,
) -> Result<(), String> {
    let provider = {
        let instances = store.instances.lock().await;
        let inst = instances.get(&session_id).ok_or("Session not connected")?;
        inst.provider.clone()
    };
    match provider {
        Provider::Copilot => {
            let (conn, acp_id) = {
                let instances = store.instances.lock().await;
                let inst = instances.get(&session_id).ok_or("Session not connected")?;
                match &inst.connection {
                    AnySessionConnection::Copilot(c) => (Arc::clone(c), inst.acp_session_id.clone()),
                    _ => return Err("Provider mismatch".to_string()),
                }
            };
            let params = CancelParams { session_id: acp_id };
            conn.send_notification("session/cancel", Some(serde_json::to_value(&params).map_err(|e| e.to_string())?))
                .await?;
        }
        Provider::Claude => {
            eprintln!("[acp] cancel is a no-op for Claude provider");
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn acp_session_list_active(
    store: State<'_, AcpSessionStore>,
) -> Result<Vec<String>, String> {
    let ids: Vec<String> = {
        let instances = store.instances.lock().await;
        instances.keys().cloned().collect()
    };
    let mut active = Vec::new();
    for id in ids {
        let alive = {
            let instances = store.instances.lock().await;
            if let Some(inst) = instances.get(&id) {
                inst.connection.is_alive().await
            } else { false }
        };
        if alive {
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
    let alive = {
        let instances = store.instances.lock().await;
        if let Some(inst) = instances.get(&session_id) {
            Some(inst.connection.is_alive().await)
        } else { None }
    };
    if let Some(true) = alive {
        emit_session_status(&app_handle, &session_id, "connected");
        return Ok("connected".to_string());
    }
    if alive.is_some() {
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
    let provider = {
        let instances = store.instances.lock().await;
        let inst = instances.get(&session_id).ok_or("Session not connected")?;
        inst.provider.clone()
    };

    if provider == Provider::Claude {
        eprintln!("[acp] refresh_info is a no-op for Claude provider");
        return Ok(());
    }

    let (conn, acp_id) = {
        let instances = store.instances.lock().await;
        let inst = instances.get(&session_id).ok_or("Session not connected")?;
        match &inst.connection {
            AnySessionConnection::Copilot(c) => (Arc::clone(c), inst.acp_session_id.clone()),
            _ => return Err("Provider mismatch".to_string()),
        }
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

