import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkFeedView } from "@/components/app/WorkFeed";
import { buildWorkFeed, type FeedJob } from "@/lib/builder/work-feed";

const START = Date.parse("2026-10-28T03:00:00.000Z");
const T = (sec: number) => new Date(START + sec * 1000).toISOString();
const ALL = ["business", "services", "brand", "analysis", "structure", "copy", "conversion", "pictures", "pages", "wording", "layout", "checks", "leads", "ready"];
const job = (over: Partial<FeedJob>): FeedJob => ({
  id: "j", status: "processing", progress: 82, steps: ALL.slice(0, 10),
  stage_timings: { pictures: 71_426, wording: 15_580 }, created_at: T(0), started_at: T(0), completed_at: null,
  section_checkpoints: { sections: { a: 1, b: 1 } }, ...over,
});
const generations = [
  { kind: "first_build_images", model: "openai/gpt-image-2.5-flare", created_at: T(90), message: "Made 1 starter website picture(s)." },
  { kind: "first_build_compositions", model: "lovable · openai/gpt-6-sol+lovable · anthropic/claude-sonnet-5+lovable · openai/gpt-6-sol", created_at: T(300) },
];
const images = [{ id: "i1", slot: "hero", status: "approved", url: "https://img.example/hero.png", at: T(60) }];

describe("WorkFeedView", () => {
  it("shows a running build step by step: timings, the live step, the models that answered and the pictures", () => {
    const feed = buildWorkFeed({ job: job({}), progress: [{ stage: "composing each section's layout", detail: "section 5 of 11", at: T(200) }], generations, images, now: START + 215_000 });
    const html = renderToStaticMarkup(<WorkFeedView feed={feed} />);
    expect(html).toContain("composing each section&#x27;s layout — section 5 of 11");
    expect(html).toContain("Pictures generated and checked");
    expect(html).toContain("1m 11s");
    expect(html).toContain("Composing each section&#x27;s layout");
    expect(html).toContain("2 sections laid out so far");
    expect(html).toContain("3 more steps to come");
    expect(html).toContain("GPT 6 Sol ×2");
    expect(html).toContain("Claude Sonnet 5");
    expect(html).toContain("GPT Image 2.5 Flare");
    expect(html).toContain("Made 1 starter website picture(s).");
    expect(html).toContain('src="https://img.example/hero.png"');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-expanded="true"');
  });

  it("collapses an ended build to its summary line, and says plainly where a failed one stopped", () => {
    const done = buildWorkFeed({ job: job({ status: "completed", progress: 100, steps: ALL, completed_at: T(430) }), progress: [], generations, images, now: START + 999_000 });
    const doneHtml = renderToStaticMarkup(<WorkFeedView feed={done} />);
    expect(doneHtml).toContain("Your draft is ready");
    expect(doneHtml).toContain("Worked for 7m 10s · 14 steps · 4 AI calls");
    expect(doneHtml).toContain('aria-expanded="false"');
    expect(doneHtml).not.toContain("Build steps");

    const failed = buildWorkFeed({ job: job({ status: "failed", steps: ALL.slice(0, 11), completed_at: T(600) }), progress: [], generations: [], images: [], now: START + 999_000 });
    const failedHtml = renderToStaticMarkup(<WorkFeedView feed={failed} />);
    expect(failedHtml).toContain("Stopped at: checking links, mobile and quality");
    expect(failedHtml).toContain("Ran for 10m 00s · 11 steps");
  });
});
