/**
 * Prospect autopilot settings contract (shared by the server, the Jarvis
 * actions and the Operations card).
 *
 * Autopilot finds local businesses with no website, builds each a private demo
 * site on the free AI pool and, where the outreach rules allow, sends the
 * preview link. It starts switched off. Texts still need the number's recorded
 * consent; the outreach backend enforces that, the do-not-contact list, quiet
 * hours and the daily caps on every send.
 */
import type { FoundProspect } from "./prospect-finder";
import { DEFAULT_ROTATION, describeRotation, parseRotation, readRotation, type RotationSettings } from "./prospect-rotation";

export const MAX_AUTOPILOT_TARGETS = 10;
export const MAX_DAILY_BUILD_CAP = 20;
export const DEFAULT_DAILY_BUILD_CAP = 5;

export type AutopilotTarget = { niche: string; city: string; state: string | null };

export type AutopilotSettings = {
  enabled: boolean;
  targets: AutopilotTarget[];
  dailyBuildCap: number;
  sendEmail: boolean;
  sendSms: boolean;
  /**
   * Pitch first: email a short text pitch and build the demo site only after the
   * owner replies. Off by default; demo-first stays the behaviour until switched on.
   */
  pitchFirst: boolean;
  /** Walks built-in trades x metros after the explicit targets. Off by default. */
  rotation: RotationSettings;
  updatedBy: string | null;
  updatedAt: string | null;
};

export type AutopilotSettingsPatch = Partial<Pick<AutopilotSettings, "enabled" | "targets" | "dailyBuildCap" | "sendEmail" | "sendSms" | "pitchFirst" | "rotation">>;

export const DEFAULT_AUTOPILOT_SETTINGS: AutopilotSettings = {
  enabled: false,
  targets: [],
  dailyBuildCap: DEFAULT_DAILY_BUILD_CAP,
  sendEmail: true,
  sendSms: false,
  pitchFirst: false,
  rotation: DEFAULT_ROTATION,
  updatedBy: null,
  updatedAt: null,
};

const clean = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Validates one target; throws a plain-language reason. */
export function parseAutopilotTarget(value: unknown): AutopilotTarget {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const niche = clean(raw["niche"], 80);
  const city = clean(raw["city"], 80);
  if (niche.length < 3) throw new Error("Each target needs the kind of business, like \"mobile detailing\".");
  if (city.length < 2) throw new Error("Each target needs a city.");
  return { niche, city, state: clean(raw["state"], 40) || null };
}

const targetKey = (target: AutopilotTarget) => `${target.niche}|${target.city}|${target.state ?? ""}`.toLowerCase();

