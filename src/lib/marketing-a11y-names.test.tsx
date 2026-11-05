// @vitest-environment jsdom
/**
 * Accessible-name / ARIA regressions the IBM Equal Access gate (#629) found on
 * the marketing chrome: redundant logo alt, aria-controls pointing at a missing
 * id, and the dictate button's name not containing its visible text.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: unknown; [k: string]: unknown }) => (
    <a href={to} {...(rest as object)}>
      {children as never}
    </a>
  ),
  useRouterState: () => "/",
}));
vi.mock("@/lib/auth-session", () => ({ useSession: () => ({ loading: true, user: null }) }));
vi.mock("@/lib/use-tenant", () => ({ useSignOut: () => () => undefined }));
vi.mock("@/components/marketing/ConversionKit", () => ({ MarketingConversionKit: () => null }));
vi.mock("@/components/marketing/VisitorJarvisLazy", () => ({ VisitorJarvis: () => null }));
vi.mock("@/components/marketing/ScrollReveal", () => ({ ScrollReveal: () => null }));
vi.mock("@/components/marketing/AuthButtons", () => ({
  AuthActions: () => null,
  SIGN_IN_SEARCH: {},
  SIGN_UP_SEARCH: {},
}));
vi.mock("@/lib/speech-input", () => ({
  getSpeechRecognition: () => function FakeRecognition() {},
  appendTranscript: (a: string, b: string) => `${a} ${b}`.trim(),
}));

vi.mock("@/lib/assessment.functions", () => ({ submitAssessment: vi.fn() }));
vi.mock("@/components/marketing/FreeAccess", () => ({
  FreeAccessButton: () => <button type="button">Start free access</button>,
}));

import { Logo, LogoMark } from "@/components/brand/Logo";
import { SiteHeader } from "@/components/marketing/Chrome";
import { VoiceDictateButton } from "@/components/marketing/VoiceDictateButton";
import { GrowthAssessment } from "@/components/marketing/GrowthAssessment";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(node));
  return { host, unmount: () => act(() => root.unmount()) };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("logo alt text", () => {
  it("is empty when the visible REVORA wordmark already names the link", () => {
    const html = renderToStaticMarkup(<Logo />);
    expect(html).toContain('alt=""');
    expect(html).not.toContain('alt="Revora"');
    expect(html).toContain("REVORA");
  });

  it("still names the mark when there is no wordmark, and by default", () => {
    expect(renderToStaticMarkup(<Logo wordmark={false} />)).toContain('alt="Revora"');
    expect(renderToStaticMarkup(<LogoMark />)).toContain('alt="Revora"');
  });
});

describe("mobile menu aria-controls target", () => {
  it("always exists in the DOM, hidden while closed, without rendering the menu links", () => {
    const { host, unmount } = mount(<SiteHeader />);
    const button = host.querySelector<HTMLButtonElement>('button[aria-controls="marketing-mobile-menu"]');
    expect(button).not.toBeNull();
    const target = host.querySelector<HTMLElement>("#marketing-mobile-menu");
    expect(target).not.toBeNull();
    expect(target!.hidden).toBe(true);
    expect(button!.getAttribute("aria-expanded")).toBe("false");
    expect(target!.querySelector('nav[aria-label="Mobile"]')).toBeNull();

    act(() => button!.click());
    expect(button!.getAttribute("aria-expanded")).toBe("true");
    expect(target!.hidden).toBe(false);
    expect(target!.querySelector('nav[aria-label="Mobile"]')).not.toBeNull();

    act(() => button!.click());
    expect(target!.hidden).toBe(true);
    expect(host.querySelector("#marketing-mobile-menu")).toBe(target);
    unmount();
  });
});

describe("dictate button accessible name (WCAG 2.5.3 Label in Name)", () => {
  it("contains the visible text, idle and while listening", () => {
    const { host, unmount } = mount(<VoiceDictateButton value="" onText={() => undefined} label="What you do" />);
    const button = host.querySelector("button");
    expect(button).not.toBeNull();
    const visible = button!.textContent!.trim();
    expect(visible).toBe("Say it");
    const name = button!.getAttribute("aria-label")!;
    expect(name.toLowerCase().startsWith(visible.toLowerCase())).toBe(true);
    expect(name).toContain("What you do");
    unmount();
  });
});

describe("growth assessment email Label in Name (WCAG 2.5.3)", () => {
  it("uses the visible Step 5 label as the accessible name (no overriding aria-label)", () => {
    const { host, unmount } = mount(<GrowthAssessment mode="assessment" />);
    const input = host.querySelector<HTMLInputElement>("#ga-email");
    expect(input).not.toBeNull();
    expect(input!.getAttribute("aria-label")).toBeNull();
    const label = host.querySelector<HTMLLabelElement>('label[for="ga-email"]');
    expect(label).not.toBeNull();
    const visible = label!.textContent!.trim();
    expect(visible.toLowerCase()).toContain("where should we send the report");
    // Associated label text is the accessible name source — must match visible wording.
    expect(label!.htmlFor).toBe("ga-email");
    unmount();
  });

  it("keeps the same label association in audit mode", () => {
    const { host, unmount } = mount(<GrowthAssessment mode="audit" />);
    const input = host.querySelector<HTMLInputElement>("#ga-email");
    expect(input).not.toBeNull();
    expect(input!.getAttribute("aria-label")).toBeNull();
    expect(host.querySelector('label[for="ga-email"]')!.textContent).toMatch(/send the report/i);
    unmount();
  });
});
