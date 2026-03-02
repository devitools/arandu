import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PlanPhase } from "@/types";

interface UsePlanWorkflowReturn {
  phase: PlanPhase;
  planFilePath: string | null;
  startPlanning: (sessionId: string, prompt: string) => Promise<void>;
  approvePlan: (reviewMarkdown?: string) => Promise<void>;
  requestChanges: (feedback: string) => Promise<void>;
  setPhase: (phase: PlanPhase) => void;
}

interface UsePlanWorkflowParams {
  workspaceId: string;
  activeSessionId: string | null;
  acpSessionId: string | null;
  localSessionId: string | null;
  initialPhase?: PlanPhase;
  sessionPlanFilePath: string | null;
  agentPlanFilePath: string | null;
  isStreaming: boolean;
  availableModes: string[];
  sendPrompt: (text: string) => Promise<void>;
  setMode: (mode: string) => Promise<void>;
  onPhaseChange?: (phase: PlanPhase) => void;
}

export function usePlanWorkflow({
  workspaceId,
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
}: UsePlanWorkflowParams): UsePlanWorkflowReturn {
  const [phase, setPhaseRaw] = useState<PlanPhase>(initialPhase ?? "idle");
  const [planFilePath, setPlanFilePath] = useState<string | null>(
    sessionPlanFilePath
  );

  const onPhaseChangeRef = useRef(onPhaseChange);
  onPhaseChangeRef.current = onPhaseChange;

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

  useEffect(() => {
    if (planFilePath || !localSessionId) return;
    invoke<string>("plan_path", { sessionId: localSessionId })
      .then(setPlanFilePath)
      .catch(console.error);
  }, [localSessionId, planFilePath]);

  const availableModesRef = useRef(availableModes);
  availableModesRef.current = availableModes;

  const startPlanning = useCallback(
    async (sessionId: string, prompt: string) => {
      const planMode = findModeBySlug(availableModesRef.current, "plan");
      if (planMode) {
        await setModeRef.current(planMode);
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
        await setModeRef.current(agentMode);
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

  return {
    phase,
    planFilePath,
    startPlanning,
    approvePlan,
    requestChanges,
    setPhase,
  };
}

function findModeBySlug(
  availableModes: string[],
  slug: string
): string | null {
  return (
    availableModes.find((id) => id.endsWith(`#${slug}`)) ??
    availableModes.find((id) => id.includes(slug)) ??
    null
  );
}
