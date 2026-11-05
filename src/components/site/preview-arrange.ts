/**
 * B13-4: arranging sections inside the builder's preview frame.
 *
 * Arrange mode (toggled by the builder) puts a drag handle on the section under
 * the pointer (or the focused / tapped one) and a "+ Add section with AI" line
 * on its nearer edge. Dropping a section moves it on screen at once
 * (optimistic) and asks the builder to save the new order; the builder sends
 * the old order back if the save fails (rollback) or the owner undoes it.
 *
 *  - Touch-safe: only the handle starts a drag (`touch-action: none` there), so
 *    scrolling the page with a finger anywhere else still scrolls. The handle
 *    and the insert button are at least 44 px tall.
 *  - Keyboard: each section is focusable while arranging. Alt+Arrow Up/Down
 *    moves it (Arrow Up/Down on the focused handle too), Enter adds a section
 *    below and Shift+Enter above, Ctrl/Cmd+Z undoes the last move, Escape
 *    cancels a drag. Every move is read out in an aria-live region.
 *
 * Nothing here saves anything, and every DOM change is undone on `destroy`.
 */
import { PREVIEW_BRIDGE_SOURCE, type PreviewToBuilderMessage } from "@/lib/builder/preview-bridge";
import { dropSpot, isNoopDrop, moveAnnouncement, stepTarget, type DropPosition } from "@/lib/builder/arrange";

const SECTION_SELECTOR = "[data-rvb][data-rvb-kind]";
const EDGE_SCROLL_PX = 56;

type Options = {
  layer: HTMLElement;
  post: (message: PreviewToBuilderMessage) => void;
  /** True while an inline text edit is open (arrange keys stay out of its way). */
  isEditing: () => boolean;
};

export type ArrangeController = {
  setOn: (on: boolean) => void;
  isOn: () => boolean;
  /** Shows the page's sections in this order (rollback / undo from the builder). */
  applyOrder: (ids: string[], announce?: string | null) => void;
  /** Document keydown (capture). Returns true when the key was handled here. */
  onKey: (event: KeyboardEvent) => boolean;
  /** Document click (capture). Returns true when the click was handled here. */
  onClick: (event: MouseEvent) => boolean;
  onScroll: () => void;
  destroy: () => void;
};

function sectionOf(node: Element | null): HTMLElement | null {
  return (node?.closest(SECTION_SELECTOR) as HTMLElement | null) ?? null;
}

