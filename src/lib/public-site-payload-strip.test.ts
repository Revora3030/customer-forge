import { describe, expect, it, vi } from "vitest";
import { scrubPlaceholderPayload } from "@/lib/builder/placeholder-contact";

// DevSkim: ignore DS162092 -- Test data: placeholder emails that must be withheld; no host is accessed.
const FAKE_EMAIL = "hello@elitemobiledetailing.example";
const FAKE_PHONE = "(512) 555-0142";
const REAL_PHONE = "(919) 482-7731";
const REAL_EMAIL = "owner@realbiz.com";

/** Shaped like loadSite()'s return value for a published client site. */
function siteFixture(phone: string, email: string, tel: string, mail: string) {
  return {
    org: { id: "o1", name: "Elite Mobile Detailing", slug: "elite-mobile-detailing" },
    profile: {
      phone,
      email,
      tagline: `Call ${phone} for a quote`,
      description: `Detailing done right. Email ${email} or visit us.`,
      city: "Austin",
      hero_image_url: null,
    },
    services: [{ id: "s1", name: "Full detail", description: "Interior and exterior." }],
    settings: { seo: { description: `Book now: ${phone}` }, generation: { footer: { items: [{ type: "link", text: phone, href: `tel:${tel}` }] } } },
    social: { phone, whatsapp: phone },
    reviews: [{ id: "r1", author_name: "A. Customer", rating: 5, comment: "Great work." }],
    content: {
      page: { slug: "home", title: "Home", meta_description: `Call ${phone}` },
      sections: [
        {
          id: "sec1",
          kind: "custom",
          settings: {
            blocks: [
              { href: `tel:${tel}`, text: phone, type: "link" },
              { href: `mailto:${mail}`, text: email, type: "link" },
              { href: "/contact", text: "Contact us", type: "button" },
            ],
          },
          components: [{ id: "c1", link_url: `tel:${tel}`, title: "Call us" }],
        },
      ],
    },
  };
}

describe("public site loader payload carries no placeholder contacts", () => {
  it("removes 555-01xx phones and .example emails from profile fields, text, blocks and links", () => {
    const out = scrubPlaceholderPayload(siteFixture(FAKE_PHONE, FAKE_EMAIL, "+15125550142", FAKE_EMAIL));
    const json = JSON.stringify(out);
    expect(json).not.toMatch(/555-?\s?0142/);
    expect(json).not.toContain("5550142");
    expect(json).not.toContain("elitemobiledetailing.example");
    expect(out.profile.phone).toBeNull();
    expect(out.profile.email).toBeNull();
    expect(out.social.phone).toBeNull();
    const [tel, mail, button] = out.content.sections[0]!.settings.blocks;
    expect(tel).toMatchObject({ href: "#contact", type: "link" });
    expect(mail).toMatchObject({ href: "#contact", type: "link" });
    expect(tel!.text).toBe("Contact us");
    expect(button).toEqual({ href: "/contact", text: "Contact us", type: "button" });
    expect(out.content.sections[0]!.components[0]!.link_url).toBe("#contact");
    // Everything that is not a placeholder contact is untouched.
    expect(out.profile.city).toBe("Austin");
    expect(out.services).toEqual(siteFixture("", "", "", "").services);
    expect(out.reviews[0]!.comment).toBe("Great work.");
  });

  it("leaves real contacts untouched", () => {
    const input = siteFixture(REAL_PHONE, REAL_EMAIL, "+19194827731", REAL_EMAIL);
    expect(scrubPlaceholderPayload(input)).toEqual(input);
  });

  it("does not mutate its input and keeps nulls and non-JSON values", () => {
    const input = siteFixture(FAKE_PHONE, FAKE_EMAIL, "+15125550142", FAKE_EMAIL);
    const before = JSON.stringify(input);
    scrubPlaceholderPayload(input);
    expect(JSON.stringify(input)).toBe(before);
    const date = new Date(0);
    expect(scrubPlaceholderPayload({ profile: { phone: null }, at: date }).at).toBe(date);
  });
});

describe("the public loader returns the scrubbed payload", () => {
  it("strips placeholder contacts from what loadSite returned", async () => {
    vi.resetModules();
    vi.doMock("@/lib/public-site.server", () => ({
      loadSite: async () => siteFixture(FAKE_PHONE, FAKE_EMAIL, "+15125550142", FAKE_EMAIL),
    }));
    const { loadPublicSitePayload } = await import("@/lib/public-site.functions");
    const out = await loadPublicSitePayload({ slug: "elite-mobile-detailing" });
    const json = JSON.stringify(out);
    expect(json).not.toContain("555-0142");
    expect(json).not.toContain("5550142");
    expect(json).not.toContain(".example");
    expect(out?.org.slug).toBe("elite-mobile-detailing");
    vi.doUnmock("@/lib/public-site.server");
  });

  it("keeps real contacts and still answers not-found for an unknown site", async () => {
    vi.resetModules();
    vi.doMock("@/lib/public-site.server", () => ({
      loadSite: async (slug: string) => (slug === "real" ? siteFixture(REAL_PHONE, REAL_EMAIL, "+19194827731", REAL_EMAIL) : null),
    }));
    const { loadPublicSitePayload } = await import("@/lib/public-site.functions");
    const real = await loadPublicSitePayload({ slug: "real" });
    expect(real?.profile?.phone).toBe(REAL_PHONE);
    expect(real?.profile?.email).toBe(REAL_EMAIL);
    expect(await loadPublicSitePayload({ slug: "missing" })).toBeNull();
    vi.doUnmock("@/lib/public-site.server");
  });
});
