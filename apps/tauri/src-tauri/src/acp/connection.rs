use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, oneshot, Mutex};
use tauri::{AppHandle, Emitter, Manager};

use super::types::*;
use crate::messages::MessageRecord;

type PendingMap = Arc<Mutex<HashMap<u64, oneshot::Sender<Result<serde_json::Value, JsonRpcError>>>>>;
type ChildRef = Arc<Mutex<Option<Child>>>;

fn save_to_db(
    saved: &mut Vec<MessageRecord>,
    workspace_id: &str,
    app_handle: &AppHandle,
    role: &str,
    content: &str,
    message_type: Option<&str>,
    tool_call_id: Option<&str>,
    tool_title: Option<&str>,
    tool_status: Option<&str>,
) {
    if let Some(db) = app_handle.try_state::<crate::comments::CommentsDb>() {
        if let Ok(conn) = db.0.lock() {
            match crate::messages::save_message(
                &conn, workspace_id, role, content,
                message_type, tool_call_id, tool_title, tool_status,
            ) {
                Ok(record) => {
                    eprintln!("[acp] save_to_db: id={} type={:?} len={}", record.id, record.message_type, content.len());
                    saved.push(record);
                }
                Err(e) => eprintln!("[acp] save_to_db error: {}", e),
            }
        }
    }
}

fn flush_buffer(
    streaming_buffer: &mut Option<String>,
    streaming_type: &mut Option<String>,
    saved: &mut Vec<MessageRecord>,
    workspace_id: &str,
    app_handle: &AppHandle,
) {
    let content = match streaming_buffer.take() {
        Some(c) if !c.is_empty() => c,
        _ => {
            *streaming_type = None;
            return;
        }
    };
    let msg_type = streaming_type.take();
    save_to_db(
        saved, workspace_id, app_handle,
        "assistant", &content,
        msg_type.as_deref(), None, None, None,
    );
}

pub struct AcpConnection {
    child: ChildRef,
    writer_tx: mpsc::Sender<String>,
    pending: PendingMap,
    next_id: Arc<AtomicU64>,
    reader_handle: Mutex<Option<tokio::task::JoinHandle<()>>>,
    writer_handle: Mutex<Option<tokio::task::JoinHandle<()>>>,
    heartbeat_handle: Mutex<Option<tokio::task::JoinHandle<()>>>,
    app_handle: AppHandle,
    workspace_id: String,
    suppress_updates: Arc<AtomicBool>,
}

impl AcpConnection {
    pub async fn spawn(
        binary: &str,
        args: &[&str],
        cwd: &str,
        gh_token: Option<String>,
        workspace_id: String,
        app_handle: AppHandle,
    ) -> Result<Self, String> {
        let mut cmd = Command::new(binary);
        cmd.args(args)
            .current_dir(cwd)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::inherit())
            .kill_on_drop(true);

        if let Some(token) = gh_token.filter(|s| !s.trim().is_empty()) {
            cmd.env("GH_TOKEN", token.trim());
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn {}: {}", binary, e))?;

        eprintln!("[acp] Spawned {} pid={:?} cwd={} workspace={}", binary, child.id(), cwd, workspace_id);
        let stdin = child.stdin.take().ok_or("Failed to capture stdin")?;
        let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;

        let pending: PendingMap = Arc::new(Mutex::new(HashMap::new()));
        let suppress_updates = Arc::new(AtomicBool::new(false));
        let (writer_tx, writer_rx) = mpsc::channel::<String>(64);

        let writer_handle = tokio::spawn(Self::writer_task(stdin, writer_rx));
        let reader_handle = tokio::spawn(Self::reader_task(
            stdout,
            pending.clone(),
            writer_tx.clone(),
            workspace_id.clone(),
            app_handle.clone(),
            suppress_updates.clone(),
        ));

        let child_arc: ChildRef = Arc::new(Mutex::new(Some(child)));
        let next_id = Arc::new(AtomicU64::new(1));
        let heartbeat_handle = tokio::spawn(Self::heartbeat_task(
            child_arc.clone(),
            writer_tx.clone(),
            pending.clone(),
            next_id.clone(),
            workspace_id.clone(),
            app_handle.clone(),
        ));

        Ok(Self {
            child: child_arc,
            writer_tx,
            pending,
            next_id,
            reader_handle: Mutex::new(Some(reader_handle)),
            writer_handle: Mutex::new(Some(writer_handle)),
            heartbeat_handle: Mutex::new(Some(heartbeat_handle)),
            app_handle,
            workspace_id,
            suppress_updates,
        })
    }

