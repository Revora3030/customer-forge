import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StopBuildBar, WorkFeedView } from "@/components/app/WorkFeed";
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

describe("stopping a build from the chat", () => {
  const running = () => buildWorkFeed({ job: job({}), progress: [], generations: [], images: [], now: START + 215_000 });
  const withId = { id: "11111111-1111-4111-8111-111111111111" };

  it("offers Stop build on a running build that the viewer may stop", () => {
    const html = renderToStaticMarkup(<WorkFeedView feed={running()} job={{ ...job({}), ...withId }} onStop={() => undefined} />);
    expect(html).toContain('data-testid="stop-build"');
    expect(html).toContain("Stop build");
    // It sits outside the collapsible log, so it is visible whether or not the log is open.
    expect(html.indexOf('data-testid="stop-build"')).toBeLessThan(html.indexOf('aria-label="Build steps"'));
  });

  it("offers nothing to someone who may not stop it, nothing without a build to stop, and nothing once it has ended", () => {
    expect(renderToStaticMarkup(<WorkFeedView feed={running()} job={{ ...job({}), ...withId }} />)).not.toContain("stop-build");
    expect(renderToStaticMarkup(<WorkFeedView feed={running()} job={{ ...job({}), id: null }} onStop={() => undefined} />)).not.toContain("stop-build");
    const done = buildWorkFeed({ job: job({ status: "completed", progress: 100, steps: ALL, completed_at: T(430) }), progress: [], generations: [], images: [], now: START + 999_000 });
    expect(renderToStaticMarkup(<WorkFeedView feed={done} job={{ ...job({ status: "completed" }), ...withId }} onStop={() => undefined} />)).not.toContain("stop-build");
    const cancelled = buildWorkFeed({ job: job({ status: "cancelled", completed_at: T(500) }), progress: [], generations: [], images: [], now: START + 999_000 });
    expect(renderToStaticMarkup(<WorkFeedView feed={cancelled} job={{ ...job({ status: "cancelled" }), ...withId }} onStop={() => undefined} />)).not.toContain("stop-build");
  });

  it("asks first, then confirms in plain words, then says it is stopping", () => {
    const noop = () => undefined;
    const ask = renderToStaticMarkup(<StopBuildBar confirming={false} stopping={false} onAsk={noop} onKeep={noop} onConfirm={noop} />);
    expect(ask).toContain("Stop build");
    expect(ask).not.toContain("Keep building");

    const confirm = renderToStaticMarkup(<StopBuildBar confirming stopping={false} onAsk={noop} onKeep={noop} onConfirm={noop} />);
    expect(confirm).toContain("Stop this build? Nothing is published and spending stops.");
    expect(confirm).toContain("Keep building");

    const stopping = renderToStaticMarkup(<StopBuildBar confirming stopping onAsk={noop} onKeep={noop} onConfirm={noop} />);
    expect(stopping).toContain("Stopping — no new AI work is being started.");
    expect(stopping).toContain("disabled");
    expect(stopping).not.toContain("Keep building");
  });
});

describe("WorkFeedView: the draft taking shape", () => {
  it("shows the chosen look and each finished section while the build runs, as plain text", () => {
    const sections = {
      a: { tree: { root: { type: "stack", children: [{ type: "heading", text: "Mobile detailing <b>in</b> Raleigh" }, { type: "text", text: "We come to you." }] } }, media: {}, at: T(100) },
    };
    const look = { direction: { name: "Obsidian Garage", mood: "Dark and glossy", primary: "#0b0d12", secondary: "#1c2230", accent: "#f5b942", font: "Space Grotesk" } };
    const feed = buildWorkFeed({ job: job({ section_checkpoints: { sections }, look }), progress: [], generations: [], images: [], now: START + 400_000 });
    const html = renderToStaticMarkup(<WorkFeedView feed={feed} />);
    expect(html).toContain('data-testid="taking-shape"');
    expect(html).toContain("Obsidian Garage · Space Grotesk");
    expect(html).toContain("Dark and glossy");
    expect(html).toContain("background-color:#0b0d12");
    expect(html).toContain("Mobile detailing &lt;b&gt;in&lt;/b&gt; Raleigh");
    expect(html).not.toContain("<b>in</b>");
    expect(html).toContain("We come to you.");
  });

  it("shows no such block when nothing has been saved yet", () => {
    const feed = buildWorkFeed({ job: job({ section_checkpoints: null }), progress: [], generations: [], images: [], now: START + 400_000 });
    expect(renderToStaticMarkup(<WorkFeedView feed={feed} />)).not.toContain("taking-shape");
  });
});