/** Validates a settings change. Only the fields present are changed. */
export function parseAutopilotPatch(value: unknown): AutopilotSettingsPatch {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const patch: AutopilotSettingsPatch = {};
  const bool = (key: "enabled" | "sendEmail" | "sendSms" | "pitchFirst") => {
    if (raw[key] === undefined) return;
    if (typeof raw[key] !== "boolean") throw new Error(`${key} must be true or false.`);
    patch[key] = raw[key] as boolean;
  };
  bool("enabled");
  bool("sendEmail");
  bool("sendSms");
  bool("pitchFirst");
  if (raw["dailyBuildCap"] !== undefined) {
    const cap = Number(raw["dailyBuildCap"]);
    if (!Number.isInteger(cap) || cap < 0 || cap > MAX_DAILY_BUILD_CAP)
      throw new Error(`The daily build limit must be a whole number from 0 to ${MAX_DAILY_BUILD_CAP}.`);
    patch.dailyBuildCap = cap;
  }
  if (raw["targets"] !== undefined) {
    if (!Array.isArray(raw["targets"])) throw new Error("Targets must be a list of {niche, city, state}.");
    if (raw["targets"].length > MAX_AUTOPILOT_TARGETS) throw new Error(`Use up to ${MAX_AUTOPILOT_TARGETS} targets.`);
    const seen = new Set<string>();
    patch.targets = raw["targets"].map(parseAutopilotTarget).filter((target) => {
      const key = targetKey(target);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  if (raw["rotation"] !== undefined) patch.rotation = parseRotation(raw["rotation"]);
  if (!Object.keys(patch).length) throw new Error("Nothing to change.");
  return patch;
}

/** Reads a stored settings row; anything unreadable falls back to the safe default (off). */
export function readAutopilotSettings(row: Record<string, unknown> | null | undefined): AutopilotSettings {
  if (!row) return { ...DEFAULT_AUTOPILOT_SETTINGS };
  const targets: AutopilotTarget[] = [];
  for (const item of Array.isArray(row["targets"]) ? row["targets"] : []) {
    try {
      targets.push(parseAutopilotTarget(item));
    } catch {
      /* a malformed stored target is skipped, never searched */
    }
  }
  const cap = Number(row["daily_build_cap"]);
  return {
    enabled: row["enabled"] === true,
    targets: targets.slice(0, MAX_AUTOPILOT_TARGETS),
    dailyBuildCap: Number.isInteger(cap) && cap >= 0 ? Math.min(cap, MAX_DAILY_BUILD_CAP) : DEFAULT_DAILY_BUILD_CAP,
    sendEmail: row["send_email"] !== false,
    sendSms: row["send_sms"] === true,
    pitchFirst: row["pitch_first"] === true,
    rotation: readRotation(row["rotation"]),
    updatedBy: typeof row["updated_by"] === "string" ? row["updated_by"] : null,
    updatedAt: typeof row["updated_at"] === "string" ? row["updated_at"] : null,
  };
}

export type AutopilotDraft = Required<AutopilotSettingsPatch>;
/** The Operations card's form: what it shows, what it was seeded from, and whether it has local edits. */
export type AutopilotDraftState = { draft: AutopilotDraft; base: AutopilotDraft; dirty: boolean } | null;

const draftOf = ({ enabled, targets, dailyBuildCap, sendEmail, sendSms, pitchFirst, rotation }: AutopilotSettings): AutopilotDraft => ({
  enabled,
  targets,
  dailyBuildCap,
  sendEmail,
  sendSms,
  pitchFirst,
  rotation,
});

/**
 * Follows newer server settings (e.g. a Jarvis-approved change) while the form
 * has no local edits; with edits, keeps them and the base they were made from.
 */
export function syncAutopilotDraft(state: AutopilotDraftState, server: AutopilotSettings | undefined): AutopilotDraftState {
  if (!server || state?.dirty) return state;
  const next = draftOf(server);
  return { draft: next, base: next, dirty: false };
}

/** Only the fields edited since the form was seeded, so Save never reverts a newer server change. */
export function changedAutopilotFields(base: AutopilotDraft, draft: AutopilotDraft): AutopilotSettingsPatch {
  const patch: AutopilotSettingsPatch = {};
  if (draft.enabled !== base.enabled) patch.enabled = draft.enabled;
  if (JSON.stringify(draft.targets) !== JSON.stringify(base.targets)) patch.targets = draft.targets;
  if (draft.dailyBuildCap !== base.dailyBuildCap) patch.dailyBuildCap = draft.dailyBuildCap;
  if (draft.sendEmail !== base.sendEmail) patch.sendEmail = draft.sendEmail;
  if (draft.sendSms !== base.sendSms) patch.sendSms = draft.sendSms;
  if (draft.pitchFirst !== base.pitchFirst) patch.pitchFirst = draft.pitchFirst;
  if (JSON.stringify(draft.rotation) !== JSON.stringify(base.rotation)) patch.rotation = draft.rotation;
  return patch;
}

/** Plain-language one-line summary of a settings change, for the approval card. */
export function describeAutopilotPatch(patch: AutopilotSettingsPatch): string {
  const parts: string[] = [];
  if (patch.enabled !== undefined) parts.push(patch.enabled ? "turn autopilot on" : "turn autopilot off");
  if (patch.targets) parts.push(patch.targets.length
    ? `search ${patch.targets.map((t) => `${t.niche} in ${[t.city, t.state].filter(Boolean).join(", ")}`).join("; ")}`
    : "clear the search targets");
  if (patch.dailyBuildCap !== undefined) parts.push(`build up to ${patch.dailyBuildCap} demo${patch.dailyBuildCap === 1 ? "" : "s"} a day`);
  if (patch.sendEmail !== undefined) parts.push(patch.sendEmail ? "email the preview link when an email is known" : "don't send emails");
  if (patch.sendSms !== undefined) parts.push(patch.sendSms ? "text the link only to numbers that opted in" : "don't send texts");
  if (patch.pitchFirst !== undefined)
    parts.push(patch.pitchFirst ? "email a short text pitch first and build the demo only after the owner replies" : "build the demo first and email its preview link");
  if (patch.rotation) parts.push(describeRotation(patch.rotation));
  const text = parts.join(", ");
  return text ? text[0]!.toUpperCase() + text.slice(1) + "." : "No change.";
}

/** Last ten digits of a phone number, for duplicate checks. Empty when too short. */
export function phoneKey(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

/** US phone in E.164 (+1XXXXXXXXXX), or null when it isn't a full US number. */
export function usPhoneE164(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export const normalBusinessName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export type DemoFingerprints = { placeIds: Set<string>; phones: Set<string>; nameCity: Set<string> };

export const nameCityKey = (name: string, city: string | null | undefined) =>
  `${normalBusinessName(name)}|${(city ?? "").trim().toLowerCase()}`;

/** Is this business already demoed or contacted (same place, phone, or name in the same city)? */
export function alreadyDemoed(prospect: FoundProspect, seen: DemoFingerprints): boolean {
  if (seen.placeIds.has(prospect.placeId)) return true;
  const phone = phoneKey(prospect.phone);
  if (phone && seen.phones.has(phone)) return true;
  return seen.nameCity.has(nameCityKey(prospect.name, prospect.city));
}

/**
 * Best fits first: no web presence at all before social-only, then a phone
 * we can reach, then established businesses (more reviews, higher rating).
 */
export function rankProspects(prospects: FoundProspect[]): FoundProspect[] {
  const score = (p: FoundProspect) =>
    (p.presence === "none" ? 1_000_000 : 0) + (phoneKey(p.phone) ? 100_000 : 0) + Math.min(p.reviewCount ?? 0, 9_999) * 10 + (p.rating ?? 0);
  return [...prospects].sort((a, b) => score(b) - score(a));
}

/** Autopilot sends are spread out: each one waits a random 0 to this many minutes after the previous. */
export const MAX_SEND_SPACING_MINUTES = 20;

/** When the next queued autopilot send may go: a random 0–20 minutes after the previous one. */
export function nextSendAt(previous: Date, random: () => number = Math.random): Date {
  const roll = Math.min(Math.max(random(), 0), 1);
  return new Date(previous.getTime() + Math.round(roll * MAX_SEND_SPACING_MINUTES * 60_000));
}
