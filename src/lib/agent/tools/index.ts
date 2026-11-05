/** PAI-8 read tools B. All risk "read", scope "owner", workspace from the session. */
import type { z } from "zod";
import type { ToolDefinitionV2 } from "@/lib/ai/tool-registry-v2.server";
import { analyticsSummary } from "./analytics";
import { automationsHistory, automationsList } from "./automations";
import { campaignsList, campaignsResults } from "./campaigns";
import { domainStatus } from "./domain";

export function readToolsB(): ToolDefinitionV2<z.ZodType>[] {
  return [
    campaignsList,
    campaignsResults,
    automationsList,
    automationsHistory,
    analyticsSummary,
    domainStatus,
  ] as unknown as ToolDefinitionV2<z.ZodType>[];
}
