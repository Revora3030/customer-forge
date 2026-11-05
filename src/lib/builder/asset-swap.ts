/**
 * Asset Swapper (Brief 12, B12-4): swap ONE picture the owner clicked in the
 * builder preview for an upload, a hand-checked free photo or an AI picture.
 *
 * Pure rules shared by the server function and tests. The swap never asks the
 * AI to plan anything: it addresses one `media` node by its tree path (the
 * same key inline text edits use) and writes only that picture.
 *
 * - Pictures in this workspace's own library are referenced by storage path
 *   and always live on a section component (the renderer signs them).
 * - A web address is only accepted with its licence metadata recorded
 *   (licence, photographer or credit, and the page it came from), so nothing
 *   is ever hot-linked without a licence on file.
 * - Alt text is kept, or the owner is asked for it; a swap never leaves a
 *   picture without a description.
 */

import type { CompositionNode, CompositionTree } from "@/lib/builder/composition-tree";
import { nodeAtPath } from "@/lib/builder/inline-edit";
import { isStoragePath } from "@/lib/media";
import type { PersistedComponentVisual } from "@/lib/site-style";

export const SWAP_ALT_MAX = 160;

/** The `media` library row being put in place of the current picture. */
export type SwapMedia = {
  id: string;
  url: string;
  alt_text: string | null;
  source: string | null;
  license: string | null;
  license_url: string | null;
  attribution: string | null;
  creator: string | null;
  source_page: string | null;
};

export type SwapOrigin = "customer" | "stock" | "generated";

export type SwapProblem =
  | "bad_path"
  | "not_picture"
  | "needs_alt"
  | "unlicensed"
  | "foreign_file"
  | "unsafe_address"
  | "unchanged";

export type SwapPlan =
  /** The picture already lives on a component of this section: repoint it. */
  | {
      ok: true;
      mode: "component";
      componentId: string;
      mediaUrl: string;
      alt: string;
      visual: PersistedComponentVisual;
    }
  /** A library picture for a node that only had a web address: a new component is attached and the node points at it. */
  | {
      ok: true;
      mode: "new_component";
      mediaUrl: string;
      alt: string;
      visual: PersistedComponentVisual;
    }
  /** A licensed web address replaces the node's own address. */
  | { ok: true; mode: "src"; tree: CompositionTree; alt: string; visual: PersistedComponentVisual }
  | { ok: false; problem: SwapProblem };

export const SWAP_PROBLEM_MESSAGE: Record<SwapProblem, string> = {
  bad_path: "That picture changed. Refresh the preview and pick it again.",
  not_picture: "Only pictures can be swapped here. Ask the assistant for other changes.",
  needs_alt: "Add a short description of the new picture for people using screen readers.",
  unlicensed: "That picture has no licence recorded, so it can't go on your site.",
  foreign_file: "That picture isn't in this website's library.",
  unsafe_address: "That picture address isn't usable.",
  unchanged: "That picture is already in place.",
};

/** Plain description text: no control characters or angle brackets, bounded. */
export function cleanAltText(value: unknown): string {
  return (
    String(value ?? "")
      // eslint-disable-next-line no-control-regex -- control characters are stripped from owner text
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/[<>]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, SWAP_ALT_MAX)
  );
}

export function swapOrigin(media: Pick<SwapMedia, "source">): SwapOrigin {
  const source = (media.source ?? "").trim().toLowerCase();
  if (source === "generated") return "generated";
  if (source.startsWith("stock")) return "stock";
  return "customer";
}

/** True when a web picture has the licence metadata needed to show it. */
export function hasLicenceOnFile(media: SwapMedia): boolean {
  return Boolean(
    media.license?.trim() &&
    (media.creator?.trim() || media.attribution?.trim()) &&
    /^https:\/\//i.test(media.source_page ?? ""),
  );
}

function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

/** What is recorded on the picture so credits and licences stay honest. */
export function swapVisual(media: SwapMedia, alt: string): PersistedComponentVisual {
  const origin = swapOrigin(media);
  const visual: PersistedComponentVisual = { alt, source: origin };
  if (origin === "stock") {
    const credit = (media.attribution ?? (media.creator ? `Photo by ${media.creator}` : "")).trim();
    if (credit) visual.credit = credit.slice(0, 200);
    if (media.license) visual.license = media.license.trim().slice(0, 40);
    if (media.source_page && isHttps(media.source_page))
      visual.source_url = media.source_page.slice(0, 500);
  }
  return visual;
}

/**
 * Works out how to put `media` in place of the picture at `path`.
 * `sectionComponentIds` are the components of the clicked section only, so a
 * swap can never repoint a picture that belongs to another block.
 */
export function planPictureSwap(input: {
  tree: CompositionTree;
  path: string;
  media: SwapMedia;
  organizationId: string;
  alt?: unknown;
  sectionComponentIds: ReadonlySet<string>;
  /** The component's current stored address, when the node points at one. */
  currentComponentUrl?: string | null;
}): SwapPlan {
  const node: CompositionNode | null = nodeAtPath(input.tree, input.path);
  if (!node) return { ok: false, problem: "bad_path" };
  if (node.type !== "media") return { ok: false, problem: "not_picture" };

  const { media } = input;
  const stored = isStoragePath(media.url);
  if (stored) {
    if (!media.url.startsWith(`${input.organizationId}/`) || media.url.includes(".."))
      return { ok: false, problem: "foreign_file" };
  } else {
    if (!isHttps(media.url)) return { ok: false, problem: "unsafe_address" };
    if (!hasLicenceOnFile(media)) return { ok: false, problem: "unlicensed" };
  }

  const alt = cleanAltText(input.alt) || cleanAltText(node.alt) || cleanAltText(media.alt_text);
  if (!alt) return { ok: false, problem: "needs_alt" };
  const visual = swapVisual(media, alt);

  const ref = node.mediaRef?.toLowerCase();
  const ownComponent =
    ref && [...input.sectionComponentIds].some((id) => id.toLowerCase() === ref)
      ? node.mediaRef!
      : null;
  if (ownComponent) {
    if (input.currentComponentUrl === media.url && cleanAltText(node.alt) === alt)
      return { ok: false, problem: "unchanged" };
    return {
      ok: true,
      mode: "component",
      componentId: ownComponent,
      mediaUrl: media.url,
      alt,
      visual,
    };
  }
  if (stored) return { ok: true, mode: "new_component", mediaUrl: media.url, alt, visual };
  if (node.src === media.url && cleanAltText(node.alt) === alt)
    return { ok: false, problem: "unchanged" };
  return {
    ok: true,
    mode: "src",
    tree: withPicture(input.tree, input.path, { src: media.url, alt }),
    alt,
    visual,
  };
}

/** Returns a NEW tree with only the picture at `path` changed. */
export function withPicture(
  tree: CompositionTree,
  path: string,
  picture: { src: string; alt: string } | { mediaRef: string; alt: string },
): CompositionTree {
  const clone = structuredClone(tree);
  const node = nodeAtPath(clone, path);
  if (!node) return clone;
  if ("src" in picture) {
    node.src = picture.src;
    delete node.mediaRef;
  } else {
    node.mediaRef = picture.mediaRef;
    delete node.src;
  }
  node.alt = picture.alt;
  return clone;
}

/** The node's alt text, for the panel to prefill. */
export function pictureAlt(tree: CompositionTree | null, path: string | null | undefined): string {
  if (!tree || !path) return "";
  const node = nodeAtPath(tree, path);
  return node?.type === "media" ? cleanAltText(node.alt) : "";
}
