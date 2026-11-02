/**
 * Lead form guard for chat edits and rendering.
 *
 * The enquiry form, booking form and quote calculator are how a visitor turns
 * into a lead. A chat edit may move them, restyle them and redesign around
 * them, but it may not hide them on phones, bury them (near-zero opacity),
 * remove them, or take away the site's only lead capture. Those parts of an
 * edit are refused with a plain sentence and everything else in the edit is
 * kept. This module is pure: the server's apply step runs it before any write,
 * and the renderer uses the same helpers to ignore a flag that was stored
 * before the guard existed.
 */
import type { AgentAction } from "@/lib/site-agent";
import { LEAD_WIDGETS, isLeadSection } from "@/lib/builder/phone-layout";
import { readDeviceLayer, writeBlockStyle } from "@/lib/site-style";

type TreeNode = {
  type?: unknown;
  text?: unknown;
  style?: Record<string, unknown> | null;
  responsive?: Record<string, Record<string, unknown> | null | undefined> | null;
  children?: unknown;
  tabs?: unknown;
};

const WIDGET_LABEL: Record<string, string> = {
  enquiry_form: "enquiry form",
  booking_form: "booking form",
  quote_calculator: "quote calculator",
};

/** Opacity at or below this counts as "buried": the form is there but nobody can see it. */
export const BURIED_OPACITY = 5;

/** The plain sentence shown when part of an edit is refused. */
export const keptVisibleSentence = (label = "enquiry form") =>
  `I kept your ${label} visible so visitors can always reach you.`;

const asNode = (value: unknown): TreeNode | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as TreeNode) : null;

const childrenOf = (node: TreeNode): unknown[] => {
  const out: unknown[] = [];
  if (Array.isArray(node.children)) out.push(...node.children);
  if (Array.isArray(node.tabs)) {
    for (const tab of node.tabs) {
      const t = asNode(tab);
      if (t && Array.isArray(t.children)) out.push(...t.children);
    }
  }
  return out;
};

export const isLeadWidgetNode = (node: unknown): boolean => {
  const n = asNode(node);
  return Boolean(n && n.type === "widget" && typeof n.text === "string" && LEAD_WIDGETS.has(n.text));
};

const leadCache = new WeakMap<object, boolean>();
/** True when this node is, or contains, a lead form widget. */
export function containsLeadWidget(node: unknown, depth = 0): boolean {
  const n = asNode(node);
  if (!n || depth > 40) return false;
  const cached = leadCache.get(n);
  if (cached !== undefined) return cached;
  const result = isLeadWidgetNode(n) || childrenOf(n).some((child) => containsLeadWidget(child, depth + 1));
  leadCache.set(n, result);
  return result;
}

/** The lead widget names a layout places. */
export function leadWidgetsIn(root: unknown): Set<string> {
  const found = new Set<string>();
  const walk = (value: unknown, depth: number) => {
    const n = asNode(value);
    if (!n || depth > 40) return;
    if (isLeadWidgetNode(n)) found.add(String(n.text));
    childrenOf(n).forEach((child) => walk(child, depth + 1));
  };
  walk(root, 0);
  return found;
}

const hides = (style: Record<string, unknown> | null | undefined): boolean =>
  Boolean(style) && (style!["hidden"] === true || (typeof style!["opacity"] === "number" && (style!["opacity"] as number) <= BURIED_OPACITY));

/**
 * Hide / bury flags that apply at phone width: the base style (all screens)
 * and the phone override. Tablet and desktop overrides don't reach phones.
 */
const phoneHides = (node: TreeNode): boolean => hides(node.style) || hides(node.responsive?.["mobile"]);

/** A node style with the hide and bury flags taken out; the same object when it had none. */
export function showStyle<T extends object>(style: T | null | undefined): T | null | undefined {
  if (!style || !hides(style as Record<string, unknown>)) return style;
  const { hidden: _hidden, ...rest } = style as Record<string, unknown>;
  void _hidden;
  if (typeof rest["opacity"] === "number" && (rest["opacity"] as number) <= BURIED_OPACITY) delete rest["opacity"];
  return rest as T;
}

/** Removes the phone-reaching hide flags from one node (used for lead widgets and their ancestors). */
function withoutHide(node: TreeNode): TreeNode {
  const clean = (style: Record<string, unknown> | null | undefined) => {
    if (!style || !hides(style)) return style;
    const { hidden: _hidden, ...rest } = style;
    void _hidden;
    if (typeof rest["opacity"] === "number" && (rest["opacity"] as number) <= BURIED_OPACITY) delete rest["opacity"];
    return rest;
  };
  const next: TreeNode = { ...node, style: clean(node.style) ?? node.style ?? null };
  if (!next.style) delete next.style;
  const mobile = node.responsive?.["mobile"];
  if (mobile && hides(mobile)) next.responsive = { ...node.responsive, mobile: clean(mobile) };
  return next;
}

