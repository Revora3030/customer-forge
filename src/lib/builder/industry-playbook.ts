/**
 * Trade playbooks: for each kind of local service business, the signature moment a great site for that trade
 * can build around and the order its story can run in. This is prompt guidance only. It names primitives the
 * builder already has, says what each needs from the owner, and never asks for proof the business has not
 * supplied: a before and after, a spin, or a result only ever comes from the owner's own photographs.
 */
export type TradePlaybook = {
  key: string;
  label: string;
  match: RegExp;
  /** The one interactive or cinematic moment worth building the home page around. */
  signature: string;
  /** Scenes, in order, for a scroll story. */
  storyArc: readonly string[];
  /** What the owner must supply before the signature moment can be real. */
  needsFromOwner: string;
};

export const TRADE_PLAYBOOKS: readonly TradePlaybook[] = [
  {
    key: "exterior-cleaning",
    label: "Pressure washing and exterior cleaning",
    match: /pressure|power\s?wash|soft\s?wash|exterior clean|window clean|gutter|roof clean/i,
    signature: "A hands-on reveal: before_after_slider with revealMode \"brush\" and a prompt like \"Clean this driveway\", then a drag slider for the second surface.",
    storyArc: ["the dirty surface", "the method and the crew", "the clean result", "the full property", "a clear next step"],
    needsFromOwner: "Real before and after photos of the same surface. Until then use scroll_chapters scenes from the supplied pictures with copy about the method, and no result claims.",
  },
  {
    key: "auto-detailing",
    label: "Auto detailing and car care",
    match: /detail|car wash|auto spa|ceramic|paint correction|tint/i,
    signature: "A before_after_slider of the owner's real paint correction or interior work, and a spin_viewer only when the owner photographs a vehicle from 8 or more angles.",
    storyArc: ["the vehicle as it arrived", "the process", "the finished panel in light", "packages", "booking"],
    needsFromOwner: "Real before and after photos; 8 or more angles of one finished vehicle for a spin. Until then build the home page as scroll_chapters scenes over the supplied or generated vehicle pictures (atmosphere only, no result claims), with the real services as offer cards; a dark, high-contrast studio look often suits the trade, but the palette stays the designer's call.",
  },
  {
    key: "roofing",
    label: "Roofing",
    match: /roof/i,
    signature: "A before_after_slider of a real roof job and a calm process story: inspection, estimate, install, clean-up.",
    storyArc: ["the problem on the roof", "inspection", "the work", "the finished roofline", "free estimate"],
    needsFromOwner: "Real before and after roof photos. Never imply storm damage or insurance outcomes.",
  },
  {
    key: "landscaping",
    label: "Landscaping, lawn care and tree service",
    match: /landscap|lawn|tree|garden|mow|irrigation|sod|hardscape|turf/i,
    signature: "A before_after_slider of a real yard, and a seasonal tab_group (spring, summer, fall, winter) that lists only services the owner offers.",
    storyArc: ["the yard today", "the plan", "the build", "the finished yard", "request a quote"],
    needsFromOwner: "Real before and after yard photos; the list of seasonal services.",
  },
  {
    key: "cleaning",
    label: "House and commercial cleaning",
    match: /clean|maid|janitor|carpet|upholster|molly/i,
    signature: "A quote_calculator front and centre (size, frequency, extras) and a before_after_slider only if the owner supplies real room photos.",
    storyArc: ["the busy week", "what is included", "the checklist", "how booking works", "get a price"],
    needsFromOwner: "The real checklist of what is included; real photos for any reveal.",
  },
  {
    key: "painting",
    label: "Painting",
    match: /paint(?!ball)|drywall|stain|wallpaper/i,
    signature: "A before_after_slider of a real repaint and a process story (prep, prime, paint, walk-through).",
    storyArc: ["the room before", "prep", "the colour going on", "the finished room", "estimate"],
    needsFromOwner: "Real before and after photos of the same wall or room.",
  },
  {
    key: "hvac",
    label: "HVAC, heating and cooling",
    match: /hvac|heating|cooling|air condition|furnace|heat pump|\bac\b/i,
    signature: "A tab_group of services (repair, install, maintenance) and an emergency-first call action in the sticky bar.",
    storyArc: ["the uncomfortable home", "how a visit works", "what is checked", "maintenance plans", "call or book"],
    needsFromOwner: "Real service area, hours and any emergency availability the owner actually offers.",
  },
  {
    key: "plumbing",
    label: "Plumbing and drain service",
    match: /plumb|drain|sewer|water heater|pipe|septic/i,
    signature: "A faq_accordion of real homeowner questions and a clear emergency call action; a quote_calculator only with the owner's own price structure.",
    storyArc: ["the problem", "how a visit works", "what is fixed", "pricing approach", "call now"],
    needsFromOwner: "The owner's real emergency hours, licence details they hold, and any flat prices.",
  },
  {
    key: "electrical",
    label: "Electrical",
    match: /electric|wiring|panel|ev charger|generator/i,
    signature: "A tab_group of services and a faq_accordion about safety and permits, using only licences and certifications the owner holds.",
    storyArc: ["the need", "how work is scoped", "safety and permits", "service list", "request a visit"],
    needsFromOwner: "Real licence numbers and certifications, shown only if supplied.",
  },
  {
    key: "contracting",
    label: "General contracting and remodelling",
    match: /contractor|remodel|renovat|construction|kitchen|bath|deck|fence|handyman|flooring|tile|carpent/i,
    signature: "scroll_chapters through the project stages (consult, design, build, walkthrough) and a before_after_slider of a real renovation.",
    storyArc: ["the house as it is", "design", "the build", "the finished space", "book a consult"],
    needsFromOwner: "Real project photos with before and after pairs; no invented timelines or prices.",
  },
  {
    key: "moving",
    label: "Moving and junk removal",
    match: /mov(er|ing)|junk|haul|storage|relocat/i,
    signature: "A quote_calculator (home size, distance, stairs) built from the owner's real pricing and a step-by-step tab_group of move day.",
    storyArc: ["the stress of moving", "how move day runs", "what is protected", "get a price", "pick a date"],
    needsFromOwner: "The owner's real pricing rules and service area.",
  },
  {
    key: "pest",
    label: "Pest control",
    match: /pest|termite|rodent|exterminat|mosquito|wildlife/i,
    signature: "A faq_accordion about methods and safety, and a service tab_group by pest, using only treatments the owner performs.",
    storyArc: ["the problem", "inspection", "the treatment", "prevention", "book an inspection"],
    needsFromOwner: "Real treatments, product or licence information, and guarantee terms exactly as the owner states them.",
  },
  {
    key: "auto-repair",
    label: "Auto repair and tyre shops",
    match: /auto repair|mechanic|tire|tyre|brake|oil change|garage|body shop|collision/i,
    signature: "A service tab_group with honest starting prices from the Services tool and a clear book-a-slot action.",
    storyArc: ["the warning light", "how a diagnosis works", "what is checked", "prices", "book a slot"],
    needsFromOwner: "Real services, prices and hours.",
  },
  {
    key: "beauty",
    label: "Salons, barbers, spas and beauty",
    match: /salon|barber|hair|nail|spa|beauty|lash|brow|massage|tattoo|makeup|wax/i,
    signature: "A collection_row of real services with prices and a booking_form; a gallery of the owner's real work.",
    storyArc: ["the space", "the services", "the stylists", "the work", "book a chair"],
    needsFromOwner: "Real portfolio photos and the real team; never stock people presented as staff.",
  },
  {
    key: "food",
    label: "Restaurants, cafes and catering",
    match: /restaurant|cafe|coffee|bakery|catering|food truck|pizza|bar\b|brewery/i,
    signature: "A menu collection_row with real dishes and prices and a prominent reservation or order action.",
    storyArc: ["the room or the truck", "the signature dishes", "the menu", "hours and location", "reserve or order"],
    needsFromOwner: "The real menu, prices, hours and photographs of the real food.",
  },
  {
    key: "health",
    label: "Dental, medical and wellness",
    match: /dent|ortho|clinic|chiropract|physio|therap|medical|doctor|vet|optom|wellness|fitness|gym|yoga|trainer/i,
    signature: "A calm service tab_group, a faq_accordion of real patient questions, and an appointment action; no outcome promises.",
    storyArc: ["the concern", "what a visit is like", "the team", "services", "book a visit"],
    needsFromOwner: "Real team, credentials they hold and hours. Never imply a cure or a guaranteed result.",
  },
  {
    key: "photo-creative",
    label: "Photography, video and creative studios",
    match: /photograph|video|film|studio|wedding|design|brand/i,
    signature: "A full-bleed gallery or scroll_chapters of the owner's real work and a booking_form for dates.",
    storyArc: ["the strongest frame", "the style", "packages", "the process", "check a date"],
    needsFromOwner: "The owner's real portfolio.",
  },
  {
    key: "real-estate-pro",
    label: "Real estate, legal, accounting and consulting",
    match: /real estate|realtor|broker|attorney|lawyer|legal|account|tax|bookkeep|consult|insurance|financ/i,
    signature: "A faq_accordion of real client questions, a clear consult-booking action and a trust section of credentials the owner holds.",
    storyArc: ["the question clients ask", "how an engagement works", "credentials", "areas served", "book a consult"],
    needsFromOwner: "Real credentials and areas served; no results or outcome claims.",
  },
  {
    key: "education",
    label: "Tutoring, lessons and childcare",
    match: /tutor|lesson|school|academy|daycare|childcare|coach|music|dance|martial/i,
    signature: "A tab_group of programmes with real schedules and a trial-class or enquiry action.",
    storyArc: ["the learner", "how a session runs", "programmes", "the instructor", "book a trial"],
    needsFromOwner: "Real programmes, schedules, safety and credential information.",
  },
];

/** The playbook for a business's industry text, or null when no trade matches. First match wins. */
export function playbookFor(industry: string | null | undefined): TradePlaybook | null {
  const text = (industry ?? "").trim();
  if (!text) return null;
  return TRADE_PLAYBOOKS.find((p) => p.match.test(text)) ?? null;
}

/** One block of prompt text for Sol, or null. Ideas, not orders: the supplied material decides. */
export function playbookNote(industry: string | null | undefined): string | null {
  const playbook = playbookFor(industry);
  if (!playbook) return null;
  return [
    `TRADE PLAYBOOK for ${playbook.label} (ideas for this trade; use only what the supplied material supports, and never invent proof):`,
    `Signature moment: ${playbook.signature}`,
    `Story arc for a scroll story: ${playbook.storyArc.join(" → ")}.`,
    `What the owner must supply: ${playbook.needsFromOwner}`,
  ].join("\n");
}
