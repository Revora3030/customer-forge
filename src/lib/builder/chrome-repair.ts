/**
 * Repairs the AI team's own menu bar, footer and section designs instead of
 * throwing them away.
 *
 * A design that forgot one page link, used a text link where the main action
 * button belongs, or wrote a phone number the owner never gave used to be
 * rejected outright. Three rejections in a row stopped the whole build and the
 * site was left with no menu. These repairs keep the AI's design and only
 * correct the specific fault, using the owner's real facts and real pages:
 *  - invented tel:/mailto: destinations point at the real number/email, or at
 *    the real contact page when none was supplied;
 *  - invented phone numbers / emails inside text are replaced by the real one
 *    or removed — never a new invented detail;
 *  - missing page links are added in the style of the AI's existing links;
 *  - a header without a call-to-action button gets one: an existing link to the
 *    contact/booking page or phone is promoted, otherwise the AI-authored
 *    primary call-to-action label is added next to the menu links.
 * Pure and dependency-free apart from shared types, so it is unit tested.
 */
import type { CompositionNode, CompositionTree } from "@/lib/builder/composition-tree";
import { addMissingNavLinks } from "@/lib/builder/link-integrity";

export type ContactFacts = {
  phone?: string | null;
  email?: string | null;
  /** The real page visitors use to get in touch, e.g. "/contact". */
  enquiryHref?: string | null;
};

