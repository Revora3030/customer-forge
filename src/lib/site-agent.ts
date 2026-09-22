import {
  backdropLabel,
  isBackdropId,
  isSectionEffectId,
  sectionEffectLabel,
  type BackdropId,
  type SectionEffectId,
} from "@/lib/site-effects";
import { safeLinkUrl } from "@/lib/website-content";
import { describeCustomBlock, parseCustomBlock, type CustomBlockSpec } from "@/lib/builder/custom-block";
import {
  DEVICES,
  STYLE_KEYS,
  normalizeStyleInput,
  writeBlockStyle,
  type BlockStyle,
  type Device,
  type StyleKey,
} from "@/lib/site-style";

/**
 * REVORA SITE AGENT — MASTER ACTION CONTRACT
 * ===========================================
 *
 * This file is the shared vocabulary between:
 *
 * Human request
 *      ↓
 * Interpreter / AI planner
 *      ↓
 * AgentAction
 *      ↓
 * Executor
 *      ↓
 * Website
 *
 * IMPORTANT:
 * This file does not write to the database.
 * It defines safe, validated actions only.
 *
 * Visual intelligence is first-class here.
 *
 * The builder can now explicitly control:
 * - section composition
 * - image treatment
 * - image position
 * - focal point
 * - image ratio
 * - card geometry
 * - spacing
 * - density
 * - max width
 * - overlays
 * - shadows
 * - object fit
 * - object position
 *
 * This keeps visual intent from being hidden inside arbitrary JSON.
 */

export const PLAN_INSTRUCTION_LIMIT = 24_000;

/**
 * One-tap starting points for the most common edits. Used for the quick voice
 * and click commands next to the assistant box — each one is a full, safe
 * instruction the owner can still edit before sending.
 */
export const QUICK_COMMANDS: { label: string; instruction: string }[] = [
  {
    label: "Change hero text",
    instruction:
      "Rewrite the hero heading and subheading on the home page so the main benefit and service area are obvious in the first line, and make the main button copy action-led.",
  },
  {
    label: "Add gallery",
    instruction:
      "Add a photo gallery section to the home page showing recent work, with a short introduction line, and link it from the menu if a gallery page makes more sense.",
  },
  {
    label: "Update pricing section",
    instruction:
      "Update the pricing section so each package has a clear name, what's included and a starting price, and make the most popular option stand out. Ask me for any prices you don't already have.",
  },
  {
    label: "Sharpen the call to action",
    instruction:
      "Make every call to action on the site consistent and specific — same wording, same promise, and a booking or quote button visible on every page.",
  },
  {
    label: "Add customer reviews",
    instruction:
      "Add a reviews section high on the home page using the reviews already in my workspace, and move it above the services section.",
  },
  {
    label: "Write my search text",
    instruction:
      "Write a page title and meta description for every page, plus social share text for the home page, using my real services and city.",
  },
];

/**
 * Guided multimodal templates. Each one tells the owner exactly what to attach
 * and gives the assistant a consistent brief, so a before/after clip or a set
 * of job photos produces the same quality of update every time.
 */
export const MULTIMODAL_TEMPLATES: {
  key: string;
  label: string;
  attach: string;
  instruction: string;
}[] = [
  {
    key: "before-after",
    label: "Before / after job",
    attach: "A short before/after clip, or one before photo and one after photo",
    instruction:
      "I've attached a before/after of a recent job. Write a short case-study block for the home page: a headline about the transformation, two or three sentences describing what was done (only what you can actually see), and a button to book the same service. Add the photos to the gallery section, and tell me any detail you need from me instead of guessing prices or timings.",
  },
  {
    key: "walkthrough",
    label: "Walkthrough clip",
    attach: "A 30–60 second clip talking through your business or a job",
    instruction:
      "I've attached a walkthrough clip. Use the chapters you wrote for it to update my website: pull the services mentioned into the services section, use my own words for the about section, and list anything I said that you can't verify as a question for me instead of publishing it.",
  },
  {
    key: "photo-refresh",
    label: "Photo refresh",
    attach: "Two to four recent job photos",
    instruction:
      "I've attached recent job photos. Refresh the gallery section with them, write one short caption per photo describing only what's visible, and update the hero image guidance to match the style of these photos.",
  },
  {
    key: "competitor-flyer",
    label: "Match a flyer or design",
    attach: "A photo or screenshot of the flyer, van wrap or page you like",
    instruction:
      "I've attached a design I like. Match its tone and structure on my home page — section order, heading style and colour feel — but keep every fact, price and service my own. Don't copy any wording or claims from the image.",
  },
];

/**
 * The executor currently supports a bounded action plan.
 * Keep this synchronized with the executor.
 */
export const MAX_ACTIONS = 60;

export type AgentField = "heading" | "subheading" | "body";

export type PageSeoPatch = {
  title?: string;
  slug?: string;
  is_visible?: boolean;
  noindex?: boolean;
  seo_title?: string;
  seo_description?: string;
  seo_canonical?: string;
  og_title?: string;
  og_description?: string;
};

export type ComponentPatch = {
  label?: string;
  body?: string;
  link_url?: string;
  link_label?: string;
  is_visible?: boolean;
};

/* -------------------------------------------------------------------------- */
/* VISUAL INTELLIGENCE                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Visual properties for a single media-bearing component.
 *
 * These are deliberately finite values rather than arbitrary CSS.
 * This prevents the AI from injecting unsafe or unsupported styles.
 */
export type VisualComponentPatch = {
  media_url?: string | null;

  /**
   * Accessibility text.
   */
  alt?: string;

  /**
   * CSS object-fit strategy.
   */
  object_fit?: "cover" | "contain";

  /**
   * Safe human-readable focal positioning.
   *
   * Examples:
   * - center
   * - center top
   * - left center
   * - right center
   */
  object_position?: string;

  /**
   * Visual overlay treatment.
   */
  overlay?: "none" | "soft" | "dark" | "brand" | "gradient";

  /**
   * Border-radius design token.
   */
  radius?: "none" | "small" | "medium" | "large" | "pill";

  /**
   * Shadow design token.
   */
  shadow?: "none" | "soft" | "medium" | "strong";

  /**
   * Preferred image composition ratio.
   */
  aspect_ratio?: "1:1" | "4:3" | "3:2" | "16:9" | "21:9";

  /**
   * Optional normalized focal point.
   *
   * Examples:
   * - "0.5 0.5"
   * - "0.8 0.4"
   */
  focal_point?: string;
};

