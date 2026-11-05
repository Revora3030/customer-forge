/**
 * JC-11 AI City sound design, opt-in. Web Audio only (no files, no licences).
 *
 * - Muted until the owner turns it on. The choice is one remembered toggle.
 * - No AudioContext exists before a tap: it is created inside the toggle click,
 *   or on the first pointer/key press after a reload when the owner had it on.
 * - The first set of records read after a page load is silent; only records
 *   that change afterwards can make a sound.
 * - prefers-reduced-motion starts muted even if sound was on before.
 * - One cue per refresh (the most important), so a burst is never a chord.
 */
import { FAILED_STATUSES, type CityWork } from "./ai-city";

export type CityCue = "failure" | "approval" | "success" | "handoff";
/** Most important first. */
export const CUE_PRIORITY: readonly CityCue[] = ["failure", "approval", "success", "handoff"];
export const CITY_SOUND_KEY = "revora:city-sound";
/** A record older than this is history, not news, even if it newly appears in the read. */
export const CUE_MAX_AGE_MS = 10 * 60_000;

const SUCCESS = new Set(["completed", "ok", "succeeded", "success", "done"]);
const ACTIVE = new Set(["running", "queued", "retrying", "waiting"]);
const APPROVAL_SOURCES = new Set(["approval_queue", "jarvis_approvals"]);
const rowKey = (row: CityWork) => `${row.source}:${row.id}`;
const isFresh = (row: CityWork, now: number) => {
  const at = Date.parse(row.at);
  return Number.isFinite(at) && now - at >= 0 && now - at <= CUE_MAX_AGE_MS;
};

/**
 * What changed between two reads. `prev` null is the first read after load and
 * never makes a sound. Returns every cue that applies, most important first.
 */
export function diffCityCues(prev: readonly CityWork[] | null, next: readonly CityWork[], now: number = Date.now()): CityCue[] {
  if (!prev) return [];
  const before = new Map(prev.map((row) => [rowKey(row), row]));
  const found = new Set<CityCue>();
  for (const row of next) {
    const old = before.get(rowKey(row));
    if (!isFresh(row, now)) continue;
    const failed = (FAILED_STATUSES as readonly string[]).includes(row.status);
    const wasFailed = old ? (FAILED_STATUSES as readonly string[]).includes(old.status) : false;
    if (failed && !wasFailed) found.add("failure");
    else if (APPROVAL_SOURCES.has(row.source) && row.status === "pending" && !old) found.add("approval");
    else if (SUCCESS.has(row.status) && old && ACTIVE.has(old.status)) found.add("success");
    else if (row.status === "running" && !old) found.add("handoff");
  }
  return CUE_PRIORITY.filter((cue) => found.has(cue));
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** Sound starts on only when it was left on AND the visitor has not asked for reduced motion. */
export function readSoundOn(storage: StorageLike | null | undefined, reducedMotion: boolean): boolean {
  if (reducedMotion) return false;
  try { return storage?.getItem(CITY_SOUND_KEY) === "on"; } catch { return false; }
}

export function writeSoundOn(storage: StorageLike | null | undefined, on: boolean): void {
  try { storage?.setItem(CITY_SOUND_KEY, on ? "on" : "off"); } catch { /* private mode: not remembered */ }
}

type Tone = { freq: number; at: number; length: number; type?: OscillatorType; gain?: number };
export const CUE_TONES: Record<CityCue, readonly Tone[]> = {
  handoff: [{ freq: 1200, at: 0, length: 0.05, gain: 0.05 }],
  success: [{ freq: 660, at: 0, length: 0.22 }, { freq: 990, at: 0.12, length: 0.3 }],
  failure: [{ freq: 196, at: 0, length: 0.4, type: "triangle", gain: 0.14 }],
  approval: [{ freq: 880, at: 0, length: 0.12 }, { freq: 880, at: 0.18, length: 0.12 }],
};

type Ctor = typeof AudioContext;
const contextCtor = (): Ctor | null => {
  if (typeof window === "undefined") return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext ?? null;
};

/** The sound engine. Nothing touches the audio system until `unlock()` runs inside a user gesture. */
export function createCitySound() {
  let ctx: AudioContext | null = null;
  return {
    get unlocked() { return ctx !== null; },
    /** Call from a click, tap or key press only. */
    unlock(): boolean {
      try {
        if (!ctx) {
          const Audio = contextCtor();
          if (!Audio) return false;
          ctx = new Audio();
        }
        if (ctx.state === "suspended") void ctx.resume();
        return true;
      } catch { return false; }
    },
    /** Plays nothing until unlocked. Never throws. */
    play(cue: CityCue): void {
      const audio = ctx;
      if (!audio) return;
      try {
        const start = audio.currentTime;
        for (const tone of CUE_TONES[cue]) {
          const osc = audio.createOscillator();
          const gain = audio.createGain();
          const t0 = start + tone.at;
          osc.type = tone.type ?? "sine";
          osc.frequency.value = tone.freq;
          gain.gain.setValueAtTime(0.0001, t0);
          gain.gain.exponentialRampToValueAtTime(tone.gain ?? 0.1, t0 + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001, t0 + tone.length);
          osc.connect(gain).connect(audio.destination);
          osc.start(t0);
          osc.stop(t0 + tone.length + 0.02);
        }
      } catch { /* audio is a nicety; never break the city */ }
    },
  };
}
