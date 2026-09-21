/**
 * What the builder remembers about one website — readable and editable by the
 * owner, because memory the owner cannot see or correct is not trustworthy.
 *
 * Every query runs through the caller's own client, so RLS decides which
 * workspace's memory can be read, pinned or forgotten.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { MemoryEntry } from "@/lib/builder/session-memory";

const orgId = (input: { organizationId?: unknown }) => {
  const value = typeof input?.organizationId === "string" ? input.organizationId.trim() : "";
  if (!value) throw new Error("Choose a workspace first.");
  return value;
};

const entryId = (input: { entryId?: unknown }) => {
  const value = typeof input?.entryId === "string" ? input.entryId.trim() : "";
  if (!value) throw new Error("That note could not be found.");
  return value;
};

export const listSiteMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string }) => ({ organizationId: orgId(input) }))
  .handler(async ({ data, context }): Promise<MemoryEntry[]> => {
    const { loadMemory } = await import("@/lib/builder/session-memory.server");
    return loadMemory(context.supabase as never, data.organizationId);
  });

export const forgetSiteMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string; entryId: string }) => ({
    organizationId: orgId(input),
    entryId: entryId(input),
  }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("website_memory")
      .delete()
      .eq("organization_id", data.organizationId)
      .eq("id", data.entryId);
    if (error) throw new Error("That note could not be forgotten. Try again.");
    return { forgotten: true };
  });

export const pinSiteMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string; entryId: string; pinned: boolean }) => ({
    organizationId: orgId(input),
    entryId: entryId(input),
    pinned: input?.pinned === true,
  }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("website_memory")
      .update({ pinned: data.pinned })
      .eq("organization_id", data.organizationId)
      .eq("id", data.entryId);
    if (error) throw new Error("That note could not be updated. Try again.");
    return { pinned: data.pinned };
  });
