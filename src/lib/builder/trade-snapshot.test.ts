import { describe, expect, it } from "vitest";

import { findInventedFacts } from "@/lib/builder/quality/facts-guard";
import {
  buildTradeSnapshot,
  findSnapshotLeaks,
  instantiateSnapshot,
  type SnapshotSourceFacts,
} from "@/lib/builder/trade-snapshot";

const FACTS: SnapshotSourceFacts = {
  businessName: "Sparkle Pro Cleaning LLC",
  ownerName: "Marisol Quintero",
  phone: "(512) 555-0147",
  email: "hello@sparklepro.test",
  address: "88 Cedar Hollow Rd, Austin, TX 78701",
  city: "Austin",
  hours: "Mon-Fri 8am-5pm",
};

const pages = [
  {
    kind: "home",
    slug: "home",
    title: "Sparkle Pro Cleaning LLC | Austin cleaners",
    seo_title: "House cleaning in Austin",
    seo_description: "Call (512) 555-0147 for a quote.",
    og_image_url: "https://cdn.example/x.jpg",
  },
  { kind: "services", slug: "services", title: "Services" },
];
const sections = [
  {
    pageSlug: "home",
    kind: "hero",
    heading: "Sparkle Pro Cleaning LLC: spotless homes in Austin",
    subheading: "Call (512) 555-0147 or email hello@sparklepro.test",
    body: "Marisol Quintero and her team clean every room. Deep clean from $189. Licensed and insured.",
    settings: {
      image: { src: "https://cdn.example/hero.jpg", alt: "Marisol smiling" },
      cta: { label: "Book a clean", href: "#quote" },
      call: { label: "Call us", href: "tel:+15125550147" },
      composition: {
        root: {
          children: [
            {
              text: "Find us at 88 Cedar Hollow Rd, Austin, TX 78701",
              photo: "https://cdn.example/team.jpg",
            },
          ],
        },
      },
    },
  },
  {
    pageSlug: "home",
    kind: "reviews",
    heading: "What Austin says",
    body: "Rated 5 stars by 214 reviews",
    settings: {},
  },
  {
    pageSlug: "home",
    kind: "team",
    heading: "Meet Marisol",
    body: "Marisol Quintero",
    settings: {},
  },
  {
    pageSlug: "services",
    kind: "services_grid",
    heading: "Cleaning services",
    body: "Open Mon-Fri 8am-5pm. Over 12 years of experience.",
    settings: {
      items: [
        {
          title: "Move-out clean",
          price: "$250",
          description: "Sparkle Pro Cleaning LLC will reach every corner.",
        },
      ],
    },
  },
];

describe("COMP-9 trade snapshot", () => {
  const snap = buildTradeSnapshot({ trade: "Cleaning", pages, sections, facts: FACTS });
  const json = JSON.stringify(snap);

  it("contains no real phone, address, review, email, name or URL from the source site", () => {
    for (const needle of [
      "512",
      "555",
      "0147",
      "Cedar Hollow",
      "78701",
      "sparklepro",
      "Sparkle",
      "Marisol",
      "Quintero",
      "cdn.example",
      "214",
      "Mon-Fri",
      "$189",
      "$250",
      "12 years",
      "Licensed",
    ]) {
      expect(json).not.toContain(needle);
    }
    expect(findSnapshotLeaks(snap, FACTS)).toEqual([]);
    expect(findInventedFacts([{ id: "all", text: json }], {})).toEqual([]);
  });

  it("keeps layout and generic copy, swaps facts for tokens, drops reviews and team", () => {
    expect(snap.trade).toBe("cleaning");
    expect(snap.sections.map((s) => s.kind)).toEqual(["hero", "services_grid"]);
    expect(snap.removed.sections).toBe(2);
    expect(snap.sections[0]!.heading).toBe("{{business_name}}: spotless homes in {{city}}");
    expect(snap.sections[0]!.subheading).toBe("Call {{phone}} or email {{email}}");
    expect(snap.pages[0]!.seo_description).toBe("Call {{phone}} for a quote.");
    const hero = snap.sections[0]!.settings as {
      cta: { label: string; href: string };
      call?: unknown;
      image?: unknown;
    };
    expect(hero.cta).toEqual({ label: "Book a clean", href: "#quote" });
    expect(hero.call).toEqual({ label: "Call us" });
    expect(hero.image).toBeUndefined();
  });

  it("catches a leak that is put back by hand, and strips every phone format", () => {
    const tampered = {
      ...snap,
      sections: [{ ...snap.sections[0]!, heading: "Sparkle Pro Cleaning LLC is great" }],
    };
    expect(findSnapshotLeaks(tampered, FACTS)).toContain("business name still present");
    const formats = ["512.555.0147", "+1 512 555 0147", "5125550147", "512-555-0147"].map(
      (phone) => ({
        pageSlug: "home",
        kind: "hero",
        heading: `Ring ${phone}`,
        settings: {},
      }),
    );
    const out = buildTradeSnapshot({ trade: "cleaning", pages, sections: formats, facts: FACTS });
    expect(out.sections.map((x) => x.heading)).toEqual(Array(4).fill("Ring {{phone}}"));
  });

  it("instantiates for a new owner with only that owner's facts, and markers for the rest", () => {
    const out = instantiateSnapshot(snap, {
      businessName: "Fresh Start Maids",
      phone: "(206) 555-0199",
      city: "Seattle",
      services: [{ name: "Deep clean" }],
    });
    expect(out.sections[0]!.heading).toBe("Fresh Start Maids: spotless homes in Seattle");
    expect(out.sections[0]!.subheading).toContain("[Add your email]");
    expect(out.missing).toEqual(expect.arrayContaining(["email", "address", "hours"]));
    const text = JSON.stringify(out);
    expect(text).not.toContain("Sparkle");
    expect(text).not.toContain("{{");
  });
});
