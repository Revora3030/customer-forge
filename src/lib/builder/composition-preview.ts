/**
 * Shared shapes for the AI-composed look and page structure.
 *
 * Client-safe on purpose: the builder UI shows the AI's reasoning, its chosen
 * palette, font and page blocks for approval before anything is applied, and
 * sends the owner's own style/colour/font choices back with the next request.
 * Only plain data lives here — no provider access, no secrets, no server code.
 */

/** The owner's brand choices, made before the AI composes anything. */
export type BrandPreference = {
  /** A light or dark website. */
  tone?: "light" | "dark" | "any" | null;
  /** Hex brand colours the owner picked. */
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  /** A specific heading font. */
  font?: string | null;
  /** A specific look from the library, when the owner already chose one. */
  directionId?: string | null;
};

/** Everything the owner sees and approves before a single change is applied. */
export type CompositionPreview = {
  styleName: string;
  mood: string;
  tone: "light" | "dark";
  font: string;
  fontNote: string;
  colors: { primary: string; secondary: string; accent: string };
  /** Why this look and this order, in one plain sentence. */
  because: string;
  /** What each page will contain, in order, in owner-friendly words. */
  pages: { pageId: string; title: string; blocks: string[]; added: string[] }[];
  /** True when the owner's own brand choices overrode the AI's palette. */
  brandLocked: boolean;
};
