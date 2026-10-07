/**
 * The message channel between the live site preview (an iframe) and the builder
 * around it, so an owner can click a part of their page and talk about it.
 *
 * Both sides are the same app on the same origin. Messages are posted with an
 * explicit same-origin target and every incoming message is checked against the
 * shapes below, so nothing a third-party frame or page sends can be mistaken
 * for a builder instruction.
 */

export const PREVIEW_BRIDGE_SOURCE = "revora-preview";

/** Sent by the preview when it is ready, and when the owner clicks a block. */
export type PreviewToBuilderMessage =
  | { source: typeof PREVIEW_BRIDGE_SOURCE; type: "ready" }
  | {
      source: typeof PREVIEW_BRIDGE_SOURCE;
      type: "select";
      /** The section or component row id the block was rendered from. */
      id: string;
      /** Section kind, when the clicked block is a section. */
      kind: string | null;
      /** Plain-language name shown to the owner, e.g. "Headline banner". */
      label: string | null;
      /** A short snippet of the block's own words, to confirm the right pick. */
      text: string | null;
      /** Exact element inside an AI layout (tree path), when one was clicked. */
      path?: string | null;
      /** That element's node type ("heading", "button", "media", …). */
      element?: string | null;
      /** A hover-menu action the owner chose for this block, if any. */
      action?: PreviewAction | null;
    }
  | {
      source: typeof PREVIEW_BRIDGE_SOURCE;
      type: "inline-edit";
      id: string;
      path: string;
      text: string;
    };

/** Hover-menu actions offered on a block in the preview. */
export const PREVIEW_ACTIONS = ["restyle", "photo", "punchier", "delete"] as const;
export type PreviewAction = (typeof PREVIEW_ACTIONS)[number];

/** Sent by the builder to the preview. */
export type BuilderToPreviewMessage =
  | {
      source: typeof PREVIEW_BRIDGE_SOURCE;
      type: "select-mode";
      on: boolean;
      /** The block currently being discussed, outlined in the preview. */
      selectedId?: string | null;
      /** The exact element being discussed, when one was picked. */
      selectedPath?: string | null;
    }
  | {
      /** Instant in-place patch of one element's text (no reload). */
      source: typeof PREVIEW_BRIDGE_SOURCE;
      type: "patch-text";
      id: string;
      path: string;
      text: string;
    }
  | {
      /** Floating status on the preview while the team works on a block. */
      source: typeof PREVIEW_BRIDGE_SOURCE;
      type: "status";
      text: string | null;
      id?: string | null;
    };

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const PATH_PATTERN = /^root(?:\.\d{1,3}){0,12}$/;
const ELEMENT_PATTERN = /^[a-z_]{1,24}$/;

function path(value: unknown): string | null {
  return typeof value === "string" && PATH_PATTERN.test(value) ? value : null;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/** Reads a message coming from the preview frame. Returns null if it isn't one. */
export function readPreviewMessage(data: unknown): PreviewToBuilderMessage | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (record["source"] !== PREVIEW_BRIDGE_SOURCE) return null;
  if (record["type"] === "ready") return { source: PREVIEW_BRIDGE_SOURCE, type: "ready" };
  const id = typeof record["id"] === "string" ? record["id"] : "";
  if (!ID_PATTERN.test(id)) return null;
  if (record["type"] === "inline-edit") {
    const at = path(record["path"]);
    const value = typeof record["text"] === "string" ? record["text"].replace(/\s+/g, " ").trim().slice(0, 600) : "";
    if (!at || !value) return null;
    return { source: PREVIEW_BRIDGE_SOURCE, type: "inline-edit", id, path: at, text: value };
  }
  if (record["type"] !== "select") return null;
  const element = typeof record["element"] === "string" && ELEMENT_PATTERN.test(record["element"]) ? record["element"] : null;
  const action = (PREVIEW_ACTIONS as readonly string[]).includes(String(record["action"])) ? (record["action"] as PreviewAction) : null;
  return {
    source: PREVIEW_BRIDGE_SOURCE,
    type: "select",
    id,
    kind: text(record["kind"], 40),
    label: text(record["label"], 60),
    text: text(record["text"], 140),
    ...(path(record["path"]) ? { path: path(record["path"]) } : {}),
    ...(element ? { element } : {}),
    ...(action ? { action } : {}),
  };
}

