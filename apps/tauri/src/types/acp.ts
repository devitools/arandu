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
