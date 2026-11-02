/**
 * New-lead alert for the owner's open dashboard, plus the WhatsApp reply link.
 *
 * - A toast shows for every NEW real lead that arrives while the dashboard is
 *   open. An optional short chime plays only if the owner turned sound on.
 * - Sound is OFF until the owner switches it on (a click, which also satisfies
 *   browser autoplay rules). The choice is remembered per user in this browser.
 * - Nothing plays on first load: only realtime INSERT events are considered,
 *   and a row older than a few minutes is ignored as well.
 * - Test leads never alert.
 * - The chime is generated with WebAudio (two short sine tones), so there is no
 *   audio file and no licence to carry.
 * - The WhatsApp link only opens the owner's own WhatsApp. Revora sends nothing.
 */

export const LEAD_CHIME_PREF_PREFIX = "revora:lead-chime:";
/** A lead created longer ago than this is not "new" (clock skew allowance). */
export const NEW_LEAD_MAX_AGE_MS = 10 * 60_000;

type LeadRowLike = { source?: string | null; created_at?: string | null } | null | undefined;

/** The trigger rule: real (non-test) and freshly created. */
export function shouldAlertNewLead(row: LeadRowLike, now: number = Date.now()): boolean {
  if (!row) return false;
  if (row.source === "test_lead") return false;
  if (!row.created_at) return true;
  const created = Date.parse(row.created_at);
  if (Number.isNaN(created)) return true;
  return now - created <= NEW_LEAD_MAX_AGE_MS;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const prefKey = (userId: string | null | undefined) => `${LEAD_CHIME_PREF_PREFIX}${userId || "anon"}`;

/** Sound is off unless this user switched it on earlier. */
export function readChimeOn(storage: StorageLike | null | undefined, userId: string | null | undefined): boolean {
  try {
    return storage?.getItem(prefKey(userId)) === "on";
  } catch {
    return false;
  }
}

export function writeChimeOn(
  storage: StorageLike | null | undefined,
  userId: string | null | undefined,
  on: boolean,
): void {
  try {
    storage?.setItem(prefKey(userId), on ? "on" : "off");
  } catch {
    /* private mode: the choice just isn't remembered */
  }
}

/**
 * `https://wa.me/<digits>` for a phone number, or null when the country can't
 * be told. A "+" number is used as written; a 10-digit or 1-prefixed 11-digit
 * number is treated as US/Canada (the same region the rest of the product
 * assumes). Anything else gets no link rather than a guess.
 */
export function whatsappLink(phone: string | null | undefined): string | null {
  const raw = (phone ?? "").trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+") || raw.startsWith("00")) {
    const intl = raw.startsWith("00") ? digits.slice(2) : digits;
    return intl.length >= 8 && intl.length <= 15 ? `https://wa.me/${intl}` : null;
  }
  if (digits.length === 10) return `https://wa.me/1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `https://wa.me/${digits}`;
  return null;
}

let audioCtx: AudioContext | null = null;

/** Two short soft tones. Safe to call anywhere: silently does nothing if audio is unavailable. */
export function playLeadChime(): void {
  try {
    if (typeof window === "undefined") return;
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audioCtx ??= new Ctor();
    const ctx = audioCtx;
    if (ctx.state === "suspended") void ctx.resume();
    const start = ctx.currentTime;
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t0 = start + i * 0.16;
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.3);
    });
  } catch {
    /* audio is a nicety, never an error */
  }
}

/**
 * Called for each realtime lead INSERT. Shows the toast (always, for a real new
 * lead) and plays the chime only when sound is on.
 */
export async function announceNewLead(
  row: (LeadRowLike & { name?: string | null; service_interest?: string | null }) | null | undefined,
  deps: {
    notifyInfo: (message: string, extra?: { description?: string }) => unknown;
    chimeOn: () => Promise<boolean> | boolean;
    play?: () => void;
    now?: number;
  },
): Promise<boolean> {
  if (!shouldAlertNewLead(row, deps.now)) return false;
  const who = row?.name?.trim() || "Someone";
  deps.notifyInfo("New lead", {
    description: row?.service_interest ? `${who} asked about ${row.service_interest}.` : `${who} just enquired.`,
  });
  let on = false;
  try {
    on = await deps.chimeOn();
  } catch {
    on = false;
  }
  if (on) (deps.play ?? playLeadChime)();
  return true;
}