/**
 * Un-hides every lead widget, and every container holding one, in a layout.
 * Returns the same object when nothing needed changing.
 */
export function revealLeadWidgets<T>(root: T): { root: T; changed: boolean } {
  let changed = false;
  const walk = (value: unknown, depth: number): unknown => {
    const n = asNode(value);
    if (!n || depth > 40 || !containsLeadWidget(n)) return value;
    let out: TreeNode = n;
    if (phoneHides(n)) {
      out = withoutHide(n);
      changed = true;
    }
    const mapChildren = (list: unknown[]): unknown[] => {
      let any = false;
      const mapped = list.map((child) => {
        const next = walk(child, depth + 1);
        if (next !== child) any = true;
        return next;
      });
      return any ? mapped : list;
    };
    if (Array.isArray(n.children)) {
      const mapped = mapChildren(n.children);
      if (mapped !== n.children) out = { ...out, children: mapped };
    }
    if (Array.isArray(n.tabs)) {
      let anyTab = false;
      const tabs = n.tabs.map((tab) => {
        const t = asNode(tab);
        if (!t || !Array.isArray(t.children)) return tab;
        const mapped = mapChildren(t.children);
        if (mapped === t.children) return tab;
        anyTab = true;
        return { ...t, children: mapped };
      });
      if (anyTab) out = { ...out, tabs };
    }
    return out;
  };
  const next = walk(root, 0) as T;
  return { root: next, changed };
}

/* --------------------------- legacy component rows -------------------------- */

const FORM_COMPONENT_KIND = /form|enquir|inquir|quote|booking|calculator/i;

/** A component row that is (part of) the lead form: by its kind, or a lead widget in its settings. */
export function isLeadFormComponent(component: { kind?: string | null; settings?: unknown }): boolean {
  if (component.kind && FORM_COMPONENT_KIND.test(component.kind)) return true;
  return hasWidgetSetting(component.settings);
}
const hasWidgetSetting = (settings: unknown): boolean => {
  const walk = (value: unknown, depth: number): boolean => {
    if (depth > 20 || !value || typeof value !== "object") return false;
    if (Array.isArray(value)) return value.some((v) => walk(v, depth + 1));
    return isLeadWidgetNode(value) || Object.values(value as Record<string, unknown>).some((v) => walk(v, depth + 1));
  };
  return walk(settings, 0);
};

/**
 * A lead form component's stored settings with every hide that reaches phones
 * removed. The tablet layer counts: its media query covers phone widths too.
 */
export function unhideLeadComponent(settings: unknown): unknown {
  let next = settings;
  for (const device of ["mobile", "tablet"] as const) {
    if (readDeviceLayer(next, device).hidden === true) next = writeBlockStyle(next, { hidden: null }, device);
  }
  return next;
}

/* ------------------------------ server preflight ---------------------------- */

type SiteSection = { id: string; page_id: string; kind: string; settings: unknown; is_visible?: boolean | null };
type SiteComponent = { id: string; section_id: string; kind?: string | null; settings?: unknown };
export type LeadGuardSite = { sections: SiteSection[]; components: SiteComponent[] };
export type LeadGuardResult = { actions: AgentAction[]; refused: string[] };

const sectionLabel = (kind: string, settings?: unknown): string => {
  const role = (settings as Record<string, unknown> | null)?.["role"];
  const k = kind !== "composition" && kind !== "custom" ? kind : typeof role === "string" ? role : kind;
  return k === "booking" ? "booking form" : k === "quote" ? "quote calculator" : "enquiry form";
};

/** Offending keys in a style patch for a block whose phone visibility matters. */
const offendingKeys = (patch: Record<string, unknown>): string[] =>
  Object.keys(patch).filter(
    (key) =>
      (key === "hidden" && patch[key] === true) ||
      (key === "opacity" && typeof patch[key] === "number" && (patch[key] as number) <= BURIED_OPACITY),
  );

/**
 * Runs over a planned batch, in order, before anything is written. Parts of an
 * edit that would hide, bury or remove a lead form on phones, or remove the
 * site's only lead capture, are taken out and explained; the rest goes through.
 * Moving or restyling a form is always allowed.
 */
