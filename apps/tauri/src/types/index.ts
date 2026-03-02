export interface Workspace {
  id: string;
  type: "file" | "directory";
  path: string;
  displayName: string;
  thumbnail?: string;
  lastAccessed: Date;
  scrollPosition?: number;
}

export interface Heading {
  level: number;
  text: string;
  index: number;
}

export interface Session {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: Date;
  lastActive: Date;
}

export interface Message {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  type?: "thinking" | "tool";
}

export interface Comment {
  id: string;
  block_ids: string[];
  text: string;
  timestamp: number;
  resolved: boolean;
}

export interface CommentsData {
  file_hash: string;
  comments: Comment[];
}

export interface CardRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export type PlanPhase = "idle" | "planning" | "reviewing" | "executing" | "done";

export interface SessionRecord {
  id: string;
  workspace_path: string;
  acp_session_id: string | null;
  name: string;
  initial_prompt: string;
  plan_markdown: string;
  plan_file_path: string | null;
  phase: PlanPhase;
  created_at: string;
  updated_at: string;
}

export interface SessionTab {
  id: string;
  acpSessionId: string | null;
  title: string;
}
