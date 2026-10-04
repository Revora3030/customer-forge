import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSupportMode } from "@/lib/support-mode";
import type { AppRole } from "@/lib/domain";

export type Session = Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"];

export function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: async () => (await supabase.auth.getSession()).data.session,
    staleTime: 30_000,
  });
}

export type Workspace = {
  organizationId: string;
  role: AppRole;
  organization: {
    id: string;
    name: string;
    slug: string;
    industry: string | null;
    plan_id: string | null;
    subscription_status: string;
    trial_ends_at: string | null;
    created_at?: string | null;
    onboarding_completed: boolean;
    onboarding_step: number;
    is_demo: boolean;
    is_suspended: boolean;
    conversion_goal: string | null;
    setup_paid_at: string | null;
  };
};

const ORG_FIELDS =
  "id, name, slug, industry, plan_id, subscription_status, trial_ends_at, created_at, onboarding_completed, onboarding_step, is_demo, is_suspended, conversion_goal, setup_paid_at";

/** Current user's workspace (or the client workspace being supported) plus platform-admin flag. */
export function useWorkspace() {
  const { mode } = useSupportMode();
  const supportOrgId = mode?.organizationId ?? null;

  return useQuery({
    queryKey: ["workspace", supportOrgId],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) return { user: null, workspace: null, isSuperAdmin: false, supporting: false };

      const [{ data: memberships, error: membershipError }, { data: roles }] = await Promise.all([
        supabase
          .from("memberships")
          .select(`organization_id, role, organizations(${ORG_FIELDS})`)
          .eq("user_id", user.id)
          .order("created_at", { ascending: true }),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
      ]);

      // A failed lookup is not "no workspace": treating it as one sent signed-in
      // owners back to onboarding. Fail with a real Error so the query retries.
      if (membershipError) {
        throw new Error(`Failed to load workspace: ${membershipError.message || "unknown error"}`);
      }

      const isSuperAdmin = (roles ?? []).some((r) => r.role === "super_admin");

      if (supportOrgId && isSuperAdmin) {
        const { data: org } = await supabase
          .from("organizations")
          .select(ORG_FIELDS)
          .eq("id", supportOrgId)
          .maybeSingle();
        if (org) {
          return {
            user,
            workspace: {
              organizationId: supportOrgId,
              role: "admin" as AppRole,
              organization: org as Workspace["organization"],
            },
            isSuperAdmin,
            supporting: true,
          };
        }
      }

      const first = memberships?.find((m) => m.organizations);
      const workspace: Workspace | null = first?.organizations
        ? {
            organizationId: first.organization_id,
            role: first.role,
            organization: first.organizations as Workspace["organization"],
          }
        : null;

      return { user, workspace, isSuperAdmin, supporting: false };
    },
    staleTime: 15_000,
  });
}

export const canManage = (role: AppRole | undefined) =>
  role === "owner" || role === "admin" || role === "manager";

export const canEdit = (role: AppRole | undefined) => role !== "viewer" && role !== undefined;

export function useSignOut() {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
  }, [queryClient]);
}
