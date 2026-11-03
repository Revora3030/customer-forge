// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/route-error-reporting", () => ({ reportRouteError: vi.fn() }));

import { WidgetErrorBoundary } from "@/components/app/WidgetErrorBoundary";
import { reportRouteError } from "@/lib/route-error-reporting";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.restoreAllMocks();
});

function Boom(): never {
  throw new Error("widget exploded");
}

describe("WidgetErrorBoundary (T047)", () => {
  it("contains a throwing widget so its siblings still render", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() =>
      root!.render(
        <div>
          <p>Leads card</p>
          <WidgetErrorBoundary name="System activity">
            <Boom />
          </WidgetErrorBoundary>
        </div>,
      ),
    );
    expect(host.textContent).toContain("Leads card");
    expect(host.textContent).toContain("System activity couldn't load");
    expect(host.querySelector('[data-widget-error="System activity"]')).not.toBeNull();
    expect(reportRouteError).toHaveBeenCalled();
  });

  it("is wired around ActivityFeed on the dashboard", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile("src/routes/_authenticated/app.index.tsx", "utf8");
    expect(source).toMatch(/<WidgetErrorBoundary name="System activity">\s*<ActivityFeed /);
  });
});
