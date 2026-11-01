import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TaskTree, TaskTreeList } from "@/components/app/TaskTree";
import type { TaskNode } from "@/lib/builder/task-tree";

const n = (over: Partial<TaskNode>): TaskNode => ({ id: "x", label: "Step", detail: null, status: "done", durationMs: 1500, startedAtMs: null, endedAtMs: null, model: null, error: null, emphasizeDetail: false, retryable: false, ...over });

describe("TaskTree", () => {
  it("is a polite live region, keyboard-reachable and open while running", () => {
    const html = renderToStaticMarkup(<TaskTree nodes={[n({ id: "a" }), n({ id: "b", label: "Now", status: "running", durationMs: null })]} />);
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("<button");
    expect(html).toContain("Now: Now");
    expect(html).toContain('data-status="running"');
    expect(html).toContain("motion-safe:animate-spin");
    expect(html).not.toContain(" animate-spin");
  });

  it("starts collapsed once done, with the step count and total", () => {
    const html = renderToStaticMarkup(<TaskTree nodes={[n({ id: "a" }), n({ id: "b" })]} />);
    expect(html).toContain("Done · 2 steps · 3s");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('aria-label="Steps"');
  });

  it("opens on a failure and offers Retry only on a retryable failed step", () => {
    const failed = n({ id: "f", label: "Build the page", status: "failed", error: "Stopped", retryable: true });
    const withRetry = renderToStaticMarkup(<TaskTree nodes={[n({ id: "a" }), failed]} onRetry={vi.fn()} />);
    expect(withRetry).toContain('aria-expanded="true"');
    expect(withRetry).toContain('aria-label="Retry Build the page"');
    expect(withRetry).toContain("Stopped at: Build the page");
    const noPlumbing = renderToStaticMarkup(<TaskTree nodes={[failed]} />);
    expect(noPlumbing).not.toContain("Retry Build the page");
    const notRetryable = renderToStaticMarkup(<TaskTreeList nodes={[{ ...failed, retryable: false }]} onRetry={vi.fn()} />);
    expect(notRetryable).not.toContain("Retry");
  });

  it("never prints a percentage and shows the model only when given one", () => {
    const html = renderToStaticMarkup(<TaskTree nodes={[n({ status: "running", durationMs: null, model: "Claude Sonnet 5" })]} />);
    expect(html).toContain("Claude Sonnet 5");
    expect(html).not.toContain("%");
  });

  it("shows the run's total elapsed at the end of a finished tree, and not while it runs", () => {
    const t0 = Date.parse("2026-10-31T10:00:00.000Z");
    const stamped = (id: string, from: number, to: number) => n({ id, startedAtMs: t0 + from * 1000, endedAtMs: t0 + to * 1000, durationMs: (to - from) * 1000 });
    const done = renderToStaticMarkup(<TaskTree defaultOpen nodes={[stamped("a", 0, 2), stamped("b", 5, 74)]} />);
    expect(done).toContain('data-testid="task-tree-total"');
    expect(done).toContain("Total elapsed 1m 14s");
    expect(done).toContain("Done · 2 steps · 1m 14s total");
    const running = renderToStaticMarkup(<TaskTree nodes={[stamped("a", 0, 2), n({ id: "b", status: "running", durationMs: null, startedAtMs: t0 + 5000 })]} />);
    expect(running).not.toContain("Total elapsed");
    const unknown = renderToStaticMarkup(<TaskTree defaultOpen nodes={[n({ id: "a" })]} />);
    expect(unknown).not.toContain("Total elapsed");
  });
});
