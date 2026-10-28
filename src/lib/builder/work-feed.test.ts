import { describe, expect, it } from "vitest";
import { buildWorkFeed, formatDuration, modelsAsked, parseModels, timedSteps, type FeedJob } from "./work-feed";

const START = "2026-10-28T03:00:00.000Z";
const T = (sec: number) => new Date(Date.parse(START) + sec * 1000).toISOString();
const job = (over: Partial<FeedJob> = {}): FeedJob => ({
  id: "j1", status: "processing", current_step: "pictures", progress: 58,
  steps: ["business", "services", "brand", "analysis", "structure", "copy", "conversion", "pictures"],
  stage_timings: { business: 44, services: 14, brand: 30, analysis: 80, structure: 34, copy: 23, conversion: 46, pictures: 71426 },
  created_at: START, started_at: START, completed_at: null, ...over,
});

describe("formatDuration", () => {
  it("reads naturally", () => {
    expect(formatDuration(44)).toBe("<1s");
    expect(formatDuration(12_400)).toBe("12s");
    expect(formatDuration(317_568)).toBe("5m 18s");
    expect(formatDuration(null)).toBe("");
  });
});

describe("parseModels", () => {
  it("counts the models that answered and names them for people", () => {
    const parsed = parseModels("lovable · openai/gpt-6.1-sol+lovable · anthropic/claude-sonnet-5+lovable · openai/gpt-6.1-sol");
    expect(parsed).toEqual([{ name: "GPT 6.1 Sol", count: 2 }, { name: "Claude Sonnet 5", count: 1 }]);
    expect(parseModels("openai/gpt-image-2.5-flare")).toEqual([{ name: "GPT Image 2.5 Flare", count: 1 }]);
    expect(parseModels("pending-ai")).toEqual([]);
    expect(parseModels("none")).toEqual([]);
    expect(parseModels(null)).toEqual([]);
  });
});

