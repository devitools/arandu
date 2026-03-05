export interface AcpSessionMode {
  id: string;
  name?: string;
  description?: string;
}

export interface AcpSessionModeState {
  availableModes: AcpSessionMode[];
  currentModeId?: string;
}

export interface AcpSessionInfo {
  sessionId: string;
  modes?: AcpSessionModeState;
}

export interface AcpSessionSummary {
  sessionId: string;
  cwd?: string;
  title?: string;
  updatedAt?: string;
}

export interface AcpSessionUpdate {
  workspaceId: string;
  sessionId: string;
  updateType: string;
  payload: Record<string, unknown>;
}

export interface AcpMessage {
  id: string;
  role: "user" | "assistant";
  type?: "thinking" | "tool" | "notice";
  content: string;
  timestamp: Date;
  toolCallId?: string;
  toolTitle?: string;
  toolStatus?: string;
}

export interface AcpConnectionStatusEvent {
  workspaceId: string;
  status: "connecting" | "connected" | "disconnected" | "reconnecting";
  attempt?: number;
}

export interface AcpHeartbeatEvent {
  workspaceId: string;
  status: "healthy" | "degraded" | "disconnected";
  latencyMs?: number;
  timestamp: string;
}

export interface AcpConnectionLogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  event: string;
  message: string;
  workspaceId: string;
}
