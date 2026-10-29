import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MAX_IMPORT_CHARS } from "./prospect-lead-import";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function guardedAdmin(context: { supabase: unknown; userId: unknown }): Promise<SupabaseClient> {
  const { assertSuperAdmin } = await import("./admin.server");
  await assertSuperAdmin(context.supabase as Parameters<typeof assertSuperAdmin>[0], String(context.userId));
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

/** Super-admin only: checks a CSV of leads and parks the good ones in the review queue. Contacts no one. */
export const importProspectLeadsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { csv?: unknown; defaultCategory?: unknown };
    const csv = typeof raw.csv === "string" ? raw.csv : "";
    if (csv.length > MAX_IMPORT_CHARS) throw new Error("That file is too large. Import up to 300 leads at a time.");
    return { csv, defaultCategory: typeof raw.defaultCategory === "string" ? raw.defaultCategory.trim().slice(0, 80) : "" };
  })
  .handler(async ({ context, data }) => {
    const db = await guardedAdmin(context);
    const { importLeadCsv } = await import("./prospect-lead-import.server");
    return importLeadCsv(db, { ...data, actorId: String(context.userId) });
  });

/** Super-admin only: the leads waiting for review, and how many sites the autopilot can still start today. */
export const listProspectLeadQueueFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await guardedAdmin(context);
    const { listImportQueue } = await import("./prospect-lead-import.server");
    return listImportQueue(db, 100);
  });

/** Super-admin only: rejects leads, or approves them into the demo pipeline (the autopilot's own checks and limits apply). */
export const reviewProspectLeadsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { ids?: unknown; decision?: unknown };
    const ids = Array.isArray(raw.ids) ? raw.ids.filter((id): id is string => typeof id === "string" && ID.test(id)).slice(0, 50) : [];
    if (!ids.length) throw new Error("Choose at least one lead first.");
    return { ids, decision: raw.decision === "reject" ? ("reject" as const) : ("approve" as const) };
  })
  .handler(async ({ context, data }) => {
    const db = await guardedAdmin(context);
    const { reviewImportedLeads } = await import("./prospect-lead-import.server");
    return reviewImportedLeads(db, { ...data, actorId: String(context.userId) });
  });
