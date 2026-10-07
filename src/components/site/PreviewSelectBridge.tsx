/**
 * Direct manipulation inside the builder's preview frame.
 *
 * Mounted on a customer website page. It does nothing at all unless the page is
 * shown inside the builder's own preview frame on the same origin. Then:
 *
 *  - Pick mode (toggled by the builder): hovering outlines a block or a single
 *    element with a label; a click picks it (no navigation, no submit).
 *  - A small hover menu on the picked block offers ready-made AI actions
 *    (Restyle / New photo / Punchier copy / Delete).
 *  - Double-click a heading, paragraph, button or link inside an AI layout to
 *    edit its words in place. Enter or clicking away saves (sent to the
 *    builder, which persists it with no AI turn); Escape cancels.
 *  - The builder can patch an element's text instantly and show a floating
 *    status badge ("Sol is restyling Hero…") without reloading the frame.
 *
 * Every DOM change made here is local to the preview and reverted on cleanup.
 */
import { useEffect } from "react";
import {
  PREVIEW_BRIDGE_SOURCE,
  readBuilderMessage,
  type PreviewAction,
  type PreviewToBuilderMessage,
} from "@/lib/builder/preview-bridge";

const INLINE_TYPES = new Set(["heading", "text", "button", "link", "quote"]);
const ACTIONS: { action: PreviewAction; label: string }[] = [
  { action: "restyle", label: "Restyle" },
  { action: "photo", label: "New photo" },
  { action: "punchier", label: "Punchier copy" },
  { action: "delete", label: "Delete" },
];

function blockOf(node: Element | null): HTMLElement | null {
  return (node?.closest("[data-rvb]") as HTMLElement | null) ?? null;
}

function elementOf(node: Element | null): HTMLElement | null {
  return (node?.closest("[data-rvp]") as HTMLElement | null) ?? null;
}

function snippet(node: Element): string | null {
  return (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 140) || null;
}

