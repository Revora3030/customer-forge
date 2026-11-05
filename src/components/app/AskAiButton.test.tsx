// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let role: string | undefined = "owner";
vi.mock("@/lib/use-tenant", () => ({
  useWorkspace: () => ({ data: { workspace: { organizationId: "11111111-1111-4111-8111-111111111111", role } } }),
}));
const askAi = vi.fn();
vi.mock("@/lib/ask-ai.functions", () => ({ askAiAboutWorkspace: (args: unknown) => askAi(args) }));

import { AskAiButton } from "@/components/app/AskAiButton";

let root: Root | null = null;
let host: HTMLElement | null = null;

async function mount(props: Parameters<typeof AskAiButton>[0] = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <QueryClientProvider client={new QueryClient()}>
        <AskAiButton {...props} />
      </QueryClientProvider>,
    );
  });
  return host!;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.body.innerHTML = "";
  askAi.mockReset();
  role = "owner";
});

describe("LOV-16 AskAiButton", () => {
  it.each(["staff", "viewer", undefined])("renders nothing for role %s", async (r) => {
    role = r;
    const el = await mount();
    expect(el.querySelector("button")).toBeNull();
  });

  it("owner opens the sheet, asks, and sees the grounded answer plus what was read", async () => {
    askAi.mockResolvedValue({ answer: "You had 3 page views.", facts: ["Page views: 3"], unavailable: [], unverifiedFigures: ["12%"], days: 7, model: "m" });
    const el = await mount({ topic: "analytics", label: "Ask AI about this" });
    const trigger = el.querySelector("button")!;
    expect(trigger.textContent).toContain("Ask AI about this");
    await act(async () => trigger.click());
    const dialog = document.body.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toMatch(/can't change anything, send anything or contact anyone/);
    const textarea = dialog.querySelector("textarea")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(textarea, "How many views?");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const days7 = [...dialog.querySelectorAll("button")].find((b) => b.textContent === "Last 7 days")!;
    await act(async () => days7.click());
    const ask = [...dialog.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Ask")!;
    await act(async () => ask.click());
    expect(askAi).toHaveBeenCalledWith({ data: { organizationId: "11111111-1111-4111-8111-111111111111", question: "How many views?", topic: "analytics", days: 7, leadId: null } });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(dialog.textContent).toContain("You had 3 page views.");
    expect(dialog.textContent).toContain("Double-check 12%");
    expect(dialog.textContent).toContain("Page views: 3");
  });
});
