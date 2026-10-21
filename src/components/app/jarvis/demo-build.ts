/**
 * Browser-safe helpers for the in-chat demo build card: reading the build
 * status the server returns, the stage list, preview widths and plain-language
 * send errors. Kept free of React so the rules are tested on their own.
 *
 * The status is read defensively (unknown in, typed out) so a field the server
 * leaves out shows as "not known" instead of breaking the card.
 */
import { GENERATION_STEPS } from "@/lib/site-engine";
import { formatDuration } from "@/lib/preview-telemetry";

/** How often an active build card asks the server for progress. */
export const DEMO_STATUS_POLL_MS = 3_000;

export type DemoChannel = "email" | "sms";

export type DemoOutreachEntry = {
  channel: DemoChannel;
  recipient: string;
  status: "sent" | "failed" | "skipped";
  reason: string | null;
  mode: "manual" | "autopilot";
  createdAt: string;
};

export type DemoPhase = "active" | "ready" | "failed" | "unavailable";

export type DemoBuildStatus = {
  phase: DemoPhase;
  progress: number;
  /** The server's current step: a stage key ("pictures") or its label. */
  step: string | null;
  previewUrl: string | null;
  claimed: boolean;
  outreach: DemoOutreachEntry[];
  email: string | null;
  phone: string | null;
  /** A plain-language note from the server (an error, or why status is unavailable). */
  message: string | null;
  /** Anonymous preview engagement; null when the server didn't report it. */
  engagement: DemoEngagement | null;
};

export type DemoEngagement = {
  views: number;
  uniqueSessions: number;
  totalMs: number;
  claimHovers: number;
  claimClicks: number;
  lastSeenAt: string | null;
  truncated: boolean;
};

const count = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

/** Reads the server's engagement totals defensively; null when absent or malformed. */
export function readEngagement(value: unknown): DemoEngagement | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const lastSeen = str(row["lastSeenAt"]);
  return {
    views: count(row["views"]),
    uniqueSessions: count(row["uniqueSessions"]),
    totalMs: count(row["totalMs"]),
    claimHovers: count(row["claimHovers"]),
    claimClicks: count(row["claimClicks"]),
    lastSeenAt: lastSeen && Number.isFinite(Date.parse(lastSeen)) ? lastSeen : null,
    truncated: row["truncated"] === true,
  };
}

/** One plain line for the card, e.g. "3 views · 2 visitors · 4 min on the page · 1 claim click". */
export function engagementLine(engagement: DemoEngagement): string {
  if (engagement.views === 0 && engagement.uniqueSessions === 0) return "Not opened yet.";
  const plural = (n: number, word: string) => `${n}${engagement.truncated ? "+" : ""} ${word}${n === 1 ? "" : "s"}`;
  const parts = [plural(engagement.views, "view"), plural(engagement.uniqueSessions, "visitor")];
  if (engagement.totalMs > 0) parts.push(`${formatDuration(engagement.totalMs)} on the page`);
  if (engagement.claimClicks > 0) parts.push(plural(engagement.claimClicks, "claim click"));
  else if (engagement.claimHovers > 0) parts.push(plural(engagement.claimHovers, "claim hover"));
  return parts.join(" · ");
}

/** The demo a card follows. The token is a fallback when status has no preview URL yet; the name may be empty. */
export type DemoCardRef = { organizationId: string; name: string; previewToken?: string | undefined };

const ACTIVE = new Set(["queued", "processing", "running", "pending"]);
const FAILED = new Set(["failed", "cancelled", "canceled", "error"]);

const str = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

function readOutreach(value: unknown): DemoOutreachEntry[] {
  if (!Array.isArray(value)) return [];
  const out: DemoOutreachEntry[] = [];
  for (const item of value.slice(0, 50)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const channel = row["channel"] === "sms" ? "sms" : row["channel"] === "email" ? "email" : null;
    const status = row["status"] === "sent" || row["status"] === "failed" || row["status"] === "skipped" ? row["status"] : null;
    if (!channel || !status) continue;
    out.push({
      channel,
      recipient: str(row["recipient"]) ?? "",
      status,
      reason: str(row["reason"]),
      mode: row["mode"] === "autopilot" ? "autopilot" : "manual",
      createdAt: str(row["created_at"]) ?? str(row["createdAt"]) ?? "",
    });
  }
  return out;
}