    async fn writer_task(
        mut stdin: tokio::process::ChildStdin,
        mut rx: mpsc::Receiver<String>,
    ) {
        while let Some(line) = rx.recv().await {
            if stdin.write_all(line.as_bytes()).await.is_err() {
                break;
            }
            if stdin.flush().await.is_err() {
                break;
            }
        }
    }

    async fn reader_task(
        stdout: tokio::process::ChildStdout,
        pending: PendingMap,
        writer_tx: mpsc::Sender<String>,
        workspace_id: String,
        app_handle: AppHandle,
        suppress_updates: Arc<AtomicBool>,
    ) {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        let mut streaming_buffer: Option<String> = None;
        let mut streaming_type: Option<String> = None;
        let mut saved_this_turn: Vec<MessageRecord> = Vec::new();

        while let Ok(Some(line)) = lines.next_line().await {
            if line.trim().is_empty() {
                continue;
            }

            let msg: JsonRpcResponse = match serde_json::from_str(&line) {
                Ok(m) => m,
                Err(e) => {
                    eprintln!("[acp] Failed to parse JSON-RPC: {} — line: {}", e, &line[..line.len().min(200)]);
                    continue;
                }
            };

            if let Some(id) = msg.id {
                if msg.result.is_some() || msg.error.is_some() {
                    let mut pending_guard = pending.lock().await;
                    if let Some(tx) = pending_guard.remove(&id) {
                        let result = if let Some(err) = msg.error {
                            Err(err)
                        } else {
                            Ok(msg.result.unwrap_or(serde_json::Value::Null))
                        };
                        let _ = tx.send(result);
                    }
                    continue;
                }
            }

            if let Some(method) = &msg.method {
                match method.as_str() {
                    "session/update" => {
                        if let Some(params) = &msg.params {
                            Self::handle_session_update(
                                params,
                                &workspace_id,
                                &app_handle,
                                &mut streaming_buffer,
                                &mut streaming_type,
                                &mut saved_this_turn,
                                &suppress_updates,
                            );
                        }
                    }
                    "session/request_permission" => {
                        if let Some(id) = msg.id {
                            let response = serde_json::json!({
                                "jsonrpc": "2.0",
                                "id": id,
                                "result": {
                                    "outcome": {
                                        "outcome": "selected",
                                        "optionId": "allow_always"
                                    }
                                }
                            });
                            let line = serde_json::to_string(&response).unwrap() + "\n";
                            let _ = writer_tx.send(line).await;
                        }
                    }
                    _ => {
                        eprintln!("[acp] Unknown method: {}", method);
                    }
                }
            }
        }
        eprintln!("[acp] Reader task ended for workspace {}", workspace_id);
        emit_log_raw(&app_handle, &workspace_id, "warn", "reader_exit", "Reader task ended — stdout closed");
        let event = ConnectionStatusEvent {
            workspace_id: workspace_id.clone(),
            status: "disconnected".to_string(),
            attempt: None,
        };
        let _ = app_handle.emit("acp:connection-status", &event);
    }

