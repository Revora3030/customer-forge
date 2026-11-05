import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Copy, Loader2, Send, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/ui/notify";
import { friendlyError } from "@/lib/user-error";
import { sendTestLeadWebhook } from "@/lib/notifications.functions";
import {
  sampleLeadWebhookBody,
  WEBHOOK_PRESETS,
  webhookTestFailureText,
  type WebhookPresetId,
} from "@/lib/webhook-presets";

/**
 * B13-8: setup steps for Zapier, Make and HighLevel, the sample body, and a
 * "Send test webhook" that is clearly marked as a test and never counted.
 */
export function WebhookPresets({
  organizationId,
  configured,
  canManage,
}: {
  organizationId: string | undefined;
  configured: boolean;
  canManage: boolean;
}) {
  const [active, setActive] = React.useState<WebhookPresetId>("zapier");
  const preset = WEBHOOK_PRESETS.find((p) => p.id === active) ?? WEBHOOK_PRESETS[0]!;
  const sample = React.useMemo(
    () =>
      JSON.stringify(
        sampleLeadWebhookBody(organizationId ?? "your-workspace-id", new Date(0)),
        null,
        2,
      ),
    [organizationId],
  );
  const testFn = useServerFn(sendTestLeadWebhook);
  const test = useMutation({
    mutationFn: () => testFn({ data: { organizationId: organizationId! } }),
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't send the test webhook.")),
  });

  const copySample = async () => {
    try {
      await navigator.clipboard.writeText(sample);
      toast.success("Sample body copied");
    } catch {
      toast.error("Couldn't copy. Select the sample and copy it by hand.");
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-border/60 p-3">
      <p className="text-[12px] font-medium">Connect your own Zapier, Make or HighLevel</p>
      <div className="mt-2 flex flex-wrap gap-1.5" role="tablist" aria-label="Webhook setup guides">
        {WEBHOOK_PRESETS.map((p) => (
          <Button
            key={p.id}
            role="tab"
            aria-selected={p.id === active}
            variant={p.id === active ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActive(p.id)}
          >
            {p.name}
          </Button>
        ))}
      </div>
      <div role="tabpanel" aria-label={`${preset.name} setup`} className="mt-2">
        <ol className="list-decimal space-y-1 pl-5 text-[12px] text-muted-foreground">
          {preset.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          URL usually starts with <span className="font-mono">{preset.urlHint}</span>. {preset.note}
        </p>
        <p className="mt-2 text-[11px] font-medium">Fields to map</p>
        <ul className="mt-1 grid grid-cols-1 gap-x-4 text-[11px] text-muted-foreground sm:grid-cols-2">
          {preset.mapping.map((m) => (
            <li key={m.path}>
              {m.field}: <span className="font-mono">{m.path}</span>
            </li>
          ))}
        </ul>
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] font-medium">
          Sample body (what a test sends)
        </summary>
        <pre className="mt-1.5 max-h-56 overflow-auto rounded bg-muted p-2 font-mono text-[10.5px] leading-snug">
          {sample}
        </pre>
        <Button variant="ghost" size="sm" onClick={() => void copySample()}>
          <Copy className="size-3.5" aria-hidden /> Copy sample
        </Button>
      </details>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!configured || !canManage || !organizationId || test.isPending}
          onClick={() => test.mutate()}
        >
          {test.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Send className="size-3.5" aria-hidden />
          )}
          Send test webhook
        </Button>
        {!configured ? (
          <span className="text-[11px] text-muted-foreground">Save a webhook URL first.</span>
        ) : test.data ? (
          <span className="flex items-center gap-1 text-[11px]" role="status">
            {test.data.ok ? (
              <>
                <CheckCircle2 className="size-3.5 text-primary" aria-hidden /> Test delivered. It is
                marked
                <span className="font-mono">test: true</span> and is not counted as a lead.
              </>
            ) : (
              <>
                <XCircle className="size-3.5 text-destructive" aria-hidden />{" "}
                {webhookTestFailureText(test.data.reason, test.data.statusCode)}
              </>
            )}
          </span>
        ) : null}
      </div>
    </div>
  );
}
