/** Tools are factories so the registry can import this file without an import-cycle ordering problem. PAI-7/PAI-8 read tools. All risk "read", scope "owner", workspace from the session. */
import type { z } from "zod";
import type { ToolDefinitionV2 } from "@/lib/ai/tool-registry-v2.server";
import { analyticsSummary } from "./analytics";
import { automationsHistory, automationsList } from "./automations";
import { bookingsFindGaps, bookingsListUpcoming } from "./bookings";
import { campaignsList, campaignsResults } from "./campaigns";
import { domainStatus } from "./domain";
import { withAgentLimits } from "./guard";
import type { LimitsDeps } from "@/lib/agent/limits.server";
import { leadsGet, leadsList } from "./leads";
import { quotesGet, quotesList } from "./quotes";
import { reviewsFindUnanswered, reviewsList } from "./reviews";

/** PAI-7: leads, quotes, bookings, reviews (const tool defs). */
export function readToolsA(): ToolDefinitionV2<z.ZodType>[] {
  return [
    leadsList,
    leadsGet,
    quotesList,
    quotesGet,
    bookingsListUpcoming,
    bookingsFindGaps,
    reviewsList,
    reviewsFindUnanswered,
  ] as unknown as ToolDefinitionV2<z.ZodType>[];
}

/** PAI-8: campaigns, automations, analytics, domain (factory tool defs). */
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

export function readTools(): ToolDefinitionV2<z.ZodType>[] {
  return [...readToolsA(), ...readToolsB()];
}

/**
 * Every agent tool group, each wrapped in the PAI-5 limits. To add a group,
 * append its factory to this list.
 */
const AGENT_TOOL_GROUPS: Array<() => ToolDefinitionV2<z.ZodType>[]> = [
  readToolsA,
  readToolsB,
];

export function agentTools(limits?: LimitsDeps): ToolDefinitionV2<z.ZodType>[] {
  return withAgentLimits(
    AGENT_TOOL_GROUPS.flatMap((group) => group()),
    limits,
  );
}
