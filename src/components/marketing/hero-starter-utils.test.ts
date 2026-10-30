import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STARTER_METADATA_KEY, starterFromMetadata } from "./hero-starter-utils";

describe("homepage starter survives sign-up on another device", () => {
  it("reads and cleans the starter saved on the account", () => {
    expect(
      starterFromMetadata({
        [STARTER_METADATA_KEY]: {
          businessName: "Apex Auto Detail",
          about: "Mobile detailing",
          industry: "Auto detailing",
          website: "  apex.example  ",
          wantsImport: true,
        },
      }),
    ).toEqual({
      businessName: "Apex Auto Detail",
      about: "Mobile detailing",
      industry: "Auto detailing",
      website: "apex.example",
      wantsImport: true,
    });
    expect(
      starterFromMetadata({ [STARTER_METADATA_KEY]: { businessName: "x".repeat(500) } })
        ?.businessName.length,
    ).toBe(120);
  });

  it("ignores missing or malformed metadata", () => {
    expect(starterFromMetadata(null)).toBeNull();
    expect(starterFromMetadata({})).toBeNull();
    expect(starterFromMetadata({ [STARTER_METADATA_KEY]: "nope" })).toBeNull();
    expect(starterFromMetadata({ [STARTER_METADATA_KEY]: { businessName: 42 } })).toBeNull();
  });

  it("sign-up saves the starter and /get-started prefills from either copy", () => {
    const auth = readFileSync("src/routes/auth.tsx", "utf8");
    expect(auth).toContain("data: { full_name: fullName, ...starterMetadata() }");
    const getStarted = readFileSync("src/routes/get-started.tsx", "utf8");
    expect(getStarted).toContain("localStarter ?? starterFromMetadata(meta)");
  });

  it("every Start button leads into the same /get-started intake path", () => {
    const buttons = readFileSync("src/components/marketing/AuthButtons.tsx", "utf8");
    expect(buttons).toContain('SIGN_UP_SEARCH = { mode: "signup", redirect: "/get-started" }');
    const chrome = readFileSync("src/components/marketing/Chrome.tsx", "utf8");
    expect(chrome).toContain('to="/get-started"');
    expect(chrome).not.toMatch(/mode: "signup", redirect: "\/(app|onboarding)/);
  });
});
