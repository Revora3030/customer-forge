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
    };

/** Sent by the builder to turn click-to-edit on or off inside the preview. */
export type BuilderToPreviewMessage = {
  source: typeof PREVIEW_BRIDGE_SOURCE;
  type: "select-mode";
  on: boolean;
  /** The block currently being discussed, outlined in the preview. */
  selectedId?: string | null;
};

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

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
  if (record["type"] !== "select") return null;
  const id = typeof record["id"] === "string" ? record["id"] : "";
  if (!ID_PATTERN.test(id)) return null;
  return {
    source: PREVIEW_BRIDGE_SOURCE,
    type: "select",
    id,
    kind: text(record["kind"], 40),
    label: text(record["label"], 60),
    text: text(record["text"], 140),
  };
}

/** Reads a message coming from the builder into the preview frame. */
export function readBuilderMessage(data: unknown): BuilderToPreviewMessage | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (record["source"] !== PREVIEW_BRIDGE_SOURCE) return null;
  if (record["type"] !== "select-mode") return null;
  const selectedId = typeof record["selectedId"] === "string" ? record["selectedId"] : null;
  return {
    source: PREVIEW_BRIDGE_SOURCE,
    type: "select-mode",
    on: record["on"] === true,
    selectedId: selectedId && ID_PATTERN.test(selectedId) ? selectedId : null,
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
}): string {
  const name = selection.label ?? selection.kind ?? "block";
  return `On the "${name}" block (id ${selection.id}):`;
}
