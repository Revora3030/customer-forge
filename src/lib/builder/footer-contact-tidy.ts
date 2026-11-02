/**
 * Render-time tidy for the AI-designed footer.
 *
 * The footer designer sometimes repeats the phone number and the email address two
 * or three times (a line in the brand column, a button, a "contact" column) and
 * pads the layout with spacer blocks, leaving huge gaps. This keeps the FIRST
 * phone and the FIRST email, drops the repeats (and a label like "Call us" that
 * only introduced a removed repeat), removes spacer blocks, caps oversize gaps,
 * and prunes any container left empty. It never adds or changes a contact detail.
 * Pure, so it is unit tested.
 */
import { readComposition, writeComposition, type CompositionNode, type CompositionTree } from "@/lib/builder/composition-tree";

const PHONE = /\+?\(?\d[\d\s().-]{5,}\d/;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const LABEL = /^\s*(?:call|phone|tel|telephone|text|email|e-mail|mail|contact|reach)(?:\s+us)?\s*[:\-–]?\s*$/i;
const CONTAINERS = new Set(["stack", "grid", "row", "card", "list"]);
const MAX_GAP = 40;

const hasPhone = (text: string) => PHONE.test(text) && text.replace(/\D/g, "").length >= 7;

function kinds(node: CompositionNode): { phone: boolean; email: boolean } {
  const href = (node.href ?? "").trim().toLowerCase();
  const text = node.text ?? "";
  const short = text.length <= 80;
  // A labelled action ("Call now", "Email us") is a button, not a second copy of
  // the number: it stays. Only a link or text that shows the number itself counts.
  const showsPhone = short && hasPhone(text);
  const showsEmail = short && EMAIL.test(text);
  return {
    phone: showsPhone || (href.startsWith("tel:") && hasPhone(text)),
    email: showsEmail || (href.startsWith("mailto:") && EMAIL.test(text)),
  };
}

export function tidyFooterContact(tree: CompositionTree): CompositionTree {
  const seen = { phone: false, email: false };

  const walk = (node: CompositionNode): CompositionNode | null => {
    if (node.type === "spacer") return null;
    // An empty text block only adds a blank gap.
    if ((node.type === "text" || node.type === "heading") && !node.children?.length && !(node.text ?? "").trim() && !node.href) return null;
    const isLeaf = !(node.children && node.children.length);
    if (isLeaf && ["text", "link", "button"].includes(node.type)) {
      const k = kinds(node);
      if (k.phone || k.email) {
        const keep = (k.phone && !seen.phone) || (k.email && !seen.email);
        if (!keep) return null;
        if (k.phone) seen.phone = true;
        if (k.email) seen.email = true;
      }
    }
    let next: CompositionNode = node;
    if (node.children?.length) {
      const kept: CompositionNode[] = [];
      let droppedAfterLabel = false;
      for (const child of node.children) {
        const before = { ...seen };
        const result = walk(child);
        if (result === null) {
          // A bare "Call us:" label right before a removed repeat has nothing left to introduce.
          const prev = kept[kept.length - 1];
          const wasContact = child.type !== "spacer";
          if (wasContact && prev && prev.type === "text" && !prev.children?.length && LABEL.test(prev.text ?? "")) kept.pop();
          droppedAfterLabel = true;
        } else {
          kept.push(result);
        }
        void before;
      }
      void droppedAfterLabel;
      next = { ...node, children: kept };
      // A container whose only content was removed disappears with it.
      if (kept.length === 0 && CONTAINERS.has(node.type)) return null;
    }
    if (next.style && typeof next.style.gap === "number" && next.style.gap > MAX_GAP) {
      next = { ...next, style: { ...next.style, gap: MAX_GAP } };
    }
    return next;
  };

  const root = walk(tree.root);
  return root ? { ...tree, root } : tree;
}

/** Counts how many separate nodes show a phone / an email (for design feedback). */
export function countFooterContact(tree: CompositionTree): { phone: number; email: number } {
  const count = { phone: 0, email: 0 };
  const walk = (node: CompositionNode) => {
    if (!(node.children && node.children.length) && ["text", "link", "button"].includes(node.type)) {
      const k = kinds(node);
      if (k.phone) count.phone += 1;
      if (k.email) count.email += 1;
    }
    node.children?.forEach(walk);
  };
  walk(tree.root);
  return count;
}

const CONTACT_ROLE = /contact|get[-_ ]?in[-_ ]?touch|reach[-_ ]?us|visit/i;

/**
 * Applies the same tidy to a page's own contact section(s): the section whose kind
 * or authored role names contact. Other sections are returned untouched.
 */
export function tidyContactSections<T extends { kind?: string | null; settings?: unknown }>(sections: T[]): T[] {
  return sections.map((section) => {
    const settings = section.settings as Record<string, unknown> | null | undefined;
    const role = typeof settings?.["role"] === "string" ? (settings["role"] as string) : "";
    if (!CONTACT_ROLE.test(`${section.kind ?? ""} ${role}`)) return section;
    const tree = readComposition(settings);
    if (!tree) return section;
    return { ...section, settings: writeComposition(settings, tidyFooterContact(tree)) };
  });
}