/** Reads a message coming from the builder into the preview frame. */
export function readBuilderMessage(data: unknown): BuilderToPreviewMessage | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (record["source"] !== PREVIEW_BRIDGE_SOURCE) return null;
  if (record["type"] === "status") {
    const id = typeof record["id"] === "string" && ID_PATTERN.test(record["id"]) ? record["id"] : null;
    return { source: PREVIEW_BRIDGE_SOURCE, type: "status", text: text(record["text"], 90), id };
  }
  if (record["type"] === "patch-text") {
    const id = typeof record["id"] === "string" ? record["id"] : "";
    const at = path(record["path"]);
    const value = typeof record["text"] === "string" ? record["text"].slice(0, 600) : "";
    if (!ID_PATTERN.test(id) || !at || !value) return null;
    return { source: PREVIEW_BRIDGE_SOURCE, type: "patch-text", id, path: at, text: value };
  }
  if (record["type"] !== "select-mode") return null;
  const selectedId = typeof record["selectedId"] === "string" ? record["selectedId"] : null;
  return {
    source: PREVIEW_BRIDGE_SOURCE,
    type: "select-mode",
    on: record["on"] === true,
    selectedId: selectedId && ID_PATTERN.test(selectedId) ? selectedId : null,
    ...(path(record["selectedPath"]) ? { selectedPath: path(record["selectedPath"]) } : {}),
  };
}

/**
 * How a clicked block is described to the assistant. The row id keeps the change
 * on exactly the block the owner pointed at, and the name keeps the sentence
 * readable for them.
 */
export function selectionPrefix(selection: {
  id: string;
  label: string | null;
  kind: string | null;
  path?: string | null | undefined;
  element?: string | null | undefined;
  text?: string | null | undefined;
}): string {
  const name = selection.label ?? selection.kind ?? "block";
  if (selection.path && selection.element) {
    const snippet = selection.text ? ` "${selection.text.slice(0, 60)}"` : "";
    return `On the ${selection.element}${snippet} (element ${selection.path}) inside the "${name}" block (id ${selection.id}):`;
  }
  return `On the "${name}" block (id ${selection.id}):`;
}

/** The ready-made instruction for a hover-menu action on a block. */
export function actionPrompt(action: PreviewAction, selection: { label: string | null; kind: string | null; element?: string | null | undefined }): string {
  const what = selection.element && selection.element !== "stack" ? `this ${selection.element}` : "this section";
  switch (action) {
    case "restyle":
      return `Restyle ${what} so it feels more premium and on-brand. Keep every fact and word that is already there.`;
    case "photo":
      return `Make a new photo for ${what} that fits the business and the section. No text, logos or people's faces in the picture.`;
    case "punchier":
      return `Make the copy in ${what} punchier and clearer. Keep it truthful — don't invent facts, numbers, awards or reviews.`;
    case "delete":
      return `Remove ${what} from the page.`;
  }
}

/* --------------------------- cross-tab change pings -------------------------- */

/** Channel name for "the draft changed" pings between open builder/preview tabs. */
export const DRAFT_CHANNEL = "revora-draft";

export type DraftChangePing = { type: "draft-changed"; organizationId: string; at: number };

export function readDraftPing(data: unknown): DraftChangePing | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (record["type"] !== "draft-changed") return null;
  const organizationId = typeof record["organizationId"] === "string" ? record["organizationId"] : "";
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) return null;
  return { type: "draft-changed", organizationId, at: Number(record["at"]) || Date.now() };
}

/** Tells every other open tab of this browser that the draft changed. Never throws. */
export function announceDraftChange(organizationId: string): void {
  try {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(DRAFT_CHANNEL);
    channel.postMessage({ type: "draft-changed", organizationId, at: Date.now() } satisfies DraftChangePing);
    channel.close();
  } catch {
    /* not supported: other tabs refresh on their own schedule */
  }
}