export function createArrangeController({ layer, post, isEditing }: Options): ArrangeController {
  let on = false;
  let current: HTMLElement | null = null;
  let edge: DropPosition = "after";
  let drag: { id: string; block: HTMLElement; opacity: string; y: number; spot: { overId: string; position: DropPosition } | null; frame: number } | null = null;

  /* ------------------------------- overlay UI ------------------------------- */
  const handle = document.createElement("button");
  handle.type = "button";
  handle.setAttribute("data-rv-arrange-handle", "");
  handle.setAttribute("aria-keyshortcuts", "ArrowUp ArrowDown");
  handle.textContent = "⠿ Move";
  handle.style.cssText =
    "position:fixed;display:none;min-height:44px;min-width:44px;padding:0 12px;border:0;border-radius:10px;background:rgba(17,17,20,.92);color:#fff;font:600 12px/1 system-ui,sans-serif;cursor:grab;touch-action:none;pointer-events:auto;box-shadow:0 8px 24px rgba(0,0,0,.25);user-select:none;-webkit-user-select:none";

  const insert = document.createElement("div");
  insert.style.cssText = "position:fixed;display:none;height:0;pointer-events:none";
  const insertLine = document.createElement("div");
  insertLine.style.cssText =
    "position:absolute;left:0;right:0;top:-1px;height:2px;background:var(--primary,#6d5dfc);opacity:.85";
  const insertButton = document.createElement("button");
  insertButton.type = "button";
  insertButton.setAttribute("data-rv-insert", "");
  insertButton.textContent = "+ Add section with AI";
  insertButton.style.cssText =
    "position:absolute;left:50%;top:0;transform:translate(-50%,-50%);min-height:44px;padding:0 16px;border:0;border-radius:999px;background:var(--primary,#6d5dfc);color:#fff;font:600 12px/1 system-ui,sans-serif;cursor:pointer;pointer-events:auto;white-space:nowrap;box-shadow:0 6px 18px rgba(0,0,0,.22)";
  insert.append(insertLine, insertButton);

  const dropLine = document.createElement("div");
  dropLine.setAttribute("aria-hidden", "true");
  dropLine.style.cssText =
    "position:fixed;display:none;height:4px;border-radius:4px;background:var(--primary,#6d5dfc);box-shadow:0 0 0 3px color-mix(in srgb,var(--primary,#6d5dfc) 25%,transparent);pointer-events:none";

  const live = document.createElement("div");
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  live.style.cssText = "position:fixed;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap";

  layer.append(handle, insert, dropLine, live);

  /* -------------------------------- helpers -------------------------------- */
  const sections = () =>
    Array.from(document.querySelectorAll<HTMLElement>(SECTION_SELECTOR)).filter(
      (node) => !layer.contains(node) && !node.parentElement?.closest(SECTION_SELECTOR) && node.getClientRects().length > 0,
    );
  const idOf = (node: HTMLElement) => node.getAttribute("data-rvb") ?? "";
  const labelOf = (node: HTMLElement) => node.getAttribute("data-rvb-label") ?? node.getAttribute("data-rvb-kind") ?? "Section";
  const visibleIds = () => sections().map(idOf);
  const byId = (id: string) => sections().find((node) => idOf(node) === id) ?? null;
  const announce = (text: string) => {
    live.textContent = "";
    window.setTimeout(() => (live.textContent = text), 30); // DevSkim: ignore DS172411 -- Fixed callback and constant delay; no untrusted data.
  };

  const place = () => {
    if (!on || !current || !current.isConnected || drag) {
      handle.style.display = "none";
      insert.style.display = "none";
      return;
    }
    const rect = current.getBoundingClientRect();
    const label = labelOf(current);
    handle.setAttribute("aria-label", `Move ${label}. Drag, or press Arrow Up or Arrow Down`);
    handle.title = `Drag to move ${label}`;
    handle.style.display = "block";
    handle.style.left = `${Math.max(8, rect.left + 8)}px`;
    handle.style.top = `${Math.min(window.innerHeight - 52, Math.max(8, rect.top + 8))}px`;
    const y = edge === "before" ? rect.top : rect.bottom;
    if (y < 0 || y > window.innerHeight) {
      insert.style.display = "none";
      return;
    }
    insertButton.setAttribute("aria-label", `Add a section with AI ${edge} ${label}`);
    insert.style.display = "block";
    insert.style.left = `${Math.max(0, rect.left)}px`;
    insert.style.width = `${Math.min(window.innerWidth, rect.width)}px`;
    insert.style.top = `${Math.min(window.innerHeight - 24, Math.max(24, y))}px`;
  };

  const setCurrent = (node: HTMLElement | null, nextEdge: DropPosition = "after") => {
    current = node;
    edge = nextEdge;
    place();
  };

  const markSections = (mark: boolean) => {
    for (const node of Array.from(document.querySelectorAll<HTMLElement>(SECTION_SELECTOR))) {
      if (mark) {
        if (!node.hasAttribute("tabindex")) {
          node.setAttribute("tabindex", "0");
          node.setAttribute("data-rv-arrange", "");
          node.setAttribute("aria-keyshortcuts", "Alt+ArrowUp Alt+ArrowDown Enter Shift+Enter");
          node.setAttribute("title", "Alt+Up/Down moves this section. Enter adds a section below it");
        }
      } else if (node.hasAttribute("data-rv-arrange")) {
        for (const name of ["tabindex", "data-rv-arrange", "aria-keyshortcuts", "title"]) node.removeAttribute(name);
      }
    }
  };

  /** Moves a section on screen next to another one (same parent only). */
  const moveNode = (block: HTMLElement, over: HTMLElement, position: DropPosition) => {
    const parent = over.parentElement;
    if (!parent || block.parentElement !== parent) return false;
    parent.insertBefore(block, position === "before" ? over : over.nextSibling);
    return true;
  };

  /** Optimistic move, then the request to save it. */
  const commitMove = (id: string, overId: string, position: DropPosition, refocus: HTMLElement | null) => {
    const ids = visibleIds();
    if (isNoopDrop(ids, id, overId, position)) return;
    const block = byId(id);
    const over = byId(overId);
    if (!block || !over) return;
    moveNode(block, over, position);
    post({ source: PREVIEW_BRIDGE_SOURCE, type: "move-section", id, overId, position });
    announce(moveAnnouncement(labelOf(block), visibleIds(), id));
    // Moving a node can drop focus; keep the keyboard where it was.
    refocus?.focus({ preventScroll: true });
    block.scrollIntoView({ block: "nearest" });
    setCurrent(block, edge);
  };

  const askInsert = (block: HTMLElement, position: DropPosition) => {
    post({
      source: PREVIEW_BRIDGE_SOURCE,
      type: "insert-section",
      id: idOf(block),
      position,
      label: block.getAttribute("data-rvb-label"),
      kind: block.getAttribute("data-rvb-kind"),
    });
  };

  /* ---------------------------------- drag ---------------------------------- */
  const endDrag = (commit: boolean) => {
    if (!drag) return;
    const { id, block, opacity, spot, frame } = drag;
    drag = null;
    window.cancelAnimationFrame(frame);
    block.style.opacity = opacity;
    dropLine.style.display = "none";
    handle.style.cursor = "grab";
    if (commit && spot) commitMove(id, spot.overId, spot.position, null);
    else place();
  };

  const showDrop = () => {
    if (!drag) return;
    const blocks = sections().map((node) => {
      const rect = node.getBoundingClientRect();
      return { id: idOf(node), top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width };
    });
    const spot = dropSpot(blocks, drag.y);
    drag.spot = spot && !isNoopDrop(blocks.map((b) => b.id), drag.id, spot.overId, spot.position) ? spot : null;
    const target = drag.spot ? blocks.find((b) => b.id === drag!.spot!.overId) : null;
    if (!target || !drag.spot) {
      dropLine.style.display = "none";
      return;
    }
    dropLine.style.display = "block";
    dropLine.style.left = `${Math.max(0, target.left + 12)}px`;
    dropLine.style.width = `${Math.max(40, Math.min(window.innerWidth, target.width) - 24)}px`;
    dropLine.style.top = `${(drag.spot.position === "before" ? target.top : target.bottom) - 2}px`;
  };

  // While dragging, the page scrolls by itself near the top and bottom edges.
  const tick = () => {
    if (!drag) return;
    const y = drag.y;
    const step = y < EDGE_SCROLL_PX ? -14 : y > window.innerHeight - EDGE_SCROLL_PX ? 14 : 0;
    if (step) window.scrollBy(0, step);
    showDrop();
    drag.frame = window.requestAnimationFrame(tick);
  };

  const onHandleDown = (event: PointerEvent) => {
    if (!on || !current || event.button > 0) return;
    event.preventDefault();
    handle.setPointerCapture?.(event.pointerId);
    drag = { id: idOf(current), block: current, opacity: current.style.opacity, y: event.clientY, spot: null, frame: 0 };
    current.style.opacity = "0.45";
    handle.style.cursor = "grabbing";
    insert.style.display = "none";
    drag.frame = window.requestAnimationFrame(tick);
  };
  const onHandleMove = (event: PointerEvent) => {
    if (!drag) return;
    event.preventDefault();
    drag.y = event.clientY;
    handle.style.top = `${Math.min(window.innerHeight - 52, Math.max(8, event.clientY - 22))}px`;
  };
  const onHandleUp = () => endDrag(true);
  const onHandleCancel = () => endDrag(false);
  const onHandleKey = (event: KeyboardEvent) => {
    if (!current || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    event.stopPropagation();
    const step = stepTarget(visibleIds(), idOf(current), event.key === "ArrowUp" ? -1 : 1);
    if (step) commitMove(idOf(current), step.overId, step.position, handle);
  };
  handle.addEventListener("pointerdown", onHandleDown);
  handle.addEventListener("pointermove", onHandleMove);
  handle.addEventListener("pointerup", onHandleUp);
  handle.addEventListener("pointercancel", onHandleCancel);
  handle.addEventListener("keydown", onHandleKey);
  const onInsertClick = (event: MouseEvent) => {
    event.preventDefault();
    if (current) askInsert(current, edge);
  };
  insertButton.addEventListener("click", onInsertClick);

  /* --------------------------- hover, focus, touch --------------------------- */
  const onPointerMove = (event: PointerEvent) => {
    if (!on || drag || event.pointerType === "touch") return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || layer.contains(target)) return;
    const block = sectionOf(target);
    if (!block) return;
    const rect = block.getBoundingClientRect();
    const nextEdge: DropPosition = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    if (block !== current || nextEdge !== edge) setCurrent(block, nextEdge);
  };
  const onPointerDown = (event: PointerEvent) => {
    if (!on || drag || event.pointerType !== "touch") return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || layer.contains(target)) return;
    const block = sectionOf(target);
    if (block && block !== current) setCurrent(block, "after");
  };
  const onFocusIn = (event: FocusEvent) => {
    if (!on) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.hasAttribute("data-rv-arrange") || (target && target.matches(SECTION_SELECTOR))) setCurrent(target, "after");
  };
  document.addEventListener("pointermove", onPointerMove, true);
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("focusin", onFocusIn, true);

  return {
    setOn(next) {
      if (next === on) return;
      on = next;
      if (!on) endDrag(false);
      markSections(on);
      if (!on) current = null;
      place();
    },
    isOn: () => on,
    applyOrder(ids, text) {
      const shown = sections();
      const wanted = ids.map((id) => shown.find((node) => idOf(node) === id)).filter((node): node is HTMLElement => Boolean(node));
      const parent = wanted[0]?.parentElement;
      if (!parent || wanted.some((node) => node.parentElement !== parent)) return;
      const run = shown.filter((node) => wanted.includes(node));
      let anchor: ChildNode | null = run[0]?.previousSibling ?? null;
      for (const node of wanted) {
        parent.insertBefore(node, anchor ? anchor.nextSibling : parent.firstChild);
        anchor = node;
      }
      if (text) announce(text);
      place();
    },
    onKey(event) {
      if (!on || isEditing()) return false;
      if (event.key === "Escape" && drag) {
        event.preventDefault();
        endDrag(false);
        return true;
      }
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        post({ source: PREVIEW_BRIDGE_SOURCE, type: "undo-move" });
        return true;
      }
      const focused = event.target instanceof HTMLElement ? event.target : null;
      if (!focused?.matches(SECTION_SELECTOR)) return false;
      if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        event.preventDefault();
        const step = stepTarget(visibleIds(), idOf(focused), event.key === "ArrowUp" ? -1 : 1);
        if (step) commitMove(idOf(focused), step.overId, step.position, focused);
        return true;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        askInsert(focused, event.shiftKey ? "before" : "after");
        return true;
      }
      return false;
    },
    onClick(event) {
      if (!on) return false;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || layer.contains(target)) return false;
      const block = sectionOf(target);
      if (!block) return false;
      // While arranging, a click (or tap) chooses the section; links and
      // buttons inside the page never navigate or submit.
      event.preventDefault();
      event.stopPropagation();
      if (block !== current) setCurrent(block, "after");
      return true;
    },
    onScroll: () => {
      if (!drag) place();
    },
    destroy() {
      endDrag(false);
      markSections(false);
      handle.removeEventListener("pointerdown", onHandleDown);
      handle.removeEventListener("pointermove", onHandleMove);
      handle.removeEventListener("pointerup", onHandleUp);
      handle.removeEventListener("pointercancel", onHandleCancel);
      handle.removeEventListener("keydown", onHandleKey);
      insertButton.removeEventListener("click", onInsertClick);
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
      handle.remove();
      insert.remove();
      dropLine.remove();
      live.remove();
    },
  };
}
