/**
 * Section-wording stage checkpoint.
 *
 * The wording refinement rewrites already AI-authored section copy. Its
 * result is stored on the job (through the existing stage checkpoints) so a
 * capacity-deferred or lease-recovered retry of the SAME job reapplies the
 * AI team's accepted wording instead of asking for it again. Re-running it
 * produced different words, which changed every section's material and
 * discarded all the saved section designs that depended on it.
 *
 * Row ids change on every attempt (pages are rewritten), so patches are
 * stored by the section's position in the ordered wording list, and the
 * checkpoint digest covers the id-free wording itself: a different list or
 * different starting copy never matches.
 */
export type WordingSection = {
  id: string;
  page: string;
  kind: string | null;
  heading: string | null;
  subheading: string | null;
  body: string | null;
};
export type WordingPatch = { id: string; heading?: string; subheading?: string; body?: string };
export type StoredWordingPatch = { index: number; heading?: string; subheading?: string; body?: string };

/** Id-free inputs the checkpoint digest is taken over. */
export function wordingCheckpointInputs(sections: WordingSection[], context: unknown) {
  return {
    context,
    sections: sections.map(({ page, kind, heading, subheading, body }) => ({ page, kind, heading, subheading, body })),
  };
}

function textFields(patch: { heading?: unknown; subheading?: unknown; body?: unknown }) {
  const out: { heading?: string; subheading?: string; body?: string } = {};
  if (typeof patch.heading === "string") out.heading = patch.heading;
  if (typeof patch.subheading === "string") out.subheading = patch.subheading;
  if (typeof patch.body === "string") out.body = patch.body;
  return out;
}

/** Patches keyed by position; patches naming an unknown section are dropped. */
export function toStoredWordingPatches(sections: WordingSection[], patches: WordingPatch[]): StoredWordingPatch[] {
  const indexById = new Map(sections.map((section, index) => [section.id, index]));
  const stored: StoredWordingPatch[] = [];
  for (const patch of patches) {
    const index = indexById.get(patch.id);
    if (index === undefined) continue;
    stored.push({ index, ...textFields(patch) });
  }
  return stored;
}

/** Stored patches mapped back onto this attempt's section ids. */
export function fromStoredWordingPatches(sections: WordingSection[], stored: unknown): WordingPatch[] | null {
  if (!Array.isArray(stored)) return null;
  const patches: WordingPatch[] = [];
  for (const entry of stored) {
    if (!entry || typeof entry !== "object") continue;
    const index = (entry as { index?: unknown }).index;
    if (typeof index !== "number" || !Number.isInteger(index)) continue;
    const section = sections[index];
    if (!section) continue;
    patches.push({ id: section.id, ...textFields(entry as StoredWordingPatch) });
  }
  return patches;
}