export function normalizeDemoStatus(raw: unknown): DemoBuildStatus {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const status = (str(row["status"]) ?? "").toLowerCase();
  const progress = Number(row["progress"]);
  const phase: DemoPhase = status === "completed" || status === "ready" ? "ready" : FAILED.has(status) ? "failed" : ACTIVE.has(status) ? "active" : "unavailable";
  return {
    phase,
    progress: Number.isFinite(progress) ? Math.min(100, Math.max(0, Math.round(progress))) : 0,
    step: str(row["step"]),
    previewUrl: str(row["previewUrl"]),
    claimed: row["claimed"] === true || Boolean(str(row["claimedAt"])),
    outreach: readOutreach(row["outreach"]),
    email: str(row["email"]),
    phone: str(row["phone"]),
    message: str(row["message"]) ?? str(row["error"]),
    engagement: readEngagement(row["engagement"]),
  };
}

export type StageState = "done" | "current" | "todo";

/**
 * The real backend stages, marked done / current / to do. The current stage is
 * the one the server named; without a name, progress decides. Nothing is
 * guessed past what the server reported.
 */
export function demoStages(step: string | null, progress: number, phase: DemoPhase) {
  const named = step ? GENERATION_STEPS.findIndex((stage) => stage.key === step || stage.label === step) : -1;
  // A stage's progress is the value written when it completes, so the first not-yet-reached stage is current.
  const byProgress = GENERATION_STEPS.findIndex((stage) => stage.progress > progress);
  const reached = phase === "ready" ? GENERATION_STEPS.length : named >= 0 ? named + 1 : byProgress === -1 ? GENERATION_STEPS.length : byProgress;
  return GENERATION_STEPS.map((stage, index) => ({
    key: stage.key,
    label: stage.label,
    state: (index < reached ? "done" : index === reached && phase === "active" ? "current" : "todo") as StageState,
  }));
}

/** Plain-language label for what the build is doing right now. */
export function currentStepLabel(step: string | null, progress: number, phase: DemoPhase) {
  if (phase === "ready") return "Draft ready";
  if (phase === "failed") return "Build stopped";
  if (phase === "unavailable") return "Status not available";
  const stages = demoStages(step, progress, phase);
  const current = stages.find((stage) => stage.state === "current");
  // Labels name the finished state ("Pages assembled"); the current one is still in progress.
  return current ? `Working on: ${current.label.toLowerCase()}` : step && !GENERATION_STEPS.some((stage) => stage.key === step) ? step : "Starting the build";
}

export const PREVIEW_DEVICES = [
  { key: "desktop", label: "Desktop", width: 1280, height: 800 },
  { key: "tablet", label: "Tablet", width: 768, height: 1024 },
  { key: "phone", label: "Phone", width: 390, height: 844 },
] as const;
export type PreviewDevice = (typeof PREVIEW_DEVICES)[number]["key"];

/** Largest on-screen height of the preview frame, so it never takes over the chat. */
export const PREVIEW_MAX_HEIGHT = 520;

/** Scale and frame height (in site pixels) that fit a device width into the space available. */
export function previewFit(device: PreviewDevice, available: number) {
  const spec = PREVIEW_DEVICES.find((item) => item.key === device) ?? PREVIEW_DEVICES[0];
  const room = available > 0 ? available : 340;
  const scale = Math.min(1, room / spec.width);
  const frameHeight = Math.round(Math.min(spec.height, PREVIEW_MAX_HEIGHT / scale));
  return { width: spec.width, frameHeight, scale };
}

/**
 * The preview path to embed. Always same-origin (`/p/<token>`): the preview
 * page only allows framing by its own origin, and APP_URL may be another host.
 */
export function previewPath(previewUrl: string | null, token?: string) {
  if (previewUrl) {
    try {
      const path = new URL(previewUrl, "https://preview.invalid").pathname;
      if (/^\/p\/[^/]+$/.test(path)) return path;
    } catch {
      /* fall through to the token */
    }
  }
  return token ? `/p/${encodeURIComponent(token)}` : null;
}

