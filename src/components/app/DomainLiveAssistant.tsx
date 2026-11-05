import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw } from "lucide-react";
import { Pill } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { recheckDomain } from "@/lib/domain.functions";
import { lookupDnsHost } from "@/lib/domain-ops.functions";
import {
  CANT_TELL_MESSAGE,
  DNS_LIVE_STATES,
  mapDnsLiveState,
  nextPollDelayMs,
  pollStopReason,
  shouldPollNow,
  type DnsLiveState,
  type PollStopReason,
} from "@/lib/dns-assistant";
import { REGISTRAR_GUIDES } from "@/lib/domain-setup";

type Settings = {
  domain_status?: string | null;
  dns_ok?: boolean | null;
  ssl_ok?: boolean | null;
  domain_records?: unknown;
} | null;

const STATE_ORDER: DnsLiveState[] = ["waiting_dns", "dns_found", "certificate_pending", "live"];

/**
 * B12-11 DNS assistant: says where the domain's DNS appears to be hosted (or
 * that we can't tell), and keeps the live check running while the tab is
 * visible. The state shown comes only from the real recheck result saved on
 * the workspace.
 */
export function DomainLiveAssistant({
  organizationId,
  domain,
  settings,
  onDetected,
}: {
  organizationId: string | undefined;
  domain: string;
  settings: Settings | undefined;
  /** Called with the REGISTRAR_GUIDES id when the DNS host is recognised. */
  onDetected: (guideId: string) => void;
}) {
  const queryClient = useQueryClient();
  const recheckFn = useServerFn(recheckDomain);
  const lookupFn = useServerFn(lookupDnsHost);

  const host = useQuery({
    queryKey: ["dns_host", organizationId, domain],
    enabled: !!organizationId && !!domain,
    queryFn: () => lookupFn({ data: { organizationId: organizationId! } }),
    staleTime: 10 * 60_000,
    retry: false,
  });
  const detection = host.data?.detection ?? null;
  const detectedId = detection?.state === "detected" ? detection.guideId : null;
  useEffect(() => {
    if (detectedId) onDetected(detectedId);
  }, [detectedId, onDetected]);

  const state = mapDnsLiveState(
    settings
      ? {
          status: settings.domain_status,
          dnsOk: settings.dns_ok,
          sslOk: settings.ssl_ok,
          records: settings.domain_records,
        }
      : null,
  );

  // --- polling: 10 s, only while the tab is visible, backing off, capped ---
  const [visible, setVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState === "visible",
  );
  const [attempts, setAttempts] = useState(0);
  const [errors, setErrors] = useState(0);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  // A different domain starts a fresh polling budget.
  useEffect(() => {
    setAttempts(0);
    setErrors(0);
  }, [domain]);

  const ctx = {
    tabVisible: visible,
    state,
    attempts,
    consecutiveErrors: errors,
    domainConnected: !!domain && !!organizationId,
  };
  const stopped: PollStopReason | null = pollStopReason(ctx);
  const polling = shouldPollNow(ctx);

  const runCheck = useCallback(async () => {
    if (!organizationId || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await recheckFn({ data: { organizationId } });
      setErrors(0);
      await queryClient.invalidateQueries({ queryKey: ["website_settings", organizationId] });
    } catch {
      setErrors((n) => n + 1);
    } finally {
      setAttempts((n) => n + 1);
      inFlight.current = false;
      setBusy(false);
    }
  }, [organizationId, queryClient, recheckFn]);

  useEffect(() => {
    if (!polling) return;
    const timer = setTimeout(() => void runCheck(), nextPollDelayMs(attempts, errors));
    return () => clearTimeout(timer);
  }, [polling, attempts, errors, runCheck]);

  const restart = () => {
    setAttempts(0);
    setErrors(0);
    void runCheck();
  };

  const guide = detectedId ? REGISTRAR_GUIDES.find((g) => g.id === detectedId) : null;
  const stateInfo = state ? DNS_LIVE_STATES[state] : null;

  return (
    <div className="space-y-3 rounded-md border border-border/60 p-3" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-medium">Live status</p>
        <div className="flex items-center gap-2">
          {stateInfo ? <Pill tone={stateInfo.tone}>{stateInfo.label}</Pill> : <Pill tone="neutral">Not checked yet</Pill>}
          <Button size="sm" variant="outline" disabled={busy} onClick={restart}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            Check again
          </Button>
        </div>
      </div>

      <ol className="grid gap-1.5 sm:grid-cols-4">
        {STATE_ORDER.map((id) => {
          const reached = state ? STATE_ORDER.indexOf(id) <= STATE_ORDER.indexOf(state) : false;
          return (
            <li
              key={id}
              className={`rounded-md border px-2 py-1 text-[11px] ${
                id === state
                  ? "border-primary/60 bg-primary/10 text-foreground"
                  : reached
                    ? "border-border text-foreground"
                    : "border-border/60 text-muted-foreground"
              }`}
            >
              {DNS_LIVE_STATES[id].label}
            </li>
          );
        })}
      </ol>
      {stateInfo ? <p className="text-[11px] text-muted-foreground">{stateInfo.help}</p> : null}

      <p className="text-[11px] text-muted-foreground">
        {polling
          ? "Checking automatically every few seconds while this tab is open."
          : stopped === "live"
            ? "Verified live — automatic checking has stopped."
            : stopped === "cap"
              ? "Automatic checking paused after a while. Press Check again to look again."
              : stopped === "errors"
                ? "Automatic checking paused because the last checks didn't complete. Press Check again to retry."
                : !visible
                  ? "Automatic checking is paused while this tab is in the background."
                  : null}
      </p>

      <div className="border-t border-border/60 pt-2 text-[12px]">
        {host.isLoading ? (
          <p className="text-muted-foreground">Looking up where your DNS is hosted…</p>
        ) : guide ? (
          <div>
            <p>
              Your DNS looks like it is hosted at <span className="font-medium">{guide.name}</span>
              <span className="text-muted-foreground">
                {" "}
                (name servers: {detection?.state === "detected" ? detection.nameservers.join(", ") : ""})
              </span>
              . The steps for {guide.name} are selected below.
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground">{CANT_TELL_MESSAGE}</p>
        )}
      </div>
    </div>
  );
}
