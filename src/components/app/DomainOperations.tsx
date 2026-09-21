/**
 * Everything that happens after a domain is connected: the secure certificate,
 * which address is canonical, moving to a new domain safely, branded email
 * forwarding, and what the change did to search visibility.
 *
 * Every status shown here comes from a live check. Nothing is reported as done
 * on the basis of a saved setting alone.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/lib/ui/notify";
import { friendlyError } from "@/lib/user-error";
import {
  ArrowRightLeft,
  CheckCircle2,
  Circle,
  Copy,
  ExternalLink,
  Loader2,
  Mail,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  completeDomainTransfer,
  monitorCertificate,
  rollbackDomainTransfer,
  runDomainSeoReport,
  saveDomainRouting,
  saveEmailForwarding,
  startDomainTransfer,
  verifyEmailForwarding,
} from "@/lib/domain-ops.functions";
import {
  COMMON_ALIASES,
  EMAIL_PROVIDERS,
  canonicalHost,
  emailForwardingRecords,
  redirectPlan,
  sslState,
  transferSteps,
  type DomainTransfer,
  type EmailForwardProvider,
  type EmailForwarding,
  type HostPreference,
} from "@/lib/domain-ops";
import { dateLong } from "@/lib/format";

type Settings = {
  custom_domain?: string | null;
  dns_ok?: boolean | null;
  ssl_ok?: boolean | null;
  domain_primary_host?: string | null;
  domain_force_https?: boolean | null;
  ssl_checked_at?: string | null;
  ssl_last_ok_at?: string | null;
  ssl_issued_at?: string | null;
  ssl_detail?: string | null;
  domain_transfer?: unknown;
  email_forwarding?: unknown;
  domain_seo_report?: unknown;
};

type SeoReport = {
  canonicalOrigin: string;
  canonicalMatches: boolean;
  checkedAt: string;
  redirects: {
    allCanonical: boolean;
    detail: string;
    results: { url: string; canonical: boolean; status: number | null }[];
  };
  crawl: {
    robots: { reachable: boolean; blocksEverything: boolean };
    sitemap: { reachable: boolean; urls: number };
    home: { reachable: boolean; canonical: string | null };
  };
  issues: { label: string; fix: string }[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Saved reports come from a JSON column, so an older or partial shape must
 * never crash the page. Anything unrecognised is treated as "no report yet".
 */
