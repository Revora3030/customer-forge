import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CityWork } from "./ai-city";
import { CITY_SOUND_KEY, CUE_MAX_AGE_MS, CUE_TONES, createCitySound, diffCityCues, readSoundOn, writeSoundOn } from "./city-sound";
import { CitySound } from "@/components/admin/city/CitySound";

const NOW = Date.parse("2026-11-05T12:00:00Z");
const row = (over: Partial<CityWork> & { id: string }): CityWork => ({ district: "factory", title: "t", status: "completed", at: new Date(NOW - 30_000).toISOString(), source: "jobs", ...over });

describe("diffCityCues", () => {
  it("is silent on the first read after load", () => {
    expect(diffCityCues(null, [row({ id: "a", status: "failed" }), row({ id: "b", status: "running" })], NOW)).toEqual([]);
  });
  it("failure: a row that newly fails", () => {
    expect(diffCityCues([row({ id: "a", status: "running" })], [row({ id: "a", status: "failed" })], NOW)).toEqual(["failure"]);
    expect(diffCityCues([], [row({ id: "n", status: "error" })], NOW)).toEqual(["failure"]);
  });
  it("does not repeat a failure that was already failed", () => {
    const failed = row({ id: "a", status: "failed" });
    expect(diffCityCues([failed], [failed], NOW)).toEqual([]);
  });
  it("approval: a newly pending approval", () => {
    expect(diffCityCues([], [row({ id: "p", source: "approval_queue", district: "growth", status: "pending" })], NOW)).toEqual(["approval"]);
    const same = row({ id: "p", source: "approval_queue", status: "pending" });
    expect(diffCityCues([same], [same], NOW)).toEqual([]);
  });
  it("success: only a row that was active and is now finished", () => {
    expect(diffCityCues([row({ id: "a", status: "running" })], [row({ id: "a", status: "completed" })], NOW)).toEqual(["success"]);
    // A finished row that appears from nowhere (old history scrolling in) is not a success.
    expect(diffCityCues([], [row({ id: "z", status: "completed" })], NOW)).toEqual([]);
  });
  it("handoff: new work starts running", () => {
    expect(diffCityCues([], [row({ id: "r", status: "running" })], NOW)).toEqual(["handoff"]);
  });
  it("ignores records older than the freshness window and bad timestamps", () => {
    const old = new Date(NOW - CUE_MAX_AGE_MS - 1000).toISOString();
    expect(diffCityCues([], [row({ id: "o", status: "failed", at: old }), row({ id: "x", status: "failed", at: "nope" })], NOW)).toEqual([]);
  });
  it("lists the most important cue first", () => {
    const next = [row({ id: "h", status: "running" }), row({ id: "f", status: "failed" }), row({ id: "p", source: "approval_queue", status: "pending" })];
    expect(diffCityCues([], next, NOW)).toEqual(["failure", "approval", "handoff"]);
  });
});

describe("preference", () => {
  const store = (value: string | null) => ({ getItem: vi.fn(() => value), setItem: vi.fn() });
  it("is muted by default and when storage is unavailable", () => {
    expect(readSoundOn(store(null), false)).toBe(false);
    expect(readSoundOn(null, false)).toBe(false);
    expect(readSoundOn({ getItem: () => { throw new Error("denied"); }, setItem: vi.fn() }, false)).toBe(false);
  });
  it("restores an explicit on, unless reduced motion is requested", () => {
    expect(readSoundOn(store("on"), false)).toBe(true);
    expect(readSoundOn(store("on"), true)).toBe(false);
  });
  it("remembers the choice under one key and survives a failing store", () => {
    const s = store(null);
    writeSoundOn(s, true);
    expect(s.setItem).toHaveBeenCalledWith(CITY_SOUND_KEY, "on");
    writeSoundOn({ getItem: vi.fn(), setItem: () => { throw new Error("full"); } }, false);
  });
});

describe("engine", () => {
  afterEach(() => vi.unstubAllGlobals());
  const fakeAudio = () => {
    const created: unknown[] = [];
    const osc = () => ({ type: "", frequency: { value: 0 }, connect: vi.fn(function (this: unknown, n: unknown) { return n; }), start: vi.fn(), stop: vi.fn() });
    const gain = () => ({ gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(() => ({})) });
    const oscillators: ReturnType<typeof osc>[] = [];
    class FakeCtx { state = "suspended"; currentTime = 0; destination = {}; resume = vi.fn(); constructor() { created.push(this); } createOscillator() { const o = osc(); oscillators.push(o); return o; } createGain() { return gain(); } }
    vi.stubGlobal("window", { AudioContext: FakeCtx });
    return { created, oscillators };
  };
  it("creates no AudioContext and plays nothing before unlock", () => {
    const { created, oscillators } = fakeAudio();
    const engine = createCitySound();
    engine.play("failure");
    expect(created).toHaveLength(0);
    expect(oscillators).toHaveLength(0);
    expect(engine.unlocked).toBe(false);
  });
  it("unlock creates one context and each cue plays its tones", () => {
    const { created, oscillators } = fakeAudio();
    const engine = createCitySound();
    expect(engine.unlock()).toBe(true);
    expect(engine.unlock()).toBe(true);
    expect(created).toHaveLength(1);
    engine.play("approval");
    expect(oscillators).toHaveLength(CUE_TONES.approval.length);
    engine.play("success");
    expect(oscillators).toHaveLength(CUE_TONES.approval.length + CUE_TONES.success.length);
  });
  it("reports false instead of throwing when there is no Web Audio", () => {
    vi.stubGlobal("window", {});
    expect(createCitySound().unlock()).toBe(false);
  });
  it("failure is the lowest, quietest-feeling tone and handoff the shortest", () => {
    expect(CUE_TONES.failure[0]!.freq).toBeLessThan(CUE_TONES.success[0]!.freq);
    expect(CUE_TONES.handoff[0]!.length).toBeLessThan(CUE_TONES.success[0]!.length);
  });
});

describe("CitySound toggle", () => {
  it("renders muted by default and touches no audio on render", () => {
    const html = renderToStaticMarkup(<CitySound rows={[]} />);
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("Turn city sounds on");
  });
});
