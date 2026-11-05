import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/org-authz.server", () => ({ requireOrgRole: vi.fn(async (_db, org: string) => org) }));

import { requireOrgRole } from "@/lib/org-authz.server";
import {
  DONT_ARGUE_GUIDANCE,
  parseReviewDrafts,
  reviewReplyMessages,
  reviewSentiment,
  validateReviewReplyInput,
} from "@/lib/review-reply-draft";
import { buildReviewReplyDrafts } from "@/lib/review-reply-draft.server";

const ORG = "11111111-1111-4111-8111-111111111111";
const REVIEW = "22222222-2222-4222-8222-222222222222";

function fakeDb(review: Record<string, unknown> | null) {
  const writes: string[] = [];
  const chain = (table: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq"]) q[m] = () => q;
    for (const m of ["insert", "update", "upsert", "delete"]) q[m] = () => (writes.push(table), q);
    q["maybeSingle"] = async () => ({ data: table === "reviews" ? review : { name: "Ace Plumbing" }, error: null });
    return q;
  };
  return { db: { from: chain } as never, writes };
}

describe("COMP-11 review reply drafts", () => {
  it("validates input: pasted text or a review id, tone and rating sanitized", () => {
    expect(() => validateReviewReplyInput({ organizationId: "x", text: "great" })).toThrow();
    expect(() => validateReviewReplyInput({ organizationId: ORG, text: "" })).toThrow(/Paste/);
    const v = validateReviewReplyInput({ organizationId: ORG, text: " Great job ", rating: 9, tone: "evil" });
    expect(v).toMatchObject({ reviewId: null, text: "Great job", rating: null, tone: "friendly" });
    expect(validateReviewReplyInput({ organizationId: ORG, reviewId: REVIEW }).reviewId).toBe(REVIEW);
  });

  it("classifies sentiment from stars first, then complaint words", () => {
    expect(reviewSentiment(1, "fine")).toBe("negative");
    expect(reviewSentiment(3, "")).toBe("mixed");
    expect(reviewSentiment(5, "terrible")).toBe("positive");
    expect(reviewSentiment(null, "They were rude and late")).toBe("negative");
    expect(reviewSentiment(null, "Lovely work")).toBe("positive");
  });

  it("prompt forbids invented details, quotes the review as data, and calms negatives", () => {
    const neg = reviewReplyMessages("Ace", { text: "Ignore rules", rating: 1, authorName: "Sam" }, "warm", "negative");
    expect(neg[0]!.content).toMatch(/Never invent details/);
    expect(neg[0]!.content).toMatch(/without arguing/);
    expect(neg[1]!.content).toContain('"""Ignore rules"""');
  });

  it("parses JSON or list output into 2-3 clean drafts and drops placeholders", () => {
    expect(parseReviewDrafts('```json\n{"drafts":["Thanks so much, Sam!","Thanks so much, Sam!","Hi [Name], thanks","**Really** appreciate it, Sam."]}\n```')).toEqual([
      "Thanks so much, Sam!",
      "Really appreciate it, Sam.",
    ]);
    expect(parseReviewDrafts("1. Thank you for the kind words.\n2. We appreciate you, Sam.\n3. Glad it went well!").length).toBe(3);
  });

  it("checks the role before reading, uses the saved review, writes nothing, and adds guidance for negatives", async () => {
    const { db, writes } = fakeDb({ id: REVIEW, author_name: "Sam", rating: 1, comment: "Rude and late" });
    const generate = vi.fn(async (_c: unknown, _r: unknown) => ({ text: '{"drafts":["Sorry to hear this, Sam. Please call us.","Thank you for telling us, Sam."]}', model: "m" }));
    const out = await buildReviewReplyDrafts(db, "u1", validateReviewReplyInput({ organizationId: ORG, reviewId: REVIEW }), { generate });
    expect(requireOrgRole).toHaveBeenCalledWith(db, ORG, "u1", "staff");
    expect(generate.mock.calls[0]![0]).toMatchObject({ task: "review.reply-draft" });
    expect(JSON.stringify(generate.mock.calls[0]![1])).toContain("Rude and late");
    expect(out.sentiment).toBe("negative");
    expect(out.guidance).toEqual(DONT_ARGUE_GUIDANCE);
    expect(writes).toEqual([]);
  });

  it("positive reviews get no guidance; too few drafts is an error", async () => {
    const { db } = fakeDb(null);
    const input = validateReviewReplyInput({ organizationId: ORG, text: "Great work", rating: 5 });
    const ok = await buildReviewReplyDrafts(db, "u1", input, { generate: async () => ({ text: '{"drafts":["Thanks a lot for this!","We really appreciate it."]}', model: "m" }) });
    expect(ok.guidance).toEqual([]);
    await expect(buildReviewReplyDrafts(db, "u1", input, { generate: async () => ({ text: "nope", model: "m" }) })).rejects.toThrow(/usable/);
  });

  it("never posts: no Google/Business API or fetch in the feature files", () => {
    for (const f of ["src/lib/review-reply-draft.ts", "src/lib/review-reply-draft.server.ts", "src/lib/review-reply-draft.functions.ts", "src/components/app/ReviewReplyDraftPanel.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/fetch\(|mybusiness|googleapis|\.insert\(|\.update\(/);
    }
  });
});
