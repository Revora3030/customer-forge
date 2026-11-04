import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cleanText, parseReturnUrl, parseWorkspaceId } from "@/lib/stripe-input";

/** Roles an invitation may grant. Ownership is never transferable by invite. */
export const INVITABLE_ROLES = ["admin", "manager", "staff", "viewer"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

/**
 * Roles a teammate with `actorRole` may hand out through an invitation. This
 * mirrors the database role guard (private.guard_membership_change): owners
 * may grant any invitable role, admins may grant everything below admin, and
 * nobody else may invite. Invitations are written and accepted with the
 * service role, which that trigger lets through, so the rule has to be
 * enforced here too or an admin could mint a second admin by invite.
 */
export function rolesGrantableBy(actorRole: string | null | undefined): readonly InvitableRole[] {
  if (actorRole === "owner") return INVITABLE_ROLES;
  if (actorRole === "admin") return INVITABLE_ROLES.filter((role) => role !== "admin");
  return [];
}

export function canGrantRole(actorRole: string | null | undefined, role: string): boolean {
  return (rolesGrantableBy(actorRole) as readonly string[]).includes(role);
}

/**
 * Who may cancel an open invitation: the same people who could have sent it.
 * Only the owner may revoke an admin invite, so an admin cannot quietly
 * cancel the owner's choice of a co-admin.
 */
export function canRevokeInvite(actorRole: string | null | undefined, role: string): boolean {
  return canGrantRole(actorRole, role);
}

/** Workspace roles from most to least access. */
const ROLE_RANK: Record<string, number> = { owner: 5, admin: 4, manager: 3, staff: 2, viewer: 1 };

/** True only when `next` gives strictly more access than `current`. */
export function isRoleUpgrade(current: string | null | undefined, next: string): boolean {
  return (ROLE_RANK[next] ?? 0) > (ROLE_RANK[String(current ?? "")] ?? 0);
}

const roleName = (role: string) => (role === "staff" ? "staff member" : role);

const parseRole = (value: unknown): InvitableRole => {
  const role = String(value ?? "");
  if ((INVITABLE_ROLES as readonly string[]).includes(role)) return role as InvitableRole;
  throw new Error("Pick a valid team role");
};

const parseEmail = (value: unknown) => {
  const email = cleanText(value, 160).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Add a valid email address");
  return email;
};

const parseToken = (value: unknown) => {
  const token = cleanText(value, 128);
  if (!/^[a-f0-9]{32,128}$/.test(token)) throw new Error("This invitation link is not valid");
  return token;
};

/** Invitation tokens are only ever stored hashed, so a database read cannot replay one. */
async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
  const role = data?.role ?? "";
  if (!["owner", "admin"].includes(role)) {
    throw new Error("Only workspace owners and admins can manage the team.");
  }
  return role as "owner" | "admin";
}

/** Creates a single-use, 14-day invitation and emails the invite link. */
export const createTeamInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; email: string; role: string; appUrl: string }) => ({
    organizationId: parseWorkspaceId(input?.organizationId),
    email: parseEmail(input?.email),
    role: parseRole(input?.role),
    appUrl: parseReturnUrl(input?.appUrl),
  }))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: true; email: string; emailed: boolean } | { error: string }> => {
      try {
        const actorRole = await assertCanManage(
          context.supabase,
          data.organizationId,
          context.userId,
        );
        if (!canGrantRole(actorRole, data.role)) {
          return { error: "Only the workspace owner can invite an admin." };
        }

        const { data: org } = await context.supabase
          .from("organizations")
          .select("id, name")
          .eq("id", data.organizationId)
          .maybeSingle();
        if (!org) return { error: "You do not have access to this workspace." };

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Already on the team? Nothing to invite.
        const { data: existingProfile } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("email", data.email)
          .maybeSingle();
        if (existingProfile?.id) {
          const { data: member } = await supabaseAdmin
            .from("memberships")
            .select("id")
            .eq("organization_id", data.organizationId)
            .eq("user_id", existingProfile.id)
            .maybeSingle();
          if (member) return { error: `${data.email} is already on this team.` };
        }

        // Replace any open invitation for the same address.
        const { error: revokeError } = await supabaseAdmin
          .from("team_invitations")
          .update({ revoked_at: new Date().toISOString() })
          .eq("organization_id", data.organizationId)
          .eq("email", data.email)
          .is("accepted_at", null)
          .is("revoked_at", null);
        // Otherwise the old link (possibly with a different role) stays valid.
        if (revokeError) return { error: "Could not replace the earlier invite. Try again." };

        const token = Array.from(crypto.getRandomValues(new Uint8Array(24)))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        const tokenHash = await hashToken(token);

        const { data: invitation, error } = await supabaseAdmin
          .from("team_invitations")
          .insert({
            organization_id: data.organizationId,
            email: data.email,
            role: data.role,
            token_hash: tokenHash,
            invited_by: context.userId,
          })
          .select("id")
          .single();
        if (error || !invitation) return { error: "Could not create that invitation." };

        const origin = new URL(data.appUrl).origin;
        const confirmationUrl = `${origin}/invite/${token}`;

        let emailed = false;
        try {
          const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
          const result = await sendTemplateEmail("team-invite", data.email, {
            templateData: {
              siteName: org.name ?? "Revora",
              siteUrl: origin,
              confirmationUrl,
            },
            idempotencyKey: `invite-${invitation.id}`,
          });
          emailed = result.sent;
        } catch (mailError) {
          console.error("[team-invite] email failed", mailError);
        }

        return { ok: true, email: data.email, emailed };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Could not send that invitation.",
        };
      }
    },
  );

