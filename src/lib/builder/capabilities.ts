/**
 * REVORA BUILDER CAPABILITIES — an honest report for the owner.
 *
 * Websites are built by Revora's AI design team (Sol, Terra, Luna and the
 * backup fleet), running on the server. There is no on-device or rule-based
 * builder. This module only reports which attachment kinds the chat can read,
 * so the builder never claims to have seen or heard something it has not.
 */

export type BuilderCapabilities = {
  /** Can a picture attached in chat be read? */
  imageUnderstanding: boolean;
  /** Can audio attached in chat be listened to? */
  audioUnderstanding: boolean;
  /** Can a document attached in chat be read? */
  documentUnderstanding: boolean;
  /** One honest sentence for the owner. */
  summary: string;
};

export function buildCapabilities(): BuilderCapabilities {
  return {
    imageUnderstanding: false,
    audioUnderstanding: false,
    documentUnderstanding: false,
    summary: "Your website is designed and written by Revora's AI design team.",
  };
}

export async function detectCapabilities(): Promise<BuilderCapabilities> {
  return buildCapabilities();
}

/**
 * The honest line to show when someone attaches a photo, recording or document
 * in chat. Returns null when that attachment kind can be read.
 */
export function attachmentNotice(
  capabilities: BuilderCapabilities,
  kind: "image" | "audio" | "document",
): string | null {
  const supported =
    kind === "image"
      ? capabilities.imageUnderstanding
      : kind === "audio"
        ? capabilities.audioUnderstanding
        : capabilities.documentUnderstanding;
  if (supported) return null;
  const label = kind === "image" ? "photos" : kind === "audio" ? "recordings" : "documents";
  return `Revora can save and use your ${label} on the site, but the chat cannot read them yet. Tell me in words what they show and the design team will build it.`;
}
