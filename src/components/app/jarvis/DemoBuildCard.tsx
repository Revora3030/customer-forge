import { useEffect, useRef, useState, type RefObject } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Circle, Copy, ExternalLink, Hammer, Loader2, Mail, MessageSquare, Monitor, RefreshCw, Smartphone, Tablet, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getDemoStatusFn } from "@/lib/jarvis-demo-site.functions";
import {
  DEMO_STATUS_POLL_MS,
  PREVIEW_DEVICES,
  channelLabel,
  currentStepLabel,
  demoStages,
  engagementLine,
  normalizeDemoStatus,
  previewFit,
  previewPath,
  sendFailureHelp,
  shareLink,
  type DemoBuildStatus,
  type DemoCardRef,
  type DemoChannel,
  type PreviewDevice,
} from "./demo-build";
import { DemoSendSheet } from "./DemoSendSheet";

const DEVICE_ICONS = { desktop: Monitor, tablet: Tablet, phone: Smartphone } as const;
const tap = "min-h-11 gap-1.5";
const linkButton = "inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const when = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};
const reasonText = (reason: string) => sendFailureHelp(reason) ?? reason.replaceAll("_", " ");

type ViewProps = {
  card: DemoCardRef;
  /** null while the first status check is running. */
  status: DemoBuildStatus | null;
  loadError: string | null;
  checking: boolean;
  onRetry: () => void;
  device: PreviewDevice;
  onDeviceChange: (device: PreviewDevice) => void;
  /** Width available to the preview frame, in CSS pixels (0 before it is measured). */
  frameRoom: number;
  measureRef?: RefObject<HTMLDivElement | null>;
  /** This page's origin, for the copyable link. */
  origin: string;
  onCopyLink: (link: string) => void;
  onSend: (channel: DemoChannel) => void;
  onDismiss?: (() => void) | undefined;
};

/**
 * One demo build inside the Jarvis chat: live progress and the real stage list
 * while the AI team builds, then a live preview with width toggles, sharing and
 * Send. Rendering only; DemoBuildCard wires the status polling.
 */
