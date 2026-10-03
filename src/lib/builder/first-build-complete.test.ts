/**
 * Every customer's first build ships every page, real pictures on each page,
 * and the owner's own photos and logo — starting from sign-up.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizePageArchitecture } from "@/lib/builder/ai-page-architecture";

const read = (path: string) => readFileSync(path, "utf8");

describe("first build ships every page", () => {
  const candidate = [
    {
      slug: "home",
      title: "Home",
      purpose: "home",
      primaryAction: "Call",
      sections: [{ role: "hero" }, { role: "services", includes: ["service_cards" as const] }],
    },
    {
      slug: "services",
      title: "Services",
      purpose: "services",
      primaryAction: "Call",
      sections: [{ role: "services", includes: ["service_cards" as const] }, { role: "contact" }],
    },
    {
      slug: "about",
      title: "About",
      purpose: "about",
      primaryAction: "Call",
      sections: [{ role: "story" }],
    },
    {
      slug: "contact",
      title: "Contact",
      purpose: "contact",
      primaryAction: "Call",
      sections: [{ role: "contact" }],
    },
  ];

  it("restores services, about and contact when the AI plan drops them", () => {
    const result = normalizePageArchitecture({
      candidate,
      proposal: [
        { slug: "home", sections: [{ role: "hero" }, { role: "services" }] },
        {
          slug: "process",
          title: "Process",
          sections: [{ role: "steps", heading: "How it works" }],
        },
      ],
    });
    expect(result?.architecture.map((page) => page.slug)).toEqual([
      "home",
      "process",
      "services",
      "about",
      "contact",
    ]);
  });

  it("always lists every real service somewhere", () => {
    const result = normalizePageArchitecture({
      candidate,
      proposal: candidate.map((page) => ({
        slug: page.slug,
        sections: page.sections.map((section) => ({ role: section.role })),
      })),
    });
    const lists = result!.architecture.some((page) =>
      page.sections.some((section) => (section.includes ?? []).includes("service_cards")),
    );
    expect(lists).toBe(true);
  });

  it("tells the architect the first build must be complete with a picture on every page", () => {
    const src = read("src/lib/builder/ai-page-architecture.server.ts");
    expect(src).toMatch(/FIRST BUILD IS COMPLETE/);
    expect(src).toMatch(/media \\"required\\" so every page has a real picture/);
  });
});

describe("pictures on every page", () => {
  it("asks for a picture campaign covering every page and service, at least 5", () => {
    const src = read("src/lib/builder/collective-first-build.server.ts");
    expect(src).toMatch(/one picture for each real service/);
    expect(src).toMatch(/at least 5 pictures/);
  });
  it("keeps descriptive slot names instead of dropping them at 20 characters", () => {
    const src = read("src/lib/builder/collective-first-build.server.ts");
    expect(src).toMatch(/textAt\(item\["slot"\], 80\)/);
  });
  it("gives each page without a picture one before spreading the rest", () => {
    expect(read("src/lib/site-materialize.server.ts")).toMatch(/Every page gets a picture/);
  });
  it("pauses and retries a briefly busy picture service instead of giving up on all pictures", () => {
    const src = read("src/lib/builder/first-build-images.server.ts");
    expect(src).toMatch(/MAX_BLOCKED_STRIKES = 3/);
  });
});

describe("owner photos and logo from sign-up", () => {
  it("lets a new customer pick photos and a logo before a workspace exists", () => {
    const component = read("src/components/onboarding/OwnerPhotoUpload.tsx");
    expect(component).not.toMatch(/disabled=\{busy \|\| !organizationId\}/);
    const onboarding = read("src/routes/_authenticated/onboarding.tsx");
    expect(onboarding).toMatch(/saveOwnerPhotos\(org\.id, photos\)/);
    expect(onboarding).toMatch(/logo_url: logoPath \|\| draft\.logoUrl\.trim\(\) \|\| null/);
    // Photos are saved before the build starts so the first build places them.
    expect(onboarding.indexOf("saveOwnerPhotos(org.id")).toBeLessThan(
      onboarding.indexOf("queueBuild({"),
    );
  });
  it("marks owner uploads as owner photos everywhere", () => {
    expect(read("src/components/onboarding/owner-photos.ts")).toMatch(/source: "owner"/);
    expect(read("src/components/app/MediaLibrary.tsx")).toMatch(/source: "owner"/);
  });
  it("marks AI pictures and clips as generated so a rebuild never treats them as owner photos", () => {
    expect(read("src/lib/site-agent.functions.ts")).toMatch(
      /source: "generated",\n\s*\} as never\)/,
    );
    expect(read("src/lib/site-video.functions.ts")).toMatch(
      /source: "generated",\n\s*\} as never\)/,
    );
  });
  it("never places a logo or a video clip as a page photo", () => {
    const worker = read("src/lib/site-engine.worker.server.ts");
    expect(worker).toMatch(/!== "logo"/);
    expect(worker).toMatch(/mp4\|webm\|mov\|m4v/);
  });
  it("shows the owner's logo in the site header", () => {
    expect(read("src/components/site/AiSiteHeader.tsx")).toMatch(/logoUrl\?: string \| null/);
    expect(read("src/routes/s.$slug.$page.tsx")).toMatch(
      /logoUrl=\{profile\?\.logo_url \?\? null\}/,
    );
  });
});

describe("sign-in redirect safety", () => {
  it("refuses protocol-relative and backslash redirects", () => {
    const src = read("src/routes/auth.tsx");
    expect(src).toMatch(/!rawRedirect\.startsWith\("\/\/"\)/);
  });
});
