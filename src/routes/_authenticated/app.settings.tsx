import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/ui/notify";
import { LoadingRows, PageHead, Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { IntegrationCenter } from "@/components/app/IntegrationCenter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTeam, useUpdateOrganization } from "@/lib/queries";
import { useSession, useWorkspace } from "@/lib/use-tenant";
import { ROLES } from "@/lib/domain";
import { initials, dateShort } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { MemberControls, TeamInvites } from "@/components/app/TeamInvites";
import { PortalAccess } from "@/components/app/PortalAccess";
import { LeadNotifications } from "@/components/app/LeadNotifications";

export const Route = createFileRoute("/_authenticated/app/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Revora" },
      { name: "description", content: "Manage your account, business workspace and team." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { data: ws, isLoading } = useWorkspace();
  const org = ws?.workspace?.organization;
  const orgId = ws?.workspace?.organizationId;
  const role = ws?.workspace?.role;
  const canManage = role === "owner" || role === "admin";
  const { data: team } = useTeam(orgId);
  const updateOrg = useUpdateOrganization();

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (isLoading) return <LoadingRows rows={4} />;

  return (
    <div className="product-page">
      <PageHead
        eyebrow="Account"
        title="Settings"
        purpose="Your login, your business details and the people on your team."
      />

      <IntegrationCenter organizationId={orgId} />

      <Panel className="p-5">
        <SectionHeading eyebrow="You" title="Your account" />
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="eyebrow">Email</dt>
            <dd className="mt-1 text-[13px]">{session?.user.email}</dd>
          </div>
          <div>
            <dt className="eyebrow">Role</dt>
            <dd className="mt-1 text-[13px]">
              {ROLES.find((r) => r.value === role)?.label ?? "Member"}
            </dd>
          </div>
        </dl>
        <div className="mt-5 flex gap-2">
          <Button variant="outline" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
      </Panel>

      <Panel className="p-5">
        <SectionHeading eyebrow="Workspace" title="Business workspace" />
        <p className="mt-2 text-[13px] text-muted-foreground">
          Your workspace name and web address are used across your public site.
        </p>
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!orgId) return;
            const form = new FormData(e.currentTarget);
            updateOrg.mutate({
              id: orgId,
              patch: {
                name: String(form.get("name") ?? "").trim(),
                slug: String(form.get("slug") ?? "")
                  .trim()
                  .toLowerCase(),
              },
            });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="o-name">Business name</Label>
              <Input id="o-name" name="name" defaultValue={org?.name ?? ""} disabled={!canManage} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="o-slug">Web address</Label>
              <Input id="o-slug" name="slug" defaultValue={org?.slug ?? ""} disabled={!canManage} />
              <p className="text-[11px] text-muted-foreground">/s/{org?.slug}</p>
            </div>
          </div>
          {canManage ? (
            <Button type="submit" variant="signal" disabled={updateOrg.isPending}>
              Save workspace
            </Button>
          ) : (
            <p className="text-[12px] text-muted-foreground">
              Only owners and admins can change workspace details.
            </p>
          )}
        </form>
      </Panel>

      <Panel className="p-5">
        <SectionHeading eyebrow="People" title="Team" />
        <ul className="mt-4 divide-y divide-border">
          {(team ?? []).map((member) => {
            const profile = member.profiles as {
              full_name?: string | null;
              email?: string | null;
            } | null;
            const name = profile?.full_name || profile?.email || "Team member";
            return (
              <li key={member.id} className="flex items-center gap-3 py-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-elevated text-[11px] font-semibold">
                  {initials(name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Joined {dateShort(member.created_at)}
                  </p>
                </div>
                <Pill tone={member.role === "owner" ? "signal" : "neutral"}>
                  {ROLES.find((r) => r.value === member.role)?.label ?? member.role}
                </Pill>
                {canManage && orgId ? (
                  <MemberControls
                    membershipId={member.id}
                    organizationId={orgId}
                    role={member.role}
                    isSelf={member.user_id === session?.user.id}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
        <div className="mt-5 border-t border-border pt-5">
          <p className="eyebrow">Invite teammates</p>
          <p className="mt-1 mb-4 text-[12px] text-muted-foreground">
            Send a secure invite link by email. Invites expire after 14 days and can be cancelled
            any time.
          </p>
          <TeamInvites organizationId={orgId} canManage={canManage} />
        </div>
        <div className="mt-5 border-t border-border pt-5">
          <p className="eyebrow">Client portal access</p>
          <p className="mt-1 mb-4 text-[12px] text-muted-foreground">
            Share one link and a client signs themselves up and joins this workspace as a viewer.
          </p>
          <PortalAccess organizationId={orgId} canManage={canManage} />
        </div>
      </Panel>

      <LeadNotifications organizationId={orgId} canManage={canManage} />
    </div>
  );
}
