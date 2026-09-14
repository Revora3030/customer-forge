export type AuditSeverity = "high" | "medium" | "low" | "pass";
export type AuditCategory =
  | "performance"
  | "mobile"
  | "seo"
  | "conversion"
  | "content"
  | "accessibility"
  | "trust";

export interface WebsiteAuditFinding {
  id: string;
  category: AuditCategory;
  severity: AuditSeverity;
  title: string;
  explanation: string;
  recommendation: string;
  evidence: string[];
  observed: boolean;
}

export interface WebsiteAuditResult {
  url: string;
  finalUrl: string;
  fetchedAt: string;
  httpStatus: number;
  title: string | null;
  description: string | null;
  score: number;
  findings: WebsiteAuditFinding[];
  signals: {
    hasViewport: boolean;
    hasTitle: boolean;
    hasDescription: boolean;
    hasCanonical: boolean;
    hasH1: boolean;
    h1Count: number;
    imageCount: number;
    imagesWithoutAlt: number;
    linkCount: number;
    formCount: number;
    phoneSignals: number;
    emailSignals: number;
    ctaSignals: number;
    socialProofSignals: number;
    htmlBytes: number;
  };
}

const MAX_HTML_BYTES = 1_500_000;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;

function isPrivateHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host === "localhost.localdomain" || host.endsWith(".local")) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  const parts = host.split(".").map(Number);
  if (parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    const [a, b] = parts;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 0) return true;
  }
  return false;
}

export function validatePublicWebsiteUrl(raw: string) {
  const value = raw.trim();
  if (!value) throw new Error("Enter a website URL.");
  const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Only HTTP and HTTPS websites can be audited.");
  if (isPrivateHostname(url.hostname)) throw new Error("That address is not a public website.");
  url.username = "";
  url.password = "";
  url.hash = "";
  return url;
}

async function fetchPublicHtml(startUrl: URL, signal: AbortSignal) {
  let currentUrl = startUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetch(currentUrl, {
      redirect: "manual",
      signal,
      headers: {
        "user-agent": "RevoraWebsiteAudit/1.0 (+https://revoragrowthsystems.com)",
        accept: "text/html,application/xhtml+xml",
      },
    });

    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      if (redirectCount === MAX_REDIRECTS) throw new Error("The website redirected too many times.");
      const nextUrl = validatePublicWebsiteUrl(new URL(location, currentUrl).toString());
      currentUrl = nextUrl;
      continue;
    }

    return { response, finalUrl: currentUrl.toString() };
  }

  throw new Error("The website could not be fetched safely.");
}

