/**
 * Trade playbooks: for each kind of local service business, the signature moment a great site for that trade
 * can build around and the order its story can run in. This is prompt guidance only. It names primitives the
 * builder already has, says what each needs from the owner, and never asks for proof the business has not
 * supplied: a before and after, a spin, or a result only ever comes from the owner's own photographs.
 *
 * Specific trades come first. Every other business falls back to one of six universal archetypes (or a general
 * one), so no kind of business is left without guidance. Archetypes also carry a look suggestion, which stays a
 * suggestion: the designer chooses the palette and type.
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
    key: "locksmith",
    label: "Locksmith and lockout service",
    match: /locksmith|lockout|lock out|car key|rekey|re-key/i,
    signature: "An emergency-first call action in the sticky bar and a tab_group of services (lockout, rekey, car keys, commercial) that lists only what the owner performs.",
    storyArc: ["locked out", "how a visit works", "what can be done", "areas served", "call now"],
    needsFromOwner: "Real service area, hours and any 24-hour availability the owner offers. Never invent arrival times or price promises.",
  },
  {
    key: "towing",
    label: "Towing and roadside assistance",
    match: /\btow(ing)?\b|roadside|wrecker|flatbed|jump start/i,
    signature: "A one-tap call action in the sticky bar, a tab_group of services (tow, jump start, tyre change, lockout) and a faq_accordion of real questions about how a call works.",
    storyArc: ["stuck on the road", "what happens when you call", "services", "areas covered", "call now"],
    needsFromOwner: "Real services, coverage area and hours. Never state response times, pricing or insurance claims the owner has not supplied.",
  },
  {
    key: "solar",
    label: "Solar and energy installers",
    match: /solar|photovoltaic|battery storage|\bev charg/i,
    signature: "scroll_chapters through the process (consult, design, install, switch-on) and a faq_accordion of real homeowner questions, with a consult-booking action.",
    storyArc: ["the home today", "assessment", "the install", "switch-on", "book a consult"],
    needsFromOwner: "Real certifications and service area. Never state savings, payback periods or incentive amounts unless the owner supplies them as stated facts.",
  },
  {
    key: "pool",
    label: "Pool and hot tub service",
    match: /\bpool\b|hot tub|swim(ming)? spa/i,
    signature: "A seasonal tab_group (opening, weekly care, repairs, closing) listing only services the owner offers, and a before_after_slider only if the owner supplies real photos of the same pool.",
    storyArc: ["the pool as found", "the routine", "repairs and upgrades", "the season ahead", "request a visit"],
    needsFromOwner: "Real service list, season dates and service area. Real before and after photos for any reveal.",
  },
  {
    key: "garage-door",
    label: "Garage door and gate service",
    match: /garage door|overhead door|gate (repair|install|opener)|door opener/i,
    signature: "A service tab_group (repair, install, opener, maintenance), a faq_accordion of real questions and an emergency call action.",
    storyArc: ["the door that will not close", "diagnosis", "repair or replace", "maintenance", "call or book"],
    needsFromOwner: "Real services, brands the owner actually installs, hours and service area. No invented warranty terms.",
  },
  {
    key: "appliance-repair",
    label: "Appliance repair",
    match: /appliance|washer|dryer|refrigerator repair|fridge repair|oven repair|dishwasher/i,
    signature: "A tab_group by appliance type, a faq_accordion of real repair-or-replace questions and a clear booking action.",
    storyArc: ["the broken appliance", "how a visit works", "what is repaired", "repair or replace", "book a visit"],
    needsFromOwner: "Real appliance types and brands serviced, service area and any diagnostic fee exactly as the owner states it.",
  },
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
    signature: "When the home page has two or more pictures of the vehicle, open with a scrub_sequence (a pinned scroll that wipes from the first frame to the last) and a short display heading in the overlay. Otherwise use scroll_chapters. A before_after_slider only of the owner's real before and after of the same vehicle, and a spin_viewer only when the owner photographs one vehicle from 8 or more angles. Real services are offer cards.",
    storyArc: ["the vehicle as it arrived", "the process", "the finished panel in light", "packages", "booking"],
    needsFromOwner: "Real before and after photos; 8 or more angles of one finished vehicle for a spin. Until then the picture campaign should include 2-4 atmospheric frames of one vehicle (same light, moving closer — not a claimed result) so the home page can open as a scrub_sequence, with the real services as offer cards; a dark, high-contrast studio look often suits the trade, but the palette stays the designer's call.",
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

export type ArchetypeKey =
  | "precision-craft"
  | "emergency-dispatch"
  | "clinical-trust"
  | "hospitality-lifestyle"
  | "tech-growth"
  | "home-services"
  | "general";

export type Archetype = {
  key: ArchetypeKey;
  label: string;
  /** Kinds of business it covers, shown to the designer. */
  covers: string;
  /** Keywords for businesses with no specific trade playbook. Null for the general fallback. */
  match: RegExp | null;
  signature: string;
  storyArc: readonly string[];
  needsFromOwner: string;
  /** A suggestion for the look. The designer's call: never a palette or a font to copy. */
  look: string;
};