export function PreviewSelectBridge() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Not framed: a normal visitor, so this feature stays completely inert.
    if (window.parent === window) return;

    const origin = window.location.origin;
    const post = (message: PreviewToBuilderMessage) => window.parent.postMessage(message, origin);
    const root = document.documentElement;
    let active = false;
    let editing: { node: HTMLElement; before: string; id: string; path: string } | null = null;

    /* ------------------------------ overlay UI ------------------------------ */
    const layer = document.createElement("div");
    layer.setAttribute("data-rv-overlay", "");
    layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483000";
    const box = document.createElement("div");
    box.style.cssText =
      "position:fixed;display:none;border:2px solid var(--primary,#6d5dfc);border-radius:6px;box-shadow:0 0 0 4px color-mix(in srgb,var(--primary,#6d5dfc) 18%,transparent);transition:all .08s ease";
    const tag = document.createElement("div");
    tag.style.cssText =
      "position:absolute;left:-2px;top:-24px;padding:2px 8px;border-radius:6px 6px 6px 0;background:var(--primary,#6d5dfc);color:#fff;font:600 11px/18px system-ui,sans-serif;white-space:nowrap";
    box.appendChild(tag);
    const menu = document.createElement("div");
    menu.setAttribute("role", "toolbar");
    menu.setAttribute("aria-label", "Quick AI actions");
    menu.style.cssText =
      "position:fixed;display:none;gap:4px;padding:4px;border-radius:10px;background:rgba(17,17,20,.92);box-shadow:0 8px 24px rgba(0,0,0,.25);pointer-events:auto;font:600 12px/1 system-ui,sans-serif";
    for (const { action, label } of ACTIONS) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.dataset["action"] = action;
      button.style.cssText =
        "border:0;border-radius:7px;padding:7px 10px;background:transparent;color:#fff;cursor:pointer;min-height:30px";
      button.onmouseenter = () => (button.style.background = "rgba(255,255,255,.14)");
      button.onmouseleave = () => (button.style.background = "transparent");
      menu.appendChild(button);
    }
    const status = document.createElement("div");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.style.cssText =
      "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);display:none;max-width:min(92vw,420px);padding:8px 14px;border-radius:999px;background:rgba(17,17,20,.9);color:#fff;font:600 12px/1.35 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25);text-align:center";
    layer.append(box, menu, status);
    document.body.appendChild(layer);

    let picked: HTMLElement | null = null;
    const place = (target: HTMLElement | null, label: string | null) => {
      if (!target) {
        box.style.display = "none";
        return;
      }
      const rect = target.getBoundingClientRect();
      box.style.display = "block";
      box.style.left = `${rect.left - 2}px`;
      box.style.top = `${rect.top - 2}px`;
      box.style.width = `${rect.width + 4}px`;
      box.style.height = `${rect.height + 4}px`;
      tag.textContent = label ?? "";
      tag.style.display = label ? "block" : "none";
      tag.style.top = rect.top < 26 ? "2px" : "-24px";
    };
    const placeMenu = () => {
      if (!picked || !active) {
        menu.style.display = "none";
        return;
      }
      const rect = picked.getBoundingClientRect();
      menu.style.display = "flex";
      const top = Math.min(window.innerHeight - 44, Math.max(8, rect.top + 8));
      menu.style.top = `${top}px`;
      menu.style.left = `${Math.max(8, Math.min(window.innerWidth - menu.offsetWidth - 8, rect.right - menu.offsetWidth - 8))}px`;
    };
    const labelFor = (block: HTMLElement, element: HTMLElement | null) => {
      const name = block.getAttribute("data-rvb-label") ?? block.getAttribute("data-rvb-kind") ?? "Block";
      const type = element?.getAttribute("data-rvp-type");
      return type ? `${name} · ${type}` : name;
    };
    const selectionOf = (block: HTMLElement, element: HTMLElement | null, action?: PreviewAction) =>
      ({
        source: PREVIEW_BRIDGE_SOURCE,
        type: "select",
        id: block.getAttribute("data-rvb") ?? "",
        kind: block.getAttribute("data-rvb-kind"),
        label: block.getAttribute("data-rvb-label"),
        text: snippet(element ?? block),
        ...(element ? { path: element.getAttribute("data-rvp"), element: element.getAttribute("data-rvp-type") } : {}),
        ...(action ? { action } : {}),
      }) as PreviewToBuilderMessage;

    const markSelected = (id: string | null | undefined, path: string | null | undefined) => {
      document.querySelectorAll("[data-rvb-selected]").forEach((node) => node.removeAttribute("data-rvb-selected"));
      picked = null;
      if (!active || !id) return placeMenu();
      const block = document.querySelector<HTMLElement>(`[data-rvb="${CSS.escape(id)}"]`);
      const element = path && block ? block.querySelector<HTMLElement>(`[data-rvp="${CSS.escape(path)}"]`) : null;
      (element ?? block)?.setAttribute("data-rvb-selected", "true");
      picked = block;
      placeMenu();
    };

    /* ----------------------------- inline edit ------------------------------ */
    const finishEdit = (save: boolean) => {
      if (!editing) return;
      const { node, before, id, path } = editing;
      editing = null;
      node.removeAttribute("contenteditable");
      node.removeAttribute("data-rv-editing");
      const after = (node.textContent ?? "").replace(/\s+/g, " ").trim();
      if (!save || !after || after === before) {
        node.textContent = before;
        return;
      }
      node.textContent = after;
      post({ source: PREVIEW_BRIDGE_SOURCE, type: "inline-edit", id, path, text: after });
    };
    const startEdit = (element: HTMLElement) => {
      const type = element.getAttribute("data-rvp-type") ?? "";
      if (!INLINE_TYPES.has(type) || element.children.length > 0) return false;
      const block = blockOf(element);
      const id = block?.getAttribute("data-rvb");
      const path = element.getAttribute("data-rvp");
      if (!id || !path) return false;
      finishEdit(true);
      editing = { node: element, before: (element.textContent ?? "").replace(/\s+/g, " ").trim(), id, path };
      element.setAttribute("contenteditable", "plaintext-only");
      // Older engines without plaintext-only fall back to "true"; pasted
      // markup is stripped on save (textContent) and again on the server.
      if (element.contentEditable !== "plaintext-only") element.setAttribute("contenteditable", "true");
      element.setAttribute("data-rv-editing", "true");
      element.focus();
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      box.style.display = "none";
      menu.style.display = "none";
      return true;
    };

    /* ------------------------------- handlers ------------------------------- */
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== window.parent) return;
      const message = readBuilderMessage(event.data);
      if (!message) return;
      if (message.type === "status") {
        status.textContent = message.text ?? "";
        status.style.display = message.text ? "block" : "none";
        return;
      }
      if (message.type === "patch-text") {
        const block = document.querySelector(`[data-rvb="${CSS.escape(message.id)}"]`);
        const node = block?.querySelector<HTMLElement>(`[data-rvp="${CSS.escape(message.path)}"]`);
        if (node && node !== editing?.node && node.children.length === 0) node.textContent = message.text;
        return;
      }
      active = message.on;
      root.classList.toggle("rv-preview-select", active);
      if (!active) place(null, null);
      markSelected(message.selectedId, message.selectedPath);
    };

    const onMove = (event: MouseEvent) => {
      if (!active || editing) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target && menu.contains(target)) return;
      const block = blockOf(target);
      const element = elementOf(target);
      place(element ?? block, block ? labelFor(block, element) : null);
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (editing) {
        if (editing.node.contains(target)) return;
        finishEdit(true);
      }
      const actionButton = target.closest<HTMLElement>("[data-action]");
      if (actionButton && menu.contains(actionButton) && picked) {
        event.preventDefault();
        event.stopPropagation();
        post(selectionOf(picked, null, actionButton.dataset["action"] as PreviewAction));
        return;
      }
      if (!active) return;
      const block = blockOf(target);
      if (!block) return;
      // In pick mode a click picks; it never navigates or submits.
      event.preventDefault();
      event.stopPropagation();
      const element = elementOf(target);
      post(selectionOf(block, element));
    };

    const onDoubleClick = (event: MouseEvent) => {
      if (!active) return;
      const element = elementOf(event.target instanceof Element ? event.target : null);
      if (!element) return;
      if (startEdit(element)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const onKey = (event: KeyboardEvent) => {
      if (!editing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        finishEdit(false);
      } else if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        finishEdit(true);
      }
    };

    const onScroll = () => {
      if (picked) placeMenu();
      box.style.display = "none";
    };

    window.addEventListener("message", onMessage);
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("dblclick", onDoubleClick, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", placeMenu);
    post({ source: PREVIEW_BRIDGE_SOURCE, type: "ready" });

    return () => {
      finishEdit(false);
      window.removeEventListener("message", onMessage);
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("dblclick", onDoubleClick, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", placeMenu);
      root.classList.remove("rv-preview-select");
      layer.remove();
    };
  }, []);

  return null;
}