    async fn heartbeat_task(
        child: ChildRef,
        writer_tx: mpsc::Sender<String>,
        pending: PendingMap,
        next_id: Arc<AtomicU64>,
        workspace_id: String,
        app_handle: AppHandle,
    ) {
        // Ping at most every 60s; only send ping if no recent activity (>45s idle)
        let check_interval = std::time::Duration::from_secs(60);
        let idle_threshold = std::time::Duration::from_secs(45);
        let ping_timeout = std::time::Duration::from_secs(10);
        let mut consecutive_failures: u32 = 0;
        let mut last_activity = std::time::Instant::now();

        loop {
            tokio::time::sleep(check_interval).await;

            {
                let mut guard = child.lock().await;
                if let Some(ref mut c) = *guard {
                    match c.try_wait() {
                        Ok(Some(status)) => {
                            eprintln!("[acp] Heartbeat: process exited (status: {:?}) for workspace {}", status, workspace_id);
                            *guard = None;
                            drop(guard);
                            emit_log_raw(&app_handle, &workspace_id, "error", "process_exit", &format!("Process exited with status: {:?}", status));
                            let event = ConnectionStatusEvent {
                                workspace_id,
                                status: "disconnected".to_string(),
                                attempt: None,
                            };
                            let _ = app_handle.emit("acp:connection-status", &event);
                            return;
                        }
                        Ok(None) => {}
                        Err(e) => {
                            eprintln!("[acp] Heartbeat: try_wait error for workspace {}: {}", workspace_id, e);
                        }
                    }
                } else {
                    return;
                }
            }

            // Skip ping if there was recent activity
            if last_activity.elapsed() < idle_threshold {
                consecutive_failures = 0;
                continue;
            }

            let id = next_id.fetch_add(1, Ordering::SeqCst);
            let request = JsonRpcRequest::new(id, "ping", None);
            let line = match serde_json::to_string(&request) {
                Ok(l) => l + "\n",
                Err(_) => continue,
            };

            let (tx, rx) = oneshot::channel();
            pending.lock().await.insert(id, tx);

            let start = std::time::Instant::now();
            if writer_tx.send(line).await.is_err() {
                consecutive_failures += 1;
                eprintln!("[acp] Heartbeat: writer channel closed for workspace {}", workspace_id);
                pending.lock().await.remove(&id);
                if consecutive_failures >= 3 {
                    let event = ConnectionStatusEvent {
                        workspace_id,
                        status: "disconnected".to_string(),
                        attempt: None,
                    };
                    let _ = app_handle.emit("acp:connection-status", &event);
                    return;
                }
                continue;
            }

            let timestamp = chrono::Utc::now().to_rfc3339();
            match tokio::time::timeout(ping_timeout, rx).await {
                Ok(_) => {
                    let latency = start.elapsed().as_millis() as u64;
                    consecutive_failures = 0;
                    last_activity = std::time::Instant::now();
                    eprintln!("[acp] Heartbeat OK: workspace={} latency={}ms", workspace_id, latency);
                    let event = HeartbeatEvent {
                        workspace_id: workspace_id.clone(),
                        status: "healthy".to_string(),
                        latency_ms: Some(latency),
                        timestamp,
                    };
                    let _ = app_handle.emit("acp:heartbeat", &event);
                }
                Err(_) => {
                    consecutive_failures += 1;
                    pending.lock().await.remove(&id);
                    let event = HeartbeatEvent {
                        workspace_id: workspace_id.clone(),
                        status: "degraded".to_string(),
                        latency_ms: None,
                        timestamp: timestamp.clone(),
                    };
                    let _ = app_handle.emit("acp:heartbeat", &event);
                    emit_log_raw(&app_handle, &workspace_id, "warn", "ping_timeout", &format!("Ping timeout ({}/3)", consecutive_failures));
                    if consecutive_failures >= 3 {
                        emit_log_raw(&app_handle, &workspace_id, "error", "disconnect", "Disconnected after 3 consecutive ping timeouts");
                        let event = ConnectionStatusEvent {
                            workspace_id,
                            status: "disconnected".to_string(),
                            attempt: None,
                        };
                        let _ = app_handle.emit("acp:connection-status", &event);
                        return;
                    }
                }
            }
        }
    }

