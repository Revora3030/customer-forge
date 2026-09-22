/**
 * Click-to-edit inside the builder's preview.
 *
 * Mounted on a customer website page. It does nothing at all unless the page is
 * shown inside the builder's own preview frame on the same origin, and only
 * after the builder asks for select mode. Then a click on any block tells the
 * builder which block it was, instead of following the link.
 */
import { useEffect } from "react";
import {
  PREVIEW_BRIDGE_SOURCE,
  readBuilderMessage,
  type PreviewToBuilderMessage,
} from "@/lib/builder/preview-bridge";

export function PreviewSelectBridge() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Not framed: a normal visitor, so this feature stays completely inert.
    if (window.parent === window) return;

    const origin = window.location.origin;
    const post = (message: PreviewToBuilderMessage) => window.parent.postMessage(message, origin);
    const root = document.documentElement;
    let active = false;

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== window.parent) return;
      const message = readBuilderMessage(event.data);
      if (!message) return;
      active = message.on;
      root.classList.toggle("rv-preview-select", active);
      document
        .querySelectorAll("[data-rvb-selected]")
        .forEach((node) => node.removeAttribute("data-rvb-selected"));
      if (active && message.selectedId) {
        const selector = `[data-rvb="${CSS.escape(message.selectedId)}"]`;
        document.querySelector(selector)?.setAttribute("data-rvb-selected", "true");
      }
    };

    const onClick = (event: MouseEvent) => {
      if (!active) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const block = target.closest("[data-rvb]");
      if (!block) return;
      // In select mode a click picks the block; it never navigates or submits.
      event.preventDefault();
      event.stopPropagation();
      post({
        source: PREVIEW_BRIDGE_SOURCE,
        type: "select",
        id: block.getAttribute("data-rvb") ?? "",
        kind: block.getAttribute("data-rvb-kind"),
        label: block.getAttribute("data-rvb-label"),
        text: (block.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 140) || null,
      });
    };

    window.addEventListener("message", onMessage);
    document.addEventListener("click", onClick, true);
    post({ source: PREVIEW_BRIDGE_SOURCE, type: "ready" });

    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("click", onClick, true);
      root.classList.remove("rv-preview-select");
    };
  }, []);

  return null;
}
