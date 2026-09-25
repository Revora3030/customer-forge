/**
 * SITE-WIDE REDESIGN — AUTHORED, NOT MATCHED
 * ==========================================
 *
 * The owner describes the change in plain language. The AI returns an open
 * creative brief in its own words. This file never maps that request to a
 * fingerprint, archetype, field list, preset or deterministic look; callers may
 * save the brief for later AI composition or report an honest failure.
 */
import { callBestThinker } from "@/lib/ai/hall-of-fame.server";

export type RedesignChange = { field: string; from: string; to: string };

export type AuthoredRedesign = {
  /** A short label for the look, in the design team's words. */
  label: string;
  /** One line the owner reads about what changed. */
  describe: string;
  /** Open AI-authored creative brief. Not a fingerprint or fixed taxonomy. */
  brief: string;
  /** Optional AI-named choices, with AI-authored keys and values. */
  choices: Record<string, string>;
  changes: RedesignChange[];
  blocked: string[];
  model: string | null;
};

const SYSTEM = [
  "You are the sole creative authority for an existing business website.",
  "The owner has described how they want it to feel. Author an open visual brief that can guide a fresh AI layout pass across the site.",
  "Do not choose from a menu, fingerprint, archetype, template, preset, style scale or fixed field list.",
  "Use your own words for any design choices you name. You may invent whatever choice names are useful.",
  "Never change wording, prices, claims or business facts — this is presentation guidance only.",
  "Reply with JSON only.",
].join(" ");

function line(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ").slice(0, max);
  return trimmed || null;
}

function readJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const unsafeKey = /(?:template|preset|archetype|fingerprint|default|fallback)/i;
const unsafeValue = /(?:template id|preset id|archetype id|fingerprint id)/i;

function cleanChoices(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>).slice(0, 24)) {
    const key = line(rawKey, 60);
    const val = line(rawValue, 220);
    if (!key || !val || unsafeKey.test(key) || unsafeValue.test(val)) continue;
    out[key] = val;
  }
  return out;
}

function currentBriefText(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  return line(raw["brief"], 1200) ?? line(raw["describe"], 240) ?? null;
}

/**
 * Authors a new open creative brief. Throws when the model produced nothing
 * usable so callers do not guess at a replacement look.
 */
export async function authorSiteWideRedesign(input: {
  organizationId: string;
  instruction: string;
  currentBrief?: unknown;
  rejected?: string[];
  industry?: string | null;
  signal?: AbortSignal;
}): Promise<AuthoredRedesign> {
  const current = currentBriefText(input.currentBrief);
  const rejected = (input.rejected ?? []).map((item) => line(item, 120)).filter((item): item is string => Boolean(item));
  const outcome = await callBestThinker({
    purpose: "creative_direction",
    complexity: "high",
    system: SYSTEM,
    user: [
      `The owner asked: "${input.instruction}"`,
      input.industry ? `Industry: ${input.industry}` : null,
      current ? `Current AI brief: ${current}` : "Current AI brief: none saved; author from the owner request and supplied business facts only.",
      rejected.length ? `Avoid directions the owner rejected: ${rejected.join("; ")}` : null,
      "",
      'Reply as: { "label": "short name", "describe": "one sentence", "brief": "open creative direction in your own words", "choices": { "your own choice name": "your own value" } }',
      "The choices object is optional and open-ended; do not use template, preset, archetype, fingerprint, default or fallback identifiers.",
    ]
      .filter((entry) => entry !== null)
      .join("\n"),
    organizationId: input.organizationId,
    json: true,
    maxOutputTokens: 1800,
    ...(input.signal ? { signal: input.signal } : {}),
  });

  if (!outcome.ok || !outcome.text) {
    throw new Error(
      "The design team couldn't work on the new look just now, so nothing was changed. Please try again in a moment.",
    );
  }

  const data = readJson(outcome.text);
  const brief = line(data?.["brief"], 1600);
  if (!brief || unsafeValue.test(brief)) {
    throw new Error(
      "The design team's new look came back incomplete, so nothing was changed. Please try again in a moment.",
    );
  }

  const choices = cleanChoices(data?.["choices"]);
  const from = current ?? "";
  const changes: RedesignChange[] = from === brief ? [] : [{ field: "creative brief", from, to: brief }];

  return {
    label: line(data?.["label"], 60) ?? "New look",
    describe: line(data?.["describe"], 240) ?? "The AI authored a new creative direction.",
    brief,
    choices,
    changes,
    blocked: [],
    model: outcome.model ?? null,
  };
}

/** Honest one-liner about what a redesign did. */
export function authoredRedesignSummary(result: AuthoredRedesign): string {
  if (result.changes.length === 0) return "The site already has that look, so nothing needed changing.";
  return `The AI authored a new site-wide creative brief. ${result.describe}`.trim();
}