    fn handle_session_update(
        params: &serde_json::Value,
        workspace_id: &str,
        app_handle: &AppHandle,
        streaming_buffer: &mut Option<String>,
        streaming_type: &mut Option<String>,
        saved_this_turn: &mut Vec<MessageRecord>,
        suppress_updates: &Arc<AtomicBool>,
    ) {
        let update_type = params
            .get("update")
            .and_then(|u| u.get("sessionUpdate"))
            .and_then(|s| s.as_str())
            .unwrap_or("unknown");

        let session_id = params
            .get("sessionId")
            .and_then(|s| s.as_str())
            .unwrap_or("")
            .to_string();

        let payload = params
            .get("update")
            .cloned()
            .unwrap_or(serde_json::Value::Null);

        let suppressed = suppress_updates.load(Ordering::Acquire);
        eprintln!("[acp] session_update: workspace={} type={} suppressed={} saved={}", workspace_id, update_type, suppressed, saved_this_turn.len());

        if suppressed {
            if update_type == "end_turn" {
                streaming_buffer.take();
                *streaming_type = None;
                saved_this_turn.clear();
                eprintln!("[acp] end_turn: session={} suppressed (replay drain)", workspace_id);
            }
            return;
        }

        match update_type {
            "agent_message_chunk" => {
                if let Some(text) = payload
                    .get("content")
                    .and_then(|c| if c.get("type").and_then(|t| t.as_str()) == Some("text") { c.get("text").and_then(|t| t.as_str()) } else { None })
                {
                    if *streaming_type == Some("thinking".to_string()) {
                        flush_buffer(streaming_buffer, streaming_type, saved_this_turn, workspace_id, app_handle);
                    }
                    let buf = streaming_buffer.get_or_insert_with(String::new);
                    buf.push_str(text);
                    *streaming_type = Some("assistant".to_string());
                }
            }
            "agent_thought_chunk" => {
                if let Some(text) = payload
                    .get("content")
                    .and_then(|c| if c.get("type").and_then(|t| t.as_str()) == Some("text") { c.get("text").and_then(|t| t.as_str()) } else { None })
                {
                    if *streaming_type == Some("assistant".to_string()) {
                        flush_buffer(streaming_buffer, streaming_type, saved_this_turn, workspace_id, app_handle);
                    }
                    let buf = streaming_buffer.get_or_insert_with(String::new);
                    buf.push_str(text);
                    *streaming_type = Some("thinking".to_string());
                }
            }
            "tool_call" => {
                flush_buffer(streaming_buffer, streaming_type, saved_this_turn, workspace_id, app_handle);
                let title = payload.get("title").and_then(|v| v.as_str()).unwrap_or("Tool call");
                let tool_call_id = payload.get("toolCallId").and_then(|v| v.as_str());
                let status = payload.get("status").and_then(|v| v.as_str()).unwrap_or("pending");
                save_to_db(
                    saved_this_turn, workspace_id, app_handle,
                    "assistant", "",
                    Some("tool"), tool_call_id, Some(title), Some(status),
                );
            }
            "tool_call_update" => {
                let tool_call_id = payload.get("toolCallId").and_then(|v| v.as_str());
                let status = payload.get("status").and_then(|v| v.as_str());
                if let (Some(tcid), Some(st)) = (tool_call_id, status) {
                    let mut new_content: Option<String> = None;
                    if st == "completed" {
                        if let Some(summary) = payload.get("rawOutput")
                            .and_then(|o| o.get("content"))
                            .and_then(|c| c.as_str())
                        {
                            new_content = Some(summary.to_string());
                        }
                    }
                    if let Some(db) = app_handle.try_state::<crate::comments::CommentsDb>() {
                        if let Ok(conn) = db.0.lock() {
                            match crate::messages::update_message_by_tool_call_id(
                                &conn, workspace_id, tcid,
                                new_content.as_deref(), st,
                            ) {
                                Ok(updated) => {
                                    if let Some(record) = saved_this_turn.iter_mut().rev()
                                        .find(|r| r.tool_call_id.as_deref() == Some(tcid))
                                    {
                                        *record = updated;
                                    }
                                }
                                Err(e) => eprintln!("[acp] tool_call_update: update error: {}", e),
                            }
                        }
                    }
                }
            }
            "end_turn" => {
                flush_buffer(streaming_buffer, streaming_type, saved_this_turn, workspace_id, app_handle);
                let to_emit = std::mem::take(saved_this_turn);
                if !to_emit.is_empty() {
                    eprintln!("[acp] end_turn: session={} emitting {} saved messages", workspace_id, to_emit.len());
                    let _ = app_handle.emit("acp:assistant-message-saved", serde_json::json!({
                        "sessionId": workspace_id,
                        "messages": to_emit,
                    }));
                }
            }
            _ => {
                if update_type == "unknown" {
                    eprintln!("[acp] unknown update_type — raw params: {}", serde_json::to_string(params).unwrap_or_default().chars().take(500).collect::<String>());
                }
            }
        }

        let event = SessionUpdateEvent {
            workspace_id: workspace_id.to_string(),
            session_id,
            update_type: update_type.to_string(),
            payload,
        };

        let _ = app_handle.emit("acp:session-update", &event);
    }

    pub async fn send_request(
        &self,
        method: &str,
        params: Option<serde_json::Value>,
    ) -> Result<serde_json::Value, String> {
        self.send_request_with_timeout(method, params, std::time::Duration::from_secs(30)).await
    }

    pub async fn send_request_with_timeout(
        &self,
        method: &str,
        params: Option<serde_json::Value>,
        timeout: std::time::Duration,
    ) -> Result<serde_json::Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let request = JsonRpcRequest::new(id, method, params);
        let line = serde_json::to_string(&request).map_err(|e| e.to_string())? + "\n";

        let (tx, rx) = oneshot::channel();
        {
            let mut pending_guard = self.pending.lock().await;
            pending_guard.insert(id, tx);
        }

        self.writer_tx
            .send(line)
            .await
            .map_err(|_| "Writer channel closed".to_string())?;

        let result = tokio::time::timeout(timeout, rx)
            .await
            .map_err(|_| format!("Timeout waiting for response to {}", method))?
            .map_err(|_| "Response channel dropped".to_string())?;

