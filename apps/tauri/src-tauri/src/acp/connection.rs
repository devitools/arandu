use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, oneshot, Mutex};
use tauri::{AppHandle, Emitter};

use super::types::*;

type PendingMap = Arc<Mutex<HashMap<u64, oneshot::Sender<Result<serde_json::Value, JsonRpcError>>>>>;

pub struct AcpConnection {
    child: Mutex<Option<Child>>,
    writer_tx: mpsc::Sender<String>,
    pending: PendingMap,
    next_id: AtomicU64,
    reader_handle: Mutex<Option<tokio::task::JoinHandle<()>>>,
    writer_handle: Mutex<Option<tokio::task::JoinHandle<()>>>,
}

impl AcpConnection {
    pub async fn spawn(
        binary: &str,
        args: &[&str],
        cwd: &str,
        workspace_id: String,
        app_handle: AppHandle,
    ) -> Result<Self, String> {
        let mut child = Command::new(binary)
            .args(args)
            .current_dir(cwd)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::inherit())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| format!("Failed to spawn {}: {}", binary, e))?;

        let stdin = child.stdin.take().ok_or("Failed to capture stdin")?;
        let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;

        let pending: PendingMap = Arc::new(Mutex::new(HashMap::new()));
        let (writer_tx, writer_rx) = mpsc::channel::<String>(64);

        let writer_handle = tokio::spawn(Self::writer_task(stdin, writer_rx));
        let reader_handle = tokio::spawn(Self::reader_task(
            stdout,
            pending.clone(),
            writer_tx.clone(),
            workspace_id,
            app_handle,
        ));

        Ok(Self {
            child: Mutex::new(Some(child)),
            writer_tx,
            pending,
            next_id: AtomicU64::new(1),
            reader_handle: Mutex::new(Some(reader_handle)),
            writer_handle: Mutex::new(Some(writer_handle)),
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
    ) {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();

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
    }

    fn handle_session_update(
        params: &serde_json::Value,
        workspace_id: &str,
        app_handle: &AppHandle,
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

        let result = tokio::time::timeout(std::time::Duration::from_secs(30), rx)
            .await
            .map_err(|_| format!("Timeout waiting for response to {}", method))?
            .map_err(|_| "Response channel dropped".to_string())?;

        result.map_err(|e| e.to_string())
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
}
