import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, activeProps: _a, ...rest }: { to: string; children: unknown; [k: string]: unknown }) => (
    <a href={to} {...(rest as object)}>
      {children as never}
    </a>
  ),
  useRouterState: () => "/",
}));
vi.mock("@/lib/auth-session", () => ({ useSession: () => ({ loading: false, user: null }) }));
vi.mock("@/lib/use-tenant", () => ({ useSignOut: () => () => undefined }));
vi.mock("@/components/marketing/ConversionKit", () => ({ MarketingConversionKit: () => null }));
vi.mock("@/components/marketing/VisitorJarvisLazy", () => ({ VisitorJarvis: () => null }));
vi.mock("@/components/marketing/ScrollReveal", () => ({ ScrollReveal: () => null }));

import { SiteHeader } from "@/components/marketing/Chrome";

/**
 * At 320px the phone header's Sign up / Sign in / menu cluster leaves ~98px for
 * the brand, while mark + REVORA wordmark need ~121px; the wordmark used to
 * slide under the Sign up button. The wordmark must step aside below 360px. (Real geometry is checked with Playwright at
 * 320/375/768/1440/2560 in the PR; this pins the markup contract.)
 */
describe("marketing header brand fits beside the phone auth buttons", () => {
  const html = renderToStaticMarkup(<SiteHeader />);
  const home = html.match(/<a[^>]*aria-label="Revora home"[^>]*>[\s\S]*?REVORA[\s\S]*?<\/a>/)?.[0] ?? "";

  it("keeps the home link shrinkable inside its grid column", () => {
    expect(home).toMatch(/class="[^"]*\bmin-w-0\b[^"]*"/);
  });

  it("hides only the wordmark below 360px; the mark and accessible name stay", () => {
    expect(home).toMatch(/<span class="[^"]*max-\[359px\]:hidden[^"]*"><span[^>]*>REVORA<\/span>/);
    expect(home).toContain('alt="Revora"');
    expect(html).toContain("Sign up");
  });
});
