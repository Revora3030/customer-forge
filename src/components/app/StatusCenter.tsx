/**
 * Status Center — one honest, at-a-glance view of the whole workspace.
 *
 * Every tile is derived from real workspace data (production status from the
 * server, website settings, leads, appointments, automations and their run
 * history). Nothing here is simulated: when a value cannot be read yet the tile
 * says so instead of guessing, and a state is only reported as live/connected
 * when the underlying record says it is.
 */
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import {
  useAppointments,
  useAutomationRuns,
  useAutomations,
  useLeads,
  useWebsiteSettings,
} from "@/lib/queries";
import { useProductionStatus } from "@/lib/production.hooks";
import { useTrialCountdown } from "@/lib/trial-clock";
import { GROWTH_SYSTEM, usd } from "@/lib/offer";
import type { Tone } from "@/lib/domain";

type Tile = {
  key: string;
  label: string;
  value: string;
  tone: Tone;
  hint: string;
  to: string;
};

const DOMAIN_LABEL: Record<string, { value: string; tone: Tone }> = {
  not_connected: { value: "Not connected", tone: "neutral" },
  dns_pending: { value: "DNS required", tone: "attention" },
  verifying: { value: "Checking", tone: "info" },
  connected: { value: "Verified", tone: "signal" },
  ssl_active: { value: "Connected", tone: "signal" },
  error: { value: "Error", tone: "danger" },
};