/**
 * Visual composition for an entire section.
 *
 * This is intentionally independent from copy.
 *
 * Copy says WHAT the section says.
 * Visual composition says HOW the section looks.
 */
export type SectionVisualPatch = {
  layout?:
    | "split"
    | "centered"
    | "image_left"
    | "image_right"
    | "full_bleed"
    | "editorial"
    | "layered"
    | "stacked";

  density?:
    | "airy"
    | "balanced"
    | "dense";

  image_position?:
    | "left"
    | "right"
    | "center"
    | "background";

  image_treatment?:
    | "natural"
    | "rounded"
    | "soft_shadow"
    | "glass_frame"
    | "duotone"
    | "gradient_overlay"
    | "cinematic"
    | "cutout"
    | "full_bleed";

  spacing?:
    | "tight"
    | "standard"
    | "generous";

  max_width?:
    | "narrow"
    | "standard"
    | "wide"
    | "edge";

  card_style?:
    | "soft"
    | "sharp"
    | "pill"
    | "glass"
    | "editorial"
    | "floating";

  image_ratio?:
    | "1:1"
    | "4:3"
    | "3:2"
    | "16:9"
    | "21:9";
};

export type { BackdropId, SectionEffectId };

export type ThemePatch = {
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  font_preference?: string;
};

/** Safe block styling shared by the AI planner, visual editor and renderer. */
export type BlockStylePatch = Partial<Record<StyleKey, BlockStyle[StyleKey] | null>>;

export const BUSINESS_FACT_FIELDS = [
  "tagline",
  "description",
  "phone",
  "email",
  "city",
  "state",
  "service_area",
  "address",
  "review_link",
  "website",
] as const;

export type BusinessFactField =
  (typeof BUSINESS_FACT_FIELDS)[number];

/* -------------------------------------------------------------------------- */
/* ACTION CONTRACT                                                            */
/* -------------------------------------------------------------------------- */

export type AgentAction =
  | {
      type: "set_section_text";
      sectionId: string;
      field: AgentField;
      value: string;
    }

  | {
      type: "set_section_visibility";
      sectionId: string;
      visible: boolean;
    }

  | {
      type: "set_section_variant";
      sectionId: string;
      variant: string;
    }

  | {
      type: "set_section_visual";
      sectionId: string;
      patch: SectionVisualPatch;
    }

  | {
      type: "set_block_style";
      target: "section" | "component";
      targetId: string;
      device: Device;
      patch: BlockStylePatch;
    }

  /**
   * Installs a validated custom interactive block (estimator, guided picker,
   * comparison table, steps, checklist, tabs, figures) on a section. The spec
   * is data only — it is rendered by trusted components, never executed.
   */
  | {
      type: "set_custom_block";
      sectionId: string;
      spec: CustomBlockSpec;
    }


  | {
      type: "add_section";
      pageId: string;

      /**
       * Temporary name (`temp_*`) so later actions can target
       * this newly-created section.
       */
      ref?: string | undefined;

      kind: string;
      heading?: string | undefined;
      subheading?: string | undefined;
      body?: string | undefined;
      position?: number | undefined;
    }

  | {
      type: "delete_section";
      sectionId: string;
    }

  | {
      type: "reorder_sections";
      pageId: string;
      sectionIds: string[];
    }

  | {
      type: "reorder_components";
      sectionId: string;
      componentIds: string[];
    }

  | {
      type: "set_component";
      componentId: string;
      patch: ComponentPatch;
    }

  | {
      type: "set_component_visual";
      componentId: string;
      patch: VisualComponentPatch;
    }

  | {
      /** Generate/edit a real AI image and attach it to this exact component. */
      type: "generate_component_image";
      componentId: string;
      prompt: string;
      alt: string;
      mode: "replace" | "create";
    }

  | {
      type: "add_component";
      sectionId: string;
      /**
       * Temporary reference so a newly-created component can be edited or
       * restyled later in the same approved plan.
       */
      ref?: string | undefined;
      kind: string;
      label?: string | undefined;
      body?: string | undefined;
      link_url?: string | undefined;
      link_label?: string | undefined;
    }

  | {
      type: "delete_component";
      componentId: string;
    }

  | {
      type: "add_page";
      kind: string;
      title: string;
      slug: string;

      /**
       * Temporary page reference.
       *
       * Example:
       * temp_page_1
       */
      ref?: string | undefined;
    }

  | {
      type: "set_page";
      pageId: string;
      patch: PageSeoPatch;
    }

  | {
      type: "delete_page";
      pageId: string;
    }

  | {
      type: "set_theme";
      patch: ThemePatch;
    }

  | {
      type: "set_backdrop";
      backdrop: BackdropId;
    }

  | {
      type: "set_section_effect";
      sectionId: string;
      effect: SectionEffectId;
    }

  | {
      type: "set_business_fact";
      field: BusinessFactField;
      value: string;
    };

/* -------------------------------------------------------------------------- */
/* PLAN TYPES                                                                 */
/* -------------------------------------------------------------------------- */

export type AgentStep = {
  /**
   * Stable index used by the UI.
   */
  key: string;

  /**
   * Plain-English title.
   */
  title: string;

  /**
   * Human-readable location.
   *
   * Example:
   * Home → Hero
   */
  where: string;

  /**
   * Current value, when replacing content.
   */
  before?: string;

  /**
   * New value.
   */
  after?: string;

  /**
   * Whether this action removes/hides something.
   */
  destructive: boolean;

  action: AgentAction;
};

export type AgentPlan = {
  reply: string;
  summary: string;
  steps: AgentStep[];
  questions: string[];
  notes: string[];
};

export type AgentTurn = {
  role: "user" | "assistant";
  content: string;
};

/* -------------------------------------------------------------------------- */
/* VALIDATION                                                                 */
/* -------------------------------------------------------------------------- */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A temporary reference is intentionally much more restricted than
 * an arbitrary string.
 */
export const TEMP_REF =
  /^temp_[a-z0-9_]{1,30}$/i;

const HEX =
  /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const KIND =
  /^[a-z][a-z0-9_]{1,32}$/;

/**
 * Only allow human-readable CSS position tokens.
 *
 * Valid:
 * - center
 * - center top
 * - right center
 * - left bottom
 */
const CSS_POSITION =
  /^(?:left|center|right|top|bottom)(?:\s+(?:left|center|right|top|bottom))?$/i;

