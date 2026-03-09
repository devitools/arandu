use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: &'static str,
    pub id: u64,
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
}

impl JsonRpcRequest {
    pub fn new(id: u64, method: impl Into<String>, params: Option<serde_json::Value>) -> Self {
        Self {
            jsonrpc: "2.0",
            id,
            method: method.into(),
            params,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct JsonRpcResponse {
    pub id: Option<u64>,
    pub result: Option<serde_json::Value>,
    pub error: Option<JsonRpcError>,
    pub method: Option<String>,
    pub params: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct JsonRpcError {
    pub code: i64,
    pub message: String,
    pub data: Option<serde_json::Value>,
}

impl std::fmt::Display for JsonRpcError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "JSON-RPC error {}: {}", self.code, self.message)
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InitializeParams {
    pub protocol_version: u32,
    pub client_capabilities: serde_json::Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewSessionParams {
    pub cwd: String,
    pub mcp_servers: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadSessionParams {
    pub session_id: String,
    pub cwd: String,
    pub mcp_servers: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptParams {
    pub session_id: String,
    pub prompt: Vec<PromptContent>,
}

#[derive(Debug, Serialize)]
pub struct PromptContent {
    pub r#type: String,
    pub text: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetSessionModeParams {
    pub session_id: String,
    pub mode_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListSessionsParams {
    pub cwd: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelParams {
    pub session_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetConfigOptionParams {
    pub session_id: String,
    pub config_id: String,
    pub value: String,
}

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionConfigOptionsState {
    #[serde(default)]
    pub available_config_options: Vec<SessionConfigOption>,
    #[serde(default)]
    pub selected_config_options: std::collections::HashMap<String, serde_json::Value>,
}

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionConfigOption {
    pub id: String,
    pub name: Option<String>,
    pub description: Option<String>,
    pub category: Option<String>,
    #[serde(rename = "type")]
    pub option_type: Option<String>,
    #[serde(default)]
    pub options: Vec<SessionConfigOptionValue>,
}

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionConfigOptionValue {
    pub id: Option<String>,
    pub value: Option<String>,
    pub name: Option<String>,
    pub label: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    #[serde(default)]
    pub session_id: String,
    pub modes: Option<SessionModeState>,
    #[serde(default)]
    pub config_options: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionModeState {
    #[serde(default)]
    pub available_modes: Vec<SessionMode>,
    pub current_mode_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionMode {
    pub id: String,
    pub name: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub session_id: String,
    pub cwd: Option<String>,
    pub title: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionUpdateEvent {
    pub workspace_id: String,
    pub session_id: String,
    pub update_type: String,
    pub payload: serde_json::Value,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionStatusEvent {
    pub workspace_id: String,
    pub status: String, // "connecting" | "connected" | "disconnected" | "reconnecting"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attempt: Option<u32>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HeartbeatEvent {
    pub workspace_id: String,
    pub status: String,
    pub latency_ms: Option<u64>,
    pub timestamp: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionLogEntry {
    pub timestamp: String,
    pub level: String,
    pub event: String,
    pub message: String,
    pub workspace_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Copilot,
    Claude,
}

impl Default for Provider {
    fn default() -> Self {
        Provider::Copilot
    }
}


#[derive(Debug, Clone)]
#[allow(dead_code)] // stored for future reconnect support
pub struct ConnectionConfig {
    pub provider: Provider,
    pub binary: String,
    pub cwd: String,
    // Copilot-specific
    pub gh_token: Option<String>,
    // Claude-specific
    pub model: Option<String>,
    pub skip_permissions: bool,
    pub max_budget_usd: Option<String>,
}

// ── Claude NDJSON event types ────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClaudeEvent {
    System(ClaudeSystemEvent),
    Assistant(ClaudeAssistantEvent),
    User(ClaudeUserEvent),
    Result(ClaudeResultEvent),
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Deserialize)]
pub struct ClaudeSystemEvent {
    pub subtype: Option<String>,
    pub session_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ClaudeAssistantEvent {
    pub message: ClaudeMessage,
}

#[derive(Debug, Deserialize)]
pub struct ClaudeMessage {
    #[serde(default)]
    pub content: Vec<ClaudeContentBlock>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClaudeContentBlock {
    Text { text: String },
    ToolUse { id: String, name: String, input: serde_json::Value },
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Deserialize)]
pub struct ClaudeUserEvent {
    pub message: ClaudeUserMessage,
}

#[derive(Debug, Deserialize)]
pub struct ClaudeUserMessage {
    #[serde(default)]
    pub content: Vec<ClaudeToolResultBlock>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct ClaudeToolResultBlock {
    pub tool_use_id: Option<String>,
    pub content: Option<serde_json::Value>,
    pub is_error: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct ClaudeResultEvent {
    pub subtype: Option<String>,
    pub is_error: Option<bool>,
    pub result: Option<String>,
    pub session_id: Option<String>,
    pub total_cost_usd: Option<f64>,
}
