/**
 * The owner's reference standard for every customer site (decided 2026-10-29 from the "Kestrel Exterior Wash"
 * reference video): a dark, cinematic one-page story that the visitor plays with, not a brochure. Prompt guidance
 * only, in the same spirit as the trade playbooks: it names primitives the builder already has, the AI still
 * authors every word, colour, picture and order, and every truth rule stays in force — a reveal only uses the
 * owner's own before/after photos, a dial only shows method facts the owner gave, and prices only come from the
 * Services tool through the quote calculator.
 *
 * Every trade playbook and every archetype has its own interpretation of the standard's two hands-on moments, so
 * no business category is left with the pressure-washing wording.
 */

export type ReferenceMoments = {
  /** The hands-on "try it yourself" moment for this kind of business. */
  tryIt: string;
  /** What a dial_selector ("the right setting for every …") explains for this kind of business. */
  dial: string;
};

/** The beats of the reference site, in order. Ideas the designer interprets, never a fixed template. */
export const REFERENCE_BEATS: readonly string[] = [
  "Opening: a pinned scrub_sequence of 3-4 frames of one property, vehicle, space or person, each frame labelled with one stage of the real service story so the corner progress ring reads \"1/3 · <stage>\"; one huge display line, one line of body and one primary button in the overlay. Without enough pictures, a full-viewport scene.",
  "Try it yourself: one hands-on moment directly after the opening (see TRY IT below), with an eyebrow such as \"Try it yourself\" and a short imperative display heading.",
  "Proof: a before_after_slider drag of the same subject (\"Same house. One visit.\") — only the owner's own real before and after photos; otherwise skip proof and tell the method story in sticky_split_story.",
  "The right setting for every surface: a dial_selector (see DIAL below) beside a short heading and one paragraph explaining why one setting does not fit everything.",
  "Instant price: a full-width quote_calculator section headed like \"Price your <thing> in 20 seconds\" — the live range comes from the owner's Services tool, never typed.",
  "Packages and close: real services as offer cards (collection_row or service_tier_fader), a faq_accordion of supplied questions, one closing scene with the main action; a mobile_sticky_bar carries the primary action on phones.",
];

/** How the reference site looks and feels, for every business unless the owner asked otherwise. */
export const REFERENCE_LOOK =
  "Obsidian canvas, white display type set tight and heavy (short imperative headlines ending in a full stop, e.g. \"Clean this driveway.\"), one saturated signal accent (the reference used a high-visibility yellow; pick the brand's own) used only on primary buttons, progress rings and selected chips, small uppercase tracked eyebrows above each heading, glass cards with 1px translucent borders, a slim header with anchor links to each beat and a pill \"Free quote\" style action.";