/**
 * Normalized focal coordinates.
 *
 * Valid:
 * - 0
 * - 0.5
 * - 1
 * - 0.5 0.8
 */
const SAFE_FOCAL_POINT =
  /^(?:0|0\.[0-9]+|1)(?:\s+(?:0|0\.[0-9]+|1))?$/;

/**
 * Finite visual vocabularies.
 *
 * The planner can be creative about WHICH value it chooses,
 * but it cannot invent arbitrary CSS.
 */
const VISUAL_VALUES = {
  object_fit: new Set([
    "cover",
    "contain",
  ]),

  overlay: new Set([
    "none",
    "soft",
    "dark",
    "brand",
    "gradient",
  ]),

  radius: new Set([
    "none",
    "small",
    "medium",
    "large",
    "pill",
  ]),

  shadow: new Set([
    "none",
    "soft",
    "medium",
    "strong",
  ]),

  aspect_ratio: new Set([
    "1:1",
    "4:3",
    "3:2",
    "16:9",
    "21:9",
  ]),

  layout: new Set([
    "split",
    "centered",
    "image_left",
    "image_right",
    "full_bleed",
    "editorial",
    "layered",
    "stacked",
  ]),

  density: new Set([
    "airy",
    "balanced",
    "dense",
  ]),

  image_position: new Set([
    "left",
    "right",
    "center",
    "background",
  ]),

  image_treatment: new Set([
    "natural",
    "rounded",
    "soft_shadow",
    "glass_frame",
    "duotone",
    "gradient_overlay",
    "cinematic",
    "cutout",
    "full_bleed",
  ]),

  spacing: new Set([
    "tight",
    "standard",
    "generous",
  ]),

  max_width: new Set([
    "narrow",
    "standard",
    "wide",
    "edge",
  ]),

  card_style: new Set([
    "soft",
    "sharp",
    "pill",
    "glass",
    "editorial",
    "floating",
  ]),

  image_ratio: new Set([
    "1:1",
    "4:3",
    "3:2",
    "16:9",
    "21:9",
  ]),
} as const;

/* -------------------------------------------------------------------------- */
/* BASIC HELPERS                                                              */
/* -------------------------------------------------------------------------- */

const text = (
  value: unknown,
  max: number,
) => {
  const out =
    typeof value === "string"
      ? value.trim()
      : "";

  return out.slice(0, max);
};

const bool = (
  value: unknown,
) =>
  value === true ||
  value === "true";

const isField = (
  value: unknown,
): value is AgentField =>
  value === "heading" ||
  value === "subheading" ||
  value === "body";

/**
 * Convert a page title or requested URL into a safe path.
 */
export const slugifyPath = (
  value: string,
) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/* -------------------------------------------------------------------------- */
/* SAFE VISUAL INPUT                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Image URLs have stricter rules than normal action links.
 *
 * Allowed:
 * - relative paths
 * - http
 * - https
 *
 * Rejected:
 * - javascript:
 * - data:
 * - mailto:
 * - tel:
 * - protocol-relative //
 * - credentials in URLs
 */
const safeVisualUrl = (
  value: unknown,
): string | null | undefined => {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const candidate =
    value.trim().slice(0, 2000);

  if (!candidate) {
    return undefined;
  }

  /**
   * Local assets are valid.
   */
  if (candidate.startsWith("/")) {
    if (candidate.startsWith("//")) {
      return undefined;
    }

    return candidate;
  }

  const safe =
    safeLinkUrl(candidate);

  if (!safe) {
    return undefined;
  }

  try {
    const url =
      new URL(safe);

    if (
      url.username ||
      url.password
    ) {
      return undefined;
    }

    if (
      url.protocol !== "https:" &&
      url.protocol !== "http:"
    ) {
      return undefined;
    }
  } catch {
    return undefined;
  }

  return safe;
};

/* -------------------------------------------------------------------------- */
/* VISUAL PATCH READERS                                                       */
/* -------------------------------------------------------------------------- */

const readVisualPatch = (
  value: unknown,
): VisualComponentPatch => {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return {};
  }

  const raw =
    value as Record<string, unknown>;

  const patch: VisualComponentPatch = {};

  const media =
    safeVisualUrl(
      raw["media_url"],
    );

  if (media !== undefined) {
    patch.media_url = media;
  }

  if (
    typeof raw["alt"] ===
    "string"
  ) {
    const alt =
      text(raw["alt"], 160);

    if (alt) {
      patch.alt = alt;
    }
  }

  if (
    typeof raw["object_fit"] ===
    "string" &&
    VISUAL_VALUES.object_fit.has(
      raw["object_fit"] as never,
    )
  ) {
    patch.object_fit =
      raw["object_fit"] as NonNullable<VisualComponentPatch["object_fit"]>;
  }

  if (
    typeof raw["object_position"] ===
    "string"
  ) {
    const position =
      text(
        raw["object_position"],
        40,
      );

    if (
      CSS_POSITION.test(position)
    ) {
      patch.object_position =
        position.toLowerCase();
    }
  }

  if (
    typeof raw["overlay"] ===
    "string" &&
    VISUAL_VALUES.overlay.has(
      raw["overlay"] as never,
    )
  ) {
    patch.overlay =
      raw["overlay"] as NonNullable<VisualComponentPatch["overlay"]>;
  }

  if (
    typeof raw["radius"] ===
    "string" &&
    VISUAL_VALUES.radius.has(
      raw["radius"] as never,
    )
  ) {
    patch.radius =
      raw["radius"] as NonNullable<VisualComponentPatch["radius"]>;
  }

  if (
    typeof raw["shadow"] ===
    "string" &&
    VISUAL_VALUES.shadow.has(
      raw["shadow"] as never,
    )
  ) {
    patch.shadow =
      raw["shadow"] as NonNullable<VisualComponentPatch["shadow"]>;
  }

  if (
    typeof raw["aspect_ratio"] ===
    "string" &&
    VISUAL_VALUES.aspect_ratio.has(
      raw["aspect_ratio"] as never,
    )
  ) {
    patch.aspect_ratio =
      raw["aspect_ratio"] as NonNullable<VisualComponentPatch["aspect_ratio"]>;
  }

  if (
    typeof raw["focal_point"] ===
    "string"
  ) {
    const focal =
      text(
        raw["focal_point"],
        40,
      );

    if (
      SAFE_FOCAL_POINT.test(focal)
    ) {
      patch.focal_point = focal;
    }
  }

  return patch;
};