export function guardLeadFormActions(actions: AgentAction[], site: LeadGuardSite): LeadGuardResult {
  type S = { id: string; page_id: string; kind: string; settings: unknown; visible: boolean; deleted: boolean };
  const sections = new Map<string, S>(
    site.sections.map((s) => [s.id, { id: s.id, page_id: s.page_id, kind: s.kind, settings: s.settings, visible: s.is_visible !== false, deleted: false }]),
  );
  const components = new Map(site.components.map((c) => [c.id, c]));
  const kept: AgentAction[] = [];
  const refused: string[] = [];
  const refuse = (label: string) => {
    const sentence = keptVisibleSentence(label);
    if (!refused.includes(sentence)) refused.push(sentence);
  };
  const isLead = (s: S) => isLeadSection({ kind: s.kind, settings: s.settings });
  const othersRemain = (except: (s: S) => boolean) =>
    [...sections.values()].some((s) => !s.deleted && s.visible && isLead(s) && !except(s));

  for (const action of actions) {
    switch (action.type) {
      case "set_block_style": {
        const phoneReaching = action.device === "mobile" || (action.target === "component" && action.device === "tablet");
        if (!phoneReaching) break;
        let label: string | null = null;
        if (action.target === "section") {
          const s = sections.get(action.targetId);
          if (s && isLead(s)) label = sectionLabel(s.kind, s.settings);
        } else {
          const c = components.get(action.targetId);
          const s = c ? sections.get(c.section_id) : undefined;
          if (c && s && isLead(s) && isLeadFormComponent(c)) label = sectionLabel(s.kind, s.settings);
        }
        if (!label) break;
        const bad = offendingKeys(action.patch as Record<string, unknown>);
        if (!bad.length) break;
        refuse(label);
        const rest = Object.fromEntries(Object.entries(action.patch as Record<string, unknown>).filter(([k]) => !bad.includes(k)));
        if (!Object.keys(rest).length) continue;
        kept.push({ ...action, patch: rest } as AgentAction);
        continue;
      }
      case "set_composition": {
        const s = sections.get(action.sectionId);
        const prevTree = s ? ((s.settings as Record<string, unknown> | null)?.["composition"] as { root?: unknown } | undefined) : undefined;
        const had = new Set<string>(prevTree?.root ? leadWidgetsIn(prevTree.root) : []);
        if (s?.kind === "booking") had.add("booking_form");
        if (s?.kind === "quote") had.add("quote_calculator");
        const now = leadWidgetsIn(action.tree.root);
        const lost = [...had].find((name) => !now.has(name));
        if (lost) {
          refuse(WIDGET_LABEL[lost] ?? "enquiry form");
          continue;
        }
        const revealed = revealLeadWidgets(action.tree.root);
        let next = action;
        if (revealed.changed) {
          refuse([...now].map((n) => WIDGET_LABEL[n]).find(Boolean) ?? "enquiry form");
          next = { ...action, tree: { ...action.tree, root: revealed.root } } as AgentAction & { type: "set_composition" };
        }
        if (s) {
          const prev = (s.settings && typeof s.settings === "object" ? (s.settings as Record<string, unknown>) : {}) as Record<string, unknown>;
          const role = typeof prev["role"] === "string" ? prev["role"] : s.kind !== "composition" ? s.kind : undefined;
          s.settings = { ...prev, composition: (next as { tree: unknown }).tree, ...(role ? { role } : {}) };
          s.kind = "composition";
        }
        kept.push(next);
        continue;
      }
      case "set_custom_block": {
        const s = sections.get(action.sectionId);
        if (s && isLead(s) && !othersRemain((o) => o.id === s.id)) {
          refuse(sectionLabel(s.kind, s.settings));
          continue;
        }
        if (s) s.kind = "custom";
        break;
      }
      case "set_section_visibility": {
        const s = sections.get(action.sectionId);
        if (s && !action.visible && isLead(s) && !othersRemain((o) => o.id === s.id)) {
          refuse(sectionLabel(s.kind, s.settings));
          continue;
        }
        if (s) s.visible = action.visible;
        break;
      }
      case "delete_section": {
        const s = sections.get(action.sectionId);
        if (s && isLead(s) && !othersRemain((o) => o.id === s.id)) {
          refuse(sectionLabel(s.kind, s.settings));
          continue;
        }
        if (s) s.deleted = true;
        break;
      }
      case "delete_page": {
        const pageId = action.pageId;
        const onPage = [...sections.values()].filter((s) => s.page_id === pageId && !s.deleted && s.visible && isLead(s));
        if (onPage.length && !othersRemain((o) => o.page_id === pageId)) {
          refuse(sectionLabel(onPage[0]!.kind, onPage[0]!.settings));
          continue;
        }
        for (const s of sections.values()) if (s.page_id === pageId) s.deleted = true;
        break;
      }
      case "add_section": {
        if (action.ref) sections.set(action.ref, { id: action.ref, page_id: action.pageId, kind: action.kind, settings: null, visible: true, deleted: false });
        break;
      }
      default:
        break;
    }
    kept.push(action);
  }
  return { actions: kept, refused };
}