export function DemoBuildCardView({ card, status, loadError, checking, onRetry, device, onDeviceChange, frameRoom, measureRef, origin, onCopyLink, onSend, onDismiss }: ViewProps) {
  const name = card.name || "Demo site";
  const path = previewPath(status?.previewUrl ?? null, card.previewToken);
  const link = shareLink(status?.previewUrl ?? null, path, origin);
  const phase = status?.phase;
  const label = status ? currentStepLabel(status.step, status.progress, status.phase) : "Checking build status…";
  const stages = status ? demoStages(status.step, status.progress, status.phase) : [];
  const done = stages.filter((stage) => stage.state === "done").length;
  // Announced politely: one line per change of step, not every poll.
  const announcement = !status ? "" : phase === "active" ? `${name}: ${label}, ${status.progress}%` : phase === "ready" ? `${name} demo is ready to preview.` : phase === "failed" ? `${name} build stopped.` : "";
  const fit = previewFit(device, frameRoom);
  const deviceLabel = PREVIEW_DEVICES.find((item) => item.key === device)?.label ?? "Desktop";

  return (
    <section aria-label={`Demo site build: ${name}`} className="mt-3 rounded-xl border border-border bg-card p-3">
      <div className="flex items-start gap-2">
        <Hammer className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-sm font-semibold">{name}</h3>
          <p className="text-xs text-muted-foreground">{phase === "ready" ? (status?.claimed ? "Claimed by the business" : "Private draft · not published") : phase === "active" ? "Building the demo site" : label}</p>
        </div>
        {onDismiss ? (
          <Button type="button" variant="ghost" size="icon-sm" data-jarvis-tap="" className="size-9 shrink-0 rounded-full" aria-label={`Close the ${name} build card`} onClick={onDismiss}>
            <X className="size-4" aria-hidden />
          </Button>
        ) : null}
      </div>
      <p role="status" aria-live="polite" className="sr-only">{announcement}</p>

      {loadError && !status ? (
        <div className="mt-2 space-y-2">
          <p role="alert" className="text-sm text-destructive">Couldn't check the build: {loadError}</p>
          <Button type="button" size="sm" variant="outline" data-jarvis-tap="" className={tap} disabled={checking} onClick={onRetry}><RefreshCw className="size-4" aria-hidden />{checking ? "Checking…" : "Check again"}</Button>
        </div>
      ) : null}

      {phase === "active" && status ? (
        <div className="mt-3 space-y-2">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 break-words">{label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{status.progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${name} build progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={status.progress} aria-valuetext={`${status.progress}%, ${label}`}>
            <div className="h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${status.progress}%` }} />
          </div>
          <details className="rounded-md border border-border">
            <summary className="flex min-h-11 cursor-pointer items-center px-2.5 text-sm">Stages · {done} of {stages.length} done</summary>
            <ol aria-label="Build stages" className="space-y-1.5 border-t border-border p-2.5 text-sm">
              {stages.map((stage) => (
                <li key={stage.key} aria-current={stage.state === "current" ? "step" : undefined} className={`flex items-center gap-2 ${stage.state === "todo" ? "text-muted-foreground" : ""}`}>
                  {stage.state === "done" ? <Check className="size-4 shrink-0 text-primary" aria-hidden /> : stage.state === "current" ? <Loader2 className="size-4 shrink-0 animate-spin text-primary motion-reduce:animate-none" aria-hidden /> : <Circle className="size-4 shrink-0" aria-hidden />}
                  <span className="min-w-0 break-words">{stage.label}</span>
                  <span className="sr-only">{stage.state === "done" ? "(done)" : stage.state === "current" ? "(in progress)" : "(to do)"}</span>
                </li>
              ))}
            </ol>
          </details>
          <p className="text-xs text-muted-foreground">Your AI team (paid and free models) is building this site. This card updates every few seconds and turns into a live preview when the draft is ready.</p>
        </div>
      ) : null}

      {phase === "failed" && status ? (
        <div className="mt-3 space-y-2">
          <p role="alert" className="break-words text-sm text-destructive">{status.message ?? "The build stopped before the draft was ready."}</p>
          <p className="text-xs text-muted-foreground">Ask Jarvis to “Fix stuck builds”, or check the builder health under Operations.</p>
          <Button type="button" size="sm" variant="outline" data-jarvis-tap="" className={tap} disabled={checking} onClick={onRetry}><RefreshCw className="size-4" aria-hidden />{checking ? "Checking…" : "Check again"}</Button>
        </div>
      ) : null}

      {phase === "unavailable" && status ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-muted-foreground">{status.message ?? "The build status isn't available right now."}</p>
          <div className="flex flex-wrap gap-2">
            {path ? <a href={path} target="_blank" rel="noreferrer" className={linkButton}><ExternalLink className="size-4" aria-hidden />Open preview</a> : null}
            <Button type="button" size="sm" variant="outline" data-jarvis-tap="" className={tap} disabled={checking} onClick={onRetry}><RefreshCw className="size-4" aria-hidden />{checking ? "Checking…" : "Check again"}</Button>
          </div>
        </div>
      ) : null}

      {phase === "ready" && status ? (
        <div className="mt-3 space-y-3">
          <div role="group" aria-label="Preview width" className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
            {PREVIEW_DEVICES.map((option) => {
              const Icon = DEVICE_ICONS[option.key];
              const active = option.key === device;
              return (
                <button
                  key={option.key}
                  type="button"
                  data-jarvis-tap=""
                  aria-pressed={active}
                  onClick={() => onDeviceChange(option.key)}
                  className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Icon className="size-4" aria-hidden />{option.label}
                </button>
              );
            })}
          </div>
          <div ref={measureRef} className="flex w-full justify-center">
            {path ? (
              <div className="overflow-hidden rounded-lg border border-border bg-background" style={{ width: Math.round(fit.width * fit.scale), height: Math.round(fit.frameHeight * fit.scale) }}>
                {/* The wrapper is scaled, not the frame: iPhone Safari ignores width on a transformed frame. */}
                <div className="origin-top-left" style={{ width: fit.width, height: fit.frameHeight, transform: `scale(${fit.scale})` }}>
                  <iframe
                    title={`Preview of the ${name} demo site, ${deviceLabel} width`}
                    src={path}
                    loading="lazy"
                    sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
                    className="block border-0"
                    style={{ width: fit.width, minWidth: fit.width, maxWidth: fit.width, height: fit.frameHeight, backgroundColor: "#fff" }}
                  />
                </div>
              </div>
            ) : <p className="text-sm text-muted-foreground">The preview link isn't available yet.</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {path ? <a href={path} target="_blank" rel="noreferrer" className={linkButton}><ExternalLink className="size-4" aria-hidden />Open in new tab</a> : null}
            {link ? <Button type="button" variant="outline" data-jarvis-tap="" className={tap} onClick={() => onCopyLink(link)}><Copy className="size-4" aria-hidden />Copy link</Button> : null}
            <Button type="button" data-jarvis-tap="" className={tap} disabled={status.claimed} onClick={() => onSend("email")}><Mail className="size-4" aria-hidden />Email</Button>
            <Button type="button" variant="outline" data-jarvis-tap="" className={tap} disabled={status.claimed} onClick={() => onSend("sms")}><MessageSquare className="size-4" aria-hidden />Text</Button>
          </div>
          <section aria-label="Preview engagement" className="space-y-1">
            <h4 className="text-sm font-medium">Prospect engagement</h4>
            {status.engagement ? (
              <>
                <p className="break-words text-sm">{engagementLine(status.engagement)}</p>
                {status.engagement.lastSeenAt ? <p className="text-xs text-muted-foreground">Last seen {when(status.engagement.lastSeenAt)}</p> : null}
                <p className="text-xs text-muted-foreground">Anonymous counts from the preview link. Your own looks while signed in aren't counted.</p>
              </>
            ) : <p className="text-xs text-muted-foreground">Engagement isn't available right now.</p>}
          </section>
          <section aria-label="Outreach history" className="space-y-1.5">
            <h4 className="text-sm font-medium">Sent so far</h4>
            {status.outreach.length === 0 ? <p className="text-xs text-muted-foreground">Nothing sent yet.</p> : (
              <ul className="space-y-1.5">
                {status.outreach.map((entry, index) => (
                  <li key={`${entry.channel}-${entry.createdAt}-${index}`} className="rounded-md border border-border p-2 text-sm">
                    <p className="flex flex-wrap items-center gap-x-2">
                      <span className={entry.status === "sent" ? "font-medium text-primary" : entry.status === "failed" ? "font-medium text-destructive" : "font-medium text-muted-foreground"}>
                        {entry.status === "sent" ? "Sent" : entry.status === "failed" ? "Failed" : "Skipped"}
                      </span>
                      <span>{channelLabel(entry.channel)}</span>
                      <span className="min-w-0 break-all text-muted-foreground">{entry.recipient}</span>
                      <span className="text-xs text-muted-foreground">{when(entry.createdAt)}{entry.mode === "autopilot" ? " · autopilot" : ""}</span>
                    </p>
                    {entry.reason && entry.status !== "sent" ? <p className="mt-0.5 break-words text-xs text-muted-foreground">{reasonText(entry.reason)}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}

      {!status && !loadError ? <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />Checking build status…</p> : null}
    </section>
  );
}

type Props = {
  card: DemoCardRef;
  onDismiss?: (() => void) | undefined;
  /** A send Jarvis proposed in chat: opens the confirm sheet once the draft is ready. */
  initialSend?: { channel: DemoChannel; to: string } | undefined;
  /** Called once the proposed send went out (true) or the sheet was closed without sending (false). */
  onInitialSendSettled?: ((sent: boolean) => void) | undefined;
};

/** The live build card: polls the build every few seconds while it runs, then shows the preview. */
export function DemoBuildCard({ card, onDismiss, initialSend, onInitialSendSettled }: Props) {
  const qc = useQueryClient();
  const statusFn = useServerFn(getDemoStatusFn);
  const status = useQuery({
    queryKey: ["jarvis", "demo-status", card.organizationId],
    queryFn: async () => normalizeDemoStatus(await statusFn({ data: { organizationId: card.organizationId } })),
    refetchInterval: (query) => (query.state.data?.phase === "active" ? DEMO_STATUS_POLL_MS : false),
    retry: 1,
  });
  const [device, setDevice] = useState<PreviewDevice>("phone");
  const [sheet, setSheet] = useState<DemoChannel | null>(null);
  const [pendingSend, setPendingSend] = useState(initialSend);
  const [room, setRoom] = useState(0);
  const measureRef = useRef<HTMLDivElement>(null);
  const phase = status.data?.phase;

  // Phones start on the phone width; wider screens on desktop.
  useEffect(() => {
    if (window.matchMedia?.("(min-width: 768px)").matches) setDevice("desktop");
  }, []);
  useEffect(() => {
    const el = measureRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setRoom(Math.floor(entry?.contentRect.width ?? 0)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [phase]);
  // A finished build also updates the Operations list.
  const previousPhase = useRef(phase);
  useEffect(() => {
    if (previousPhase.current === "active" && phase && phase !== "active") void qc.invalidateQueries({ queryKey: ["jarvis", "prospect-demos"] });
    previousPhase.current = phase;
  }, [phase, qc]);
  useEffect(() => {
    if (pendingSend && phase === "ready") setSheet(pendingSend.channel);
  }, [pendingSend, phase]);

  // Settles a proposed send exactly once, whichever of "sent" or "closed" comes first.
  const settled = useRef(false);
  const settle = (sent: boolean) => {
    if (!initialSend || settled.current) return;
    settled.current = true;
    setPendingSend(undefined);
    onInitialSendSettled?.(sent);
  };
  const closeSheet = () => {
    setSheet(null);
    settle(false);
  };
  // A proposed send for a demo that failed, or whose status can't be read, is released so it can be retried.
  const loadFailed = Boolean(status.error);
  useEffect(() => {
    if (phase === "failed" || phase === "unavailable" || loadFailed) settle(false);
    // settle is stable in effect (guarded by a ref); only the phase matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, loadFailed]);
  const copyLink = (link: string) => {
    void navigator.clipboard.writeText(link).then(() => toast.success("Preview link copied."), () => toast.error("Couldn't copy the link."));
  };
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const data = status.data ?? null;
  const path = previewPath(data?.previewUrl ?? null, card.previewToken);

  return (
    <>
      <DemoBuildCardView
        card={card}
        status={data}
        loadError={status.error ? status.error.message : null}
        checking={status.isFetching}
        onRetry={() => { void status.refetch(); }}
        device={device}
        onDeviceChange={setDevice}
        frameRoom={room}
        measureRef={measureRef}
        origin={origin}
        onCopyLink={copyLink}
        onSend={setSheet}
        onDismiss={onDismiss}
      />
      {data ? (
        <DemoSendSheet
          channel={sheet}
          onClose={closeSheet}
          card={card}
          status={data}
          link={shareLink(data.previewUrl, path, origin)}
          initialTo={pendingSend?.to}
          onSent={() => settle(true)}
        />
      ) : null}
    </>
  );
}