/** Cancels an open invitation. */
export const revokeTeamInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; invitationId: string }) => ({
    organizationId: parseWorkspaceId(input?.organizationId),
    invitationId: parseWorkspaceId(input?.invitationId),
  }))
  .handler(async ({ data, context }): Promise<{ ok: true } | { error: string }> => {
    try {
      const actorRole = await assertCanManage(
        context.supabase,
        data.organizationId,
        context.userId,
      );
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: invite } = await supabaseAdmin
        .from("team_invitations")
        .select("id, role")
        .eq("id", data.invitationId)
        .eq("organization_id", data.organizationId)
        .maybeSingle();
      if (!invite) return { error: "That invite was not found." };
      if (!canRevokeInvite(actorRole, invite.role)) {
        return { error: "Only the workspace owner can cancel an admin invite." };
      }
      const { error } = await supabaseAdmin
        .from("team_invitations")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", data.invitationId)
        .eq("organization_id", data.organizationId)
        .eq("role", invite.role)
        .is("accepted_at", null)
        .is("revoked_at", null);
      // A revoke that didn't save leaves the invite link usable.
      if (error) return { error: "Could not revoke that invite. Try again." };
      return { ok: true };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Could not revoke that invite." };
    }
  });

/** Accepts an invitation for the signed-in user, joining them to the workspace. */
export const acceptTeamInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { token: string }) => ({ token: parseToken(input?.token) }))
  .handler(
    async ({
      data,
      context,
    }): Promise<
      { ok: true; organizationId: string; organizationName: string | null } | { error: string }
    > => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const tokenHash = await hashToken(data.token);

      const { data: invite } = await supabaseAdmin
        .from("team_invitations")
        .select("id, organization_id, email, role, invited_by, expires_at, accepted_at, revoked_at")
        .eq("token_hash", tokenHash)
        .maybeSingle();

      if (!invite) return { error: "This invitation link is not valid." };
      if (invite.revoked_at) return { error: "This invitation was cancelled." };
      if (invite.accepted_at) return { error: "This invitation was already used." };
      if (new Date(invite.expires_at) < new Date())
        return { error: "This invitation has expired. Ask for a new one." };

      const callerEmail = String(
        (context.claims as Record<string, unknown> | undefined)?.["email"] ?? "",
      ).toLowerCase();
      if (!callerEmail || callerEmail !== invite.email) {
        return {
          error: `This invitation was sent to ${invite.email}. Sign in with that email to accept it.`,
        };
      }

      // The email must be one the account actually proved it owns; an
      // unverified sign-up with someone else's address cannot take their seat.
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(context.userId);
      const confirmedEmail = String(authUser?.user?.email ?? "").toLowerCase();
      if (!authUser?.user?.email_confirmed_at || confirmedEmail !== invite.email) {
        return {
          error: `Confirm ${invite.email} first (check your inbox for the verification email), then open this invitation again.`,
        };
      }

      // The inviter must still be allowed to grant this role today. A link
      // sent by an admin who has since been demoted or removed (or an admin
      // invite minted before this check existed) must not grant access.
      const inviterRole = invite.invited_by
        ? (
            await supabaseAdmin
              .from("memberships")
              .select("role")
              .eq("organization_id", invite.organization_id)
              .eq("user_id", invite.invited_by)
              .maybeSingle()
          ).data?.role
        : null;
      if (!canGrantRole(inviterRole, invite.role)) {
        return {
          error: "This invitation is no longer valid. Ask the workspace owner to send a new one.",
        };
      }

      // Already on the team? The invite may only raise access, never lower
      // it, and a no-op is refused before the link is spent so it stays
      // usable (or can be cancelled) instead of being marked used for nothing.
      const { data: existing } = await supabaseAdmin
        .from("memberships")
        .select("id, role")
        .eq("organization_id", invite.organization_id)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (existing && !isRoleUpgrade(existing.role, invite.role)) {
        return {
          error: `You're already on this team as ${roleName(String(existing.role))}. This invitation would not give you more access, so it was not used.`,
        };
      }

      // Claim the invitation first, atomically: only one request can move it
      // from open to accepted, so a link opened twice at once grants one seat.
      const { data: claimed, error: claimError } = await supabaseAdmin
        .from("team_invitations")
        .update({ accepted_at: new Date().toISOString(), accepted_by: context.userId })
        .eq("id", invite.id)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .select("id")
        .maybeSingle();
      if (claimError) return { error: "Could not accept that invitation. Try again." };
      if (!claimed) return { error: "This invitation was already used." };

      // Give the invitation back so the person can try again.
      const releaseClaim = () =>
        supabaseAdmin
          .from("team_invitations")
          .update({ accepted_at: null, accepted_by: null })
          .eq("id", invite.id);

      if (existing) {
        // Raise the role only if it is still the one checked above, so a
        // concurrent role change (say, a promotion to owner) is never undone.
        const { data: raised, error } = await supabaseAdmin
          .from("memberships")
          .update({ role: invite.role })
          .eq("id", existing.id)
          .eq("role", existing.role)
          .select("id")
          .maybeSingle();
        if (error || !raised) {
          await releaseClaim();
          return { error: "Your access changed while accepting. Open the invitation again." };
        }
      } else {
        const { error } = await supabaseAdmin.from("memberships").insert({
          organization_id: invite.organization_id,
          user_id: context.userId,
          role: invite.role,
        });
        if (error) {
          await releaseClaim();
          return { error: "Could not add you to that workspace." };
        }
      }

      const { data: org } = await supabaseAdmin
        .from("organizations")
        .select("name")
        .eq("id", invite.organization_id)
        .maybeSingle();

      return {
        ok: true,
        organizationId: invite.organization_id,
        organizationName: org?.name ?? null,
      };
    },
  );