/**
 * The six universal archetypes plus a general fallback. Order matters: the first match wins, so the urgent and
 * technical vocabularies are tested before the broad hospitality and home-service ones.
 */
export const ARCHETYPES: readonly Archetype[] = [
  {
    key: "emergency-dispatch",
    label: "Urgent and on-call services",
    covers: "locksmiths, towing, 24-hour repair, water and fire restoration, rescue and recovery",
    match: /emergenc|24\s?\/\s?7|24[- ]?hour|round[- ]the[- ]clock|on[- ]call|urgent|rescue|ambulance|breakdown|disaster|biohazard|\bmold\b|(?:water|fire|flood|storm|smoke)\s+(?:damage|restoration|cleanup|remediation)/i,
    signature:
      "A call action that is always in reach: a mobile_sticky_bar with the real phone, a direct_contact widget near the top, a tab_group of the services the owner really offers, and a faq_accordion answering how a call works.",
    storyArc: ["the problem", "what happens when you call", "what is handled", "where you work", "call now"],
    needsFromOwner:
      "The real phone, hours, service area and any round-the-clock availability. Never state arrival times, a guaranteed response, insurance, licensing or accepted payment methods unless the owner supplied them.",
    look: "Plain, very clear and high contrast: little decoration, large tap targets, the phone number and one action on the first screen.",
  },
  {
    key: "tech-growth",
    label: "Software, agencies, energy and B2B",
    covers: "software and apps, marketing and IT firms, installers, logistics, engineering, industrial suppliers",
    match: /software|saas|\bapps?\b|platform|\bai\b|artificial intelligence|machine learning|automation|\bit\s+(?:support|services|consult)|managed service|cyber|cloud|hosting|analytics|fintech|biotech|start-?up|\bb2b\b|(?:marketing|advertising|digital|creative|web|seo|pr)\s+agency|\bseo\b|web\s?(?:design|dev)|development studio|digital|solar|energy|battery|logistic|freight|trucking|shipping|supply chain|wholesale|manufactur|industrial|equipment|machinery|\bcrane|leasing|engineering|laborator|telecom|network/i,
    signature:
      "Show how it works: scroll_chapters or a sticky_split_story of the real process or product, a tab_group of capabilities, a grid comparing plans or approaches built only from supplied facts (a toggle for two real price views), and a quote_calculator or enquiry_form with one clear demo or consult action.",
    storyArc: ["the problem the customer has", "how it works", "what is included", "how it compares", "book a demo or consult"],
    needsFromOwner:
      "A real feature list, the plans and prices exactly as the owner states them, and the integrations they actually have. No customer counts, uptime, savings, security certifications, logos or case studies unless supplied (a company logo only for a company the owner named).",
    look: "Crisp and technical: a clean neo-grotesque or geometric sans, fine lines, clear figure blocks (only supplied figures) and ample space.",
  },
  {
    key: "clinical-trust",
    label: "Care and professional advice",
    covers: "dental and medical practices, therapy, legal, accounting, architecture and other professional practices",
    match: /clinic|medic|health|dental|dentist|doctor|physician|surgeon|therap|counsel|psych|chiro|physio|optom|pharmac|nurs|hospice|senior care|elder care|home health|attorney|\blaw\b|lawyer|legal|notary|accountan|\bcpa\b|bookkeep|\btax|advis|wealth|mortgage|insurance|architect|surveyor/i,
    signature:
      "Calm clarity: a tab_group of services, a faq_accordion of the real questions clients ask, credentials shown only if the owner holds them, and one clear consult or appointment action (a booking_form or enquiry_form).",
    storyArc: ["the concern", "what a first visit or consultation is like", "the people", "the services", "book a consultation"],
    needsFromOwner:
      "Credentials and licences the owner actually holds, real team details and hours. Never imply a cure, an outcome, a ranking or a guaranteed result, and show no reviews unless they are published.",
    look: "Quiet, spacious and editorial: generous whitespace, a refined display face paired with a clean text face, soft neutral surfaces and one warm accent.",
  },
  {
    key: "hospitality-lifestyle",
    label: "Experiences and hospitality",
    covers: "restaurants, cafes, bakeries, chocolatiers, salons, spas, gyms, venues, hotels, shops",
    match: /restaurant|caf[eé]|coffee|\btea\b|bakery|bakeri|patisserie|chocolat|confection|ice cream|gelato|dessert|catering|\bbar\b|\bpub\b|brew|distill|winery|\bwine\b|cocktail|\bfood\b|hotel|motel|\binn\b|resort|lodg|bed and breakfast|\bvenue\b|event space|banquet|\bspa\b|salon|barber|\bgym\b|fitness|pilates|yoga|crossfit|florist|flower|gift shop|book(?:shop|store)|retail|\bshop\b|\bstore\b|\bmarket\b|travel|\btour|charter|yacht|escape room|bowling|arcade/i,
    signature:
      "Appetite and atmosphere: a scene over the owner's real photographs of the space or the product, a collection_row of the real offerings with prices from the Services tool, a tab_group for menu or class sections, and a reservation or booking action (a booking_form).",
    storyArc: ["the space or the product", "what is on offer", "the people", "hours and where", "reserve or order"],
    needsFromOwner:
      "The real menu, classes or services with their prices, the hours, and photographs of the real space and products. No awards, press mentions or reviews unless supplied or published.",
    look: "Warm and sensory: rich tones, full-bleed pictures with calm copy space and a computed scrim, expressive display type.",
  },
  {
    key: "precision-craft",
    label: "Craft and transformation work",
    covers: "detailing, remodelling, painting, landscaping, joinery, jewellery, restoration and design studios",
    match: /custom|bespoke|craft|artisan|handmade|jewel|goldsmith|silversmith|furniture|cabinet|joinery|woodwork|metalwork|\bweld|glass|\bstone\b|mason|\bbrick|fabricat|restor|tailor|seamstress|leather|printing|signmaking|sign shop|engrav|ceramic|pottery|gallery|interior (?:design|styling)|design studio/i,
    signature:
      "A hands-on proof moment built only from the owner's real photographs: a before_after_slider (revealMode \"brush\" for a hands-on reveal) or a lens_magnifier over one real photo, a sticky_split_story for the process, and the packages as a service_tier_fader of real services.",
    storyArc: ["the starting state", "the method, step by step", "the finished detail", "the packages", "a clear next step"],
    needsFromOwner:
      "Real project photos, with before and after pairs of the same subject for any reveal, and the real process in the owner's own words. Until then use scenes and a sticky_split_story over mood pictures, with no result claims.",
    look: "A restrained, high-contrast studio feel often suits craft work: deep or raw surfaces, fine borders, one restrained accent, generous vertical rhythm and full-bleed pictures with a computed scrim. A light palette is as valid as a dark one when it suits the brand.",
  },
  {
    key: "home-services",
    label: "Everyday home and property services",
    covers: "cleaning, moving, pest control, repairs, handyman work, inspections, pet care",
    match: /clean|maid|janitor|laundry|dry[- ]clean|repair|handyman|maintenance|inspect|moving|movers|junk|pest|exterminat|sweep|pressure|gutter|window|\bpet\b|\bdog|groom|walker|sitter|boarding|kennel|lawn|\byard\b|snow|plow|trash|waste|recycl|storage|carpet|chimney|septic|appliance|property management|errand|concierge|declutter/i,
    signature:
      "Make the price and the next step easy: a quote_calculator on the owner's real pricing (or a service_menu), what is included as a faq_accordion or tab_group, a process told in order, and a short enquiry_form.",
    storyArc: ["the busy week or the problem", "what is included", "how a visit works", "what it costs", "book or get a price"],
    needsFromOwner:
      "The owner's real pricing rules, what each service includes, the service area and the hours. No invented guarantees, insurance, background checks or reviews.",
    look: "Fresh, clean and reassuring: light surfaces, clear icons and checklists, one confident accent and large friendly buttons.",
  },
  {
    key: "general",
    label: "General local business",
    covers: "anything else",
    match: null,
    signature:
      "Whatever the owner's real material supports best: a collection_row of the real services, a faq_accordion of real questions, scroll_chapters of how it works over the supplied pictures, and one clear booking or enquiry action. Find the single most distinctive real thing about this business and build the page around it.",
    storyArc: ["who it is for", "what you do", "how it works", "the proof the owner can supply", "the next step"],
    needsFromOwner: "Real services, the service area, contact details and photographs. Ask for what is missing instead of inventing it.",
    look: "Choose a look that suits this business's own tone and avoid generic template styling.",
  },
];

