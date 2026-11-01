import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ContactMap } from "./ContactMap";
import { CONTENT_SECURITY_POLICY } from "@/lib/security-headers";

const site = (google_business: string | null) => ({ social: { google_business } }) as never;

describe("ContactMap", () => {
  it("frames the free Google Maps embed for a saved Maps link", () => {
    const html = renderToStaticMarkup(
      <ContactMap site={site("https://www.google.com/maps/place/Elite+Mobile+Detailing/@35.7796,-78.6382,17z")} />,
    );
    expect(html).toContain("https://www.google.com/maps?q=");
    expect(html).toContain("output=embed");
    expect(html).toContain("Map showing Elite Mobile Detailing");
    expect(html).toContain("sandbox=");
    expect(html).not.toMatch(/key=/);
  });

  it("renders nothing without a readable Maps link", () => {
    expect(renderToStaticMarkup(<ContactMap site={site(null)} />)).toBe("");
    expect(renderToStaticMarkup(<ContactMap site={site("https://facebook.com/joes")} />)).toBe("");
    expect(renderToStaticMarkup(<ContactMap site={{ social: null } as never} />)).toBe("");
  });

  it("is allowed by the page's frame-src policy", () => {
    const frameSrc = CONTENT_SECURITY_POLICY.split("; ").find((part) => part.startsWith("frame-src")) ?? "";
    expect(frameSrc).toContain("https://www.google.com");
  });
});
