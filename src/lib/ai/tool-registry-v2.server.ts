/**
 * Tool registry v2 (PAI-1).
 *
 * Builds on the tool registry in `tools.server.ts` without changing it. Every
 * tool now declares:
 *
 * - `risk`: `read` (runs now), `write_internal` (runs now, must say how to undo
 *   it) or `send_external` (never runs here: it needs an approval, see PAI-4)
 * - `scope`: `owner` (a member of the workspace the run is scoped to) or
 *   `admin` (platform super-admin only)
 * - a strict zod schema, a timeout and an idempotency key
 *
 * Rules that hold for every tool and are covered by tests:
 *
 * 1. `runToolV2` never throws. An unknown tool, bad arguments, a missing scope,
 *    a timeout or a crashing tool all come back as a typed `ok: false` result,
 *    so an agent loop can reason about them.
 * 2. The workspace comes from the session (`context.organizationId`), never
 *    from the model. A tool schema may not declare an organization field, and
 *    model arguments that carry one are refused.
 * 3. One audit row is written for every call, including refused ones. The row
 *    stores a hash of the arguments, not the arguments.
 * 4. The caller's own RLS client is the only database access tools receive.
 *
 * Server-only. New code should use this module; the four original tools are
 * exposed through the adapter at the bottom.
 */

import { createHash } from "node:crypto";
import { z } from "zod";
import { aiLimits } from "@/lib/ai/config";
import { RevoraAiError } from "@/lib/ai/errors";
import { findTool, type ToolContext } from "@/lib/ai/tools.server";

export type ToolRisk = "read" | "write_internal" | "send_external";
export type ToolScope = "owner" | "admin";

export type ToolContextV2 = ToolContext & {
  /** Set by the agent loop (PAI-3); stored on the audit row. */
  runId?: string;
  stepId?: string;
};

export type ToolInverse = { tool: string; arguments: unknown };

export type ToolDefinitionV2<S extends z.ZodType = z.ZodType> = {
  name: string;
  description: string;
  risk: ToolRisk;
  scope: ToolScope;
  /** Strict object schema for the model's arguments. */
  schema: S;
  run: (input: z.infer<S>, context: ToolContextV2) => Promise<unknown>;
  /**
   * Required for `write_internal`: how to undo this call, or `null` when the
   * call cannot be undone (or is itself the undo). Never called for reads.
   */
  inverse?: (input: z.infer<S>, result: unknown, context: ToolContextV2) => ToolInverse | null;
  timeoutMs?: number;
};

export type ToolFailureReason =
  | "unknown_tool"
  | "forbidden"
  | "invalid_input"
  | "timeout"
  | "failed"
  | "needs_approval";

export type ToolResultV2 =
  | {
      ok: true;
      tool: string;
      risk: ToolRisk;
      data: unknown;
      durationMs: number;
      idempotencyKey: string | null;
      /** True when an earlier identical write was returned instead of running again. */
      replayed: boolean;
      /** How to undo this call (write_internal only). */
      inverse: ToolInverse | null;
    }
  | {
      ok: false;
      tool: string;
      risk: ToolRisk | null;
      reason: ToolFailureReason;
      error: string;
      durationMs: number;
    };

export type ToolCallV2 = {
  name: string;
  arguments: unknown;
  requestId: string;
  /** Same key + same arguments = same write, run once. Derived when omitted. */
  idempotencyKey?: string;
};

export type ToolAuditEntry = {
  request_id: string;
  tool: string;
  organization_id: string;
  user_id: string;
  run_id: string | null;
  step_id: string | null;
  risk: ToolRisk | null;
  args_hash: string;
  result_status: "ok" | "replayed" | "refused" | "invalid" | "timeout" | "failed" | "needs_approval";
  idempotency_key: string | null;
  ok: boolean;
  reason: string | null;
  duration_ms: number;
};

export type ToolRunDeps = {
  /** Records one audit row. Must not throw; failures are swallowed anyway. */
  audit?: (entry: ToolAuditEntry) => Promise<void>;
  /** Earlier results by idempotency key, so a retried write does not run twice. */
  idempotency?: Map<string, ToolResultV2 & { ok: true }>;
  /**
   * Approval check for `send_external` tools (PAI-4 supplies the real one).
   * Without it, send_external tools are always refused with `needs_approval`.
   */
  approvals?: { consume: (call: { tool: string; argsHash: string; context: ToolContextV2 }) => Promise<boolean> };
};

/* --------------------------------- helpers -------------------------------- */

const ORG_KEYS = new Set(["organizationid", "organization_id", "orgid", "org_id", "workspaceid", "workspace_id"]);

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function hashToolArguments(args: unknown): string {
  return createHash("sha256").update(stableStringify(args)).digest("hex");
}

function schemaKeys(schema: z.ZodType): string[] {
  const shape = (schema as unknown as { shape?: Record<string, unknown> }).shape;
  return shape ? Object.keys(shape) : [];
}

function argumentCarriesWorkspace(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  return Object.keys(raw as Record<string, unknown>).some((key) => ORG_KEYS.has(key.toLowerCase()));
}

