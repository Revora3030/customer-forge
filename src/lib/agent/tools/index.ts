/** Tools are factories so the registry can import this file without an import-cycle ordering problem. PAI-8 read tools B. All risk "read", scope "owner", workspace from the session. */
import type { z } from "zod";
import type { ToolDefinitionV2 } from "@/lib/ai/tool-registry-v2.server";
import { analyticsSummary } from "./analytics";
import { automationsHistory, automationsList } from "./automations";
import { campaignsList, campaignsResults } from "./campaigns";
import { domainStatus } from "./domain";
import { withAgentLimits } from "./guard";
import { readToolsC } from "./quotes-reviews";
import { sendTools } from "./send";
import type { LimitsDeps } from "@/lib/agent/limits.server";

export function readToolsB(): ToolDefinitionV2<z.ZodType>[] {
  return [
    campaignsList(),
    campaignsResults(),
    automationsList(),
    automationsHistory(),
    analyticsSummary(),
    domainStatus(),
  ] as unknown as ToolDefinitionV2<z.ZodType>[];
}

/**
 * Every agent tool group, each wrapped in the PAI-5 limits. To add a group
 * (e.g. COMP-14 quotes/reviews), append its factory to this list. sendTools
 * (PAI-12) holds the send_external tools: the registry refuses them without a
 * PAI-4 approval, and this is the one place they are wrapped in the limits.
 */
const AGENT_TOOL_GROUPS: Array<() => ToolDefinitionV2<z.ZodType>[]> = [readToolsB, readToolsC, () => sendTools()];

export function agentTools(limits?: LimitsDeps): ToolDefinitionV2<z.ZodType>[] {
  return withAgentLimits(
    AGENT_TOOL_GROUPS.flatMap((group) => group()),
    limits,
  );
}
