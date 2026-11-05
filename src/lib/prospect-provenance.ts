/**
 * JC-57: per-prospect lead source, freshness, duplicate flag and why-ranked line,
 * computed only from data already stored on the prospect demo (the
 * website_settings.generation.prospectDemo marker and business_profiles).
 * Pure; anything not on record is reported as "unknown", never guessed.
 */
import { isPlatformEmailDomain } from "./prospect-email";

export type ProvenanceInput = {
  organizationId: string;
  name: string | null;
  city: string | null;
  phone: string | null;
  /** Raw website_settings.generation.prospectDemo value. */
  marker: unknown;
};

export type ProspectProvenance = {
  source: string;
  freshness: string;
  /** Names of other prospects sharing a domain, phone or name+city. Empty = no duplicate. */
  duplicateOf: string[];
  duplicateReason: string | null;
  whyRanked: string;
};

const UNKNOWN = "unknown";

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function normalizePhone(phone: string | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

export function normalizeName(name: string | null): string | null {
  const n = (name ?? "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(llc|inc|co|corp|ltd|the|company)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return n || null;
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/** The business's own domain: its listed page (public_page) or a non-platform email domain. */
export function prospectDomain(marker: unknown): string | null {
  const e = obj(obj(marker)?.["enrichment"]);
  if (!e) return null;
  if (e["source"] === "public_page") {
    const host = hostOf(str(e["sourceUrl"]));
    if (host) return host;
  }
  const domain = str(e["email"])?.split("@")[1]?.toLowerCase() ?? null;
  return domain && !isPlatformEmailDomain(domain) ? domain : null;
}

export function sourceLabel(marker: unknown): string {
  const m = obj(marker);
  const placeId = str(m?.["placeId"]);
  const via = m?.["source"] === "autopilot" ? " (autopilot search)" : "";
  if (placeId) return (placeId.startsWith("osm:") ? "OpenStreetMap" : "Google Maps") + via;
  const enrichSource = str(obj(m?.["enrichment"])?.["source"]);
  if (enrichSource === "imported_lead") return "Imported lead (CSV)";
  if (m?.["source"] === "autopilot") return "Autopilot search";
  return UNKNOWN;
}

export function ageLabel(iso: string | null, now: number): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const days = Math.max(0, Math.floor((now - t) / 86_400_000));
  return days === 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;
}

export function freshnessLabel(marker: unknown, now: number): string {
  const m = obj(marker);
  const checked = ageLabel(str(obj(m?.["enrichment"])?.["checkedAt"]), now);
  if (checked) return `contact checked ${checked}`;
  const found = ageLabel(str(m?.["createdAt"]), now);
  return found ? `found ${found}` : UNKNOWN;
}

export function whyRankedLine(marker: unknown): string {
  const m = obj(marker);
  const parts: string[] = [];
  const gaps = Array.isArray(m?.["siteGaps"]) ? (m?.["siteGaps"] as unknown[]).filter((g): g is string => typeof g === "string") : [];
  if (gaps.length) parts.push(`site gaps: ${gaps.slice(0, 3).join(", ")}`);
  const status = str(obj(m?.["enrichment"])?.["status"]);
  if (status === "verified") parts.push("published email verified");
  else if (status && status !== "none") parts.push(`email ${status}`);
  if (m?.["pitchFirst"] === true) parts.push("pitch-first (no site built yet)");
  return parts.length ? parts.join("; ") : UNKNOWN;
}

/** Builds provenance for `targets`, checking duplicates against `pool` (all known prospects, targets included). */
export function buildProvenance(
  targets: ProvenanceInput[],
  pool: ProvenanceInput[],
  now = Date.now(),
): Record<string, ProspectProvenance> {
  const keyed = pool.map((p) => {
    const name = normalizeName(p.name);
    const city = normalizeName(p.city);
    return {
      p,
      domain: prospectDomain(p.marker),
      phone: normalizePhone(p.phone),
      nameCity: name && city ? `${name}|${city}` : null,
    };
  });
  const out: Record<string, ProspectProvenance> = {};
  for (const t of targets) {
    const me = keyed.find((k) => k.p.organizationId === t.organizationId) ?? {
      p: t,
      domain: prospectDomain(t.marker),
      phone: normalizePhone(t.phone),
      nameCity: null,
    };
    const dupes: string[] = [];
    const reasons = new Set<string>();
    for (const k of keyed) {
      if (k.p.organizationId === t.organizationId) continue;
      const why = [
        me.domain && k.domain === me.domain ? "same domain" : null,
        me.phone && k.phone === me.phone ? "same phone" : null,
        me.nameCity && k.nameCity === me.nameCity ? "same name+city" : null,
      ].filter((x): x is string => Boolean(x));
      if (!why.length) continue;
      dupes.push(k.p.name ?? k.p.organizationId);
      why.forEach((w) => reasons.add(w));
    }
    out[t.organizationId] = {
      source: sourceLabel(t.marker),
      freshness: freshnessLabel(t.marker, now),
      duplicateOf: dupes,
      duplicateReason: reasons.size ? [...reasons].join(", ") : null,
      whyRanked: whyRankedLine(t.marker),
    };
  }
  return out;
}
