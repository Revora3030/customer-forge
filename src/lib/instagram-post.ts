import { isFetchableHostname } from "./net-guard.server";

export type InstagramDraft = { caption: string; imageUrl: string };
export function parseInstagramDraft(value: unknown): InstagramDraft {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const caption = typeof raw["caption"] === "string" ? raw["caption"].trim() : "";
  if (!caption || caption.length > 2200) throw new Error("Add a caption of 1–2,200 characters.");
  const imageUrl = typeof raw["imageUrl"] === "string" ? raw["imageUrl"].trim() : "";
  let url: URL;
  try { url = new URL(imageUrl); } catch { throw new Error("Choose a public HTTPS image."); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !isFetchableHostname(url.hostname) || imageUrl.length > 2048) {
    throw new Error("Choose a public HTTPS image without credentials.");
  }
  return { caption, imageUrl };
}

export function requireInstagramApproval(input: { approved?: unknown; contentHash?: unknown }, expected: string) {
  if (input.approved !== true) throw new Error("Approve this exact post before publishing.");
  if (typeof input.contentHash !== "string" || input.contentHash !== expected) throw new Error("The post changed. Review it again.");
}

export function requireInstagramAccount(postAccount: string, connectedAccount: string) {
  if (!postAccount || postAccount !== connectedAccount) throw new Error("Instagram account changed. Create and review a new draft.");
}

export const INSTAGRAM_CALLBACK = "https://revoragrowthsystems.com/api/public/instagram/callback";
export const INSTAGRAM_SCOPES = ["instagram_business_basic", "instagram_business_content_publish"];