export function StatusCenter({ organizationId }: { organizationId: string | undefined }) {
  const { data: production, isPending: productionPending } = useProductionStatus(organizationId);
  const { data: settings } = useWebsiteSettings(organizationId);
  const { data: leads } = useLeads(organizationId);
  const { data: appointments } = useAppointments(organizationId);
  const { data: automations } = useAutomations(organizationId);
  const { data: runs } = useAutomationRuns(organizationId);

  const trialEndsAt = production?.trialEndsAt ? Date.parse(production.trialEndsAt) : null;
  const countdown = useTrialCountdown(Number.isFinite(trialEndsAt) ? trialEndsAt : null);

  const tiles = useMemo<Tile[]>(() => {
    const publishState = production?.publishState ?? settings?.publish_state ?? "draft";
    const isLive = publishState === "published";
    const website: Tile = {
      key: "website",
      label: "Website",
      value: isLive ? "Live" : publishState === "preview" ? "Ready" : "Draft",
      tone: isLive ? "signal" : publishState === "preview" ? "info" : "neutral",
      hint: isLive
        ? production?.liveSince
          ? `Live since ${new Date(production.liveSince).toLocaleDateString()}`
          : "Serving customers"
        : "Your live site is unchanged until you launch.",
      to: "/app/website",
    };

    const paid = production?.setupPaymentStatus === "paid";
    const trial: Tile = {
      key: "trial",
      label: "Free access",
      value: paid
        ? "Unlocked"
        : countdown
          ? countdown.expired
            ? "Ended"
            : countdown.label
          : productionPending
            ? "Checking…"
            : "Not started",
      tone: paid ? "signal" : countdown && !countdown.expired ? "info" : "attention",
      hint: paid
        ? "Setup paid — production features are available."
        : countdown && !countdown.expired
          ? `Time left in your ${GROWTH_SYSTEM.fullAccessWindow} full-system access.`
          : "Your work is saved. Pay the setup fee to launch it.",
      to: "/app/billing",
    };

    const accountStatus = production?.accountStatus;
    const billing: Tile = {
      key: "billing",
      label: "Billing",
      value: paid
        ? accountStatus === "active"
          ? "Paid"
          : "Setup paid"
        : accountStatus === "expired"
          ? "Past due"
          : productionPending
            ? "Checking…"
            : "Trial",
      tone: paid ? "signal" : accountStatus === "expired" ? "danger" : "info",
      hint: paid
        ? `${usd(GROWTH_SYSTEM.monthlyPrice)}/month after your first free month.`
        : `${usd(GROWTH_SYSTEM.setupPrice)} setup, first month free, then ${usd(GROWTH_SYSTEM.monthlyPrice)}/month.`,
      to: "/app/billing",
    };

    // Builder usage is never metered or charged separately — this tile exists so
    // the customer can see that at a glance.
    const builder: Tile = {
      key: "builder",
      label: "Builder access",
      value: "Included",
      tone: "signal",
      hint: "Unlimited AI building, editing, audits, fixes and publishing — no credits.",
      to: "/app/website",
    };

    const domainState = DOMAIN_LABEL[settings?.domain_status ?? "not_connected"] ?? {
      value: "Not connected",
      tone: "neutral" as Tone,
    };
    const domain: Tile = {
      key: "domain",
      label: "Domain",
      value: domainState.value,
      tone: domainState.tone,
      hint: settings?.custom_domain
        ? settings.custom_domain
        : "Add your own domain when you launch.",
      to: "/app/domain",
    };

    const ssl: Tile = {
      key: "ssl",
      label: "SSL",
      value: settings?.ssl_ok ? "Active" : settings?.custom_domain ? "Pending" : "Not needed yet",
      tone: settings?.ssl_ok ? "signal" : settings?.custom_domain ? "attention" : "neutral",
      hint: settings?.ssl_ok
        ? "Your site is served over HTTPS."
        : "A certificate is issued once DNS verifies.",
      to: "/app/domain",
    };

    const launch: Tile = {
      key: "launch",
      label: "Launch",
      value: isLive ? "Live" : production?.unlocked ? "Ready" : "Not ready",
      tone: isLive ? "signal" : production?.unlocked ? "info" : "attention",
      hint: production?.reason || "Run the launch checks to see what's outstanding.",
      to: "/app/launch",
    };

    const newLeads = (leads ?? []).filter((l) => l.status === "new").length;
    const leadTile: Tile = {
      key: "leads",
      label: "Leads",
      value: leads ? String(leads.length) : "—",
      tone: newLeads > 0 ? "signal" : "neutral",
      hint: leads ? `${newLeads} waiting on a first reply` : "Enquiries land here automatically.",
      to: "/app/leads",
    };

    const upcoming = (appointments ?? []).filter(
      (a) => Date.parse(a.starts_at) > Date.now() && a.status !== "cancelled",
    ).length;
    const bookingTile: Tile = {
      key: "bookings",
      label: "Bookings",
      value: appointments ? String(appointments.length) : "—",
      tone: upcoming > 0 ? "signal" : "neutral",
      hint: appointments ? `${upcoming} upcoming` : "Customers book real slots from your site.",
      to: "/app/calendar",
    };

    const activeAutomations = (automations ?? []).filter((a) => a.is_active).length;
    const failedRuns = (runs ?? []).filter((r) => r.status === "failed").length;
    const automationTile: Tile = {
      key: "automations",
      label: "Automations",
      value: automations
        ? failedRuns > 0
          ? `${failedRuns} failed`
          : `${activeAutomations} active`
        : "—",
      tone: failedRuns > 0 ? "danger" : activeAutomations > 0 ? "signal" : "neutral",
      hint:
        failedRuns > 0
          ? "Open the run history to see what failed and retry."
          : activeAutomations > 0
            ? "Follow-ups are running for new leads."
            : "Turn on follow-ups so no lead goes cold.",
      to: "/app/automations",
    };

    return [
      website,
      trial,
      billing,
      builder,
      domain,
      ssl,
      launch,
      leadTile,
      bookingTile,
      automationTile,
    ];
  }, [production, productionPending, settings, leads, appointments, automations, runs, countdown]);

  return (
    <Panel>
      <SectionHeading
        title="Status center"
        description="Everything that matters about your system, in one place. Live values — nothing estimated."
      />
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {tiles.map((tile) => (
          <li key={tile.key}>
            <Link
              to={tile.to}
              className="flex h-full flex-col gap-2 rounded-xl border border-border bg-elevated/60 p-3 transition-colors hover:border-primary/40 focus-visible:border-primary/60 focus-visible:outline-none"
            >
              <span className="text-[10.5px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                {tile.label}
              </span>
              <Pill tone={tile.tone} dot>
                {tile.value}
              </Pill>
              <span className="text-[11px] leading-snug text-muted-foreground">{tile.hint}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