/** Full link to share: the server's preview URL, or this origin plus the path. */
export function shareLink(previewUrl: string | null, path: string | null, origin: string) {
  if (previewUrl && /^https?:\/\//.test(previewUrl)) return previewUrl;
  return path ? `${origin.replace(/\/$/, "")}${path}` : null;
}

const SMS_SECRETS = "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER (or TWILIO_MESSAGING_SERVICE_SID)";

/** Extra plain-language help for a send the server refused, keyed by its reason. */
export function sendFailureHelp(reason: string | null | undefined): string | null {
  switch (reason) {
    case "sms_not_configured":
      return `Texting isn't set up yet. In Lovable, open Cloud → Secrets and add ${SMS_SECRETS} from your Twilio account, then try again.`;
    case "email_not_configured":
      return "Email sending isn't set up yet. Check the email domain in Lovable Cloud → Emails, then try again.";
    case "mailing_address_missing":
      return "Set REVORA_MAILING_ADDRESS (a real street address or PO box) in your server secrets. Commercial email must include it.";
    case "do_not_contact":
      return "This address or number asked not to be contacted, so Jarvis won't send to it.";
    case "daily_cap":
      return "Today's sending limit is reached. It resets tomorrow.";
    case "quiet_hours":
      return "Texts only go out between 9am and 8pm in the business's time zone. Try again then.";
    case "no_consent":
      return "Automatic texts need the business's recorded consent. You can still send one yourself.";
    case "quality_gate":
      return "The draft didn't pass the quality check (pictures, contrast or claims). Fix what it lists, then send again.";
    case "already_sent":
      return "This demo was already sent on this channel. Tick “Send again” to resend.";
    default:
      return null;
  }
}

/** Human channel name. */
export const channelLabel = (channel: DemoChannel) => (channel === "sms" ? "Text" : "Email");

export function validRecipient(channel: DemoChannel, value: string) {
  const clean = value.trim();
  if (channel === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean);
  return clean.replace(/\D/g, "").length >= 10;
}

/**
 * A short text for the operator to review and edit. It names the sender; the
 * send adds the "Reply STOP to opt out." line itself (and the sender too, if
 * the edited text drops it), so neither has to be kept by hand.
 */
export function smsDraft(name: string, link: string) {
  return `${name ? `Hi ${name} team` : "Hi"}, this is Revora Growth Systems. I didn't see a website listed for your business, so I built a free private draft from your public listing: ${link}`;
}

/** The latest sent message on a channel, if any (one send per demo per channel unless resent). */
export const lastSent = (outreach: DemoOutreachEntry[], channel: DemoChannel) =>
  outreach.find((entry) => entry.channel === channel && entry.status === "sent") ?? null;

/**
 * Reads a `demo.send` chat proposal without depending on its exact type, so
 * this page works whether its fields sit at the top level or under `input`.
 */
export function readDemoSendProposal(proposal: unknown): { organizationId: string; channel: DemoChannel; to: string } | null {
  if (!proposal || typeof proposal !== "object") return null;
  const row = proposal as Record<string, unknown>;
  if (row["id"] !== "demo.send") return null;
  const nested = [row["input"], row["args"]].find((value) => value && typeof value === "object") as Record<string, unknown> | undefined;
  const source = nested ?? row;
  const organizationId = str(source["organizationId"]);
  if (!organizationId || !/^[0-9a-f-]{36}$/i.test(organizationId)) return null;
  return { organizationId, channel: source["channel"] === "sms" ? "sms" : "email", to: str(source["to"]) ?? "" };
}

const MAPS_LINK = /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)\S*/i;

/** The first Google Maps link in a message, if any. */
export const findMapsLink = (text: string) => MAPS_LINK.exec(text)?.[0] ?? null;

export const DEMO_CARDS_KEY = "jarvis:demo-cards";
const MAX_DEMO_CARDS = 50;
type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Which demo each approved chat proposal started, on this device, so the card survives a reload. */
export function readDemoCards(storage: StorageLike | null = defaultStorage()): Record<string, DemoCardRef> {
  if (!storage) return {};
  try {
    const parsed: unknown = JSON.parse(storage.getItem(DEMO_CARDS_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, DemoCardRef> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const row = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
      const organizationId = row ? str(row["organizationId"]) : null;
      if (!row || !organizationId || !/^[0-9a-f-]{36}$/i.test(organizationId)) continue;
      const token = str(row["previewToken"]);
      out[key] = { organizationId, name: str(row["name"]) ?? "", ...(token ? { previewToken: token } : {}) };
    }
    return out;
  } catch {
    return {};
  }
}

export function rememberDemoCard(key: string, card: DemoCardRef, storage: StorageLike | null = defaultStorage()) {
  const current = readDemoCards(storage);
  delete current[key];
  const entries = Object.entries({ ...current, [key]: card });
  const next = Object.fromEntries(entries.slice(Math.max(0, entries.length - MAX_DEMO_CARDS)));
  if (storage) {
    try {
      storage.setItem(DEMO_CARDS_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable or full */
    }
  }
  return next;
}
