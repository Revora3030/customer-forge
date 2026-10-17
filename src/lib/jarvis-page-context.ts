/**
 * Jarvis on every admin page: which page the owner is looking at, and how a
 * page's live facts are turned into a short spoken brief. The facts come from
 * jarvis-page-context.server.ts; nothing here invents a number.
 */

export const JARVIS_PAGES = {
  overview: "Overview",
  clients: "Clients",
  client: "Client detail",
  websites: "Websites",
  monitoring: "Monitoring",
  analytics: "Analytics",
  payments: "Payments",
  domains: "Domains",
  backups: "Backups",
  ai: "AI health",
  seo: "Search growth",
  other: "Admin",
} as const;

export type JarvisPageKey = keyof typeof JARVIS_PAGES;

export type PageFact = {
  label: string;
  /** null = the source couldn't be read. Never shown or spoken as zero. */
  value: number | string | null;
  /** "attention" facts lead the spoken brief. */
  tone?: "attention" | "good";
};

export type PageBrief = {
  page: JarvisPageKey;
  title: string;
  facts: PageFact[];
  spoken: string;
  checkedAt: string;
};

const PATH_PATTERN = /^\/admin(\/[A-Za-z0-9._~-]{1,80}){0,3}\/?$/;

/** Normalises an untrusted pathname to an admin path, or null. */
export function adminPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const path = raw.split(/[?#]/)[0]!.trim();
  return PATH_PATTERN.test(path) ? path.replace(/\/$/, "") || "/admin" : null;
}

export function pageKey(path: string | null): JarvisPageKey {
  const parts = (path ?? "").split("/").filter(Boolean);
  if (parts[0] !== "admin") return "other";
  const section = parts[1];
  if (!section) return "overview";
  if (section === "clients") return parts[2] ? "client" : "clients";
  return section in JARVIS_PAGES && section !== "overview" && section !== "client" && section !== "other"
    ? (section as JarvisPageKey)
    : "other";
}

const shown = (value: PageFact["value"]) => (typeof value === "number" ? value.toLocaleString("en-US") : value);

/** "Payments. Needs attention: 2 failed payments. Also: …". Unreadable facts are named, not zeroed. */
export function speakBrief(title: string, facts: readonly PageFact[]): string {
  const known = facts.filter((fact) => fact.value !== null);
  const missing = facts.filter((fact) => fact.value === null).map((fact) => fact.label.toLowerCase());
  const attention = known.filter((fact) => fact.tone === "attention");
  const rest = known.filter((fact) => fact.tone !== "attention");
  const say = (list: PageFact[]) => list.map((fact) => `${fact.label}: ${shown(fact.value)}`).join(". ");
  const parts = [`${title}.`];
  if (attention.length) parts.push(`Needs attention. ${say(attention)}.`);
  else if (known.length) parts.push("Nothing here needs you right now.");
  if (rest.length) parts.push(`${say(rest)}.`);
  if (missing.length) parts.push(`I couldn't read ${missing.join(", ")} just now.`);
  return parts.join(" ");
}