function normalizeReport(value: unknown): SeoReport | null {
  if (!isRecord(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw["canonicalOrigin"] !== "string") return null;
  const redirects = isRecord(raw["redirects"]) ? (raw["redirects"] as Record<string, unknown>) : {};
  const crawl = isRecord(raw["crawl"]) ? (raw["crawl"] as Record<string, unknown>) : {};
  const robots = isRecord(crawl["robots"]) ? (crawl["robots"] as Record<string, unknown>) : {};
  const sitemap = isRecord(crawl["sitemap"]) ? (crawl["sitemap"] as Record<string, unknown>) : {};
  const home = isRecord(crawl["home"]) ? (crawl["home"] as Record<string, unknown>) : {};
  return {
    canonicalOrigin: raw["canonicalOrigin"] as string,
    canonicalMatches: !!raw["canonicalMatches"],
    checkedAt: typeof raw["checkedAt"] === "string" ? raw["checkedAt"] : new Date().toISOString(),
    redirects: {
      allCanonical: !!redirects["allCanonical"],
      detail: typeof redirects["detail"] === "string" ? redirects["detail"] : "",
      results: (Array.isArray(redirects["results"]) ? redirects["results"] : [])
        .filter((row: unknown) => isRecord(row) && typeof row["url"] === "string")
        .map((row: Record<string, unknown>) => ({
          url: row["url"] as string,
          canonical: !!row["canonical"],
          status: typeof row["status"] === "number" ? row["status"] : null,
        })),
    },
    crawl: {
      robots: { reachable: !!robots["reachable"], blocksEverything: !!robots["blocksEverything"] },
      sitemap: { reachable: !!sitemap["reachable"], urls: Number(sitemap["urls"]) || 0 },
      home: {
        reachable: !!home["reachable"],
        canonical: typeof home["canonical"] === "string" ? home["canonical"] : null,
      },
    },
    issues: (Array.isArray(raw["issues"]) ? raw["issues"] : [])
      .filter((row: unknown) => isRecord(row) && typeof row["label"] === "string")
      .map((row: Record<string, unknown>) => ({
        label: row["label"] as string,
        fix: typeof row["fix"] === "string" ? row["fix"] : "",
      })),
  };
}

const copyValue = (value: string, label: string) =>
  void navigator.clipboard?.writeText(value).then(
    () => toast.success(`${label} copied`),
    () => toast.error("Copy failed — select the text instead."),
  );

export function DomainOperations({
  organizationId,
  settings,
  canManage,
}: {
  organizationId: string | undefined;
  settings: Settings | null | undefined;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: ["website_settings"] });

  const domain = settings?.custom_domain ?? null;
  const preference: HostPreference = settings?.domain_primary_host === "www" ? "www" : "root";
  const forceHttps = settings?.domain_force_https !== false;
  const transfer = (
    isRecord(settings?.domain_transfer) ? settings?.domain_transfer : {}
  ) as DomainTransfer;
  const forwarding = (
    isRecord(settings?.email_forwarding) ? settings?.email_forwarding : {}
  ) as EmailForwarding;
  const savedReport = normalizeReport(settings?.domain_seo_report);

  const [host, setHost] = useState<HostPreference>(preference);
  const [https, setHttps] = useState(forceHttps);
  const [newDomain, setNewDomain] = useState("");
  const [alias, setAlias] = useState(forwarding.alias ?? "contact");
  const [forwardTo, setForwardTo] = useState(forwarding.forward_to ?? "");
  const [provider, setProvider] = useState<EmailForwardProvider>(
    EMAIL_PROVIDERS.some((p) => p.id === forwarding.provider)
      ? (forwarding.provider as EmailForwardProvider)
      : "improvmx",
  );
  const [report, setReport] = useState<SeoReport | null>(savedReport);

  const saveRouting = useServerFn(saveDomainRouting);
  const monitor = useServerFn(monitorCertificate);
  const startTransfer = useServerFn(startDomainTransfer);
  const finishTransfer = useServerFn(completeDomainTransfer);
  const rollback = useServerFn(rollbackDomainTransfer);
  const saveEmail = useServerFn(saveEmailForwarding);
  const verifyEmail = useServerFn(verifyEmailForwarding);
  const runReport = useServerFn(runDomainSeoReport);

  const routingMutation = useMutation({
    mutationFn: () =>
      saveRouting({
        data: { organizationId: organizationId!, primaryHost: host, forceHttps: https },
      }),
    onSuccess: () => {
      toast.success("Address settings saved");
      refresh();
    },
    onError: (error: Error) => toast.error(friendlyError(error)),
  });

  const certMutation = useMutation({
    mutationFn: () => monitor({ data: { organizationId: organizationId! } }),
    onSuccess: (result) => {
      toast[result.sslOk ? "success" : "message"](result.detail ?? "Checked.");
      refresh();
    },
    onError: (error: Error) => toast.error(friendlyError(error)),
  });

  const startMutation = useMutation({
    mutationFn: () =>
      startTransfer({ data: { organizationId: organizationId!, toDomain: newDomain } }),
    onSuccess: () => {
      toast.success("Transfer prepared — your current address stays live.");
      refresh();
    },
    onError: (error: Error) => toast.error(friendlyError(error)),
  });

  const finishMutation = useMutation({
    mutationFn: () => finishTransfer({ data: { organizationId: organizationId! } }),
    onSuccess: (result) => {
      if (result.ok) toast.success("Cutover complete.");
      else toast.error(result.transfer.detail ?? "Cutover cancelled — nothing changed.");
      refresh();
    },
    onError: (error: Error) => toast.error(friendlyError(error)),
  });

  const rollbackMutation = useMutation({
    mutationFn: () => rollback({ data: { organizationId: organizationId! } }),
    onSuccess: () => {
      toast.success("Rolled back to your previous address.");
      refresh();
    },
    onError: (error: Error) => toast.error(friendlyError(error)),
  });

  const emailSaveMutation = useMutation({
    mutationFn: () =>
      saveEmail({ data: { organizationId: organizationId!, provider, alias, forwardTo } }),
    onSuccess: () => {
      toast.success("Saved. Add the records, then verify.");
      refresh();
    },
    onError: (error: Error) => toast.error(friendlyError(error)),
  });

  const emailVerifyMutation = useMutation({
    mutationFn: () => verifyEmail({ data: { organizationId: organizationId! } }),
    onSuccess: (result) => {
      toast[result.active ? "success" : "message"](result.detail ?? "Checked.");
      refresh();
    },
    onError: (error: Error) => toast.error(friendlyError(error)),
  });

  const reportMutation = useMutation({
    mutationFn: () => runReport({ data: { organizationId: organizationId! } }),
    onSuccess: (result) => {
      setReport(normalizeReport(result));
      toast.success("Search visibility report updated");
      refresh();
    },
    onError: (error: Error) => toast.error(friendlyError(error)),
  });

  const ssl = sslState({
    domain,
    dnsOk: !!settings?.dns_ok,
    sslOk: !!settings?.ssl_ok,
    lastOkAt: settings?.ssl_last_ok_at ?? null,
    checkedAt: settings?.ssl_checked_at ?? null,
    detail: settings?.ssl_detail ?? null,
  });
  const rules = redirectPlan(domain, host, https);
  const steps = transferSteps({
    transfer,
    dnsOk: !!settings?.dns_ok,
    sslOk: !!settings?.ssl_ok,
    live: !!settings?.dns_ok && !!settings?.ssl_ok,
  });
  const mailRecords = emailForwardingRecords(domain, provider, forwardTo);

  return (
    <div className="space-y-6">
      {/* Certificate */}
      <Panel>
        <SectionHeading
          eyebrow="Secure connection"
          title="HTTPS certificate"
          action={
            <Button
              variant="outline"
              size="sm"
              disabled={!canManage || !domain || certMutation.isPending}
              onClick={() => certMutation.mutate()}
            >
              {certMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Check now
            </Button>
          }
        />
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <ShieldCheck
            className={`size-5 ${ssl.secure ? "text-primary" : "text-muted-foreground"}`}
            aria-hidden="true"
          />
          <Pill tone={ssl.tone}>{ssl.label}</Pill>
          {settings?.ssl_last_ok_at ? (
            <span className="text-[11px] text-muted-foreground">
              Last verified {dateLong(settings.ssl_last_ok_at)}
            </span>
          ) : null}
        </div>
        <p className="mt-3 max-w-2xl text-[13px] text-muted-foreground">{ssl.detail}</p>
        <p className="mt-2 text-[12px] text-muted-foreground">
          Issuing and renewal are handled for you. Revora re-checks the certificate and notifies you
          if HTTPS ever stops answering, so an expiry can't quietly take the site down.
        </p>
      </Panel>

      {/* Canonical + redirects */}
      <Panel>
        <SectionHeading eyebrow="Web address" title="Redirects and canonical address" />
        <p className="mt-3 max-w-2xl text-[13px] text-muted-foreground">
          Pick the one address you want people and Google to see. Every other version points to it,
          so your ranking isn't split between two copies of the same site.
        </p>

        <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
          {(["root", "www"] as HostPreference[]).map((option) => {
            const label = canonicalHost(domain ?? "yourdomain.com", option);
            return (
              <button
                key={option}
                type="button"
                disabled={!canManage}
                onClick={() => setHost(option)}
                className={`rounded-md border p-3.5 text-left transition ${
                  host === option
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <p className="text-[13px] font-medium">https://{label}</p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {option === "root"
                    ? "Shorter, easier to say out loud."
                    : "Traditional, works well with some proxies."}
                </p>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-2.5">
          <Switch
            id="force-https"
            checked={https}
            disabled={!canManage}
            onCheckedChange={setHttps}
          />
          <Label htmlFor="force-https" className="text-[13px]">
            Always send visitors to the secure https version
          </Label>
        </div>

        {rules.length ? (
          <ul className="mt-4 space-y-2">
            {rules.map((rule) => (
              <li key={rule.key} className="rounded-md border border-border p-3">
                <p className="text-[13px]">
                  <span className="text-muted-foreground">{rule.from}</span> →{" "}
                  <span className="font-medium">{rule.to}</span>
                </p>
                <p className="mt-1 text-[12px] text-muted-foreground">{rule.why}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-[13px] text-muted-foreground">
            Connect your own domain to manage redirects.
          </p>
        )}

        <Button
          className="mt-4"
          variant="signal"
          disabled={!canManage || routingMutation.isPending || !organizationId}
          onClick={() => routingMutation.mutate()}
        >
          {routingMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Save address settings
        </Button>
      </Panel>

      {/* Transfer */}
      <Panel>
        <SectionHeading eyebrow="Move domain" title="Transfer to a different domain" />
        <p className="mt-3 max-w-2xl text-[13px] text-muted-foreground">
          Your live address keeps working the whole time. The switch only happens once the new
          domain has been proven to resolve here and answer over HTTPS — and you can roll back at
          any point.
        </p>

        {transfer.state && transfer.state !== "idle" ? (
          <div className="mt-4 rounded-md border border-border p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <ArrowRightLeft className="size-4 text-muted-foreground" aria-hidden="true" />
              <p className="text-[13px]">
                {transfer.from_domain ?? "no domain"} →{" "}
                <span className="font-medium">{transfer.to_domain}</span>
              </p>
              <Pill
                tone={
                  transfer.state === "completed"
                    ? "signal"
                    : transfer.state === "rolled_back"
                      ? "danger"
                      : "attention"
                }
              >
                {transfer.state.replace("_", " ")}
              </Pill>
            </div>
            {transfer.detail ? (
              <p className="mt-2 text-[12px] text-muted-foreground">{transfer.detail}</p>
            ) : null}
          </div>
        ) : null}

        <ol className="mt-4 space-y-2">
          {steps.map((step) => (
            <li key={step.key} className="flex items-start gap-2.5">
              {step.done ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              ) : (
                <Circle
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
              <div>
                <p className="text-[13px] font-medium">{step.title}</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">{step.what}</p>
              </div>
            </li>
          ))}
        </ol>

        {canManage ? (
          <div className="mt-5 space-y-3">
            <div className="flex flex-wrap items-end gap-2.5">
              <div className="min-w-[220px] flex-1">
                <Label htmlFor="new-domain">New domain</Label>
                <Input
                  id="new-domain"
                  value={newDomain}
                  onChange={(event) => setNewDomain(event.target.value)}
                  placeholder="newname.com"
                  className="mt-1.5"
                />
              </div>
              <Button
                variant="outline"
                disabled={!newDomain || startMutation.isPending}
                onClick={() => startMutation.mutate()}
              >
                {startMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Prepare transfer
              </Button>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <Button
                variant="signal"
                disabled={!transfer.to_domain || finishMutation.isPending}
                onClick={() => finishMutation.mutate()}
              >
                {finishMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Verify and cut over
              </Button>
              <Button
                variant="outline"
                disabled={!transfer.to_domain || rollbackMutation.isPending}
                onClick={() => rollbackMutation.mutate()}
              >
                {rollbackMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RotateCcw className="size-4" />
                )}
                Roll back
              </Button>
            </div>
          </div>
        ) : null}
      </Panel>

      {/* Branded email */}
      <Panel>
        <SectionHeading
          eyebrow="Branded email"
          title="Get mail at your own domain"
          action={
            forwarding.active ? (
              <Pill tone="signal">Active</Pill>
            ) : forwarding.alias ? (
              <Pill tone="attention">Not verified</Pill>
            ) : null
          }
        />
        <p className="mt-3 max-w-2xl text-[13px] text-muted-foreground">
          Set up an address like{" "}
          <span className="font-medium text-foreground">
            {alias || "contact"}@{domain ?? "yourdomain.com"}
          </span>{" "}
          that forwards straight into the inbox you already use. Nothing new to check every day.
        </p>

        {!domain ? (
          <p className="mt-4 text-[13px] text-muted-foreground">
            Connect your own domain first — branded email needs it.
          </p>
        ) : (
          <>
            <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
              {EMAIL_PROVIDERS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  disabled={!canManage}
                  onClick={() => setProvider(option.id)}
                  className={`rounded-md border p-3.5 text-left transition ${
                    provider === option.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <p className="text-[13px] font-medium">{option.name}</p>
                  <p className="mt-1 text-[12px] text-muted-foreground">{option.note}</p>
                </button>
              ))}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="alias">Address</Label>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <Input
                    id="alias"
                    value={alias}
                    onChange={(event) => setAlias(event.target.value)}
                    className="max-w-[160px]"
                  />
                  <span className="truncate text-[13px] text-muted-foreground">@{domain}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {COMMON_ALIASES.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setAlias(option)}
                      className="rounded-full border border-border px-2.5 py-1 text-[11px] hover:border-primary"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label htmlFor="forward-to">Forward mail to</Label>
                <Input
                  id="forward-to"
                  value={forwardTo}
                  onChange={(event) => setForwardTo(event.target.value)}
                  placeholder="you@gmail.com"
                  className="mt-1.5"
                />
              </div>
            </div>

            <ul className="mt-4 space-y-1.5">
              {mailRecords.map((record) => (
                <li
                  key={`${record.type}-${record.value}`}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-[12px]"
                >
                  <span className="w-10 font-medium">{record.type}</span>
                  <span className="w-10 text-muted-foreground">{record.name}</span>
                  <span className="min-w-0 flex-1 truncate">{record.value}</span>
                  {record.priority ? (
                    <span className="text-muted-foreground">priority {record.priority}</span>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Copy ${record.type} record`}
                    onClick={() => copyValue(record.value, `${record.type} record`)}
                  >
                    <Copy className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>

            {forwarding.detail ? (
              <p className="mt-3 text-[12px] text-muted-foreground">{forwarding.detail}</p>
            ) : null}

            {canManage ? (
              <div className="mt-4 flex flex-wrap gap-2.5">
                <Button
                  variant="signal"
                  disabled={emailSaveMutation.isPending}
                  onClick={() => emailSaveMutation.mutate()}
                >
                  {emailSaveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Save address
                </Button>
                <Button
                  variant="outline"
                  disabled={!forwarding.alias || emailVerifyMutation.isPending}
                  onClick={() => emailVerifyMutation.mutate()}
                >
                  {emailVerifyMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Mail className="size-4" />
                  )}
                  Verify and activate
                </Button>
                <Button asChild variant="ghost">
                  <a
                    href={
                      EMAIL_PROVIDERS.find((p) => p.id === provider)?.setupUrl ??
                      "https://improvmx.com/"
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    Create the alias <ExternalLink className="size-3.5" />
                  </a>
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Panel>

      {/* SEO impact */}
      <Panel>
        <SectionHeading
          eyebrow="Search visibility"
          title="What the domain change did to your search presence"
          action={
            <Button
              variant="outline"
              size="sm"
              disabled={!canManage || !domain || reportMutation.isPending}
              onClick={() => reportMutation.mutate()}
            >
              {reportMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              Run report
            </Button>
          }
        />
        {!report ? (
          <p className="mt-4 text-[13px] text-muted-foreground">
            {domain
              ? "Run the report to check redirects, the canonical address, robots.txt and your sitemap on your own domain."
              : "Connect your own domain to run this report."}
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            <p className="text-[13px]">
              Canonical address: <span className="font-medium">{report.canonicalOrigin}</span>
            </p>
            <ul className="space-y-1.5">
              {report.redirects.results.map((row) => (
                <li key={row.url} className="flex flex-wrap items-center gap-2 text-[12px]">
                  {row.canonical ? (
                    <CheckCircle2 className="size-3.5 text-primary" aria-hidden="true" />
                  ) : (
                    <Circle className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{row.url}</span>
                  <span className="text-muted-foreground">{row.status ?? "no response"}</span>
                </li>
              ))}
            </ul>
            <p className="text-[12px] text-muted-foreground">{report.redirects.detail}</p>
            <dl className="grid gap-3 sm:grid-cols-3">
              <Signal
                label="robots.txt"
                ok={report.crawl.robots.reachable && !report.crawl.robots.blocksEverything}
              />
              <Signal
                label={`Sitemap (${report.crawl.sitemap.urls} pages)`}
                ok={report.crawl.sitemap.reachable && report.crawl.sitemap.urls > 0}
              />
              <Signal label="Canonical tag matches" ok={report.canonicalMatches} />
            </dl>
            {report.issues.length ? (
              <ul className="space-y-2">
                {report.issues.map((issue) => (
                  <li key={issue.label} className="rounded-md border border-border p-3">
                    <p className="text-[13px] font-medium">{issue.label}</p>
                    <p className="mt-1 text-[12px] text-muted-foreground">{issue.fix}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                Redirects, crawl access and the canonical address all check out on your domain.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Checked {dateLong(report.checkedAt)}
            </p>
          </div>
        )}
      </Panel>
    </div>
  );
}

function Signal({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="rounded-md border border-border p-3">
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 flex items-center gap-1.5 text-[13px]">
        {ok ? (
          <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
        ) : (
          <Circle className="size-4 text-muted-foreground" aria-hidden="true" />
        )}
        {ok ? "Good" : "Needs attention"}
      </dd>
    </div>
  );
}
