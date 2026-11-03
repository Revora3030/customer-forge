// @vitest-environment jsdom
/** FIX-EVERYTHING #2-#3: the Builder pill never renders on phones or public /s/ pages, only for an owner of this site. */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let role: string | null = "owner";
let session: { user: { id: string } } | null = { user: { id: "u1" } };
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session } }) },
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: role ? { role } : null }) }) }) }) }),
  },
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...rest }: { children: unknown; to: string }) => <a href={to} {...(rest as object)}>{children as never}</a>,
}));

import { BuilderReturnBar } from "@/components/site/BuilderReturnBar";

let root: Root | null = null;
let host: HTMLElement | null = null;
const setWidth = (w: number) => Object.defineProperty(window, "innerWidth", { value: w, configurable: true });

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<BuilderReturnBar organizationId="org1" />);
    await Promise.resolve();
    await Promise.resolve();
  });
  return host;
}

beforeEach(() => {
  role = "owner";
  session = { user: { id: "u1" } };
  setWidth(1280);
  window.history.pushState({}, "", "/draft/acme");
  window.sessionStorage.clear();
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("BuilderReturnBar", () => {
  it("shows a small pill to the signed-in owner on a desktop draft", async () => {
    const el = await mount();
    expect(el.textContent).toContain("Builder");
  });

  it("renders nothing at 375px so it can never sit on the Call/Book bar", async () => {
    setWidth(375);
    expect((await mount()).textContent).toBe("");
  });

  it("renders nothing on a public /s/ page", async () => {
    window.history.pushState({}, "", "/s/acme");
    expect((await mount()).textContent).toBe("");
  });

  it("renders nothing for a signed-in user who is not a member of this site", async () => {
    role = null;
    expect((await mount()).textContent).toBe("");
  });

  it("renders nothing for a visitor who is not signed in", async () => {
    session = null;
    expect((await mount()).textContent).toBe("");
  });
});
