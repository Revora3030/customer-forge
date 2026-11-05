/**
 * PAI-15: starts an agent run from a builder chat message. Off unless the agent
 * loop is on (AGENT_LOOP_ENABLED), so with the flag unset the chat behaves as before.
 * Limits and the kill switch are enforced when the worker claims the run (loop.server).
 */
import { agentLoopEnabled } from "@/lib/agent/loop-install.server";
import { globalKillSwitchOn, refusalMessage, defaultLimits } from "@/lib/agent/limits.server";
import {
  AGENT_RUN_NOT_STARTED_REPLY,
  AGENT_RUN_STARTED_REPLY,
  routeChatMessage,
} from "@/lib/builder/agent-run-routing";

export type ChatRunStart =
  | { kind: "site" }
  | { kind: "started"; runId: string; reply: string }
  | { kind: "refused"; reply: string };

export type ChatRunDeps = {
  enabled: () => boolean;
  killSwitchOn: () => boolean;
  createRun: (input: {
    organizationId: string;
    userId: string;
    goal: string;
  }) => Promise<{ id: string }>;
};

async function defaultDeps(): Promise<ChatRunDeps> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { createAgentRun } = await import("@/lib/agent/run-store.server");
  return {
    enabled: () => agentLoopEnabled(),
    killSwitchOn: () => globalKillSwitchOn(),
    createRun: (input) =>
      createAgentRun(supabaseAdmin, {
        organizationId: input.organizationId,
        userId: input.userId,
        goal: input.goal,
        source: "owner",
      }),
  };
}

export async function startChatAgentRun(
  input: { organizationId: string; userId: string; instruction: string; hasAttachments: boolean },
  deps?: ChatRunDeps,
): Promise<ChatRunStart> {
  if (routeChatMessage(input.instruction, { hasAttachments: input.hasAttachments }) !== "agent_run")
    return { kind: "site" };
  const d = deps ?? (agentLoopEnabled() ? await defaultDeps() : null);
  if (!d || !d.enabled()) return { kind: "site" };
  if (d.killSwitchOn())
    return { kind: "refused", reply: refusalMessage("global_kill_switch", defaultLimits()) };
  try {
    const run = await d.createRun({
      organizationId: input.organizationId,
      userId: input.userId,
      goal: input.instruction.trim().slice(0, 4000),
    });
    return { kind: "started", runId: run.id, reply: AGENT_RUN_STARTED_REPLY };
  } catch (error) {
    console.error("[builder-chat] could not start an agent run", (error as Error).message);
    return { kind: "refused", reply: AGENT_RUN_NOT_STARTED_REPLY };
  }
}
