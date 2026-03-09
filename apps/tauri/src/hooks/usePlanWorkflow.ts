import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PlanPhase } from "@/types";
import type { AcpSessionMode } from "@/types/acp";

interface UsePlanWorkflowReturn {
  phase: PlanPhase;
  planFilePath: string | null;
  startPlanning: (sessionId: string, prompt: string) => Promise<void>;
  approvePlan: (reviewMarkdown?: string) => Promise<void>;
  requestChanges: (feedback: string) => Promise<void>;
  setPhase: (phase: PlanPhase) => void;
  locatePlan: () => Promise<string | null>;
}

interface UsePlanWorkflowParams {
  workspaceId: string;
  workspacePath: string;
  activeSessionId: string | null;
  acpSessionId: string | null;
  localSessionId: string | null;
  initialPhase?: PlanPhase;
  sessionPlanFilePath: string | null;
  agentPlanFilePath: string | null;
  isStreaming: boolean;
  availableModes: AcpSessionMode[];
  sendPrompt: (text: string) => Promise<void>;
  setMode: (mode: string, options?: { origin?: "user" | "workflow" }) => Promise<boolean>;
  onPhaseChange?: (phase: PlanPhase) => void;
  onAutoSwitchMode?: (modeId: string) => void;
}

export function usePlanWorkflow({
  workspaceId,
  workspacePath,
  activeSessionId,
  acpSessionId,
  localSessionId,
  initialPhase,
  sessionPlanFilePath,
  agentPlanFilePath,
  availableModes,
  sendPrompt,
  setMode,
  onPhaseChange,
  onAutoSwitchMode,
}: UsePlanWorkflowParams): UsePlanWorkflowReturn {
  const [phase, setPhaseRaw] = useState<PlanPhase>(initialPhase ?? "idle");
  const validStoredPath = sessionPlanFilePath || null;
  const [planFilePath, setPlanFilePath] = useState<string | null>(validStoredPath);

  const onPhaseChangeRef = useRef(onPhaseChange);
  onPhaseChangeRef.current = onPhaseChange;
  const onAutoSwitchModeRef = useRef(onAutoSwitchMode);
  onAutoSwitchModeRef.current = onAutoSwitchMode;

  const setPhase = useCallback((p: PlanPhase) => {
    setPhaseRaw(p);
    onPhaseChangeRef.current?.(p);
  }, []);

  const sendPromptRef = useRef(sendPrompt);
  sendPromptRef.current = sendPrompt;
  const setModeRef = useRef(setMode);
  setModeRef.current = setMode;
  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;

  useEffect(() => {
    if (!agentPlanFilePath) return;
    setPlanFilePath(agentPlanFilePath);

    if (localSessionId) {
      invoke("session_update_plan_file_path", {
        id: localSessionId,
        planFilePath: agentPlanFilePath,
      }).catch(console.error);
    }
  }, [agentPlanFilePath, localSessionId]);

  const availableModesRef = useRef(availableModes);
  availableModesRef.current = availableModes;

  const startPlanning = useCallback(
    async (_sessionId: string, prompt: string) => {
      const planMode = findModeBySlug(availableModesRef.current, "plan");
      if (planMode) {
        const switched = await setModeRef.current(planMode, { origin: "workflow" });
        if (switched) onAutoSwitchModeRef.current?.(planMode);
      }

      setPhase("planning");
      if (localSessionId) {
        invoke("session_update_phase", {
          id: localSessionId,
          phase: "planning",
        }).catch(console.error);
      }

      await sendPromptRef.current(prompt);
    },
    [workspaceId, localSessionId]
  );

  const approvePlan = useCallback(
    async (reviewMarkdown?: string) => {
      if (!acpSessionId && !activeSessionIdRef.current) return;

      const agentMode = findModeBySlug(availableModesRef.current, "agent");
      if (agentMode) {
        const switched = await setModeRef.current(agentMode, { origin: "workflow" });
        if (switched) onAutoSwitchModeRef.current?.(agentMode);
      }

      setPhase("executing");
      if (localSessionId) {
        invoke("session_update_phase", {
          id: localSessionId,
          phase: "executing",
        }).catch(console.error);
      }

      const prompt = reviewMarkdown
        ? `The plan has been reviewed. Here is the feedback:\n\n${reviewMarkdown}\n\nPlease proceed with executing the plan, incorporating the feedback above.`
        : "The plan has been approved. Please proceed with execution.";

      await sendPromptRef.current(prompt);
    },
    [workspaceId, acpSessionId, activeSessionId, localSessionId]
  );

  const requestChanges = useCallback(
    async (feedback: string) => {
      setPhase("planning");

      if (localSessionId) {
        invoke("session_update_phase", {
          id: localSessionId,
          phase: "planning",
        }).catch(console.error);
      }

      await sendPromptRef.current(
        `Please revise the plan based on this feedback:\n\n${feedback}`
      );
    },
    [localSessionId]
  );

  const locatePlan = useCallback(async (): Promise<string | null> => {
    if (!localSessionId) return null;
    try {
      if (sessionPlanFilePath) {
        const exists = await invoke<string>("read_file", { path: sessionPlanFilePath }).catch(() => null);
        if (exists) {
          setPlanFilePath(sessionPlanFilePath);
          return sessionPlanFilePath;
        }
      }
      const path = await invoke<string>("plan_path", { sessionId: localSessionId });
      const content = await invoke<string>("plan_read", { sessionId: localSessionId });
      if (!content) return null;
      setPlanFilePath(path);
      invoke("session_update_plan_file_path", {
        id: localSessionId,
        planFilePath: path,
      }).catch(console.error);
      return path;
    } catch {
      return null;
    }
  }, [localSessionId, sessionPlanFilePath]);

  const locatePlanRef = useRef(locatePlan);
  locatePlanRef.current = locatePlan;
  useEffect(() => {
    if (!planFilePath && initialPhase && initialPhase !== "idle") {
      locatePlanRef.current();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    phase,
    planFilePath,
    startPlanning,
    approvePlan,
    requestChanges,
    setPhase,
    locatePlan,
  };
}

function findModeBySlug(
  availableModes: AcpSessionMode[],
  slug: string
): string | null {
  const slugLower = slug.toLowerCase();
  return (
    availableModes.find((m) => m.id.endsWith(`#${slugLower}`))?.id ??
    availableModes.find((m) => m.id.toLowerCase().includes(slugLower))?.id ??
    availableModes.find((m) => m.name?.toLowerCase().includes(slugLower))?.id ??
    null
  );
}