/** The archetype of each specific trade, so its note can carry the same look suggestion. */
const PLAYBOOK_ARCHETYPE: Record<string, ArchetypeKey> = {
  locksmith: "emergency-dispatch",
  towing: "emergency-dispatch",
  hvac: "emergency-dispatch",
  plumbing: "emergency-dispatch",
  solar: "tech-growth",
  health: "clinical-trust",
  "real-estate-pro": "clinical-trust",
  education: "clinical-trust",
  beauty: "hospitality-lifestyle",
  food: "hospitality-lifestyle",
  "exterior-cleaning": "precision-craft",
  "auto-detailing": "precision-craft",
  roofing: "precision-craft",
  landscaping: "precision-craft",
  painting: "precision-craft",
  contracting: "precision-craft",
  "photo-creative": "precision-craft",
  cleaning: "home-services",
  moving: "home-services",
  pest: "home-services",
  pool: "home-services",
  "garage-door": "home-services",
  "appliance-repair": "home-services",
  electrical: "home-services",
  "auto-repair": "home-services",
};

/** [playbook key, words in the industry, archetype to use instead]. */
const SPECIFIC_LOOK_OVERRIDES: readonly (readonly [string, RegExp, ArchetypeKey])[] = [
  ["health", /gym|fitness|yoga|pilates|crossfit|trainer|wellness/i, "hospitality-lifestyle"],
  ["education", /dance|music|martial|coach/i, "hospitality-lifestyle"],
];

