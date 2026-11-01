/**
 * Frame labels a visitor may read. The AI sometimes names scrub_sequence
 * frames after how it made them ("Resting frame", "Moving frame", "Shot 2",
 * "Image 1", "Still") instead of the stage of the real service story
 * ("Driveway", "Roof soft wash"). Those production notes must never render.
 */

/** Words that describe the picture or how it was made, not the business. */
const PRODUCTION_WORD = /\b(frames?|keyframes?|stills?|shots?|clips?|renders?|placeholders?|untitled|lorem|ipsum|todo|tbd|debug|dummy)\b/i;

/** A bare generic name, optionally numbered: "Image 2", "Scene 1", "Step 3", "Photo". */
const GENERIC_NAME = /^(image|img|photo|picture|pic|scene|slide|chapter|step|part|view|angle|label|frame|media|start|end|first|middle|last|opening|closing|resting|moving|static|still|a|b|c)\s*[-#:.]?\s*\d*$/i;

/** True when a label is a production note, a generic slot name or empty. */
export function isProductionFrameLabel(label: string | null | undefined): boolean {
  const text = (label ?? "").replace(/\s+/g, " ").trim();
  if (!text) return true;
  if (!/\p{L}/u.test(text)) return true; // "1", "02", "—"
  if (/[a-z0-9_]+\.(jpe?g|png|webp|avif|gif|mp4|webm)\b/i.test(text)) return true; // file names
  if (GENERIC_NAME.test(text)) return true;
  return PRODUCTION_WORD.test(text);
}

/** The label to show for a frame, or undefined when it should not render. */
export function visibleFrameLabel(label: string | null | undefined): string | undefined {
  if (isProductionFrameLabel(label)) return undefined;
  return (label ?? "").replace(/\s+/g, " ").trim().slice(0, 30);
}

/**
 * Frames with production-note labels removed. When no frame keeps a real
 * label, the chip row has nothing meaningful to say and is hidden.
 */
export function cleanFrameLabels<T extends { label?: string | undefined }>(frames: readonly T[]): { frames: T[]; showChips: boolean } {
  const cleaned = frames.map((frame) => {
    const label = visibleFrameLabel(frame.label);
    const { label: _drop, ...rest } = frame;
    return (label ? { ...rest, label } : rest) as T;
  });
  return { frames: cleaned, showChips: cleaned.length > 1 && cleaned.some((frame) => !!frame.label) };
}
