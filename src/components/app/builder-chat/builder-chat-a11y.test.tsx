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
vi.mock("@/components/app/SectionHistoryButton", () => ({ SectionHistoryButton: () => null }));

import { BuilderAssistant } from "@/components/app/BuilderAssistant";
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

function render(tasks: ChatTask[], props: { accessBlocked?: boolean } = {}) {
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

  it("offers Try again only where a retry is the right thing", () => {
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
    expect(render([failed("t2", false)])).not.toContain("Try again");
    expect(render([failed("t3", true)])).toContain("Try again");
    expect(render([failed("t4", undefined)])).toContain("Try again");
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