const readSectionVisualPatch = (
  value: unknown,
): SectionVisualPatch => {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return {};
  }

  const raw =
    value as Record<string, unknown>;

  const patch:
    Partial<SectionVisualPatch> = {};

  const values = [
    "layout",
    "density",
    "image_position",
    "image_treatment",
    "spacing",
    "max_width",
    "card_style",
    "image_ratio",
  ] as const;

  for (const key of values) {
    const candidate =
      text(
        raw[key],
        40,
      );

    if (
      candidate &&
      VISUAL_VALUES[key].has(
        candidate as never,
      )
    ) {
      patch[key] =
        candidate as never;
    }
  }

  return patch as SectionVisualPatch;
};

const readBlockStylePatch = (value: unknown): BlockStylePatch => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  // Natural property names ("backgroundColor", "fontSize", "padding: 48px")
  // are mapped onto Revora's style model first, so a valid design request is
  // never discarded just because the model named the property its own way.
  const raw = normalizeStyleInput(value) as Partial<Record<StyleKey, unknown>>;
  const cleaned = writeBlockStyle({}, raw)["style"];
  if (!cleaned || typeof cleaned !== "object" || Array.isArray(cleaned)) return {};
  const out: BlockStylePatch = {};
  for (const key of STYLE_KEYS) {
    if (!(key in raw)) continue;
    if (raw[key] === null || raw[key] === "") out[key] = null;
    else if (key in cleaned) out[key] = (cleaned as BlockStylePatch)[key] as never;
  }
  return out;
};

/* -------------------------------------------------------------------------- */
/* ACTION READER                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Converts model output into actions Revora is actually willing to execute.
 *
 * Unknown actions are dropped.
 * Unknown IDs are dropped.
 * Invalid visual values are dropped.
 * Unsafe links are dropped.
 * Arbitrary CSS is never accepted.
 */
