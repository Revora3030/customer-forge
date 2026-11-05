/**
 * Colour of a form's small print (helper lines, the consent note, hints).
 *
 * `text-muted-foreground` is a theme-wide grey chosen against the page
 * background. A form usually sits on a card or panel that is a different
 * surface, and on a dark site that grey measured 1.6 to 2.3:1 against the
 * form it was printed on. The small print now takes the form's own ink,
 * the colour its labels and fields already read in, at a high but not full
 * strength. `currentColor` is resolved against the surface the form is
 * actually painted on, so no theme or card needs to be known here.
 *
 * With a form ink that reaches 7:1 on its surface, 86% of that ink still
 * reaches 4.5:1 (see form-helper-text.test.ts), the WCAG AA floor for small
 * text.
 */
/** Strength of the ink, in percent. Must match the literal class below (checked in the test). */
export const FORM_HELPER_STRENGTH = 86;

// A complete literal, not built from FORM_HELPER_STRENGTH: Tailwind finds a
// class only when it appears in the source exactly as written.
export const FORM_HELPER_TEXT = "[color:color-mix(in_srgb,currentColor_86%,transparent)]";