const PHONE_IN_TEXT = /\+?\(?\d[\d\s().-]{6,}\d/g;
const EMAIL_IN_TEXT = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const digits = (value: string) => value.replace(/\D+/g, "");

function realTel(phone: string | null | undefined): string | null {
  const d = phone ? digits(phone) : "";
  return d.length >= 7 ? `tel:${phone!.trim().startsWith("+") ? "+" : ""}${d}` : null;
}

function sameNumber(a: string, b: string): boolean {
  const x = digits(a);
  const y = digits(b);
  return Boolean(x && y) && (x.includes(y) || y.includes(x));
}

function fixText(text: string, facts: ContactFacts): string {
  let out = text.replace(PHONE_IN_TEXT, (match) => {
    if (digits(match).length < 7) return match;
    if (facts.phone && sameNumber(match, facts.phone)) return match;
    return facts.phone?.trim() ?? "";
  });
  out = out.replace(EMAIL_IN_TEXT, (match) => {
    const own = facts.email?.trim().toLowerCase();
    if (own && match.toLowerCase() === own) return match;
    return facts.email?.trim() ?? "";
  });
  return out.replace(/\s{2,}/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
}

function fixHref(href: string, facts: ContactFacts): string | null {
  const value = href.trim();
  if (/^tel:/i.test(value)) {
    if (facts.phone && sameNumber(value, facts.phone)) return null;
    return realTel(facts.phone) ?? facts.enquiryHref ?? "/";
  }
  if (/^mailto:/i.test(value)) {
    const own = facts.email?.trim().toLowerCase();
    const target = value.slice(7).split("?")[0]?.toLowerCase();
    if (own && target === own) return null;
    return own ? `mailto:${facts.email!.trim()}` : facts.enquiryHref ?? "/";
  }
  return null;
}

/**
 * Deep-copies a raw (not yet validated) AI tree and corrects invented contact
 * details in place. Unknown shapes are passed through untouched so the normal
 * validator still reports them.
 */
export function repairContactDetails<T>(raw: T, facts: ContactFacts): { value: T; fixes: number } {
  let fixes = 0;
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (!value || typeof value !== "object") return value;
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if ((key === "href") && typeof child === "string") {
        const next = fixHref(child, facts);
        if (next !== null && next !== child) {
          fixes += 1;
          out[key] = next;
          continue;
        }
        out[key] = child;
        continue;
      }
      if ((key === "text" || key === "label" || key === "alt" || key === "ariaLabel") && typeof child === "string") {
        const next = fixText(child, facts);
        if (next !== child) fixes += 1;
        out[key] = next || child.replace(PHONE_IN_TEXT, "").replace(EMAIL_IN_TEXT, "").trim();
        continue;
      }
      out[key] = walk(child);
    }
    // A link whose visible text was only an invented number now reads as empty;
    // give it the real page or number it points to as its words.
    if ((out["type"] === "link" || out["type"] === "button") && typeof out["text"] === "string" && !String(out["text"]).trim()) {
      const href = String(out["href"] ?? "");
      out["text"] = /^tel:/i.test(href) && facts.phone ? facts.phone : href.replace(/^\//, "").replace(/-/g, " ") || "Home";
    }
    return out;
  };
  return { value: walk(raw) as T, fixes };
}

function hasButton(node: CompositionNode): boolean {
  return (node.type === "button" && Boolean(node.href)) || (node.children ?? []).some(hasButton);
}

/** Path to the container holding the most internal links (the menu row). */
function menuContainer(root: CompositionNode): number[] {
  let best: { path: number[]; count: number } = { path: [], count: -1 };
  const scan = (node: CompositionNode, path: number[]) => {
    const count = (node.children ?? []).filter((c) => (c.type === "link" || c.type === "button") && c.href).length;
    if (count > best.count) best = { path, count };
    node.children?.forEach((child, i) => scan(child, [...path, i]));
  };
  scan(root, []);
  return best.path;
}

function mapAt(node: CompositionNode, path: number[], fn: (n: CompositionNode) => CompositionNode): CompositionNode {
  if (!path.length) return fn(node);
  const [head, ...rest] = path;
  return { ...node, children: (node.children ?? []).map((c, i) => (i === head ? mapAt(c, rest, fn) : c)) };
}

/**
 * Makes sure the menu bar carries one real call-to-action button. Returns the
 * tree unchanged when it already has one, or when there is nowhere real to
 * send visitors (no contact page and no phone number).
 */
export function ensureHeaderAction(
  tree: CompositionTree,
  input: { ctaLabel?: string | null; enquiryHref?: string | null; phone?: string | null; enquiryTitle?: string | null },
): { tree: CompositionTree; changed: "none" | "promoted" | "added" } {
  if (hasButton(tree.root)) return { tree, changed: "none" };
  const tel = realTel(input.phone);
  const target = input.enquiryHref || tel;
  if (!target) return { tree, changed: "none" };

  // 1) Promote the AI's own link to the contact/booking page (or phone).
  let promoted = false;
  const promote = (node: CompositionNode): CompositionNode => {
    if (promoted) return node;
    if (node.type === "link" && node.href && (node.href === input.enquiryHref || /^tel:/i.test(node.href))) {
      promoted = true;
      return { ...node, type: "button" };
    }
    return node.children ? { ...node, children: node.children.map(promote) } : node;
  };
  const promotedRoot = promote(tree.root);
  if (promoted) return { tree: { ...tree, root: promotedRoot }, changed: "promoted" };

  // 2) Add the AI-authored primary call to action beside the menu links.
  const label = (input.ctaLabel ?? "").trim() || (input.enquiryTitle ?? "").trim() || (tel && input.phone ? input.phone.trim() : "");
  if (!label) return { tree, changed: "none" };
  const button: CompositionNode = { type: "button", text: label.slice(0, 40), href: target };
  const root = mapAt(tree.root, menuContainer(tree.root), (node) => ({
    ...node,
    children: [...(node.children ?? []), button],
  }));
  return { tree: { ...tree, root }, changed: "added" };
}

/** Adds every missing page link, styled like the AI's own links. */
export function completeChromeLinks(
  tree: CompositionTree,
  required: string[],
  pages: { href: string; title: string }[],
): { tree: CompositionTree; added: string[] } {
  const wanted = pages.filter((page) => required.includes(page.href));
  for (const href of required) if (!wanted.some((p) => p.href === href)) wanted.push({ href, title: href === "/" ? "Home" : href.slice(1).replace(/-/g, " ") });
  return addMissingNavLinks(tree, wanted);
}
