/**
 * Rendered accessibility contract for the builder chat (no DOM library in this
 * repo: renderToStaticMarkup, as in DashboardPreview.test.tsx).
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BuilderRequests } from "@/lib/builder-requests.hooks";
import type { ChatTask } from "@/lib/builder/hydrate-tasks";

vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/ai-suggestions.functions", () => ({ getAiSuggestions: async () => ({ suggestions: [] }) }));
vi.mock("@/lib/builder-requests.hooks", () => ({ INSTRUCTION_LIMIT: 1200 }));
vi.mock("@/lib/builder/progress.hooks", () => ({ useBuildProgress: () => ({ steps: [], latest: null }) }));
vi.mock("@/components/app/AssistantMedia", () => ({ AssistantMedia: () => null }));
vi.mock("@/components/app/CompositionPreviewCard", () => ({ CompositionPreviewCard: () => null }));
vi.mock("@/components/app/builder-chat/ResultCards", () => ({ ResultCards: () => null }));
vi.mock("@/components/app/SectionHistoryButton", () => ({ SectionHistoryButton: () => null }));

import { BuilderAssistant, RebuildConfirm } from "@/components/app/BuilderAssistant";
import { ApplyResultCard } from "./ApplyResultCard";
import { MessageMenu } from "./MessageMenu";

const appliedTask: ChatTask = {
  id: "t1",
  instruction: "Make the hero warmer",
  state: "complete",
  steps: [],
  questions: [],
  reply: "I warmed up the hero.",
  applied: 3,
  failedCount: 2,
  staleCount: 0,
  titles: ["Warmer hero headline", "New hero photo", "Softer button"],
};

function fakeRequests(tasks: ChatTask[]): BuilderRequests {
  const noop = () => undefined;
  return {
    tasks,
    busy: false,
    ready: true,
    summary: null,
    capabilities: null,
    memoryLoaded: true,
    branch: "main",
    branches: ["main"],
    hasEarlier: false,
    loadingEarlier: false,
    queue: noop,
    apply: noop,
    retry: noop,
    dismiss: noop,
    newChat: async () => undefined,
    switchBranch: noop,
    loadEarlier: async () => undefined,
    search: () => [],
    progressRunId: (id: string) => id,
    approvedCount: () => 0,
    toggleStep: noop,
    moveStep: noop,
    dropStep: noop,
  } as unknown as BuilderRequests;
}

function render(tasks: ChatTask[], props: Partial<React.ComponentProps<typeof BuilderAssistant>> = {}) {
  const client = new QueryClient();
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <BuilderAssistant
        compact
        organizationId="11111111-1111-4111-8111-111111111111"
        requests={fakeRequests(tasks)}
        emptyTitle="What would you like to change?"
        emptyHint="Ask for any change."
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe("builder chat accessibility", () => {
  it("labels the composer and exposes the conversation as a log", () => {
    const html = render([appliedTask]);
    expect(html).toContain('aria-label="Tell Revora what to change"');
    expect(html).toContain('role="log"');
    expect(html).toContain('id="website-assistant"');
    expect(html).toContain('id="task-t1"');
    expect(html).toContain('aria-label="Chat options"');
    // The restore-point promise stays for screen readers.
    expect(html).toContain("Every change saves a restore point first. On a live website, checked changes go live straight away.");
  });

  it("dims and disables the composer when the access check blocks editing", () => {
    const html = render([], { accessBlocked: true });
    expect(html).toMatch(/<textarea[^>]*disabled=""/);
  });

  it("gives every desktop message action an accessible name", () => {
    const html = renderToStaticMarkup(
      <MessageMenu
        variant="desktop"
        organizationId="org"
        instruction="Make it warmer"
        text="Done"
        onImprove={() => undefined}
        onUndo={() => undefined}
        onClear={() => undefined}
      />,
    );
    const buttons = html.match(/<button[^>]*>/g) ?? [];
    expect(buttons.length).toBeGreaterThanOrEqual(5);
    for (const button of buttons) expect(button).toMatch(/aria-label="[^"]+"/);
    expect(html).toContain('aria-label="Ask Revora to improve this"');
  });

  it("offers one menu button on touch screens", () => {
    const html = renderToStaticMarkup(
      <MessageMenu variant="touch" organizationId="org" instruction="x" text="y" onImprove={() => undefined} onClear={() => undefined} />,
    );
    expect(html.match(/<button[^>]*>/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Response actions"');
  });
});

describe("apply result card", () => {
  it("talks about the draft, never 'reached your website', and offers the retry", () => {
    const html = renderToStaticMarkup(
      <ApplyResultCard applied={5} failedCount={1} staleCount={1} onRetrySkipped={() => undefined} onUndo={() => undefined} onPreview={() => undefined} />,
    );
    expect(html).toContain("Updated your draft · 5 changes");
    expect(html).toContain("Try those 2 again");
    expect(html).toContain("2 changes didn&#x27;t go through. Nothing else was touched.");
    expect(html).toContain("Not live yet — Publish when you");
    expect(html).not.toContain("reached your website");
  });

  it("uses the known reason when one was stored, and hides raw labels behind Technical details", () => {
    const html = renderToStaticMarkup(
      <ApplyResultCard applied={2} staleCount={1} details={["stale set_component (missing_component)"]} />,
    );
    expect(html).toContain("those parts of your page had changed since I planned them");
    expect(html).toMatch(/<details[^>]*><summary[^>]*>Technical details/);
    expect(html).not.toMatch(/<details[^>]*open/);
  });

  it("never reports success when nothing was written", () => {
    expect(renderToStaticMarkup(<ApplyResultCard applied={0} failedCount={3} />)).toBe("");
  });

  it("offers Retry only where a retry is the right thing", () => {
    const failed = (id: string, retryable: boolean | undefined): ChatTask => ({
      id,
      instruction: "Build my website",
      state: "failed",
      steps: [],
      questions: [],
      error: "The build didn't finish.",
      ...(retryable === undefined ? {} : { retryable }),
    });
    // A first build that failed must not be "retried" through the edit planner.
    expect(render([failed("t2", false)])).not.toContain("Retry");
    expect(render([failed("t3", true)])).toContain("Retry");
    expect(render([failed("t4", undefined)])).toContain("Retry");
  });

  it("a tracked build shows its live card without taking the queue's place", () => {
    const tracked: ChatTask = { id: "t5", instruction: "Build my website", state: "building", steps: [], questions: [], tracking: true };
    const html = render([tracked]);
    expect(html).toContain("Applying…");
    expect(html).not.toContain("Waiting — I’ll start this");
  });

  it("renders the card inside the chat for an applied request", () => {
    const html = render([appliedTask]);
    expect(html).toContain("Updated your draft · 3 changes");
    expect(html).toContain("Try those 2 again");
    expect(html).not.toContain("reached your website");
  });
});

describe("chat knows the page and the trade", () => {
  it("shows the open page as a chip and nothing when no page is known", () => {
    const withPage = render([appliedTask], { pageContext: { id: "p1", title: "Services", slug: "services" } });
    expect(withPage).toContain("Viewing: Services");
    expect(render([appliedTask])).not.toContain("Viewing:");
    // A first build has no page yet, so the chip stays out of it.
    expect(render([], { pageContext: { id: "p1", title: "Home", slug: "home" }, onFirstBuild: async () => undefined })).not.toContain("Viewing:");
  });

  it("offers the trade's starter requests in an empty chat straight away", () => {
    const html = render([], {
      starterIdeas: [
        { label: "Add my trade's signature moment", reason: "Auto detailing and car care", instruction: "x" },
        { label: "Make every page richer", reason: "Replace plain text stacks", instruction: "y" },
      ],
    });
    expect(html).toContain("Add my trade&#x27;s signature moment");
    expect(html).toContain("Make every page richer");
    expect(html).not.toContain("animate-pulse rounded-xl");
  });
});

describe("fresh rebuild from the chat", () => {
  const card = (props: { allowed: boolean; busy: boolean }) =>
    renderToStaticMarkup(<RebuildConfirm {...props} onConfirm={() => undefined} onCancel={() => undefined} />);

  it("says what happens first, and only offers the rebuild behind an explicit button", () => {
    const html = card({ allowed: true, busy: false });
    expect(html).toContain("Replace your whole draft with a fresh build?");
    expect(html).toContain("I save a backup first");
    expect(html).toContain("Your live site isn&#x27;t touched until you publish");
    expect(html).toContain("Start fresh rebuild");
    expect(html).toContain("Keep my site");
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Start fresh rebuild/);
  });

  it("disables the button while a build runs, and offers no rebuild to a role that cannot", () => {
    expect(card({ allowed: true, busy: true })).toMatch(/<button[^>]*disabled=""[^>]*>Start fresh rebuild/);
    const denied = card({ allowed: false, busy: false });
    expect(denied).not.toContain("Start fresh rebuild");
    expect(denied).toContain("Only an owner or admin can replace the whole draft");
  });

  it("routes the rebuild words to the confirm card instead of the edit planner", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/components/app/BuilderAssistant.tsx", "utf8");
    expect(source).toMatch(/onFreshRebuild && attachments\.length === 0 && wantsFreshRebuild\(text\)[\s\S]*setRebuildAsk[\s\S]*requests\.queue\(scoped\(text\), attachments\)/);
  });
});

describe("show in preview", () => {
  it("offers a Show button only for the changes that have a place in the preview", () => {
    const html = renderToStaticMarkup(
      <ApplyResultCard applied={2} titles={["Warmer headline", "Set SEO title"]} reveals={[() => undefined, null]} />,
    );
    expect(html).toContain('aria-label="Show in preview: Warmer headline"');
    expect(html).not.toContain('aria-label="Show in preview: Set SEO title"');
    expect(renderToStaticMarkup(<ApplyResultCard applied={1} titles={["Warmer headline"]} />)).not.toContain("Show in preview");
  });

  it("offers it on each planned change that points at a section", () => {
    const S = "11111111-1111-4111-8111-111111111111";
    const planned: ChatTask = {
      id: "t9", instruction: "Warm the hero", state: "waiting_for_approval", questions: [],
      steps: [
        { key: "a", title: "Warmer headline", where: "Home → Hero", destructive: false, included: true, target: { sectionId: S } },
        { key: "b", title: "Set SEO title", where: "Home", destructive: false, included: true },
      ],
    };
    const html = render([planned], { onReveal: () => undefined });
    expect(html).toContain('aria-label="Show in preview: Warmer headline"');
    expect(html).not.toContain('aria-label="Show in preview: Set SEO title"');
    expect(render([planned])).not.toContain("Show in preview");
  });
});