export function readActions(
  value: unknown,
  known: {
    pageIds: Set<string>;
    sectionIds: Set<string>;
    componentIds: Set<string>;
  },
): AgentAction[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const out: AgentAction[] = [];

  /**
   * Page and section temporary references are separate namespaces.
   * This prevents a temporary page from accidentally being treated
   * as a temporary section.
   */
  const pageRefs =
    new Set<string>();

  const sectionRefs =
    new Set<string>();

  const componentRefs =
    new Set<string>();

  const knownPage = (
    id: string,
  ) =>
    known.pageIds.has(id) ||
    pageRefs.has(id);

  const knownSection = (
    id: string,
  ) =>
    known.sectionIds.has(id) ||
    sectionRefs.has(id);

  const knownComponent = (
    id: string,
  ) =>
    known.componentIds.has(id) ||
    componentRefs.has(id);

  for (
    const raw of value.slice(
      0,
      MAX_ACTIONS * 2,
    )
  ) {
    if (
      !raw ||
      typeof raw !== "object"
    ) {
      continue;
    }

    const row =
      raw as Record<string, unknown>;

    const type =
      text(
        row["type"],
        60,
      );

    const sectionId =
      text(
        row["sectionId"],
        80,
      );

    const pageId =
      text(
        row["pageId"],
        80,
      );

    const componentId =
      text(
        row["componentId"],
        80,
      );

    switch (type) {
      /* ------------------------------------------------------------------ */
      /* SECTION TEXT                                                       */
      /* ------------------------------------------------------------------ */

      case "set_section_text": {
        const field =
          row["field"];

        const value2 =
          text(
            row["value"],
            4000,
          );

        if (
          !knownSection(
            sectionId,
          )
        ) {
          break;
        }

        if (
          !isField(field) ||
          !value2
        ) {
          break;
        }

        out.push({
          type,
          sectionId,
          field,
          value: value2,
        });

        break;
      }

      /* ------------------------------------------------------------------ */
      /* SECTION VISIBILITY                                                 */
      /* ------------------------------------------------------------------ */

      case "set_section_visibility": {
        if (
          !knownSection(
            sectionId,
          )
        ) {
          break;
        }

        out.push({
          type,
          sectionId,
          visible: bool(
            row["visible"],
          ),
        });

        break;
      }

      /* ------------------------------------------------------------------ */
      /* SECTION VARIANT                                                    */
      /* ------------------------------------------------------------------ */

      case "set_section_variant": {
        const variant =
          text(
            row["variant"],
            40,
          );

        if (
          !knownSection(
            sectionId,
          ) ||
          !KIND.test(variant)
        ) {
          break;
        }

        out.push({
          type,
          sectionId,
          variant,
        });

        break;
      }

      /* ------------------------------------------------------------------ */
      /* SECTION VISUAL                                                     */
      /* ------------------------------------------------------------------ */

      case "set_section_visual": {
        if (
          !knownSection(
            sectionId,
          )
        ) {
          break;
        }

        const patch =
          readSectionVisualPatch(
            row["patch"],
          );

        if (
          Object.keys(patch)
            .length === 0
        ) {
          break;
        }

        out.push({
          type,
          sectionId,
          patch,
        });

        break;
      }

      case "set_block_style": {
        const target = row["target"] === "component" ? "component" : row["target"] === "section" ? "section" : null;
        const targetId = text(row["targetId"], 80);
        const device = DEVICES.includes(row["device"] as Device) ? (row["device"] as Device) : "desktop";
        const patch = readBlockStylePatch(row["patch"]);
        const knownTarget = target === "section" ? knownSection(targetId) : target === "component" ? knownComponent(targetId) : false;
        if (!target || !knownTarget || Object.keys(patch).length === 0) break;
        out.push({ type, target, targetId, device, patch });
        break;
      }

      /* ------------------------------------------------------------------ */
      /* CUSTOM INTERACTIVE BLOCK                                           */
      /* ------------------------------------------------------------------ */

      case "set_custom_block": {
        if (
          !knownSection(
            sectionId,
          )
        ) {
          break;
        }

        const parsed =
          parseCustomBlock(
            row["spec"],
          );

        if (!parsed.ok) {
          break;
        }

        out.push({
          type,
          sectionId,
          spec: parsed.spec,
        });

        break;
      }


      /* ------------------------------------------------------------------ */
      /* ADD SECTION                                                        */
      /* ------------------------------------------------------------------ */

      case "add_section": {
        const kind =
          text(
            row["kind"],
            40,
          ).toLowerCase();

        if (
          !knownPage(pageId) ||
          !KIND.test(kind)
        ) {
          break;
        }

        const position =
          Number(
            row["position"],
          );

        const sectionRef =
          text(
            row["ref"],
            40,
          );

        if (sectionRef && TEMP_REF.test(sectionRef) && sectionRefs.has(sectionRef)) {
          break;
        }

        const usableRef =
          TEMP_REF.test(sectionRef)
            ? sectionRef
            : "";

        if (usableRef) {
          sectionRefs.add(usableRef);
        }

        out.push({
          type,
          pageId,
          ref:
            usableRef ||
            undefined,

          kind,

          heading:
            text(
              row["heading"],
              200,
            ) ||
            undefined,

          subheading:
            text(
              row["subheading"],
              400,
            ) ||
            undefined,

          body:
            text(
              row["body"],
              4000,
            ) ||
            undefined,

          position:
            Number.isFinite(
              position,
            ) &&
            position >= 0
              ? Math.floor(
                  position,
                )
              : undefined,
        });

        break;
      }

      /* ------------------------------------------------------------------ */
      /* DELETE SECTION                                                     */
      /* ------------------------------------------------------------------ */

      case "delete_section": {
        if (
          !knownSection(
            sectionId,
          )
        ) {
          break;
        }

        out.push({
          type,
          sectionId,
        });

        break;
      }

      /* ------------------------------------------------------------------ */
      /* REORDER SECTIONS                                                   */
      /* ------------------------------------------------------------------ */

      case "reorder_sections": {
        const rawIds =
          Array.isArray(row["sectionIds"])
            ? (row["sectionIds"] as unknown[]).map((id) => text(id, 80))
            : [];
        const ids = rawIds.filter(Boolean);

        if (
          !knownPage(pageId) ||
          ids.length < 2 ||
          ids.some((id) => !knownSection(id)) ||
          new Set(ids).size !== ids.length
        ) {
          break;
        }

        out.push({
          type,
          pageId,
          sectionIds: [
            ...new Set(ids),
          ],
        });

        break;
      }

      /* ------------------------------------------------------------------ */
      /* REORDER COMPONENTS                                                 */
      /* ------------------------------------------------------------------ */

      case "reorder_components": {
        const rawIds =
          Array.isArray(row["componentIds"])
            ? (row["componentIds"] as unknown[]).map((id) => text(id, 80))
            : [];
        const ids = rawIds.filter(Boolean);

        if (
          !knownSection(sectionId) ||
          ids.length < 2 ||
          ids.some((id) => !knownComponent(id)) ||
          new Set(ids).size !== ids.length
        ) {
          break;
        }

        out.push({
          type,
          sectionId,
          componentIds: [...new Set(ids)],
        });

        break;
      }

      /* ------------------------------------------------------------------ */
      /* SET COMPONENT                                                      */
      /* ------------------------------------------------------------------ */

      case "set_component": {
        const patchRaw =
          (row["patch"] ??
            {}) as Record<
            string,
            unknown
          >;

        const patch:
          ComponentPatch = {};

        if (
          typeof patchRaw[
            "label"
          ] === "string"
        ) {
          patch.label =
            text(
              patchRaw[
                "label"
              ],
              200,
            );
        }

        if (
          typeof patchRaw[
            "body"
          ] === "string"
        ) {
          patch.body =
            text(
              patchRaw[
                "body"
              ],
              2000,
            );
        }

        if (
          typeof patchRaw[
            "link_url"
          ] === "string"
        ) {
          const safe =
            safeLinkUrl(
              text(
                patchRaw[
                  "link_url"
                ],
                400,
              ),
            );

          if (safe) {
            patch.link_url =
              safe;
          }
        }

        if (
          typeof patchRaw[
            "link_label"
          ] === "string"
        ) {
          patch.link_label =
            text(
              patchRaw[
                "link_label"
              ],
              120,
            );
        }

        if (
          "is_visible" in
          patchRaw
        ) {
          patch.is_visible =
            bool(
              patchRaw[
                "is_visible"
              ],
            );
        }

        if (
          !knownComponent(
            componentId,
          ) ||
          Object.keys(
            patch,
          ).length === 0
        ) {
          break;
        }

        out.push({
          type,
          componentId,
          patch,
        });

        break;
      }

      /* ------------------------------------------------------------------ */
      /* SET COMPONENT VISUAL                                               */
      /* ------------------------------------------------------------------ */

      case "set_component_visual": {
        if (
          !knownComponent(
            componentId,
          )
        ) {
          break;
        }

        const patch =
          readVisualPatch(
            row["patch"],
          );

        if (
          Object.keys(
            patch,
          ).length === 0
        ) {
          break;
        }

        out.push({
          type,
          componentId,
          patch,
        });

        break;
      }

      case "generate_component_image": {
        if (!knownComponent(componentId)) break;
        const prompt = text(row["prompt"], 1200);
        const alt = text(row["alt"], 200);
        const mode = row["mode"] === "create" ? "create" : "replace";
        if (prompt.length < 20 || alt.length < 3) break;
        out.push({ type, componentId, prompt, alt, mode });
        break;
      }

      /* ------------------------------------------------------------------ */
      /* ADD COMPONENT                                                      */
      /* ------------------------------------------------------------------ */

      case "add_component": {
        const kind =
          text(
            row["kind"],
            40,
          ).toLowerCase();

        if (
          !knownSection(
            sectionId,
          ) ||
          !KIND.test(kind)
        ) {
          break;
        }

        const ref =
          text(
            row["ref"],
            40,
          );

        if (ref && TEMP_REF.test(ref) && componentRefs.has(ref)) {
          break;
        }

        const usableRef =
          TEMP_REF.test(ref)
            ? ref
            : "";

        if (usableRef) {
          componentRefs.add(usableRef);
        }

        out.push({
          type,
          sectionId,
          ref:
            usableRef ||
            undefined,
          kind,

          label:
            text(
              row["label"],
              200,
            ) ||
            undefined,

          body:
            text(
              row["body"],
              2000,
            ) ||
            undefined,

          link_url:
            safeLinkUrl(
              text(
                row["link_url"],
                400,
              ),
            ) ??
            undefined,

          link_label:
            text(
              row["link_label"],
              120,
            ) ||
            undefined,
        });

        break;
      }

      /* ------------------------------------------------------------------ */
      /* DELETE COMPONENT                                                   */
      /* ------------------------------------------------------------------ */

      case "delete_component": {
        if (
          !knownComponent(
            componentId,
          )
        ) {
          break;
        }

        out.push({
          type,
          componentId,
        });

        break;
      }

      /* ------------------------------------------------------------------ */
      /* ADD PAGE                                                           */
      /* ------------------------------------------------------------------ */

      case "add_page": {
        const kind =
          text(
            row["kind"],
            40,
          ).toLowerCase();

        const title =
          text(
            row["title"],
            120,
          );

        const slug =
          slugifyPath(
            text(
              row["slug"],
              80,
            ) ||
              title,
          );

        if (
          !KIND.test(kind) ||
          !title ||
          !slug
        ) {
          break;
        }

        const ref =
          text(
            row["ref"],
            40,
          );

        if (ref && TEMP_REF.test(ref) && pageRefs.has(ref)) {
          break;
        }

        const usable =
          TEMP_REF.test(ref)
            ? ref
            : "";

        if (usable) {
          pageRefs.add(usable);
        }

        out.push({
          type,
          kind,
          title,
          slug,
          ref:
            usable ||
            undefined,
        });

        break;
      }

      /* ------------------------------------------------------------------ */
      /* SET PAGE                                                           */
      /* ------------------------------------------------------------------ */

      case "set_page": {
        const patchRaw =
          (row["patch"] ??
            {}) as Record<
            string,
            unknown
          >;

        const patch:
          PageSeoPatch = {};

        if (
          typeof patchRaw[
            "title"
          ] === "string"
        ) {
          patch.title =
            text(
              patchRaw[
                "title"
              ],
              120,
            );
        }

        if (
          typeof patchRaw[
            "slug"
          ] === "string"
        ) {
          patch.slug =
            slugifyPath(
              text(
                patchRaw[
                  "slug"
                ],
                80,
              ),
            );
        }

        if (
          "is_visible" in
          patchRaw
        ) {
          patch.is_visible =
            bool(
              patchRaw[
                "is_visible"
              ],
            );
        }

        if (
          "noindex" in
          patchRaw
        ) {
          patch.noindex =
            bool(
              patchRaw[
                "noindex"
              ],
            );
        }

        if (
          typeof patchRaw[
            "seo_title"
          ] === "string"
        ) {
          patch.seo_title =
            text(
              patchRaw[
                "seo_title"
              ],
              70,
            );
        }

        if (
          typeof patchRaw[
            "seo_description"
          ] === "string"
        ) {
          patch.seo_description =
            text(
              patchRaw[
                "seo_description"
              ],
              165,
            );
        }

        if (
          typeof patchRaw[
            "seo_canonical"
          ] === "string"
        ) {
          patch.seo_canonical =
            text(
              patchRaw[
                "seo_canonical"
              ],
              300,
            );
        }

        if (
          typeof patchRaw[
            "og_title"
          ] === "string"
        ) {
          patch.og_title =
            text(
              patchRaw[
                "og_title"
              ],
              90,
            );
        }

        if (
          typeof patchRaw[
            "og_description"
          ] === "string"
        ) {
          patch.og_description =
            text(
              patchRaw[
                "og_description"
              ],
              200,
            );
        }

        if (
          !knownPage(pageId) ||
          Object.keys(
            patch,
          ).length === 0
        ) {
          break;
        }

        out.push({
          type,
          pageId,
          patch,
        });

        break;
      }

      /* ------------------------------------------------------------------ */
      /* DELETE PAGE                                                        */
      /* ------------------------------------------------------------------ */

      case "delete_page": {
        if (
          !knownPage(pageId)
        ) {
          break;
        }

        out.push({
          type,
          pageId,
        });

        break;
      }

      /* ------------------------------------------------------------------ */
      /* THEME                                                              */
      /* ------------------------------------------------------------------ */

      case "set_theme": {
        const patchRaw =
          (row["patch"] ??
            {}) as Record<
            string,
            unknown
          >;

        const patch:
          ThemePatch = {};

        for (
          const key of [
            "primary_color",
            "secondary_color",
            "accent_color",
          ] as const
        ) {
          const colour =
            text(
              patchRaw[key],
              9,
            );

          if (
            HEX.test(
              colour,
            )
          ) {
            patch[key] =
              colour;
          }
        }

        const font =
          text(
            patchRaw[
              "font_preference"
            ],
            60,
          );

        if (font) {
          patch.font_preference =
            font;
        }

        if (
          Object.keys(
            patch,
          ).length === 0
        ) {
          break;
        }

        out.push({
          type,
          patch,
        });

        break;
      }

      /* ------------------------------------------------------------------ */
      /* BACKDROP                                                            */
      /* ------------------------------------------------------------------ */

      case "set_backdrop": {
        const backdrop =
          text(
            row["backdrop"],
            30,
          );

        if (
          !isBackdropId(
            backdrop,
          )
        ) {
          break;
        }

        out.push({
          type,
          backdrop,
        });

        break;
      }

      /* ------------------------------------------------------------------ */
      /* SECTION EFFECT                                                     */
      /* ------------------------------------------------------------------ */

      case "set_section_effect": {
        const effect =
          text(
            row["effect"],
            30,
          );

        if (
          !knownSection(
            sectionId,
          ) ||
          !isSectionEffectId(
            effect,
          )
        ) {
          break;
        }

        out.push({
          type,
          sectionId,
          effect,
        });

        break;
      }

      /* ------------------------------------------------------------------ */
      /* BUSINESS FACT                                                      */
      /* ------------------------------------------------------------------ */

      case "set_business_fact": {
        const field =
          text(
            row["field"],
            40,
          ) as BusinessFactField;

        const value2 =
          text(
            row["value"],
            1200,
          );

        if (
          !BUSINESS_FACT_FIELDS.includes(
            field,
          ) ||
          !value2
        ) {
          break;
        }

        out.push({
          type,
          field,
          value: value2,
        });

        break;
      }

      default:
        /**
         * Unknown actions are deliberately ignored.
         */
        break;
    }

    if (
      out.length >=
      MAX_ACTIONS
    ) {
      break;
    }
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/* DESCRIPTIONS                                                               */
/* -------------------------------------------------------------------------- */

const FIELD_LABEL: Record<
  AgentField,
  string
> = {
  heading: "headline",
  subheading: "sub-headline",
  body: "text",
};

export type SiteIndex = {
  pages: Map<
    string,
    {
      title: string;
      slug: string;
    }
  >;

  sections: Map<
    string,
    {
      pageId: string;
      label: string;
    }
  >;

  components: Map<
    string,
    {
      sectionId: string;
      label: string;
    }
  >;
};

/**
 * Human-readable location.
 */
function locate(
  index: SiteIndex,
  ids: {
    pageId?: string | undefined;
    sectionId?: string | undefined;
    componentId?: string | undefined;
  },
): string {
  if (ids.componentId) {
    const component =
      index.components.get(
        ids.componentId,
      );

    if (component) {
      const parent =
        locate(
          index,
          {
            sectionId:
              component.sectionId,
          },
        );

      return `${parent} → ${component.label}`;
    }
  }

  if (ids.sectionId) {
    const section =
      index.sections.get(
        ids.sectionId,
      );

    if (section) {
      const page =
        index.pages.get(
          section.pageId,
        );

      return `${page?.title ?? "Page"} → ${section.label}`;
    }
  }

  if (ids.pageId) {
    return (
      index.pages.get(
        ids.pageId,
      )?.title ??
      "Page"
    );
  }

  return "Your website";
}

/**
 * Convert actions into business-owner-friendly approval steps.
 */
export function describeActions(
  actions: AgentAction[],
  index: SiteIndex,
  currentText: Map<
    string,
    string
  >,
): AgentStep[] {
  return actions.map(
    (
      action,
      i,
    ) => {
      const key =
        `${i}-${action.type}`;

      switch (action.type) {
        case "set_section_text":
          return {
            key,

            title:
              `Rewrite the ${FIELD_LABEL[action.field]}`,

            where:
              locate(
                index,
                {
                  sectionId:
                    action.sectionId,
                },
              ),

            before:
              currentText.get(
                `${action.sectionId}:${action.field}`,
              ) ?? "",

            after:
              action.value,

            destructive:
              false,

            action,
          };

        case "set_section_visibility":
          return {
            key,

            title:
              action.visible
                ? "Show this section"
                : "Hide this section",

            where:
              locate(
                index,
                {
                  sectionId:
                    action.sectionId,
                },
              ),

            destructive:
              !action.visible,

            action,
          };

        case "set_section_variant":
          return {
            key,

            title:
              `Change the layout style to "${action.variant}"`,

            where:
              locate(
                index,
                {
                  sectionId:
                    action.sectionId,
                },
              ),

            destructive:
              false,

            action,
          };

        case "set_section_visual":
          return {
            key,

            title:
              "Refine this section's visual composition",

            where:
              locate(
                index,
                {
                  sectionId:
                    action.sectionId,
                },
              ),

            after:
              Object.values(
                action.patch,
              )
                .filter(Boolean)
                .join(" · "),

            destructive:
              false,

            action,
          };

        case "set_block_style":
          return {
            key,
            title: `Style this ${action.target} for ${action.device}`,
            where: locate(index, action.target === "section" ? { sectionId: action.targetId } : { componentId: action.targetId }),
            after: Object.entries(action.patch).map(([name, value]) => `${name}: ${String(value)}`).join(" · "),
            destructive: false,
            action,
          };

        case "set_custom_block":
          return {
            key,

            title:
              "Build a custom interactive block for this section",

            where:
              locate(
                index,
                {
                  sectionId:
                    action.sectionId,
                },
              ),

            after:
              describeCustomBlock(
                action.spec,
              ),

            destructive:
              false,

            action,
          };



        case "add_section":
          return {
            key,

            title:
              `Add a new ${action.kind.replace(
                /_/g,
                " ",
              )} section`,

            where:
              locate(
                index,
                {
                  pageId:
                    action.pageId,
                },
              ),

            after:
              action.heading ??
              action.body ??
              "",

            destructive:
              false,

            action,
          };

        case "delete_section":
          return {
            key,

            title:
              "Remove this section",

            where:
              locate(
                index,
                {
                  sectionId:
                    action.sectionId,
                },
              ),

            destructive:
              true,

            action,
          };

        case "reorder_sections":
          return {
            key,

            title:
              "Reorder the sections on this page",

            where:
              locate(
                index,
                {
                  pageId:
                    action.pageId,
                },
              ),

            destructive:
              false,

            action,
          };

        case "reorder_components":
          return {
            key,
            title: "Reorder the items in this section",
            where: locate(index, { sectionId: action.sectionId }),
            destructive: false,
            action,
          };

        case "set_component":
          return {
            key,

            title:
              "Update this item",

            where:
              locate(
                index,
                {
                  componentId:
                    action.componentId,
                },
              ),

            after:
              action.patch.label ??
              action.patch.body ??
              action.patch.link_label ??
              action.patch.link_url ??
              "",

            destructive:
              action.patch
                .is_visible ===
              false,

            action,
          };

        case "set_component_visual":
          return {
            key,

            title:
              "Refine this image or visual treatment",

            where:
              locate(
                index,
                {
                  componentId:
                    action.componentId,
                },
              ),

            after:
              Object.values(
                action.patch,
              )
                .filter(Boolean)
                .join(" · "),

            destructive:
              false,

            action,
          };

        case "generate_component_image":
          return {
            key,
            title: action.mode === "replace" ? "Generate and replace this picture" : "Generate and attach a picture",
            where: locate(index, { componentId: action.componentId }),
            after: action.prompt,
            destructive: false,
            action,
          };

        case "add_component":
          return {
            key,

            title:
              `Add a new ${action.kind.replace(
                /_/g,
                " ",
              )}`,

            where:
              locate(
                index,
                {
                  sectionId:
                    action.sectionId,
                },
              ),

            after:
              action.label ??
              action.body ??
              "",

            destructive:
              false,

            action,
          };

        case "delete_component":
          return {
            key,

            title:
              "Remove this item",

            where:
              locate(
                index,
                {
                  componentId:
                    action.componentId,
                },
              ),

            destructive:
              true,

            action,
          };

        case "add_page":
          return {
            key,

            title:
              `Add a new page: ${action.title}`,

            where:
              `/${action.slug}`,

            destructive:
              false,

            action,
          };

        case "set_page": {
          const fields =
            Object.keys(
              action.patch,
            )
              .map((field) =>
                field.replace(
                  /_/g,
                  " ",
                ),
              )
              .join(", ");

          return {
            key,

            title:
              `Update page settings (${fields})`,

            where:
              locate(
                index,
                {
                  pageId:
                    action.pageId,
                },
              ),

            after:
              action.patch.title ??
              action.patch.seo_title ??
              action.patch.seo_description ??
              "",

            destructive:
              action.patch
                .is_visible ===
              false,

            action,
          };
        }

        case "delete_page":
          return {
            key,

            title:
              "Delete this page and everything on it",

            where:
              locate(
                index,
                {
                  pageId:
                    action.pageId,
                },
              ),

            destructive:
              true,

            action,
          };

        case "set_theme":
          return {
            key,

            title:
              `Update the look (${Object.keys(
                action.patch,
              )
                .map((field) =>
                  field.replace(
                    /_/g,
                    " ",
                  ),
                )
                .join(", ")})`,

            where:
              "Whole website",

            after:
              Object.values(
                action.patch,
              ).join("  "),

            destructive:
              false,

            action,
          };

        case "set_backdrop":
          return {
            key,

            title:
              `Install the "${backdropLabel(
                action.backdrop,
              )}" animated background`,

            where:
              "Whole website",

            destructive:
              false,

            action,
          };

        case "set_section_effect":
          return {
            key,

            title:
              `Add the "${sectionEffectLabel(
                action.effect,
              )}" effect to this section`,

            where:
              locate(
                index,
                {
                  sectionId:
                    action.sectionId,
                },
              ),

            destructive:
              false,

            action,
          };

        case "set_business_fact":
          return {
            key,

            title:
              `Update your ${action.field.replace(
                /_/g,
                " ",
              )}`,

            where:
              "Business details",

            after:
              action.value,

            destructive:
              false,

            action,
          };
      }
    },
  );
}

/* -------------------------------------------------------------------------- */
/* ATTACHMENTS                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The assistant accepts photos, video and voice as context.
 *
 * Attachments allow requests such as:
 *
 * "Use this truck photo."
 * "Match the colors in this flyer."
 * "Use the finished project in this video."
 *
 * They do not grant arbitrary execution abilities.
 */
export const MAX_ATTACHMENTS = 4;

export const ATTACHMENT_LIMITS: Record<
  AgentAttachmentKind,
  number
> = {
  image:
    6 * 1024 * 1024,

  video:
    16 * 1024 * 1024,

  audio:
    8 * 1024 * 1024,
};

export type AgentAttachmentKind =
  | "image"
  | "video"
  | "audio";

export const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
];
export const VIDEO_MIME_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"];
export const AUDIO_MIME_TYPES = [
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/m4a",
  "audio/x-m4a",
];

export const ATTACHMENT_ACCEPT = [...IMAGE_MIME_TYPES, ...VIDEO_MIME_TYPES].join(",");

export function attachmentKindOf(mimeType: string): AgentAttachmentKind | null {
  const mime = mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (IMAGE_MIME_TYPES.includes(mime)) return "image";
  if (VIDEO_MIME_TYPES.includes(mime)) return "video";
  if (AUDIO_MIME_TYPES.includes(mime)) return "audio";
  return null;
}

/** Roughly how many bytes a base64 payload decodes to. */
export function base64Bytes(dataUrl: string) {
  const payload = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.floor((payload.length * 3) / 4);
}

/**
 * One moment in an attached video.
 */
export type AgentChapter = {
  /**
   * Example:
   * "0:12"
   */
  at: string;

  label: string;

  detail: string;
};

export type AgentAttachment = {
  kind: AgentAttachmentKind;

  /**
   * Example:
   * image/jpeg
   * video/mp4
   * audio/webm
   */
  mimeType: string;

  name: string;

  /**
   * data:<mime>;base64,<payload>
   */
  dataUrl: string;

  chapters?: AgentChapter[];
};

export const MAX_CHAPTERS = 10;

/**
 * Sanitize automatically generated video chapter information.
 */
export function readChapters(
  value: unknown,
): AgentChapter[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const out: AgentChapter[] = [];

  for (
    const raw of value.slice(
      0,
      MAX_CHAPTERS,
    )
  ) {
    if (
      !raw ||
      typeof raw !== "object"
    ) {
      continue;
    }

    const item =
      raw as Record<
        string,
        unknown
      >;

    const at =
      typeof item["at"] ===
      "string"
        ? item["at"].slice(
            0,
            12,
          )
        : "";

    const label =
      typeof item["label"] ===
      "string"
        ? item["label"].slice(
            0,
            120,
          )
        : "";

    const detail =
      typeof item["detail"] ===
      "string"
        ? item["detail"].slice(
            0,
            400,
          )
        : "";

    if (
      !label &&
      !detail
    ) {
      continue;
    }

    out.push({
      at:
        at ||
        "0:00",

      label:
        label ||
        "Moment",

      detail,
    });
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/* ATTACHMENT VALIDATION                                                      */
/* -------------------------------------------------------------------------- */

export const MAX_ATTACHMENT_NAME_LENGTH = 120;

/**
 * Validates and normalizes attachment inputs from the client into safe,
 * storable attachments. Anything that isn't a recognised MIME type, a real
 * `data:` payload, or within its kind's size limit is silently dropped
 * rather than thrown — callers that require an attachment (voice, video)
 * check the returned array themselves and raise their own message.
 */
export function readAttachments(value: unknown): AgentAttachment[] {
  if (!Array.isArray(value)) return [];

  const out: AgentAttachment[] = [];

  for (const raw of value) {
    if (out.length >= MAX_ATTACHMENTS) break;
    if (!raw || typeof raw !== "object") continue;

    const item = raw as Record<string, unknown>;

    const mimeType = typeof item["mimeType"] === "string" ? item["mimeType"] : "";
    const kind = mimeType ? attachmentKindOf(mimeType) : null;
    if (!kind) continue;

    const dataUrl = typeof item["dataUrl"] === "string" ? item["dataUrl"] : "";
    if (!dataUrl.startsWith("data:") || !dataUrl.includes(",")) continue;
    if (base64Bytes(dataUrl) > ATTACHMENT_LIMITS[kind]) continue;

    const rawName = typeof item["name"] === "string" ? item["name"].trim() : "";
    const name = (rawName || `${kind} attachment`).slice(0, MAX_ATTACHMENT_NAME_LENGTH);

    const attachment: AgentAttachment = { kind, mimeType, name, dataUrl };
    if (kind === "video") {
      const chapters = readChapters(item["chapters"]);
      if (chapters.length) attachment.chapters = chapters;
    }

    out.push(attachment);
  }

  return out;
}