describe("buildWorkFeed", () => {
  it("shows a running build: done steps with their timings, the open step as running, the rest pending", () => {
    const feed = buildWorkFeed({
      job: job(),
      progress: [{ stage: "assembling your pages", detail: null, at: T(80) }],
      generations: [],
      images: [],
      now: Date.parse(T(90)),
    });
    expect(feed.state).toBe("running");
    expect(feed.percent).toBe(58);
    expect(feed.elapsedMs).toBe(90_000);
    expect(feed.headline).toBe("assembling your pages");
    const byKey = Object.fromEntries(feed.stages.map((s) => [s.key, s]));
    expect(byKey["pictures"]).toMatchObject({ state: "done", durationMs: 71_426 });
    expect(byKey["pages"]).toMatchObject({ state: "running", label: "Assembling your pages" });
    expect(byKey["layout"]).toMatchObject({ state: "pending" });
    expect(feed.summary).toBe("");
  });

  it("falls back to the running step's own name when nothing live was recorded", () => {
    const feed = buildWorkFeed({ job: job(), progress: [], generations: [], images: [], now: Date.parse(T(5)) });
    expect(feed.headline).toBe("Assembling your pages");
  });

  it("lists the recorded AI calls in order with their models, and only first-build kinds", () => {
    const feed = buildWorkFeed({
      job: job({ status: "completed", current_step: "ready", progress: 100, steps: ["business", "services", "brand", "analysis", "structure", "copy", "conversion", "pictures", "pages", "wording", "layout", "checks", "leads", "ready"], completed_at: T(430) }),
      progress: [],
      generations: [
        { kind: "first_build_compositions", model: "lovable · openai/gpt-6-sol+lovable · anthropic/claude-sonnet-5+lovable · openai/gpt-6-sol", created_at: T(300) },
        { kind: "first_build_images", model: "openai/gpt-image-2.5-flare", created_at: T(90), message: "Made 1 starter website picture(s) with the premium model.\n" },
        { kind: "build_attempt_started", model: "none", created_at: T(1) },
        { kind: "website_copy", model: "pending-ai", created_at: T(2) },
      ],
      images: [],
      now: Date.parse(T(999)),
    });
    expect(feed.ai.map((i) => i.label)).toEqual(["Pictures", "Section layouts"]);
    expect(feed.ai[0]).toMatchObject({ calls: 1, note: "Made 1 starter website picture(s) with the premium model.", offsetMs: 90_000 });
    expect(feed.ai[1]!.models).toEqual([{ name: "GPT 6 Sol", count: 2 }, { name: "Claude Sonnet 5", count: 1 }]);
    expect(feed.aiCalls).toBe(4);
    expect(feed.state).toBe("done");
    expect(feed.summary).toBe("Worked for 7m 10s · 14 steps · 4 AI calls");
    expect(feed.stages.every((s) => s.state === "done")).toBe(true);
  });

  it("marks the step a failed build stopped at, and never claims the rest ran", () => {
    const feed = buildWorkFeed({
      job: job({ status: "failed", progress: 82, steps: ["business", "services", "brand", "analysis", "structure", "copy", "conversion", "pictures", "pages", "wording", "layout"], completed_at: T(600) }),
      progress: [], generations: [], images: [], now: Date.parse(T(700)),
    });
    expect(feed.state).toBe("failed");
    expect(feed.stages.find((s) => s.state === "failed")?.key).toBe("checks");
    expect(feed.headline).toBe("Stopped at: checking links, mobile and quality");
    expect(feed.stages.filter((s) => s.state === "done")).toHaveLength(11);
    expect(feed.summary).toBe("Ran for 10m 00s · 11 steps");
  });

  it("reports sections laid out so far only while layouts run, and only pictures that have an address", () => {
    const feed = buildWorkFeed({
      job: job({ steps: ["business", "services", "brand", "analysis", "structure", "copy", "conversion", "pictures", "pages", "wording"], section_checkpoints: { sections: { a: {}, b: {}, c: {} } } }),
      progress: [], generations: [],
      images: [
        { id: "1", slot: "hero", status: "approved", url: "https://x/1.png", at: T(60) },
        { id: "2", slot: "gallery", status: "pending", url: null, at: T(61) },
      ],
      now: Date.parse(T(200)),
    });
    expect(feed.sectionsDone).toBe(3);
    expect(feed.pictures.map((p) => p.id)).toEqual(["1"]);
  });

  it("is empty with no job, and says a queued job is queued", () => {
    expect(buildWorkFeed({ job: null, progress: [], generations: [], images: [], now: 0 }).state).toBe("none");
    const queued = buildWorkFeed({ job: job({ status: "queued", steps: [], stage_timings: {}, progress: 0 }), progress: [], generations: [], images: [], now: Date.parse(T(3)) });
    expect(queued.state).toBe("queued");
    expect(queued.headline).toMatch(/^Queued/);
  });
});

describe("timedSteps and modelsAsked", () => {
  const rows = [
    { stage: "designing your change", detail: "composing", at: T(30) },
    { stage: "model at work", detail: "lovable · openai/gpt-6.1-sol", at: T(20) },
    { stage: "reading your message", detail: null, at: T(10) },
    { stage: "reading your message", detail: null, at: T(5) },
  ];

  it("lists steps oldest first with the gap to the next one, and leaves the running step open", () => {
    const steps = timedSteps(rows);
    expect(steps.map((s) => s.stage)).toEqual(["reading your message", "model at work", "designing your change"]);
    expect(steps.map((s) => s.durationMs)).toEqual([15_000, 10_000, null]);
  });

  it("names each model the planner asked once", () => {
    expect(modelsAsked([{ stage: "model at work", detail: "lovable · anthropic/claude-sonnet-5", at: T(40) }, ...rows])).toEqual(["GPT 6.1 Sol", "Claude Sonnet 5"]);
    expect(modelsAsked([{ stage: "model at work", detail: "free pool", at: T(1) }])).toEqual(["free pool"]);
  });
});