/** Declares a tool and checks the rules that cannot be checked at run time. */
export function defineToolV2<S extends z.ZodType>(definition: ToolDefinitionV2<S>): ToolDefinitionV2<S> {
  if (!/^[a-z][a-z0-9_.]{1,59}$/.test(definition.name)) throw new Error(`Invalid tool name "${definition.name}".`);
  if (definition.risk === "write_internal" && typeof definition.inverse !== "function")
    throw new Error(`Tool "${definition.name}" changes data, so it must declare an inverse (or return null).`);
  if (definition.risk !== "write_internal" && definition.inverse)
    throw new Error(`Tool "${definition.name}" is not write_internal, so it cannot declare an inverse.`);
  const leaked = schemaKeys(definition.schema).filter((key) => ORG_KEYS.has(key.toLowerCase()));
  if (leaked.length > 0)
    throw new Error(`Tool "${definition.name}" takes ${leaked.join(", ")} from the model; the workspace comes from the session.`);
  return definition;
}

/* -------------------------------- registry -------------------------------- */

export function createToolRegistryV2(definitions: ToolDefinitionV2<z.ZodType>[], deps: ToolRunDeps = {}) {
  const byName = new Map<string, ToolDefinitionV2<z.ZodType>>();
  for (const definition of definitions) {
    if (byName.has(definition.name)) throw new Error(`Duplicate tool "${definition.name}".`);
    byName.set(definition.name, definition);
  }

  const allowed = (tool: ToolDefinitionV2<z.ZodType>, context: { isSuperAdmin: boolean }) =>
    tool.scope !== "admin" || context.isSuperAdmin;

  async function writeAudit(entry: ToolAuditEntry) {
    try {
      const sink = deps.audit ?? defaultAudit;
      await sink(entry);
    } catch {
      /* an audit failure must never break, or change the outcome of, a tool call */
    }
  }

  return {
    names: () => [...byName.keys()],
    find: (name: string) => byName.get(name) ?? null,

    /** What the model may be told about: only tools this caller may use. */
    list(context: { isSuperAdmin: boolean }) {
      return [...byName.values()]
        .filter((tool) => allowed(tool, context))
        .map((tool) => ({
          name: tool.name,
          description: tool.description,
          risk: tool.risk,
          scope: tool.scope,
          parameters: z.toJSONSchema(tool.schema) as Record<string, unknown>,
        }));
    },

    async run(context: ToolContextV2, call: ToolCallV2): Promise<ToolResultV2> {
      const started = Date.now();
      const argsHash = hashToolArguments(call.arguments);
      const elapsed = () => Date.now() - started;
      const finish = async (
        result: ToolResultV2,
        status: ToolAuditEntry["result_status"],
        reason: string | null,
        tool: ToolDefinitionV2<z.ZodType> | null,
        key: string | null,
      ): Promise<ToolResultV2> => {
        await writeAudit({
          request_id: call.requestId,
          tool: call.name.slice(0, 60),
          organization_id: context.organizationId,
          user_id: context.userId,
          run_id: context.runId ?? null,
          step_id: context.stepId ?? null,
          risk: tool?.risk ?? null,
          args_hash: argsHash,
          result_status: status,
          idempotency_key: key,
          ok: result.ok,
          reason,
          duration_ms: elapsed(),
        });
        return result;
      };
      const refuse = (
        tool: ToolDefinitionV2<z.ZodType> | null,
        reason: ToolFailureReason,
        error: string,
        status: ToolAuditEntry["result_status"],
        auditReason: string,
        key: string | null = null,
      ) =>
        finish(
          { ok: false, tool: call.name, risk: tool?.risk ?? null, reason, error, durationMs: elapsed() },
          status,
          auditReason,
          tool,
          key,
        );

      try {
        const tool = byName.get(call.name) ?? null;
        if (!tool) return await refuse(null, "unknown_tool", "That tool isn't available to Revora AI.", "refused", "unknown_tool");

        if (!allowed(tool, context))
          return await refuse(tool, "forbidden", "That tool is limited to Revora platform administrators.", "refused", "forbidden");

        if (argumentCarriesWorkspace(call.arguments))
          return await refuse(
            tool,
            "invalid_input",
            "The workspace is set by your session, so a tool call can't name one.",
            "invalid",
            "org_in_args",
          );

        const parsed = tool.schema.safeParse(call.arguments ?? {});
        if (!parsed.success) {
          const first = parsed.error.issues[0];
          const where = first && first.path.length > 0 ? `"${first.path.join(".")}": ` : "";
          return await refuse(tool, "invalid_input", `${where}${first?.message ?? "Invalid arguments."}`, "invalid", "invalid_input");
        }

        const key =
          tool.risk === "read"
            ? null
            : (call.idempotencyKey?.slice(0, 120) ?? `${tool.name}:${context.organizationId}:${argsHash.slice(0, 32)}`);

        if (tool.risk === "send_external") {
          const approved = deps.approvals
            ? await deps.approvals.consume({ tool: tool.name, argsHash, context }).catch(() => false)
            : false;
          if (!approved)
            return await refuse(
              tool,
              "needs_approval",
              "This would contact someone outside the business, so it waits for the owner's approval.",
              "needs_approval",
              "needs_approval",
              key,
            );
        }

        if (key && deps.idempotency?.has(key)) {
          const earlier = deps.idempotency.get(key)!;
          return await finish({ ...earlier, replayed: true, durationMs: elapsed() }, "replayed", null, tool, key);
        }

        const timeoutMs = tool.timeoutMs ?? aiLimits().requestTimeoutMs;
        try {
          const data = await Promise.race([
            tool.run(parsed.data, context),
            new Promise<never>((_resolve, reject) => {
              AbortSignal.timeout(timeoutMs).addEventListener("abort", () => {
                reject(new RevoraAiError(408, "That step took too long.", { category: "timeout" }));
              });
            }),
          ]);
          let inverse: ToolInverse | null = null;
          if (tool.risk === "write_internal" && tool.inverse) {
            try {
              inverse = tool.inverse(parsed.data, data, context);
            } catch {
              inverse = null;
            }
          }
          const ok: ToolResultV2 & { ok: true } = {
            ok: true,
            tool: tool.name,
            risk: tool.risk,
            data,
            durationMs: elapsed(),
            idempotencyKey: key,
            replayed: false,
            inverse,
          };
          if (key) deps.idempotency?.set(key, ok);
          return await finish(ok, "ok", null, tool, key);
        } catch (error) {
          const timeout = error instanceof RevoraAiError && error.category === "timeout";
          return await refuse(
            tool,
            timeout ? "timeout" : "failed",
            (error as Error)?.message || "That step failed.",
            timeout ? "timeout" : "failed",
            timeout ? "timeout" : "failed",
            key,
          );
        }
      } catch (error) {
        // Last resort: the loop gets a typed result, never an exception.
        return {
          ok: false,
          tool: call.name,
          risk: null,
          reason: "failed",
          error: (error as Error)?.message || "That step failed.",
          durationMs: elapsed(),
        };
      }
    },
  };
}

