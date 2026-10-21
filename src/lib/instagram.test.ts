import { describe, it, expect, vi, afterEach } from "vitest";
import { parseActions, JARVIS_ACTION_CLASSES, appendReplyMeta, splitReplyMeta } from "./jarvis-actions";
import { requireInstagramApproval, requireInstagramAccount, parseInstagramDraft } from "./instagram-post";
import { publishInstagramDraft, finishInstagramOAuth } from "./instagram.server";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("./instagram-provider.server", () => ({
  instagramGraph: vi.fn(), exchangeInstagramCode: vi.fn(),
  InstagramProviderError: class extends Error { constructor(public status: number, detail: string) { super(detail); } },
}));
vi.mock("./instagram-crypto.server", () => ({
  instagramHash: () => "hash", instagramNonce: () => "nonce", openInstagramToken: () => "test-token", sealInstagramToken: () => "ciphertext",
}));
import { instagramGraph, exchangeInstagramCode } from "./instagram-provider.server";
afterEach(() => vi.clearAllMocks());

function fakeDb(responses: Array<{ data?: unknown; error?: unknown }>) {
  const writes: unknown[] = [];
  const from = vi.fn(() => {
    const result = responses.shift() ?? { data: null, error: null };
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "is", "gt", "in", "update", "insert", "upsert"]) {
      chain[method] = vi.fn((...args: unknown[]) => { if (method === "update") writes.push(args[0]); return chain; });
    }
    chain["maybeSingle"] = vi.fn(async () => result);
    chain["then"] = (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve);
    return chain;
  });
  return { db: { from } as unknown as SupabaseClient, from, writes };
}
const post = { user_id: "owner", instagram_id: "123", content_hash: "hash", caption: "Owner approved caption", image_url: "https://images.example.com/owned.jpg", status: "draft" };
const account = { instagram_id: "123", username: "owner", token_ciphertext: "encrypted", expires_at: "2099-01-01" };
const approval = { postId: "post", contentHash: "hash", approved: true };

describe("Instagram owner approval", () => {
  it("always proposes posts instead of letting the model publish", () => {
    const parsed = parseActions([{ id: "instagram.post", args: { caption: "Real offer", imageUrl: "https://images.example.com/owned.jpg" } }], []);
    expect(parsed.reads).toEqual([]);
    expect(parsed.proposals).toHaveLength(1);
    expect(JARVIS_ACTION_CLASSES["instagram.post"].autoRuns).toBe(false);
    expect(JARVIS_ACTION_CLASSES["instagram.post"].risk).toBe("ask");
    expect(parseActions([{ id: "instagram.publish" }], []).rejected).toHaveLength(1);
    expect(splitReplyMeta(appendReplyMeta("Review first", { ran: [], proposals: parsed.proposals })).meta.proposals).toEqual(parsed.proposals);
  });
  it("requires explicit approval for each exact saved post", () => {
    expect(() => requireInstagramApproval({ approved: false, contentHash: "hash" }, "hash")).toThrow(/Approve/);
    expect(() => requireInstagramApproval({ approved: true, contentHash: "changed" }, "hash")).toThrow(/changed/);
    expect(() => requireInstagramApproval(approval, "hash")).not.toThrow();
  });
  it("rejects a different connected account", () => {
    expect(() => requireInstagramAccount("123", "456")).toThrow(/account changed/);
  });
  it("rejects private and credential-bearing image URLs", () => {
    for (const imageUrl of ["http://images.example.com/a.jpg", "https://127.0.0.1/a.jpg", "https://user:pass@images.example.com/a.jpg", "https://metadata.google.internal/a.jpg"]) {
      expect(() => parseInstagramDraft({ caption: "Post", imageUrl })).toThrow();
    }
  });
  it("checks ownership before any provider call", async () => {
    const { db, from } = fakeDb([{ data: null }]);
    await expect(publishInstagramDraft(db, "other-owner", approval)).rejects.toThrow(/wasn't found/);
    expect(from).toHaveBeenCalledWith("jarvis_instagram_posts");
    expect(instagramGraph).not.toHaveBeenCalled();
  });
  it("does not call Instagram without individual approval", async () => {
    const { db } = fakeDb([{ data: post }]);
    await expect(publishInstagramDraft(db, "owner", { ...approval, approved: false })).rejects.toThrow(/Approve/);
    expect(instagramGraph).not.toHaveBeenCalled();
  });
  it("fences simultaneous approval attempts", async () => {
    const { db } = fakeDb([{ data: post }, { data: account }, { data: null }]);
    await expect(publishInstagramDraft(db, "owner", approval)).rejects.toThrow(/already submitted/);
    expect(instagramGraph).not.toHaveBeenCalled();
  });
  it("never resubmits already-published posts", async () => {
    const { db } = fakeDb([{ data: { ...post, status: "published" } }, { data: account }]);
    await expect(publishInstagramDraft(db, "owner", approval)).rejects.toThrow(/already submitted/);
    expect(instagramGraph).not.toHaveBeenCalled();
  });
  it("records approval and publishes the saved content exactly once", async () => {
    vi.mocked(instagramGraph).mockResolvedValueOnce({ id: "321" }).mockResolvedValueOnce({ id: "654" }).mockResolvedValueOnce({ permalink: "https://www.instagram.com/p/approved/" });
    const { db, writes } = fakeDb([{ data: post }, { data: account }, { data: { id: "post" } }, {}, {}, {}]);
    await expect(publishInstagramDraft(db, "owner", approval)).resolves.toEqual({ published: true });
    expect(writes[0]).toMatchObject({ status: "publishing", approved_by: "owner" });
    expect(instagramGraph).toHaveBeenNthCalledWith(1, "test-token", "/123/media", { image_url: post.image_url, caption: post.caption });
    expect(instagramGraph).toHaveBeenNthCalledWith(2, "test-token", "/123/media_publish", { creation_id: "321" });
    expect(writes).toContainEqual({ status: "published", media_id: "654", error: null });
  });
  it("keeps uncertain publishes locked instead of retrying", async () => {
    vi.mocked(instagramGraph).mockResolvedValueOnce({ id: "321" }).mockRejectedValueOnce(new Error("Timed out"));
    const { db, writes } = fakeDb([{ data: post }, { data: account }, { data: { id: "post" } }, {}, {}]);
    await expect(publishInstagramDraft(db, "owner", approval)).rejects.toThrow(/Timed out/);
    expect(instagramGraph).toHaveBeenCalledTimes(2);
    expect(writes.at(-1)).toMatchObject({ status: "uncertain" });
  });
  it("rejects expired or reused OAuth state before exchanging credentials", async () => {
    const { db } = fakeDb([{ data: null }]);
    await expect(finishInstagramOAuth(db, "a".repeat(64), "code")).rejects.toThrow(/expired or was already used/);
    expect(exchangeInstagramCode).not.toHaveBeenCalled();
  });
});