function textContent(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script\b[^>]*>/gi, " ")
    .replace(/<style[\s\S]*?<\/style\b[^>]*>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript\b[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function count(html: string, pattern: RegExp) {
  return html.match(pattern)?.length ?? 0;
}

function firstMeta(html: string, name: string) {
  const match = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"));
  return match?.[1]?.trim() || null;
}

function titleOf(html: string) {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() || null;
}

function addFinding(findings: WebsiteAuditFinding[], finding: Omit<WebsiteAuditFinding, "observed"> & { observed?: boolean }) {
  findings.push({ ...finding, observed: finding.observed ?? true });
}

export async function auditPublicWebsite(rawUrl: string): Promise<WebsiteAuditResult> {
  const url = validatePublicWebsiteUrl(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const { response, finalUrl } = await fetchPublicHtml(url, controller.signal);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("text/html") && !contentType.toLowerCase().includes("application/xhtml+xml")) {
      throw new Error("The supplied URL did not return an HTML page.");
    }

    const body = await response.text();
    const html = body.slice(0, MAX_HTML_BYTES);
    const text = textContent(html);
    const hasViewport = /<meta[^>]+name=["']viewport["'][^>]*>/i.test(html);
    const title = titleOf(html);
    const description = firstMeta(html, "description");
    const hasCanonical = /<link[^>]+rel=["'][^"']*canonical[^"']*["'][^>]*>/i.test(html);
    const h1Count = count(html, /<h1\b/gi);
    const imageCount = count(html, /<img\b/gi);
    const imagesWithoutAlt = count(html, /<img(?![^>]+\balt=["'][^"']*["'])[^>]*>/gi);
    const linkCount = count(html, /<a\b/gi);
    const formCount = count(html, /<form\b/gi);
    const phoneSignals = count(text, /\b(?:tel|call|phone|mobile)\b/gi);
    const emailSignals = count(text, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi);
    const ctaSignals = count(text, /\b(?:get started|book now|schedule|request a quote|contact us|call now|buy now|learn more|free consultation)\b/gi);
    const socialProofSignals = count(text, /\b(?:reviews?|testimonials?|rated|rating|customers?|clients?|trusted|5-star|five-star)\b/gi);

    const findings: WebsiteAuditFinding[] = [];

    if (!title) addFinding(findings, { id: "seo-title", category: "seo", severity: "high", title: "Missing page title", explanation: "Search engines and browsers need a clear title to understand the page.", recommendation: "Add a concise, service-focused title containing the business name and primary search intent.", evidence: ["No <title> element was detected."] });
    else addFinding(findings, { id: "seo-title-pass", category: "seo", severity: "pass", title: "Page title detected", explanation: "The page exposes a title element.", recommendation: "Review it for search intent, clarity, and length.", evidence: [`Detected title: ${title}`] });

    if (!description) addFinding(findings, { id: "seo-description", category: "seo", severity: "medium", title: "Missing meta description", explanation: "A useful description can improve how search listings communicate the offer.", recommendation: "Add a unique description that explains the offer and gives users a reason to click.", evidence: ["No meta description was detected."] });
    if (!hasViewport) addFinding(findings, { id: "mobile-viewport", category: "mobile", severity: "high", title: "Mobile viewport is missing", explanation: "The page does not declare a standard responsive viewport in its HTML.", recommendation: "Add the standard viewport meta tag and verify the layout at mobile widths.", evidence: ["No viewport meta tag was detected."] });
    if (h1Count === 0) addFinding(findings, { id: "seo-h1", category: "seo", severity: "medium", title: "No H1 detected", explanation: "The primary page heading helps users and search engines understand the main topic.", recommendation: "Add one clear H1 describing the primary offer.", evidence: ["No H1 element was detected."] });
    if (h1Count > 1) addFinding(findings, { id: "seo-multiple-h1", category: "seo", severity: "low", title: "Multiple H1 headings detected", explanation: "Multiple primary headings can weaken page hierarchy when they are not intentional.", recommendation: "Keep one primary H1 and use H2/H3 headings for supporting sections.", evidence: [`Detected ${h1Count} H1 elements.`] });
    if (imagesWithoutAlt > 0) addFinding(findings, { id: "a11y-image-alt", category: "accessibility", severity: imagesWithoutAlt > 3 ? "high" : "medium", title: "Images missing alt text", explanation: "Images without useful alternative text can reduce accessibility and context.", recommendation: "Add concise, meaningful alt text to informative images and empty alt attributes to decorative images.", evidence: [`Detected ${imagesWithoutAlt} image(s) without an explicit alt attribute.`] });
    if (formCount === 0 && ctaSignals === 0) addFinding(findings, { id: "conversion-cta", category: "conversion", severity: "high", title: "No clear conversion path detected", explanation: "The page does not expose an obvious lead form or common conversion call to action in the HTML text.", recommendation: "Add one primary action such as booking, quote request, call, or contact, and repeat it at natural decision points.", evidence: ["No form and no common CTA phrase were detected."] });
    if (socialProofSignals === 0) addFinding(findings, { id: "trust-proof", category: "trust", severity: "medium", title: "Trust signals not detected", explanation: "The audit could not find common review, testimonial, rating, or trust language.", recommendation: "Add authentic reviews, testimonials, credentials, guarantees, case studies, or service-area proof where applicable.", evidence: ["No common trust-signal terms were detected in visible text."] });
    if (phoneSignals === 0 && emailSignals === 0 && formCount === 0) addFinding(findings, { id: "contact-path", category: "conversion", severity: "medium", title: "Contact path not detected", explanation: "No phone, email, or form signal was detected in the page HTML.", recommendation: "Give visitors a low-friction way to contact or book with the business.", evidence: ["No phone, email, or form signal was detected."] });
    if (html.length >= MAX_HTML_BYTES) addFinding(findings, { id: "audit-truncated", category: "performance", severity: "low", title: "Audit sample was truncated", explanation: "The page exceeded Revora's safe initial HTML inspection limit.", recommendation: "Connect a deeper crawler later if the customer needs multi-page or rendered-app analysis.", evidence: [`Only the first ${MAX_HTML_BYTES.toLocaleString()} bytes were inspected.`] });

    const high = findings.filter((f) => f.severity === "high").length;
    const medium = findings.filter((f) => f.severity === "medium").length;
    const low = findings.filter((f) => f.severity === "low").length;
    const penalty = high * 14 + medium * 7 + low * 3;
    const score = Math.max(0, Math.min(100, 100 - penalty));

    return {
      url: url.toString(),
      finalUrl,
      fetchedAt: new Date().toISOString(),
      httpStatus: response.status,
      title,
      description,
      score,
      findings,
      signals: {
        hasViewport,
        hasTitle: Boolean(title),
        hasDescription: Boolean(description),
        hasCanonical,
        hasH1: h1Count > 0,
        h1Count,
        imageCount,
        imagesWithoutAlt,
        linkCount,
        formCount,
        phoneSignals,
        emailSignals,
        ctaSignals,
        socialProofSignals,
        htmlBytes: Buffer.byteLength(body, "utf8"),
      },
    };
  } finally {
    clearTimeout(timer);
  }
}
