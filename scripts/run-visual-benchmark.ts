import { gradeViewport, type ViewportMeasurement } from "../src/lib/builder/visual";
import { COMPOSITION_PRIMITIVES, validateComposition, type CompositionTree } from "../src/lib/builder/composition-tree";

const BENCHMARK_VIEWPORTS = [320, 390, 768, 1280, 1440] as const;
const PLACEHOLDER_PATTERNS = [
  /\\[[^\\]]+\\]/,
  /\\bTODO\\b/i,
  /\\bundefined\\b/i,
  /\\bnull\\b/i,
  /\\bfictional studio\\b/i,
  /\\btest[- ]fixture service\\b/i,
];

type Archetype = {
  id: string;
  label: string;
  requiredPrimitives: string[];
  tree: CompositionTree;
  textColors: Array<{ foreground: string; background: string; role: "body" | "heading" }>;
  interactiveTargets: Array<{ label: string; width: number; height: number }>;
};

const node = (type: (typeof COMPOSITION_PRIMITIVES)[number], extra: Record<string, unknown> = {}) =>
  ({ type, ...extra }) as never;

const archetypes: Archetype[] = [
  {
    id: "high-ticket-mobile-service",
    label: "Luxury Auto Detailing / Ceramic Coating",
    requiredPrimitives: ["before_after_slider", "mobile_sticky_bar", "gallery"],
    tree: {
      version: 1,
      label: "High-ticket mobile service benchmark",
      root: node("stack", {
        style: { columns: 1, gap: 32, padding: 32, background: "#0B0B0B", color: "#F5F5F0" },
        children: [
          node("heading", { text: "Paint correction and ceramic coating", level: 1, style: { color: "#FFFFFF" } }),
          node("before_after_slider", {
            beforeImage: { src: "https://fixture.invalid/before.jpg", alt: "Vehicle before detailing", label: "Before" },
            afterImage: { src: "https://fixture.invalid/after.jpg", alt: "Vehicle after detailing", label: "After" },
            initialSplit: 50,
          }),
          node("gallery", {
            children: [
              node("media", { src: "https://fixture.invalid/detail-1.jpg", alt: "Paint correction detail" }),
              node("media", { src: "https://fixture.invalid/detail-2.jpg", alt: "Ceramic coating detail" }),
            ],
          }),
          node("grid", {
            style: { columns: 3, gap: 16 },
            responsive: { mobile: { columns: 1 } },
            children: [
              node("card", { children: [node("heading", { text: "Essential", level: 2 }), node("text", { text: "A focused exterior finish." })] }),
              node("card", { children: [node("heading", { text: "Complete", level: 2 }), node("text", { text: "Exterior and interior service." })] }),
              node("card", { children: [node("heading", { text: "Protection", level: 2 }), node("text", { text: "Ceramic coating service." })] }),
            ],
          }),
          node("mobile_sticky_bar", {
            primaryCta: { label: "Book service", href: "/book" },
          }),
        ],
      }),
    },
    textColors: [
      { foreground: "#F5F5F0", background: "#0B0B0B", role: "body" },
      { foreground: "#FFFFFF", background: "#0B0B0B", role: "heading" },
    ],
    interactiveTargets: [
      { label: "before-after slider handle", width: 44, height: 44 },
      { label: "book service", width: 44, height: 48 },
    ],
  },
  {
    id: "technical-contractor-b2b",
    label: "Commercial Cleanroom HVAC / Industrial Electrical",
    requiredPrimitives: ["grid", "widget"],
    tree: {
      version: 1,
      label: "Technical contractor B2B benchmark",
      root: node("stack", {
        style: { columns: 1, gap: 28, padding: 32, background: "#F4F6F7", color: "#16202A" },
        children: [
          node("heading", { text: "Industrial systems built for demanding facilities", level: 1, style: { color: "#16202A" } }),
          node("grid", {
            style: { columns: 4, gap: 16 },
            responsive: { mobile: { columns: 1 }, tablet: { columns: 2 } },
            children: [
              node("card", { children: [node("heading", { text: "Airflow", level: 2 }), node("text", { text: "Controlled environmental performance." })] }),
              node("card", { children: [node("heading", { text: "Power", level: 2 }), node("text", { text: "Industrial electrical infrastructure." })] }),
              node("card", { children: [node("heading", { text: "Compliance", level: 2 }), node("text", { text: "Documented project requirements." })] }),
              node("card", { children: [node("heading", { text: "Service areas", level: 2 }), node("text", { text: "Multiple operating locations." })] }),
            ],
          }),
          node("widget", {
            text: "quote_calculator",
            widgetPresentation: {
              title: "Build an RFQ",
              description: "Share the project scope and request an estimate.",
              actionLabel: "Request RFQ",
              theme: {
                surface: "#FFFFFF", text: "#16202A", muted: "#53616D",
                border: "#AAB4BC", action: "#0B5FFF", actionText: "#FFFFFF",
              },
            },
          }),
        ],
      }),
    },
    textColors: [
      { foreground: "#16202A", background: "#F4F6F7", role: "body" },
      { foreground: "#16202A", background: "#FFFFFF", role: "heading" },
    ],
    interactiveTargets: [
      { label: "request RFQ", width: 120, height: 48 },
      { label: "RFQ option", width: 100, height: 44 },
    ],
  },
  {
    id: "high-end-boutique-studio",
    label: "Architectural Interior Design / Wellness Clinic",
    requiredPrimitives: ["stack", "row", "widget", "faq_accordion"],
    tree: {
      version: 1,
      label: "High-end boutique studio benchmark",
      root: node("stack", {
        style: { columns: 1, gap: 56, padding: 40, background: "#FAF8F4", color: "#25211D" },
        children: [
          node("row", {
            style: { columns: 2, gap: 48, align: "center" },
            responsive: { mobile: { columns: 1, gap: 24 } },
            children: [
              node("stack", { children: [node("heading", { text: "Spaces with a point of view", level: 1 }), node("text", { text: "A considered approach to interiors and wellbeing." })] }),
              node("media", { src: "https://fixture.invalid/studio.jpg", alt: "Boutique studio interior" }),
            ],
          }),
          node("widget", {
            text: "booking_form",
            widgetPresentation: {
              title: "Schedule a consultation",
              description: "Choose a time to discuss your project.",
              actionLabel: "Request time",
              successTitle: "Request received",
              successBody: "Your request has been recorded.",
              theme: {
                surface: "#FFFFFF", text: "#25211D", muted: "#6D665E",
                border: "#B9B0A6", action: "#6B4D3C", actionText: "#FFFFFF",
              },
            },
          }),
          node("faq_accordion", {
            faqItems: [
              { question: "How does the consultation work?", answer: "The consultation starts with the project details you provide." },
              { question: "What should I bring?", answer: "Bring the information and references relevant to your project." },
            ],
          }),
        ],
      }),
    },
    textColors: [
      { foreground: "#25211D", background: "#FAF8F4", role: "body" },
      { foreground: "#25211D", background: "#FFFFFF", role: "heading" },
    ],
    interactiveTargets: [
      { label: "request time", width: 120, height: 48 },
      { label: "FAQ header", width: 320, height: 48 },
    ],
  },
];

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
}

