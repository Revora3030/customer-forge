/**
 * Owner-facing API for the business memory store (PAI-6). Every call runs on
 * the signed-in owner's own client (RLS), and the workspace comes from the
 * request, then is checked against the owner's memberships by RLS on every
 * read and write. Vectors use the service role only after that.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MEMORY_KINDS, type BusinessMemoryRow, type MemoryKind } from "@/lib/business-memory";

const orgId = (input: { organizationId?: unknown }) => {
  const value = typeof input?.organizationId === "string" ? input.organizationId.trim() : "";
  if (!value) throw new Error("Choose a workspace first.");
  return value;
};
const noteId = (input: { id?: unknown }) => {
  const value = typeof input?.id === "string" ? input.id.trim() : "";
  if (!value) throw new Error("That note could not be found.");
  return value;
};
const text = (value: unknown) => (typeof value === "string" ? value : "");

async function ownerContext(userId: string, organizationId: string) {
  return { organizationId, actor: { kind: "owner" as const, userId } };
}

async function deps() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { admin: supabaseAdmin as never };
}

export const listBusinessMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; includeSuperseded?: boolean }) => ({ organizationId: orgId(input), includeSuperseded: input?.includeSuperseded === true }))
  .handler(async ({ data, context }): Promise<BusinessMemoryRow[]> => {
    const { listMemory } = await import("@/lib/business-memory.server");
    return listMemory(context.supabase as never, await ownerContext(context.userId, data.organizationId), {
      statuses: data.includeSuperseded ? ["proposed", "confirmed", "superseded"] : ["proposed", "confirmed"],
    });
  });

export const saveBusinessMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; kind: MemoryKind; key: string; value: string }) => {
    if (!MEMORY_KINDS.includes(input?.kind)) throw new Error("Choose what kind of note this is.");
    return { organizationId: orgId(input), kind: input.kind, key: text(input.key), value: text(input.value) };
  })
  .handler(async ({ data, context }) => {
    const { recordMemory } = await import("@/lib/business-memory.server");
    return recordMemory(
      context.supabase as never,
      await ownerContext(context.userId, data.organizationId),
      { kind: data.kind, key: data.key, value: data.value, sourceType: "owner_entered" },
      await deps(),
    );
  });

export const confirmBusinessMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; id: string }) => ({ organizationId: orgId(input), id: noteId(input) }))
  .handler(async ({ data, context }) => {
    const { confirmMemory } = await import("@/lib/business-memory.server");
    return confirmMemory(context.supabase as never, await ownerContext(context.userId, data.organizationId), data.id, await deps());
  });

export const editBusinessMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; id: string; key?: string; value?: string }) => ({
    organizationId: orgId(input),
    id: noteId(input),
    ...(input?.key != null ? { key: text(input.key) } : {}),
    ...(input?.value != null ? { value: text(input.value) } : {}),
  }))
  .handler(async ({ data, context }) => {
    const { editMemory } = await import("@/lib/business-memory.server");
    return editMemory(
      context.supabase as never,
      await ownerContext(context.userId, data.organizationId),
      data.id,
      { ...(data.key != null ? { key: data.key } : {}), ...(data.value != null ? { value: data.value } : {}) },
      await deps(),
    );
  });

export const deleteBusinessMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; id: string }) => ({ organizationId: orgId(input), id: noteId(input) }))
  .handler(async ({ data, context }) => {
    const { deleteMemory } = await import("@/lib/business-memory.server");
    return deleteMemory(context.supabase as never, await ownerContext(context.userId, data.organizationId), data.id);
  });

export const businessMemoryHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; id: string }) => ({ organizationId: orgId(input), id: noteId(input) }))
  .handler(async ({ data, context }) => {
    const { memoryHistory } = await import("@/lib/business-memory.server");
    return memoryHistory(context.supabase as never, await ownerContext(context.userId, data.organizationId), data.id);
  });

export const importBusinessMemoryFromWebsite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => ({ organizationId: orgId(input) }))
  .handler(async ({ data, context }) => {
    const { importWebsiteMemory } = await import("@/lib/business-memory.server");
    return importWebsiteMemory(context.supabase as never, await ownerContext(context.userId, data.organizationId));
  });