/* ------------------------------- audit writer ------------------------------ */

/**
 * Writes with the trusted server client on purpose: a refused call must still
 * be recorded when the caller had no access. If the v2 columns are not in the
 * database yet (migration not applied), falls back to the original columns.
 */
async function defaultAudit(entry: ToolAuditEntry) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const table = supabaseAdmin.from("ai_tool_audit") as unknown as {
    insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
  };
  const { error } = await table.insert({ ...entry, duration_ms: Math.round(entry.duration_ms) });
  if (!error) return;
  const legacy = await table.insert({
    request_id: entry.request_id,
    tool: entry.tool,
    organization_id: entry.organization_id,
    user_id: entry.user_id,
    ok: entry.ok,
    reason: entry.reason,
    duration_ms: Math.round(entry.duration_ms),
  });
  if (legacy.error) console.error("[revora-ai] tool audit write failed");
}

/* ------------------------- the four original tools ------------------------- */

/**
 * Adapter: runs a tool from `tools.server.ts` unchanged. The workspace id its
 * parser needs is injected from the session, so the model never supplies it.
 */
function legacy<S extends z.ZodType>(
  name: string,
  risk: ToolRisk,
  schema: S,
  extra: Partial<Pick<ToolDefinitionV2<S>, "inverse" | "timeoutMs">> = {},
): ToolDefinitionV2<S> {
  const original = findTool(name);
  if (!original) throw new Error(`Original tool "${name}" is missing.`);
  return defineToolV2<S>({
    name,
    description: original.description,
    risk,
    scope: original.permission === "platform_admin" ? "admin" : "owner",
    schema,
    ...((extra.timeoutMs ?? original.timeoutMs) ? { timeoutMs: (extra.timeoutMs ?? original.timeoutMs) as number } : {}),
    ...(extra.inverse ? { inverse: extra.inverse } : {}),
    run: (input, context) => {
      const raw = { ...(input as Record<string, unknown>), organizationId: context.organizationId };
      return original.run(original.parse(raw) as never, context);
    },
  });
}

export function originalToolsV2(): ToolDefinitionV2<z.ZodType>[] {
  return [
    legacy("inspect_website", "read", z.strictObject({})),
    legacy("verify_live_pages", "read", z.strictObject({})),
    legacy("generate_image", "read", z.strictObject({ prompt: z.string().trim().min(1).max(4000) })),
    // Rolling back is itself the undo, so it has nothing further to undo.
    legacy("rollback_changes", "write_internal", z.strictObject({ steps: z.array(z.unknown()).min(1).max(200) }), {
      inverse: () => null,
    }),
  ] as ToolDefinitionV2<z.ZodType>[];
}

/** The registry the agent loop uses: the original four tools, on v2 rules. */
export function createDefaultToolRegistryV2(deps: ToolRunDeps = {}) {
  return createToolRegistryV2(originalToolsV2(), deps);
}
