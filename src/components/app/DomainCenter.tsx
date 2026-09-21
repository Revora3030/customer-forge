import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/lib/ui/notify";
import { friendlyError } from "@/lib/user-error";
import {
  CheckCircle2,
  Circle,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recheckDomain, saveOwnDomain } from "@/lib/domain.functions";
import {
  DNS_HELP,
  DOMAIN_FAQ,
  DOMAIN_STEPS,
  REGISTRAR_GUIDES,
  REGISTRARS,
  dnsRows,
  domainSuggestions,
  looksLikeDomain,
  normalizeInput,
} from "@/lib/domain-setup";
import { DOMAIN_STATES } from "@/lib/readiness";
import { clientSitePath } from "@/lib/revora-address";
import { dateLong } from "@/lib/format";

function copy(value: string, label: string) {
  void navigator.clipboard?.writeText(value).then(
    () => toast.success(`${label} copied`),
    () => toast.error("Copy failed — select the text instead."),
  );
}

/**
 * Self-serve domain center. An owner can find and buy a name, or connect one
 * they already own, and see verified DNS/HTTPS status the whole way. Status is
 * only ever reported from a real check — nothing shows as live early.
 */
export function DomainCenter({
  organizationId,
  slug,
  businessName,
  city,
  industry,
  settings,
  canManage,
}: {
  organizationId: string | undefined;
  slug: string | undefined;
  businessName: string | null | undefined;
  city: string | null | undefined;
  industry: string | null | undefined;
  settings:
    | {
        custom_domain?: string | null;
        domain_status?: string | null;
        domain_error?: string | null;
        domain_checked_at?: string | null;
        dns_ok?: boolean | null;
        ssl_ok?: boolean | null;
        publish_state?: string | null;
      }
    | null
    | undefined;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const saveFn = useServerFn(saveOwnDomain);
  const recheckFn = useServerFn(recheckDomain);

  const connected = settings?.custom_domain ?? "";
  const [input, setInput] = useState(connected);
  const [idea, setIdea] = useState("");

  const [registrar, setRegistrar] = useState("godaddy");
  const [lastCheck, setLastCheck] = useState<{
    dnsOk: boolean;
    sslOk: boolean;
    detail: string;
    seen: string[];
    expected: string;
  } | null>(null);

  // While a client's own domain is being verified, the address that always
  // works is the platform path — no DNS, no certificate, nothing to buy.
  const previewPath = clientSitePath(slug ?? null);

  const status = settings?.domain_status ?? "not_connected";
  const dnsOk = !!settings?.dns_ok;
  const sslOk = !!settings?.ssl_ok;
  const published = settings?.publish_state === "published";

  const suggestions = useMemo(
    () => domainSuggestions({ businessName, city, industry, slug }).slice(0, 8),
    [businessName, city, industry, slug],
  );

  const save = useMutation({
    mutationFn: (value: string) =>
      saveFn({ data: { organizationId: organizationId!, domain: value } }),
    onSuccess: (result) => {
      toast.message(DOMAIN_STATES[result.status]?.label ?? result.status, {
        description: result.detail,
      });
      void queryClient.invalidateQueries({ queryKey: ["website_settings", organizationId] });
    },
    onError: (error: Error) => toast.error(friendlyError(error)),
  });

  const recheck = useMutation({
    mutationFn: () => recheckFn({ data: { organizationId: organizationId! } }),
    onSuccess: (result) => {
      setLastCheck({
        dnsOk: result.dnsOk,
        sslOk: result.sslOk,
        detail: result.detail,
        seen: result.seen,
        expected: result.expected,
      });
      toast.message(result.live ? "Domain verified" : "Not verified yet", {
        description: result.detail,
      });
      void queryClient.invalidateQueries({ queryKey: ["website_settings", organizationId] });
    },
    onError: (error: Error) => toast.error(friendlyError(error)),
  });

  const stepDone: Record<string, boolean> = {
    choose: !!connected,
    connect: !!connected,
    dns: dnsOk,
    verify: dnsOk && sslOk,
    live: dnsOk && sslOk && published,
  };

  const rows = dnsRows(connected);

  return (
    <div className="space-y-6">
      {/* YOUR OWN DOMAIN — the client's permanent public website address */}
      <Panel className="space-y-4 p-5">
        <SectionHeading
          eyebrow="Your website address"
          title={connected || "No domain connected yet"}
          action={
            <Pill tone={DOMAIN_STATES[status]?.tone ?? "neutral"}>
              {DOMAIN_STATES[status]?.label ?? status}
            </Pill>
          }
        />
        <p className="text-[13px] text-muted-foreground">{DOMAIN_STATES[status]?.help}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
            <p className="text-[12px] font-medium">Preview address (while you build)</p>
            <p className="mt-1 font-mono text-[12px] text-muted-foreground">
              {previewPath ?? "Created with your website"}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Use this to review and share your site before your domain is connected. Your own
              domain becomes the public address as soon as it is verified.
            </p>
          </div>
          <div className="rounded-md border border-border/60 p-3">
            <p className="text-[12px] font-medium">Your own domain (public website)</p>
            <p className="mt-1 font-mono text-[12px] text-muted-foreground">
              {connected || "Not connected yet"}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {connected && dnsOk && sslOk
                ? "Verified and live with HTTPS."
                : "It only goes live after DNS and HTTPS both pass — until then use your Revora share link."}
            </p>
          </div>
        </div>
        <ol className="grid gap-2 sm:grid-cols-5">
          {DOMAIN_STEPS.map((step, index) => (
            <li key={step.id} className="rounded-md border border-border/60 p-3">
              <div className="flex items-center gap-1.5">
                {stepDone[step.id] ? (
                  <CheckCircle2 className="size-3.5 text-primary" aria-hidden="true" />
                ) : (
                  <Circle className="size-3.5 text-muted-foreground" aria-hidden="true" />
                )}
                <span className="text-[11px] font-medium">
                  {index + 1}. {step.title}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{step.detail}</p>
            </li>
          ))}
        </ol>
      </Panel>

      {/* Buy a domain at a registrar */}
      <Panel className="space-y-4 p-5">
        <SectionHeading eyebrow="Buy a domain" title="Register your own domain name" />
        <p className="text-[13px] text-muted-foreground">
          You buy your domain directly from a registrar — that keeps you the owner of it. Type the
          name you want, open any registrar below to check the price and register it, then come back
          and connect it in the next step.
        </p>
        <div className="min-w-56">
          <Label className="mb-1.5 block text-[12px]">Domain name you want</Label>
          <Input
            value={idea}
            onChange={(event) => setIdea(event.target.value)}
            placeholder={businessName ? `${businessName} .com` : "e.g. elitemobiledetailing.com"}
          />
        </div>

        {suggestions.length ? (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                className="cursor-pointer rounded-full border border-border px-2.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-elevated"
                onClick={() => setIdea(s)}
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
          {REGISTRARS.map((r) => (
            <div key={r.id} className="rounded-md border border-border/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] font-medium">{r.name}</p>
                <Button size="sm" variant="outline" asChild>
                  <a
                    href={r.search(normalizeInput(idea) || suggestions[0] || "")}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Buy here <ExternalLink className="size-3.5" />
                  </a>
                </Button>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{r.note}</p>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-muted-foreground">
          The registrar's checkout shows the real price and whether the name is still available.
          Once you own it, connect it below — nothing else to buy, HTTPS is included.
        </p>
        <Button variant="ghost" size="sm" asChild className="w-fit">
          <a href="#connect-own-domain">I already own a domain — connect it</a>
        </Button>
      </Panel>

      {/* Connect a domain you own */}
      <Panel id="connect-own-domain" className="scroll-mt-24 space-y-4 p-5">
        <SectionHeading eyebrow="Connect a domain" title="Use a domain you already own" />
        <p className="text-[13px] text-muted-foreground">
          Save it here first. We keep checking your DNS in the background and only report it live
          once the records resolve here and HTTPS is working.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-56 flex-1">
            <Label className="mb-1.5 block text-[12px]">Your domain</Label>
            <Input
              value={input}
              onChange={(event) => setInput(normalizeInput(event.target.value))}
              placeholder="yourbusiness.com"
              disabled={!canManage}
            />
          </div>
          <Button
            variant="signal"
            disabled={!canManage || save.isPending || (!!input && !looksLikeDomain(input))}
            onClick={() => save.mutate(input)}
          >
            {save.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ShieldCheck className="size-4" />
            )}
            Save & check
          </Button>
          {connected ? (
            <Button
              variant="outline"
              disabled={!canManage || save.isPending}
              onClick={() => save.mutate(connected)}
            >
              <RefreshCw className="size-4" /> Re-check now
            </Button>
          ) : null}
          {connected ? (
            <Button
              variant="ghost"
              disabled={!canManage || save.isPending}
              onClick={() => {
                setInput("");
                save.mutate("");
              }}
            >
              Remove domain
            </Button>
          ) : null}
        </div>
        {input && !looksLikeDomain(input) ? (
          <p className="text-[12px] text-destructive">
            Enter a bare domain like <span className="font-mono">yourbusiness.com</span> — no
            https:// and no trailing slash.
          </p>
        ) : null}
      </Panel>

      {/* STEP-BY-STEP GUIDE — written for an owner who has never touched DNS */}
      <Panel className="space-y-4 p-5">
        <SectionHeading
          eyebrow="Step-by-step guide"
          title="How to point your domain at your website"
          action={
            <Pill tone={dnsOk && sslOk ? "signal" : connected ? "attention" : "neutral"}>
              {dnsOk && sslOk ? "Verified" : connected ? "Waiting on DNS" : "Not started"}
            </Pill>
          }
        />
        <ol className="space-y-2 text-[13px]">
          {[
            "Save your domain in Revora (the box above). Nothing goes offline when you do this.",
            "Open your registrar — the company you bought the domain from — and find its DNS screen.",
            "Add the two A records shown below, exactly as written.",
            "Come back here and press Check now. We look up your domain live and tell you the truth.",
            "Once DNS and HTTPS both pass, publish (or re-publish) and your domain serves your site.",
          ].map((step, index) => (
            <li key={index} className="flex gap-2">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
                {index + 1}
              </span>
              <span className="text-muted-foreground">{step}</span>
            </li>
          ))}
        </ol>

        <div>
          <p className="eyebrow mb-2">Instructions for your registrar</p>
          <div className="flex flex-wrap gap-1.5">
            {REGISTRAR_GUIDES.map((guide) => (
              <button
                key={guide.id}
                type="button"
                aria-pressed={registrar === guide.id}
                onClick={() => setRegistrar(guide.id)}
                className={`cursor-pointer rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                  registrar === guide.id
                    ? "border-primary/60 bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-elevated"
                }`}
              >
                {guide.name}
              </button>
            ))}
          </div>
          <ol className="mt-3 space-y-1.5">
            {(REGISTRAR_GUIDES.find((g) => g.id === registrar) ?? REGISTRAR_GUIDES[0])!.steps.map(
              (step, index) => (
                <li key={index} className="text-[12px] text-muted-foreground">
                  <span className="font-medium text-foreground">{index + 1}.</span> {step}
                </li>
              ),
            )}
          </ol>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {DOMAIN_FAQ.map((item) => (
            <div key={item.q} className="rounded-md border border-border/60 p-3">
              <p className="text-[12px] font-medium">{item.q}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{item.a}</p>
            </div>
          ))}
        </div>
      </Panel>

      {/* DNS records + verified status */}

      {connected ? (
        <Panel className="space-y-4 p-5">
          <SectionHeading
            eyebrow="Step 3"
            title="Add these two records at your registrar"
            action={
              <div className="flex items-center gap-2">
                <Pill tone={dnsOk ? "signal" : "attention"}>
                  {dnsOk ? "DNS resolving here" : "Waiting on DNS"}
                </Pill>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={recheck.isPending}
                  onClick={() => recheck.mutate()}
                >
                  {recheck.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                  Check now
                </Button>
              </div>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-[12px]">
              <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3">Type</th>
                  <th className="py-1.5 pr-3">Name / host</th>
                  <th className="py-1.5 pr-3">Value</th>
                  <th className="py-1.5 pr-3">TTL</th>
                  <th className="py-1.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.type}-${row.name}`} className="border-t border-border/60">
                    <td className="py-2 pr-3 font-mono">{row.type}</td>
                    <td className="py-2 pr-3 font-mono">{row.name}</td>
                    <td className="py-2 pr-3 font-mono">{row.value}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{row.ttl}</td>
                    <td className="py-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copy(row.value, "Record value")}
                      >
                        <Copy className="size-3.5" /> Copy
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {DNS_HELP.map((help) => (
              <li key={help.registrar} className="text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">{help.registrar}:</span> {help.where}
              </li>
            ))}
          </ul>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-md border border-border/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] font-medium">DNS check</p>
                <Pill tone={dnsOk ? "signal" : "attention"}>
                  {dnsOk ? "Resolving here" : "Not pointing here"}
                </Pill>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Changes usually appear within an hour, but registrars can take up to 48 hours.
              </p>
            </div>
            <div className="rounded-md border border-border/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] font-medium">Secure certificate (HTTPS)</p>
                <Pill tone={sslOk ? "signal" : dnsOk ? "info" : "neutral"}>
                  {sslOk ? "HTTPS active" : dnsOk ? "Being issued" : "Waiting on DNS"}
                </Pill>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Issued automatically once DNS resolves here. No configuration needed from you.
              </p>
            </div>
          </div>

          {settings?.domain_error ? (
            <p className="text-[12px] text-destructive">{settings.domain_error}</p>
          ) : null}
          {!published && dnsOk && sslOk ? (
            <p className="text-[12px] text-accent">
              Your domain is ready. Publish your website and it will serve at {connected}.
            </p>
          ) : null}
          {lastCheck ? (
            <div className="rounded-md border border-border/60 p-3">
              <p className="text-[12px] font-medium">Live lookup result</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{lastCheck.detail}</p>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                expected {lastCheck.expected} · found{" "}
                {lastCheck.seen.length ? lastCheck.seen.join(", ") : "nothing yet"}
              </p>
            </div>
          ) : null}
          {settings?.domain_checked_at ? (
            <p className="text-[11px] text-muted-foreground">
              Last checked {dateLong(settings.domain_checked_at)}
            </p>
          ) : null}
          {connected && dnsOk && sslOk && published ? (
            <Button variant="outline" asChild>
              <a href={`https://${connected}`} target="_blank" rel="noreferrer noopener">
                Visit {connected} <ExternalLink className="size-4" />
              </a>
            </Button>
          ) : null}
        </Panel>
      ) : null}
    </div>
  );
}
