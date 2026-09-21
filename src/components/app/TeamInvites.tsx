import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/lib/ui/notify";
import { friendlyError } from "@/lib/user-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pill } from "@/components/app/Bits";
import { supabase } from "@/integrations/supabase/client";
import { dateShort } from "@/lib/format";
import { ROLES } from "@/lib/domain";
import {
  INVITABLE_ROLES,
  createTeamInvitation,
  revokeTeamInvitation,
  type InvitableRole,
} from "@/lib/team.functions";

type Invitation = {
  id: string;
  email: string;
  role: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

const roleLabel = (role: string) => ROLES.find((r) => r.value === role)?.label ?? role;

function useInvitations(organizationId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["team_invitations", organizationId],
    enabled: !!organizationId && enabled,
    queryFn: async (): Promise<Invitation[]> => {
      const { data, error } = await supabase
        .from("team_invitations")
        .select("id, email, role, created_at, expires_at, accepted_at, revoked_at")
        .eq("organization_id", organizationId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Invitation[];
    },
  });
}

/** Owner/admin controls for one existing member: change role or remove access. */
export function MemberControls({
  membershipId,
  organizationId,
  role,
  isSelf,
}: {
  membershipId: string;
  organizationId: string;
  role: string;
  isSelf: boolean;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = React.useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["team", organizationId] });

  if (role === "owner" || isSelf) return null;

  async function changeRole(next: string) {
    setBusy(true);
    const { error } = await supabase
      .from("memberships")
      .update({ role: next as InvitableRole })
      .eq("id", membershipId);
    setBusy(false);
    if (error) {
      toast.error("Could not change that role");
      return;
    }
    toast.success(`Access set to ${roleLabel(next)}`);
    refresh();
  }

  async function remove() {
    setBusy(true);
    const { error } = await supabase.from("memberships").delete().eq("id", membershipId);
    setBusy(false);
    if (error) {
      toast.error("Could not remove that teammate");
      return;
    }
    toast.success("Teammate removed");
    refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={role} onValueChange={changeRole} disabled={busy}>
        <SelectTrigger className="h-8 w-[130px] text-[12px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {INVITABLE_ROLES.map((value) => (
            <SelectItem key={value} value={value}>
              {roleLabel(value)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="ghost" size="sm" onClick={remove} disabled={busy}>
        Remove
      </Button>
    </div>
  );
}

/** Invite form plus the pending / recent invitation list. */
export function TeamInvites({
  organizationId,
  canManage,
}: {
  organizationId: string | undefined;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const invite = useServerFn(createTeamInvitation);
  const revoke = useServerFn(revokeTeamInvitation);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<InvitableRole>("staff");
  const { data: invitations } = useInvitations(organizationId, canManage);

  const sendInvite = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("Pick a workspace first");
      const result = await invite({
        data: { organizationId, email, role, appUrl: window.location.origin },
      });
      if ("error" in result) throw new Error(result.error);
      return result;
    },
    onSuccess: (result) => {
      setEmail("");
      toast.success(`Invite sent to ${result.email}`, {
        description: result.emailed
          ? "They have 14 days to accept and join this workspace."
          : "Their email provider blocked delivery — resend or share the link directly.",
      });
      queryClient.invalidateQueries({ queryKey: ["team_invitations", organizationId] });
    },
    onError: (error: Error) => toast.error(friendlyError(error)),
  });

  const cancelInvite = useMutation({
    mutationFn: async (invitationId: string) => {
      if (!organizationId) throw new Error("Pick a workspace first");
      const result = await revoke({ data: { organizationId, invitationId } });
      if ("error" in result) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      toast.success("Invite cancelled");
      queryClient.invalidateQueries({ queryKey: ["team_invitations", organizationId] });
    },
    onError: (error: Error) => toast.error(friendlyError(error)),
  });

  if (!canManage) {
    return (
      <p className="text-[12px] text-muted-foreground">
        Only owners and admins can invite teammates or change access.
      </p>
    );
  }

  const pending = (invitations ?? []).filter((i) => !i.accepted_at && !i.revoked_at);
  const history = (invitations ?? []).filter((i) => i.accepted_at || i.revoked_at).slice(0, 5);

  return (
    <div className="space-y-4">
      <form
        className="grid gap-3 sm:grid-cols-[1fr_150px_auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          sendInvite.mutate();
        }}
      >
        <div>
          <Label htmlFor="invite-email">Teammate email</Label>
          <Input
            id="invite-email"
            type="email"
            autoComplete="email"
            placeholder="name@business.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="invite-role">Access</Label>
          <Select value={role} onValueChange={(value) => setRole(value as InvitableRole)}>
            <SelectTrigger id="invite-role" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INVITABLE_ROLES.map((value) => (
                <SelectItem key={value} value={value}>
                  {roleLabel(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={sendInvite.isPending}>
          {sendInvite.isPending ? "Sending…" : "Send invite"}
        </Button>
      </form>
      <p className="text-[12px] text-muted-foreground">
        {ROLES.find((r) => r.value === role)?.description}
      </p>

      {pending.length ? (
        <div className="rounded-lg border border-border">
          <p className="border-b border-border px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            Pending invites
          </p>
          <ul className="divide-y divide-border">
            {pending.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{item.email}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {roleLabel(item.role)} · expires {dateShort(item.expires_at)}
                  </p>
                </div>
                <Pill tone="neutral">Invited</Pill>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={cancelInvite.isPending}
                  onClick={() => cancelInvite.mutate(item.id)}
                >
                  Cancel
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {history.length ? (
        <ul className="space-y-1 text-[11px] text-muted-foreground">
          {history.map((item) => (
            <li key={item.id}>
              {item.email} — {item.accepted_at ? "joined" : "cancelled"}{" "}
              {dateShort(item.accepted_at ?? item.revoked_at ?? item.created_at)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