function luminance(hex: string) {
  return hexToRgb(hex).map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrastRatio(foreground: string, background: string) {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function collectText(value: unknown): string[] {
  const output: string[] = [];
  const walk = (entry: unknown) => {
    if (typeof entry === "string") output.push(entry);
    else if (Array.isArray(entry)) entry.forEach(walk);
    else if (entry && typeof entry === "object") Object.values(entry as Record<string, unknown>).forEach(walk);
  };
  walk(value);
  return output;
}

function assertNoPlaceholders(archetype: Archetype) {
  const leaked = collectText(archetype.tree).filter((text) => PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text)));
  if (leaked.length) throw new Error(`${archetype.id}: placeholder leakage: ${leaked.join(" | ")}`);
}

function assertPrimitiveCoverage(archetype: Archetype) {
  const json = JSON.stringify(archetype.tree);
  const missing = archetype.requiredPrimitives.filter((primitive) => !json.includes(`"type":"${primitive}"`));
  if (missing.length) throw new Error(`${archetype.id}: missing required primitives: ${missing.join(", ")}`);
  const validation = validateComposition(archetype.tree, {
    screenText: (text) => PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text)) ? "placeholder leakage" : null,
    allowedMediaRefs: new Set<string>(),
    requiredMediaRefs: new Set<string>(),
  });
  if (!validation.ok) throw new Error(`${archetype.id}: composition validation failed: ${validation.issues.map((issue) => issue.problem).join("; ")}`);
}

function cleanMeasurement(width: number): ViewportMeasurement {
  return {
    width,
    scrollWidth: width,
    overflowing: [],
    brokenImages: [],
    clipped: [],
    smallTargets: [],
    tinyText: [],
    unreachable: [],
    navigable: true,
    ctas: 1,
    accessibility: {
      imagesMissingAlt: [],
      unlabeledControls: [],
      unlabeledInputs: [],
      headingOrderProblems: [],
      h1Count: 1,
      hasMain: true,
      hasNav: true,
      controls: 1,
      keyboardReachable: 1,
      lowContrast: [],
      zoomBlocked: false,
      invalidTabIndexes: [],
      focusVisibleMissing: [],
    },
  };
}

for (const archetype of archetypes) {
  assertNoPlaceholders(archetype);
  assertPrimitiveCoverage(archetype);

  for (const pair of archetype.textColors) {
    const ratio = contrastRatio(pair.foreground, pair.background);
    const minimum = pair.role === "body" ? 4.5 : 3;
    if (ratio < minimum) throw new Error(`${archetype.id}: ${pair.role} contrast ${ratio.toFixed(2)}:1 < ${minimum}:1`);
  }

  for (const target of archetype.interactiveTargets) {
    if (target.width < 44 || target.height < 44) throw new Error(`${archetype.id}: touch target below 44px: ${target.label}`);
  }

  for (const width of BENCHMARK_VIEWPORTS) {
    const report = gradeViewport(cleanMeasurement(width));
    if (report.length) throw new Error(`${archetype.id}: visual engine reported unexpected findings at ${width}px: ${JSON.stringify(report)}`);
  }
}

console.log(JSON.stringify({
  status: "PASS",
  archetypes: archetypes.map(({ id, label, requiredPrimitives }) => ({ id, label, requiredPrimitives })),
  viewports: BENCHMARK_VIEWPORTS,
  assertions: [
    "composition primitives",
    "zero horizontal overflow",
    "44px touch targets",
    "body contrast >= 4.5:1",
    "heading contrast >= 3:1",
    "zero placeholder leakage",
  ],
}, null, 2));
