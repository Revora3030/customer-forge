import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HeroStarter } from "./HeroStarter";
import { GROWTH_SYSTEM } from "@/lib/offer";

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/lib/auth-session", () => ({ useSession: () => ({ user: null }) }));

describe("homepage starter truthfulness", () => {
  it("labels the sample and does not invent credentials or a rating", () => {
    const html = renderToStaticMarkup(<HeroStarter />);
    expect(html).toContain("Illustrative layout");
    expect(html).not.toMatch(/Licensed|Insured|lucide-star/);
  });

  it("presents the free access duration without a currency symbol", () => {
    const html = renderToStaticMarkup(<HeroStarter />);
    expect(html).toContain(`Start your ${GROWTH_SYSTEM.fullAccessWindow} free`);
    expect(html).not.toContain(`$${GROWTH_SYSTEM.fullAccessWindow}`);
  });
});
