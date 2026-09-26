import type { SupabaseClient } from "@supabase/supabase-js";
/**
 * Self-serve client portal access.
 *
 * A workspace owner/admin can turn on a shareable portal code. Anyone with a
 * Revora account and that code can join the workspace as a `viewer`, so clients
 * can onboard themselves from the public /portal page instead of waiting for an
 * emailed invite. The code is never exposed to anonymous callers: every read,
 * rotation and join happens inside a server function.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cleanText, parseWorkspaceId } from "@/lib/stripe-input";

/** Human-friendly, unambiguous alphabet (no 0/O/1/I). */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const PORTAL_CODE_LENGTH = 10;

/** Codes are shown/typed uppercase; hyphens and spaces are ignored. */
export function normalizePortalCode(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

const parseCode = (value: unknown) => {
  const code = normalizePortalCode(cleanText(value, 32));
  if (code.length !== PORTAL_CODE_LENGTH) throw new Error("That portal code is not valid.");
  return code;
};

function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(PORTAL_CODE_LENGTH));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

async function assertCanManage(
  supabase: Pick<SupabaseClient, "from">,
  organizationId: string,
  userId: string,
) {
  const { data } = await supabase
    .from("memberships")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!["owner", "admin"].includes(data?.role ?? "")) {
    throw new Error("Only workspace owners and admins can manage portal access.");
  }
}

/** Current portal code for a workspace (null when self-serve joining is off). */
export const getPortalCode = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => ({
    organizationId: parseWorkspaceId(input?.organizationId),
  }))
  .handler(async ({ data, context }): Promise<{ code: string | null } | { error: string }> => {
    try {
      await assertCanManage(context.supabase, data.organizationId, context.userId);
      const { data: org } = await context.supabase
        .from("organizations")
        .select("portal_code")
        .eq("id", data.organizationId)
        .maybeSingle();
      return { code: (org?.portal_code as string | null) ?? null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Could not read portal access." };
    }
  });

/** Creates a new code (invalidating the previous one) or turns sharing off. */
export const setPortalCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; enabled: boolean }) => ({
    organizationId: parseWorkspaceId(input?.organizationId),
    enabled: input?.enabled !== false,
  }))
  .handler(async ({ data, context }): Promise<{ code: string | null } | { error: string }> => {
    try {
      await assertCanManage(context.supabase, data.organizationId, context.userId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      if (!data.enabled) {
        await supabaseAdmin
          .from("organizations")
          .update({ portal_code: null })
          .eq("id", data.organizationId);
        return { code: null };
      }

      // Retry on the (astronomically unlikely) unique-index collision.
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const code = generateCode();
        const { error } = await supabaseAdmin
          .from("organizations")
          .update({ portal_code: code })
          .eq("id", data.organizationId);
        if (!error) return { code };
      }
      return { error: "Could not create a portal code. Try again." };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Could not update portal access." };
    }
  });

/** Joins the signed-in user to the workspace that owns this code, as a viewer. */
export const joinWithPortalCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { code: string }) => ({ code: parseCode(input?.code) }))
  .handler(
    async ({
      data,
      context,
    }): Promise<
      { ok: true; organizationName: string | null; alreadyMember: boolean } | { error: string }
    > => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { data: org } = await supabaseAdmin
        .from("organizations")
        .select("id, name, is_suspended")
        .eq("portal_code", data.code)
        .maybeSingle();

      if (!org) return { error: "That portal code is not valid or has been turned off." };
      if (org.is_suspended) return { error: "That workspace is not accepting new members." };

      const { data: existing } = await supabaseAdmin
        .from("memberships")
        .select("id")
        .eq("organization_id", org.id)
        .eq("user_id", context.userId)
        .maybeSingle();

      if (existing) {
        return { ok: true, organizationName: org.name ?? null, alreadyMember: true };
      }

      const { error } = await supabaseAdmin.from("memberships").insert({
        organization_id: org.id,
        user_id: context.userId,
        role: "viewer",
      });
      if (error) return { error: "Could not add you to that workspace." };

      return { ok: true, organizationName: org.name ?? null, alreadyMember: false };
    },
  );
