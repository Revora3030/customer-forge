/**
 * Booking + lead email notifications.
 *
 * An owner picks the inbox that receives every booking the moment it lands,
 * sends a real test message to prove it works, and sees the honest delivery
 * history — every row is a real provider response, never an assumption.
 */
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/lib/ui/notify";
import { friendlyError } from "@/lib/user-error";
import { BellRing, CheckCircle2, Copy, KeyRound, Loader2, Mail, Send, XCircle } from "lucide-react";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import {
  getLeadWebhookStatus,
  rotateLeadWebhookSecret,
  saveLeadNotifications,
  saveLeadWebhook,
  sendTestLeadAlert,
} from "@/lib/notifications.functions";
import { dateShort } from "@/lib/format";

type Profile = {
  notification_email: string | null;
  email: string | null;
  owner_email: string | null;
  notify_on_lead: boolean | null;
};

export function LeadNotifications({
  organizationId,
  canManage,
}: {
  organizationId: string | undefined;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const saveFn = useServerFn(saveLeadNotifications);
  const testFn = useServerFn(sendTestLeadAlert);
  const saveWebhookFn = useServerFn(saveLeadWebhook);
  const webhookStatusFn = useServerFn(getLeadWebhookStatus);
  const rotateSecretFn = useServerFn(rotateLeadWebhookSecret);
  const [showSecret, setShowSecret] = React.useState(false);

  const webhookStatus = useQuery({
    queryKey: ["lead_webhook_status", organizationId],
    enabled: !!organizationId,
    queryFn: () => webhookStatusFn({ data: { organizationId: organizationId! } }),
  });

  const profile = useQuery({
    queryKey: ["notify_profile", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_profiles")
        .select("notification_email, email, owner_email, notify_on_lead")
        .eq("organization_id", organizationId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Profile | null;
    },
  });

  const log = useQuery({
    queryKey: ["lead_alert_log", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_alert_log")
        .select("id, recipient, kind, status, reason, created_at")
        .eq("organization_id", organizationId!)
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data ?? [];
    },
  });

  const fallback = profile.data?.email || profile.data?.owner_email || "";
  const [email, setEmail] = React.useState("");
  const [enabled, setEnabled] = React.useState(true);
  const [webhookUrl, setWebhookUrl] = React.useState("");
  const loadedFor = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!profile.data || loadedFor.current === organizationId) return;
    loadedFor.current = organizationId ?? null;
    setEmail(profile.data.notification_email ?? "");
    setEnabled(profile.data.notify_on_lead !== false);
  }, [profile.data, organizationId]);

  const save = useMutation({
    mutationFn: () => saveFn({ data: { organizationId: organizationId!, email, enabled } }),
    onSuccess: () => {
      toast.success("Notification inbox saved");
      void queryClient.invalidateQueries({ queryKey: ["notify_profile", organizationId] });
    },
    onError: (error: Error) => toast.error(friendlyError(error)),
  });

  const webhook = useMutation({
    mutationFn: (url: string) =>
      saveWebhookFn({ data: { organizationId: organizationId!, webhookUrl: url } }),
    onSuccess: (result: { configured: boolean }) => {
      toast.success(result.configured ? "Lead webhook saved" : "Lead webhook removed");
      setWebhookUrl("");
      void queryClient.invalidateQueries({ queryKey: ["lead_webhook_status", organizationId] });
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't save the lead webhook.")),
  });

  const rotateSecret = useMutation({
    mutationFn: () => rotateSecretFn({ data: { organizationId: organizationId! } }),
    onSuccess: () => {
      toast.success("New signing secret created. Update it in your receiver.");
      setShowSecret(true);
      void queryClient.invalidateQueries({ queryKey: ["lead_webhook_status", organizationId] });
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't rotate the signing secret.")),
  });

  const copySecret = async (secret: string) => {
    try {
      await navigator.clipboard.writeText(secret);
      toast.success("Signing secret copied");
    } catch {
      toast.error("Couldn't copy. Select the secret and copy it by hand.");
    }
  };

  const test = useMutation({
    mutationFn: () => testFn({ data: { organizationId: organizationId! } }),
    onSuccess: (result: { recipient: string }) => {
      toast.success(`Test alert sent to ${result.recipient}`);
      void queryClient.invalidateQueries({ queryKey: ["lead_alert_log", organizationId] });
    },
    onError: (error: Error) => {
      toast.error(friendlyError(error));
      void queryClient.invalidateQueries({ queryKey: ["lead_alert_log", organizationId] });
    },
  });

  const active = enabled && (email.trim() || fallback);

  return (
    <Panel className="space-y-4 p-5">
      <SectionHeading
        eyebrow="Notifications"
        title="Booking & lead email alerts"
        action={
          <Pill tone={active ? "signal" : "attention"}>
            {active ? "Alerts on" : "No inbox set"}
          </Pill>
        }
      />
      <p className="text-[13px] text-muted-foreground">
        Every booking and enquiry is saved in your dashboard. Add an inbox here and we also email it
        to you the second it arrives — with the customer's name, phone, email and requested time.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1">
          <Label htmlFor="notify-email" className="mb-1.5 block text-[12px]">
            Send booking alerts to
          </Label>
          <Input
            id="notify-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={fallback || "you@yourbusiness.com"}
            disabled={!canManage}
          />
          {!email && fallback ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Currently using <span className="font-mono">{fallback}</span> from your business
              profile.
            </p>
          ) : null}
        </div>
        <Button
          variant="signal"
          disabled={!canManage || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Mail className="size-4" />
          )}
          Save inbox
        </Button>
        <Button
          variant="outline"
          disabled={!canManage || test.isPending}
          onClick={() => test.mutate()}
        >
          {test.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
          Send test alert
        </Button>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 p-3">
        <div className="flex items-center gap-2">
          <BellRing className="size-4 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="text-[12px] font-medium">Email me every new booking and lead</p>
            <p className="text-[11px] text-muted-foreground">
              Turn off to keep them dashboard-only.
            </p>
          </div>
        </div>
        <Switch
          checked={enabled}
          disabled={!canManage}
          onCheckedChange={(value) => {
            setEnabled(value);
            if (canManage) save.mutate();
          }}
          aria-label="Email me every new booking and lead"
        />
      </div>

      <div className="border-t border-border/60 pt-4">
        <Label htmlFor="lead-webhook" className="mb-1.5 block text-[12px]">
          Lead webhook (optional)
        </Label>
        <div className="flex flex-wrap items-end gap-2">
          <Input
            id="lead-webhook"
            type="url"
            value={webhookUrl}
            onChange={(event) => setWebhookUrl(event.target.value)}
            placeholder="https://hooks.zapier.com/..."
            autoComplete="off"
            disabled={!canManage || webhook.isPending}
            className="min-w-64 flex-1"
          />
          <Button
            variant="outline"
            disabled={!canManage || webhook.isPending || !webhookUrl.trim()}
            onClick={() => webhook.mutate(webhookUrl)}
          >
            {webhook.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {webhookStatus.data?.configured ? "Replace webhook" : "Save webhook"}
          </Button>
          {webhookStatus.data?.configured ? (
            <Button
              variant="ghost"
              disabled={!canManage || webhook.isPending}
              onClick={() => webhook.mutate("")}
            >
              Remove
            </Button>
          ) : null}
        </div>
        {webhookStatus.data?.configured ? (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Connected to{" "}
            <span className="font-mono">{webhookStatus.data.host ?? "your saved URL"}</span>.
          </p>
        ) : null}
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          After a lead is saved, Revora sends a standard POST event to this URL. A slow or failed
          webhook never blocks the visitor's submission.
        </p>
        {webhookStatus.data?.configured && webhookStatus.data.signingSecret ? (
          <div className="mt-3 rounded-lg border border-border/60 p-3">
            <p className="flex items-center gap-1.5 text-[12px] font-medium">
              <KeyRound className="size-3.5" aria-hidden /> Signing secret
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-[11px]">
                {showSecret ? webhookStatus.data.signingSecret : "whsec_••••••••••••••••"}
              </code>
              <Button variant="ghost" size="sm" onClick={() => setShowSecret((v) => !v)}>
                {showSecret ? "Hide" : "Reveal"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void copySecret(webhookStatus.data!.signingSecret!)}
                aria-label="Copy signing secret"
              >
                <Copy className="size-3.5" aria-hidden />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!canManage || rotateSecret.isPending}
                onClick={() => rotateSecret.mutate()}
              >
                {rotateSecret.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Rotate
              </Button>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Every delivery carries an <span className="font-mono">x-revora-signature</span> header:{" "}
              <span className="font-mono">t=&lt;unix time&gt;,v1=&lt;hex&gt;</span>, where v1 is
              HMAC-SHA256 of <span className="font-mono">t.body</span> with this secret. Reject
              requests whose signature doesn't match or whose time is more than five minutes old.
            </p>
          </div>
        ) : null}
      </div>

      <div>
        <p className="eyebrow">Recent deliveries</p>
        {log.data?.length ? (
          <ul className="mt-2 space-y-1.5">
            {log.data.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2 text-[12px]"
              >
                <span className="flex items-center gap-1.5">
                  {row.status === "sent" ? (
                    <CheckCircle2 className="size-3.5 text-primary" aria-hidden="true" />
                  ) : (
                    <XCircle className="size-3.5 text-destructive" aria-hidden="true" />
                  )}
                  <span className="font-mono">{row.recipient}</span>
                </span>
                <span className="text-muted-foreground">
                  {row.kind} · {row.status === "sent" ? "delivered" : (row.reason ?? "failed")} ·{" "}
                  {dateShort(row.created_at)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[12px] text-muted-foreground">
            No alerts sent yet. Send a test to confirm delivery before your first real booking.
          </p>
        )}
      </div>
    </Panel>
  );
}
