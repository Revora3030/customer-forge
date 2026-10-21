import type { SupabaseClient } from "@supabase/supabase-js";
import { INSTAGRAM_CALLBACK, INSTAGRAM_SCOPES, parseInstagramDraft, requireInstagramAccount, requireInstagramApproval, type InstagramDraft } from "./instagram-post";
import { instagramHash, instagramNonce, sealInstagramToken, openInstagramToken } from "./instagram-crypto.server";
import { exchangeInstagramCode, instagramGraph, InstagramProviderError } from "./instagram-provider.server";

export type InstagramPostRow = {
  id: string; instagram_id: string; username: string; caption: string; image_url: string; content_hash: string;
  status: string; permalink: string | null; error: string | null; created_at: string;
};
const POST_FIELDS = "id,instagram_id,username,caption,image_url,content_hash,status,permalink,error,created_at";
const configured = () => Boolean(process.env["INSTAGRAM_APP_ID"] && process.env["INSTAGRAM_APP_SECRET"] && process.env["INSTAGRAM_CREDENTIAL_SECRET"]);
export async function instagramStatus(db: SupabaseClient, userId: string) {
  const [account, posts] = await Promise.all([
    db.from("jarvis_instagram_connections").select("instagram_id,username,expires_at").eq("user_id", userId).maybeSingle(),
    db.from("jarvis_instagram_posts").select(POST_FIELDS).eq("user_id", userId).order("created_at", { ascending: false }).limit(30),
  ]);
  if (account.error || posts.error) throw new Error("Couldn't load Instagram. Try refreshing.");
  const expired = account.data ? Date.parse(String(account.data.expires_at)) <= Date.now() : false;
  return { configured: configured(), connected: Boolean(account.data) && !expired, reconnectRequired: expired, account: account.data as { instagram_id: string; username: string; expires_at: string } | null, posts: (posts.data ?? []) as InstagramPostRow[] };
}
export async function startInstagramOAuth(db: SupabaseClient, userId: string) {
  if (!configured()) throw new Error("Save your Instagram Meta app credentials before connecting.");
  const state = instagramNonce();
  const { error } = await db.from("jarvis_instagram_oauth").insert({ user_id: userId, state_hash: instagramHash(state), expires_at: new Date(Date.now() + 600000).toISOString() });
  if (error) throw new Error("Couldn't start Instagram sign-in.");
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.search = new URLSearchParams({ client_id: process.env["INSTAGRAM_APP_ID"] ?? "", redirect_uri: INSTAGRAM_CALLBACK, response_type: "code", scope: INSTAGRAM_SCOPES.join(","), state, enable_fb_login: "0", force_authentication: "1" }).toString();
  return { authorizationUrl: url.toString() };
}
/** Callback authorization is a single-use, expiring state issued after an owner role check. */
export async function finishInstagramOAuth(db: SupabaseClient, state: string, code: string) {
  if (!/^[a-f0-9]{64}$/.test(state) || !code || code.length > 4000) throw new Error("Invalid Instagram sign-in response.");
  const { data, error } = await db.from("jarvis_instagram_oauth").update({ used_at: new Date().toISOString() })
    .eq("state_hash", instagramHash(state)).is("used_at", null).gt("expires_at", new Date().toISOString()).select("user_id").maybeSingle();
  if (error || !data) throw new Error("Instagram sign-in expired or was already used.");
  const userId = String(data.user_id);
  const role = await db.from("user_roles").select("role").eq("user_id", userId).eq("role", "super_admin").maybeSingle();
  if (role.error || !role.data) throw new Error("Owner access is no longer available.");
  const auth = await exchangeInstagramCode(code);
  const profile = await instagramGraph(auth.token, "/me");
  const accountId = String(profile["user_id"] ?? "");
  if (!/^\d+$/.test(accountId) || typeof profile["username"] !== "string") throw new Error("Instagram professional account was not returned.");
  const saved = await db.from("jarvis_instagram_connections").upsert({ user_id: userId, instagram_id: accountId, username: profile["username"], token_ciphertext: sealInstagramToken(auth.token), expires_at: new Date(Date.now() + auth.expiresIn * 1000).toISOString(), connected_at: new Date().toISOString() });
  if (saved.error) throw new Error("Couldn't save the Instagram connection.");
}
async function accountFor(db: SupabaseClient, userId: string) {
  const { data, error } = await db.from("jarvis_instagram_connections").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Couldn't read your Instagram connection.");
  if (!data || Date.parse(String(data.expires_at)) <= Date.now()) throw new Error("Connect or reconnect Instagram first.");
  return data as { instagram_id: string; username: string; token_ciphertext: string };
}
export async function saveInstagramDraft(db: SupabaseClient, userId: string, input: InstagramDraft): Promise<InstagramPostRow> {
  const draft = parseInstagramDraft(input);
  const account = await accountFor(db, userId);
  const hash = instagramHash(JSON.stringify([account.instagram_id, draft.caption, draft.imageUrl]));
  const previous = await db.from("jarvis_instagram_posts").select(POST_FIELDS).eq("user_id", userId).eq("instagram_id", account.instagram_id).eq("content_hash", hash).in("status", ["draft", "publishing", "published", "uncertain"]).maybeSingle();
  if (previous.error) throw new Error("Couldn't check existing drafts.");
  if (previous.data) return previous.data as InstagramPostRow;
  const { data, error } = await db.from("jarvis_instagram_posts").insert({ user_id: userId, instagram_id: account.instagram_id, username: account.username, caption: draft.caption, image_url: draft.imageUrl, content_hash: hash }).select(POST_FIELDS).single();
  if (error || !data) throw new Error("Couldn't save this draft. Refresh to check for an existing one.");
  return data as InstagramPostRow;
}
/** Only called from the explicit authenticated review button, never from a model or routine. */
export async function publishInstagramDraft(db: SupabaseClient, userId: string, input: { postId: string; contentHash: string; approved: boolean }) {
  const post = await db.from("jarvis_instagram_posts").select("*").eq("id", input.postId).eq("user_id", userId).maybeSingle();
  if (post.error || !post.data) throw new Error("This draft wasn't found in your account.");
  requireInstagramApproval(input, String(post.data.content_hash));
  const account = await accountFor(db, userId);
  requireInstagramAccount(String(post.data.instagram_id), account.instagram_id);
  if (post.data.status !== "draft") throw new Error("This post is already submitted or closed. Refresh its status; don't submit it again.");
  const lock = await db.from("jarvis_instagram_posts").update({ status: "publishing", approved_by: userId, approved_at: new Date().toISOString() })
    .eq("id", input.postId).eq("user_id", userId).eq("status", "draft").eq("content_hash", input.contentHash).select("id").maybeSingle();
  if (lock.error || !lock.data) throw new Error("Another request already submitted this post.");
  let publishing = false;
  try {
    const token = openInstagramToken(account.token_ciphertext);
    const container = await instagramGraph(token, `/${account.instagram_id}/media`, { image_url: String(post.data.image_url), caption: String(post.data.caption) });
    const containerId = String(container["id"] ?? "");
    if (!/^\d+$/.test(containerId)) throw new Error("Instagram did not create the image container.");
    const saved = await db.from("jarvis_instagram_posts").update({ container_id: containerId }).eq("id", input.postId).eq("user_id", userId);
    if (saved.error) throw new Error("Couldn't save Instagram's upload reference. Nothing was published.");
    publishing = true;
    const result = await instagramGraph(token, `/${account.instagram_id}/media_publish`, { creation_id: containerId });
    const mediaId = String(result["id"] ?? "");
    if (!/^\d+$/.test(mediaId)) throw new Error("Instagram's publish result needs checking.");
    const done = await db.from("jarvis_instagram_posts").update({ status: "published", media_id: mediaId, error: null }).eq("id", input.postId).eq("user_id", userId);
    if (done.error) throw new Error("Instagram accepted the post, but saving the result failed. Check Instagram before doing anything else.");
    // Link lookup is optional; never change a successful publish to failure.
    try {
      const media = await instagramGraph(token, `/${mediaId}`);
      if (typeof media["permalink"] === "string" && /^https:\/\/(www\.)?instagram\.com\//.test(media["permalink"])) {
        await db.from("jarvis_instagram_posts").update({ permalink: media["permalink"] }).eq("id", input.postId).eq("user_id", userId);
      }
    } catch { /* published ID is durable even when link lookup fails */ }
    return { published: true };
  } catch (error) {
    const uncertain = publishing && !(error instanceof InstagramProviderError && error.status >= 400 && error.status < 500);
    const message = error instanceof Error ? error.message : "Instagram publishing failed.";
    await db.from("jarvis_instagram_posts").update({ status: uncertain ? "uncertain" : "failed", error: uncertain ? `${message} Check Instagram before preparing another post; automatic retries are disabled.` : message }).eq("id", input.postId).eq("user_id", userId);
    throw new Error(message);
  }
}