const GENERAL = ARCHETYPES.find((a) => a.key === "general")!;

function classify(text: string): Archetype | null {
  const t = text.trim();
  if (!t) return null;
  return ARCHETYPES.find((a) => a.match?.test(t)) ?? null;
}

/**
 * The archetype for a business: its specific trade's, else by its industry words, then by `hints` (its description
 * and service names) when the industry says nothing, else the general one. Null only with nothing to go on at all.
 */
export function archetypeFor(industry: string | null | undefined, hints: string | null | undefined = null): Archetype | null {
  const text = (industry ?? "").trim();
  const extra = (hints ?? "").trim();
  if (!text && !extra) return null;
  const specific = playbookFor(text);
  if (specific) {
    // A few trades share a playbook but not a look: a gym is not a dental practice.
    const override = SPECIFIC_LOOK_OVERRIDES.find(([key, words]) => key === specific.key && words.test(text));
    const key = override ? override[2] : PLAYBOOK_ARCHETYPE[specific.key];
    return ARCHETYPES.find((a) => a.key === key) ?? GENERAL;
  }
  return classify(text) ?? classify(extra) ?? GENERAL;
}

type Guidance = { label: string; signature: string; storyArc: readonly string[]; needsFromOwner: string; archetype: Archetype; specific: boolean };