/**
 * Lists teammates for a workspace. Teammate names/emails live in `profiles`,
 * which is self-read only under RLS, so this runs server-side: it confirms the
 * caller is a member with their own (RLS-bound) client, then reads the roster
 * with the privileged client. No SECURITY DEFINER function is exposed to the
 * browser for this.
 */
export const listTeamMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => ({
    organizationId: parseWorkspaceId(input?.organizationId),
  }))
  .handler(
    async ({
      data,
      context,
    }): Promise<
      {
        id: string;
        role: string;
        created_at: string;
        user_id: string;
        profiles: { full_name: string | null; email: string | null; avatar_url: string | null };
      }[]
    > => {
      const { data: me } = await context.supabase
        .from("memberships")
        .select("id")
        .eq("organization_id", data.organizationId)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (!me) return [];

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: rows } = await supabaseAdmin
        .from("memberships")
        .select("id, role, created_at, user_id, profiles(full_name, email, avatar_url)")
        .eq("organization_id", data.organizationId)
        .order("created_at");

      type MemberRow = {
        id: string;
        role: string;
        created_at: string;
        user_id: string;
        profiles?: {
          full_name?: string | null;
          email?: string | null;
          avatar_url?: string | null;
        } | null;
      };

      return ((rows ?? []) as unknown as MemberRow[]).map((row) => ({
        id: row.id as string,
        role: String(row.role),
        created_at: row.created_at as string,
        user_id: row.user_id as string,
        profiles: {
          full_name: row.profiles?.full_name ?? null,
          email: row.profiles?.email ?? null,
          avatar_url: row.profiles?.avatar_url ?? null,
        },
      }));
    },
  );
