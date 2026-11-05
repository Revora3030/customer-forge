/**
 * Rendered contract for the CU-5 checkpoint pieces (renderToStaticMarkup, as
 * in builder-chat-a11y.test.tsx): hidden from non-owners, the timeline shows
 * names, pins and the live copy, restore is offered only where it is safe, and
 * the before/after slider marks what changed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Checkpoint } from "@/lib/builder/checkpoints";

const state = vi.hoisted(() => ({
  data: undefined as undefined | { allowed: boolean; checkpoints: Checkpoint[] },
}));
vi.mock("@/components/app/builder-chat/use-checkpoints", () => ({
  useCheckpoints: () => ({ data: state.data, isLoading: false, isError: false }),
  useRestoreCheckpoint: () => ({ mutate: () => undefined, isPending: false }),
  useUpdateCheckpoint: () => ({ mutate: () => undefined, isPending: false }),
}));
vi.mock("@/components/app/builder-chat/CheckpointCompare", async (original) => ({
  ...(await original<object>()),
  CheckpointCompare: () => null,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/builder/checkpoints.functions", () => ({ compareCheckpoint: async () => null }));

import { CheckpointTimeline, CheckpointTimelineButton } from "./CheckpointTimeline";
import { RestoreBeforeMessage } from "./RestoreBeforeMessage";
import { CheckpointCompareView } from "./CheckpointCompare";

const ORG = "11111111-1111-4111-8111-111111111111";
const cp = (version: number, extra: Partial<Checkpoint> = {}): Checkpoint => ({
  id: `v${version}`,
  version,
  date: `2026-10-0${version}T12:00:00Z`,
  who: "Adam",
  kind: "publish",
  restoredFrom: null,
  summary: "Changed the hero.",
  isLive: false,
  verification: null,
  name: null,
  pinned: false,
  ...extra,
});
const list = [
  cp(3, { isLive: true }),
  cp(2, { name: "Spring prices", pinned: true }),
  cp(1, { verification: "failed" }),
];

beforeEach(() => {
  state.data = { allowed: true, checkpoints: list };
});

describe("checkpoint timeline", () => {
  it("is hidden from people who are not owners or admins", () => {
    state.data = { allowed: false, checkpoints: [] };
    expect(renderToStaticMarkup(<CheckpointTimelineButton organizationId={ORG} />)).toBe("");
    expect(renderToStaticMarkup(<CheckpointTimeline organizationId={ORG} />)).toBe("");
    expect(
      renderToStaticMarkup(
        <RestoreBeforeMessage
          organizationId={ORG}
          task={{ id: "t", sentAt: "2026-10-04T00:00:00Z" }}
        />,
      ),
    ).toBe("");
  });

  it("shows the header button to owners", () => {
    const html = renderToStaticMarkup(<CheckpointTimelineButton organizationId={ORG} />);
    expect(html).toContain('aria-label="Checkpoints"');
  });

  it("lists checkpoints with the live copy, names and pins, and offers restore only where safe", () => {
    const html = renderToStaticMarkup(<CheckpointTimeline organizationId={ORG} />);
    expect(html).toContain("Live now");
    expect(html).toContain("Spring prices");
    expect(html).toContain("Pinned");
    expect(html).toContain("Unpin");
    expect(html).toContain('data-testid="checkpoint-restore-2"');
    // The live copy is already live; a failed live check is never offered.
    expect(html).not.toContain('data-testid="checkpoint-restore-3"');
    expect(html).not.toContain('data-testid="checkpoint-restore-1"');
    // Phone-sized tap targets.
    expect(html).toContain("min-h-11");
  });
});

describe("restore to before this message", () => {
  it("offers the checkpoint from before the message", () => {
    const html = renderToStaticMarkup(
      <RestoreBeforeMessage
        organizationId={ORG}
        task={{ id: "t1", sentAt: "2026-10-02T18:00:00Z" }}
      />,
    );
    expect(html).toContain("Restore to before this message");
  });
  it("offers nothing when the live site is already from before the message", () => {
    expect(
      renderToStaticMarkup(
        <RestoreBeforeMessage
          organizationId={ORG}
          task={{ id: "t2", sentAt: "2026-10-05T00:00:00Z" }}
        />,
      ),
    ).toBe("");
  });
});

describe("before/after slider", () => {
  it("labels both sides, says it is an outline and marks changed sections", () => {
    const outline = (heading: string) => ({
      pages: [
        { id: "home", title: "Home", sections: [{ id: "a", label: "Hero", heading, text: "" }] },
      ],
    });
    const html = renderToStaticMarkup(
      <CheckpointCompareView
        before={outline("Old")}
        after={outline("New")}
        beforeLabel="Version 2"
      />,
    );
    expect(html).toContain("Before");
    expect(html).toContain("Now");
    expect(html).toContain("not a screenshot");
    expect(html).toContain('data-changed="true"');
    expect(html).toContain('type="range"');
    expect(html).toContain("inset(0 50% 0 0)");
  });
});