        result.map_err(|e| e.to_string())
    }

    /// Send a session/prompt request and persist the user message to SQLite.
    /// Centralizes user-message persistence so it happens exactly once per send,
    /// regardless of how many times the frontend invokes the command.
    pub fn set_suppress_updates(&self, suppress: bool) {
        self.suppress_updates.store(suppress, Ordering::Release);
        eprintln!("[acp] suppress_updates={} workspace={}", suppress, self.workspace_id);
    }

    pub async fn send_prompt(
        &self,
        acp_session_id: String,
        text: String,
        timeout: std::time::Duration,
    ) -> Result<serde_json::Value, String> {
        let was_suppressed = self.suppress_updates.swap(false, Ordering::AcqRel);
        eprintln!("[acp] send_prompt: workspace={} was_suppressed={} text_len={}", self.workspace_id, was_suppressed, text.len());
        if let Some(db) = self.app_handle.try_state::<crate::comments::CommentsDb>() {
            match db.0.lock() {
                Ok(conn) => {
                    if crate::messages::is_duplicate_user_message(&conn, &self.workspace_id, &text) {
                        eprintln!("[acp] send_prompt: skipping duplicate user message");
                    } else {
                        match crate::messages::save_message(
                            &conn,
                            &self.workspace_id,
                            "user",
                            &text,
                            None,
                            None,
                            None,
                            None,
                        ) {
                            Ok(record) => {
                                eprintln!("[acp] send_prompt: saved user message id={}", record.id);
                                let _ = self.app_handle.emit("acp:user-message-saved", serde_json::json!({
                                    "sessionId": &self.workspace_id,
                                    "id": record.id,
                                    "content": &text,
                                }));
                            }
                            Err(e) => eprintln!("[acp] send_prompt: save_message FAILED: {}", e),
                        }
                    }
                },
                Err(e) => eprintln!("[acp] send_prompt: db lock FAILED: {}", e),
            }
        } else {
            eprintln!("[acp] send_prompt: CommentsDb state NOT FOUND");
        }

        let params = crate::acp::types::PromptParams {
            session_id: acp_session_id,
            prompt: vec![crate::acp::types::PromptContent {
                r#type: "text".to_string(),
                text,
            }],
        };
        self.send_request_with_timeout(
            "session/prompt",
            Some(serde_json::to_value(&params).map_err(|e| e.to_string())?),
            timeout,
        )
        .await
    }

    pub async fn send_notification(
        &self,
        method: &str,
        params: Option<serde_json::Value>,
    ) -> Result<(), String> {
        let msg = serde_json::json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params.unwrap_or(serde_json::Value::Null),
        });
        let line = serde_json::to_string(&msg).map_err(|e| e.to_string())? + "\n";
        self.writer_tx
            .send(line)
            .await
            .map_err(|_| "Writer channel closed".to_string())
    }

    pub async fn shutdown(&self) {
        let mut child_guard = self.child.lock().await;
        if let Some(mut child) = child_guard.take() {
            let _ = child.kill().await;
        }
        drop(child_guard);

        let mut heartbeat = self.heartbeat_handle.lock().await;
        if let Some(handle) = heartbeat.take() {
            handle.abort();
        }

        let mut reader = self.reader_handle.lock().await;
        if let Some(handle) = reader.take() {
            handle.abort();
        }

        let mut writer = self.writer_handle.lock().await;
        if let Some(handle) = writer.take() {
            handle.abort();
        }

        self.pending.lock().await.clear();
    }

    /// Returns true if the child process is still running.
    pub async fn is_alive(&self) -> bool {
        let mut guard = self.child.lock().await;
        if let Some(ref mut c) = *guard {
            matches!(c.try_wait(), Ok(None))
        } else {
            false
        }
    }

    /// Emits a connection-status event to the frontend.
    pub fn emit_status(&self, status: &str, attempt: Option<u32>) {
        let event = ConnectionStatusEvent {
            workspace_id: self.workspace_id.clone(),
            status: status.to_string(),
            attempt,
        };
        let _ = self.app_handle.emit("acp:connection-status", &event);
    }

    pub fn emit_log(&self, level: &str, event: &str, message: &str) {
        let entry = ConnectionLogEntry {
            timestamp: chrono::Utc::now().to_rfc3339(),
            level: level.to_string(),
            event: event.to_string(),
            message: message.to_string(),
            workspace_id: self.workspace_id.clone(),
        };
        let _ = self.app_handle.emit("acp:log", &entry);
    }
}

pub fn emit_log_raw(app_handle: &AppHandle, workspace_id: &str, level: &str, event: &str, message: &str) {
    let entry = ConnectionLogEntry {
        timestamp: chrono::Utc::now().to_rfc3339(),
        level: level.to_string(),
        event: event.to_string(),
        message: message.to_string(),
        workspace_id: workspace_id.to_string(),
    };
    let _ = app_handle.emit("acp:log", &entry);
}