const MOMENTS: Record<string, ReferenceMoments> = {
  locksmith: { tryIt: "a tab_group \"What happened?\" (locked out, lost keys, broken lock) where each tab shows the real next step and the call button", dial: "security level per door or lock type, only grades or products the owner fits" },
  towing: { tryIt: "a tab_group \"What happened?\" (won't start, flat tyre, accident, locked out) where each tab shows the real service and one-tap call", dial: "which truck or method suits each vehicle type, only equipment the owner runs" },
  solar: { tryIt: "scroll_chapters walking the visitor through their own roof from consult to switch-on", dial: "system or battery sizing per home size, only ranges the owner states — never savings figures" },
  pool: { tryIt: "a brush reveal \"Clear this pool\" when the owner has real before/after photos of the same pool; otherwise a seasonal tab_group", dial: "the treatment per water condition (clear, cloudy, green), only methods the owner uses" },
  "garage-door": { tryIt: "a tab_group \"What is your door doing?\" (won't close, noisy, off track, opener dead) with the real fix and booking action", dial: "door or opener options per home, only models the owner installs" },
  "appliance-repair": { tryIt: "a tab_group by appliance where the visitor picks theirs and sees the real repair process", dial: "repair-or-replace guidance per appliance age, only rules of thumb the owner gives" },
  "exterior-cleaning": { tryIt: "a brush reveal \"Clean this driveway.\" with tool chips (e.g. Surface cleaner, 25° tip, 40° tip), live percent and stopwatch, from the owner's real dirty/clean photos of the same surface", dial: "pressure per surface (concrete, siding, roof, deck, brick) with dialUnit PSI only when the owner gave figures, otherwise plain words such as Soft wash" },
  "auto-detailing": { tryIt: "a brush reveal \"Polish this panel.\" with tool chips (e.g. Wash, Polish, Ceramic) from the owner's real before/after of the same panel; otherwise a spin_viewer with 8+ real angles", dial: "the protection per finish or use (daily driver, show car, fleet), only packages and products the owner offers" },
  roofing: { tryIt: "a brush reveal \"Clear this roof.\" from the owner's real before/after of the same roof", dial: "the material or method per roof type (shingle, metal, tile, flat), only work the owner does" },
  landscaping: { tryIt: "a brush reveal \"Finish this yard.\" from the owner's real before/after of the same yard; otherwise a seasonal tab_group", dial: "the care plan per season or lawn condition, only services the owner offers" },
  cleaning: { tryIt: "a brush reveal \"Clean this kitchen.\" from the owner's real before/after room photos; otherwise lead with the quote_calculator", dial: "clean depth per room or visit type (standard, deep, move-out), only what the owner's checklist includes" },
  painting: { tryIt: "a brush reveal \"Paint this wall.\" from the owner's real before/after of the same wall", dial: "the finish per surface (matte, eggshell, satin, gloss), only finishes the owner uses" },
  hvac: { tryIt: "a tab_group \"What is your system doing?\" (no cooling, no heat, noisy, high bills) with the real next step and booking", dial: "system type or capacity per home size, only ranges the owner states" },
  plumbing: { tryIt: "a tab_group \"Where is the problem?\" (kitchen, bathroom, water heater, sewer) with the real fix and call action", dial: "the repair method per pipe material or problem, only methods the owner uses" },
  electrical: { tryIt: "a tab_group \"What do you need?\" (panel, EV charger, lighting, repair) with the real scope and booking", dial: "the service level per job (repair, upgrade, new circuit), only work the owner does" },
  contracting: { tryIt: "a before_after_slider drag of a real finished project; otherwise sticky_split_story of the real build phases", dial: "the build scope per project size, only scopes the owner states" },
  moving: { tryIt: "lead with the quote_calculator \"Price your move in 20 seconds\"", dial: "crew and truck size per home size, only sizes the owner runs" },
  pest: { tryIt: "a tab_group \"What did you see?\" (ants, rodents, termites, wasps) with the real treatment and booking", dial: "the treatment intensity per infestation level, only methods the owner uses — no guarantees unless supplied" },
  "auto-repair": { tryIt: "a tab_group \"What is your car doing?\" (noise, warning light, brakes, won't start) with the real next step", dial: "the service interval or package per mileage, only packages the owner offers" },
  beauty: { tryIt: "a lens_magnifier \"Inspect the detail\" over a real finished look; otherwise a tab_group of the real treatments", dial: "the treatment intensity or length per hair or skin type, only services the salon offers" },
  food: { tryIt: "a collection_row of the real menu or signature dishes as offer cards", dial: "spice, roast or portion per dish, only options the kitchen actually serves" },
  health: { tryIt: "a tab_group \"What brings you in?\" listing only the real treatments with the booking action", dial: "the programme intensity per goal (recovery, maintenance, performance), only programmes the practice offers — never outcomes" },
  "photo-creative": { tryIt: "a gallery or spin_viewer of real work; a lens_magnifier over one real photo", dial: "the package per occasion (portrait, event, brand), only packages the owner offers" },
  "real-estate-pro": { tryIt: "scroll_chapters of the real process from first call to closing", dial: "the service level per client situation (buying, selling, investing), only services the owner offers" },
  education: { tryIt: "a tab_group by level or age group with the real programme and enrolment action", dial: "the pace or intensity per learner level, only programmes the owner runs" },
  "emergency-dispatch": { tryIt: "a tab_group \"What happened?\" whose every tab ends in the one-tap call button", dial: "the response type per situation, only services the owner offers — never arrival times unless supplied" },
  "tech-growth": { tryIt: "a tab_group or service_tier_fader of the real plans the owner sells", dial: "the plan or tier per team size, only plans the owner offers" },
  "clinical-trust": { tryIt: "a tab_group of the real services with what to expect at a visit", dial: "the care pathway per need, only pathways the practice offers — never outcomes" },
  "hospitality-lifestyle": { tryIt: "a collection_row of the real offerings, or a lens_magnifier over one real photo", dial: "the experience per mood or occasion, only offerings the owner provides" },
  "precision-craft": { tryIt: "a brush reveal from the owner's real before/after of the same subject, with 1-3 tool chips for the real stages", dial: "the method per material or surface, only methods the owner uses" },
  "home-services": { tryIt: "a brush reveal from real before/after photos when supplied; otherwise a tab_group \"What do you need?\" of the real services", dial: "the service level per home size or condition, only services the owner offers" },
  general: { tryIt: "the single most distinctive real thing about this business made hands-on: a tab_group, a before_after_slider of real photos or a collection_row of real services", dial: "the right option per customer need, only options the business actually offers" },
};

/** The hands-on moments for a playbook or archetype key, falling back to the general ones. */
export function referenceMomentsFor(key: string | null | undefined): ReferenceMoments {
  return (key && MOMENTS[key]) || MOMENTS["general"]!;
}

/** Every key with its own interpretation; used by tests to prove no category is left out. */
export const REFERENCE_MOMENT_KEYS: readonly string[] = Object.keys(MOMENTS);

/** One block of prompt text for Sol. Ideas, not orders: the supplied material and the truth rules decide. */
export function referenceStandardNote(key: string | null | undefined): string {
  const moments = referenceMomentsFor(key);
  return [
    "REFERENCE STANDARD (the owner's chosen look for every customer site — a cinematic, hands-on one-page story; interpret it for this business, never copy wording, and drop any beat the supplied material cannot make true):",
    ...REFERENCE_BEATS.map((beat, i) => `${i + 1}. ${beat}`),
    `TRY IT for this business: ${moments.tryIt}.`,
    `DIAL for this business: ${moments.dial}.`,
    `Look: ${REFERENCE_LOOK}`,
  ].join("\n");
}
