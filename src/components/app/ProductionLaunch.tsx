import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { GROWTH_SYSTEM, usd } from "@/lib/offer";
import type {
  ActivationResult,
  ProductionReadiness,
  ProductionStatus,
} from "@/lib/production.functions";

/* ------------------------------ environment ------------------------------- */

/**
 * Tells the client exactly which environment they're in. Sandbox is not a
 * broken or reduced builder — it's the full system before launch.
 */
export function EnvironmentBanner({ status }: { status: ProductionStatus | undefined }) {
  if (!status) return null;
  const live = status.environment === "production";

  return (
    <section
      className={`panel p-4 ${live ? "border-primary/40 bg-primary/5" : "border-accent/30 bg-accent/5"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">{live ? "Production — live" : "Sandbox mode"}</p>
          <p className="mt-1 text-[13px] font-medium">
            {live
              ? "Your website is live and taking real enquiries."
              : status.accountStatus === "expired"
                ? "Your 1-day access has ended — your work is saved."
                : "You have the full Revora builder. Launch unlocks after setup."}
          </p>
          <p className="mt-1 max-w-2xl text-[12px] text-muted-foreground">
            {live
              ? "Your edits stay in draft until you publish them."
              : `Build and test everything now. Publishing and your own domain unlock once the one-time ${usd(GROWTH_SYSTEM.setupPrice)} setup is paid.`}
          </p>
        </div>
        {!live ? (
          <Button asChild size="sm" variant="signal">
            <Link to="/get-started">Launch my website — ${GROWTH_SYSTEM.setupPrice} setup</Link>
          </Button>
        ) : null}
      </div>
    </section>
  );
}

/* ------------------------------ locked modal ------------------------------ */

export function ProductionLaunchModal({
  open,
  onClose,
  reason,
}: {
  open: boolean;
  onClose: () => void;
  reason?: string | null;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Launch your website"
      onClick={onClose}
    >
      <div className="panel w-full max-w-md p-5" onClick={(event) => event.stopPropagation()}>
        <p className="eyebrow">Ready to launch</p>
        <h2 className="mt-1 font-display text-[20px] font-semibold">
          Your website is ready to go live
        </h2>
        <p className="mt-2 text-[13px] text-muted-foreground">
          {reason ??
            "You've built your website and customer-growth system. Complete your one-time setup to take it live."}
        </p>
        <ul className="mt-3 space-y-1.5 text-[13px]">
          {[
            "Publish your website",
            "Deploy it live",
            "Connect your custom domain",
            "Activate production",
            "Start receiving real customers and leads",
          ].map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden className="text-primary">
                ✓
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 rounded-md border border-border bg-elevated p-3">
          <p className="text-[11px] text-muted-foreground">One-time setup</p>
          <p className="font-display text-[24px] font-semibold text-primary">
            ${GROWTH_SYSTEM.setupPrice}
          </p>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            Then ${GROWTH_SYSTEM.monthlyPrice}/month — your first month is free.
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild variant="signal" className="flex-1">
            <Link to="/get-started">Unlock &amp; launch</Link>
          </Button>
          <Button variant="outline" onClick={onClose} className="flex-1">
            Keep editing
          </Button>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Nothing is lost or reset when you pay: the same website, pages, media, CRM, automations,
          SEO and version history become your live system.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------- readiness -------------------------------- */

export function ProductionReadinessPanel({
  readiness,
  status,
  onLaunch,
  isLaunching,
  canManage,
  result,
}: {
  readiness: ProductionReadiness | undefined;
  status: ProductionStatus | undefined;
  onLaunch: () => void;
  isLaunching: boolean;
  canManage: boolean;
  result: ActivationResult | null;
}) {
  if (!readiness) return null;
  const live = status?.environment === "production";

  return (
    <section className="panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Production readiness</p>
          <h3 className="mt-1 font-display text-[17px] font-semibold">
            {readiness.passed ? "Pass — ready to launch" : "Needs attention"}
          </h3>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
            readiness.passed
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-accent/40 bg-accent/10 text-accent"
          }`}
        >
          {readiness.checks.filter((c) => c.ok).length}/{readiness.checks.length} checks
        </span>
      </div>

      <ul className="mt-3 space-y-1.5">
        {readiness.checks.map((check) => (
          <li key={check.key} className="flex gap-2 rounded-md border border-border p-2.5">
            <span aria-hidden className={check.ok ? "text-primary" : "text-accent"}>
              {check.ok ? "✓" : "!"}
            </span>
            <span className="min-w-0">
              <span className="block text-[12.5px] font-medium">{check.label}</span>
              <span className="block text-[11.5px] text-muted-foreground">{check.detail}</span>
            </span>
          </li>
        ))}
      </ul>

      {result && !result.activated ? (
        <p className="mt-3 text-[12px] text-accent">{result.reason}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="signal" size="sm" onClick={onLaunch} disabled={!canManage || isLaunching}>
          {isLaunching
            ? "Working…"
            : live
              ? "Publish changes"
              : readiness.unlocked
                ? "Activate production"
                : "Launch my website"}
        </Button>
        <p className="text-[11.5px] text-muted-foreground">
          {readiness.unlocked
            ? "Creates a permanent production version — earlier versions are kept."
            : "Verified server-side. Sandbox testing never sends real customer messages."}
        </p>
      </div>
    </section>
  );
}

/* ---------------------------- dashboard summary --------------------------- */

const TRIAL_INCLUDES = [
  "Website builder",
  "AI tools",
  "CRM",
  "Lead generation",
  "Booking",
  "Automation",
  "SEO",
  "Analytics",
  "Preview",
  "Testing",
];

/**
 * Dashboard view of where this workspace stands: full build access now,
 * production launch after setup. Deliberately not a paywall on every screen.
 */
export function ProductionSummaryCard({ status }: { status: ProductionStatus | undefined }) {
  if (!status) return null;
  if (status.environment === "production")
    return (
      <section className="panel border-primary/40 bg-primary/5 p-4">
        <p className="eyebrow">Production — live</p>
        <p className="mt-1 text-[13px] font-medium">
          Your system is live and working for your business.
        </p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Keep editing in draft, then publish changes when you're happy — your live site stays
          stable in between.
        </p>
      </section>
    );

  return (
    <section className="panel p-4">
      <p className="eyebrow">
        {status.accountStatus === "expired" ? "Access ended — work saved" : "1-day free access"}
      </p>
      <h3 className="mt-1 font-display text-[17px] font-semibold">Build your system</h3>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {TRIAL_INCLUDES.map((item) => (
          <span
            key={item}
            className="rounded-full border border-border bg-elevated px-2 py-0.5 text-[11px]"
          >
            ✓ {item}
          </span>
        ))}
      </div>
      <div className="mt-3 rounded-md border border-accent/30 bg-accent/5 p-3">
        <p className="text-[12.5px] font-medium">🔒 Production launch</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          {status.accountStatus === "expired"
            ? "Your website and configuration are saved. Complete setup to continue and launch."
            : "Your complete system can be launched after setup."}
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="signal">
            <Link to="/get-started">Launch my website</Link>
          </Button>
          <span className="text-[11.5px] text-muted-foreground">
            ${GROWTH_SYSTEM.setupPrice} one-time setup · then ${GROWTH_SYSTEM.monthlyPrice}/month,
            first month free
          </span>
        </div>
      </div>
    </section>
  );
}
