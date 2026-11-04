/** SPF / DKIM / DMARC health for the connected domain, with plain-language fixes. */
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MailCheck, RefreshCw } from "lucide-react";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/ui/notify";
import { friendlyError } from "@/lib/user-error";
import type { Tone } from "@/lib/domain";
import type { AuthCheck, AuthStatus } from "@/lib/email-auth/email-auth-health";
import { checkEmailAuthHealth } from "@/lib/email-auth/email-auth.functions";

const LABEL: Record<AuthCheck, { name: string; what: string }> = {
  spf: { name: "SPF", what: "Which servers may send as you" },
  dkim: { name: "DKIM", what: "A signature proving mail wasn't altered" },
  dmarc: { name: "DMARC", what: "What receivers do with mail that fails" },
};

const STATUS: Record<AuthStatus, { tone: Tone; label: string }> = {
  pass: { tone: "signal", label: "Pass" },
  warn: { tone: "attention", label: "Needs work" },
  fail: { tone: "danger", label: "Fail" },
};

export function EmailAuthHealth({
  organizationId,
  domain,
}: {
  organizationId: string | undefined;
  domain: string | null | undefined;
}) {
  const check = useServerFn(checkEmailAuthHealth);
  const run = useMutation({
    mutationFn: () => check({ data: { organizationId: organizationId ?? "" } }),
    onError: (error: Error) => toast.error(friendlyError(error)),
  });
  const report = run.data;

  return (
    <Panel>
      <SectionHeading
        eyebrow="Email deliverability"
        title="Email authentication"
        description="SPF, DKIM and DMARC decide whether your quotes and replies land in the inbox or in spam."
        action={
          <Button
            type="button"
            variant="outline"
            className="min-h-11 gap-2"
            disabled={!organizationId || !domain || run.isPending}
            onClick={() => run.mutate()}
          >
            {run.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="size-4" aria-hidden="true" />
            )}
            {report ? "Check again" : "Check now"}
          </Button>
        }
      />
      {!domain ? (
        <p className="mt-3 text-[13px] text-muted-foreground">
          Connect a domain above, then check its email setup here.
        </p>
      ) : !report ? (
        <p className="mt-3 flex items-center gap-2 text-[13px] text-muted-foreground">
          <MailCheck className="size-4" aria-hidden="true" />
          Reads public DNS for {domain}. Nothing is changed.
        </p>
      ) : (
        <div className="mt-4 space-y-3" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2.5">
            <Pill tone={STATUS[report.status].tone} dot>
              {report.domain}: {STATUS[report.status].label}
            </Pill>
          </div>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {report.results.map((result) => (
              <li key={result.check} className="space-y-1.5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[13px] font-medium text-foreground">
                      {LABEL[result.check].name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{LABEL[result.check].what}</p>
                  </div>
                  <Pill tone={STATUS[result.status].tone}>{STATUS[result.status].label}</Pill>
                </div>
                <p className="text-[13px] text-muted-foreground">{result.summary}</p>
                {result.record ? (
                  <code className="block overflow-x-auto rounded-md bg-muted/40 px-2 py-1.5 font-mono text-[11px] break-all text-muted-foreground">
                    {result.record}
                  </code>
                ) : null}
                {result.hints.length ? (
                  <ul className="list-disc space-y-1 pl-5 text-[12px] text-foreground/90">
                    {result.hints.map((hint) => (
                      <li key={hint}>{hint}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