/** What to build around: the specific trade's playbook when there is one, else the business's archetype. */
export function guidanceFor(industry: string | null | undefined, hints: string | null | undefined = null): Guidance | null {
  const archetype = archetypeFor(industry, hints);
  if (!archetype) return null;
  const playbook = playbookFor(industry);
  return playbook
    ? { label: playbook.label, signature: playbook.signature, storyArc: playbook.storyArc, needsFromOwner: playbook.needsFromOwner, archetype, specific: true }
    : { label: archetype.label, signature: archetype.signature, storyArc: archetype.storyArc, needsFromOwner: archetype.needsFromOwner, archetype, specific: false };
}

/** One block of prompt text for Sol, or null. Ideas, not orders: the supplied material decides. */
export function playbookNote(industry: string | null | undefined, hints: string | null | undefined = null): string | null {
  const guide = guidanceFor(industry, hints);
  if (!guide) return null;
  return [
    guide.specific
      ? `TRADE PLAYBOOK for ${guide.label} (ideas for this trade; use only what the supplied material supports, and never invent proof):`
      : `DESIGN GUIDE for this kind of business, ${guide.label} (${guide.archetype.covers}). Ideas, not orders: use only what the supplied material supports, and never invent proof.`,
    `Signature moment: ${guide.signature}`,
    `Story arc for a scroll story: ${guide.storyArc.join(" → ")}.`,
    `What the owner must supply: ${guide.needsFromOwner}`,
    `Look (a suggestion; you choose the palette and type for this business): ${guide.archetype.look}`,
  ].join("\n");
}

export type StarterIdea = { label: string; reason: string; instruction: string };

/**
 * Starter requests for an empty chat, shown at once while the AI's own
 * suggestions load. They only restate what the playbook and the builder
 * already allow, ask for missing material instead of inventing it, and never
 * promise a result.
 */
export function starterIdeasFor(industry: string | null | undefined, hints: string | null | undefined = null): StarterIdea[] {
  const guide = guidanceFor(industry, hints);
  const ideas: StarterIdea[] = [];
  if (guide) {
    ideas.push({
      label: guide.specific ? "Add my trade's signature moment" : "Add the signature moment for my business",
      reason: guide.label,
      instruction: `Add the signature moment for my business to my home page, where my real material supports it: ${guide.signature} ${guide.needsFromOwner} If something is missing, ask me for it instead of inventing it.`,
    });
    ideas.push({
      label: "Tell my story as I scroll",
      reason: "A scroll story over my pictures",
      instruction: `Turn my home page into a scroll story in this order where my real material supports it: ${guide.storyArc.join(", then ")}. Use scenes over my real or mood pictures, with no result claims and no invented facts.`,
    });
  }
  ideas.push({
    label: "Make every page richer",
    reason: "Replace plain text stacks",
    instruction:
      "Look at every page. Where a section is only plain text on stacks and cards, rebuild it with scenes, offer cards, galleries or interactive blocks that fit my real services and photos. Keep every word and fact I supplied.",
  });
  ideas.push({
    label: "Add a mobile action bar",
    reason: "Call and book on phones",
    instruction: "Add a sticky mobile action bar with call and book buttons that use my real phone number and booking page.",
  });
  return ideas;
}
