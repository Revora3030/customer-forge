import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { CompositionTree } from "./composition-tree";
import { completeChromeLinks, ensureHeaderAction, repairContactDetails } from "./chrome-repair";

const header = (children: CompositionTree["root"][]): CompositionTree => ({
  version: 1,
  root: { type: "row", children: [{ type: "text", text: "Acme Roofing" }, { type: "row", children }] },
});

describe("invented contact details are corrected, not fatal", () => {
  it("points an invented tel: at the real number", () => {
    const raw = { type: "button", text: "Call (555) 999-1234", href: "tel:5559991234" };
    const { value, fixes } = repairContactDetails(raw, { phone: "(919) 555-0100", email: null, enquiryHref: "/contact" });
    expect(value.href).toBe("tel:9195550100");
    expect(value.text).toBe("Call (919) 555-0100");
    expect(fixes).toBe(2);
  });
  it("sends an invented number to the contact page when no phone was supplied", () => {
    const { value } = repairContactDetails({ type: "button", text: "Call 555-999-1234", href: "tel:5559991234" }, { phone: null, email: null, enquiryHref: "/contact" });
    expect(value.href).toBe("/contact");
    expect(value.text).toBe("Call");
  });
  it("keeps the owner's own details untouched", () => {
    const raw = { type: "link", text: "hi@acme.co", href: "mailto:hi@acme.co" };
    const { value, fixes } = repairContactDetails(raw, { phone: null, email: "hi@acme.co" });
    expect(value).toEqual(raw);
    expect(fixes).toBe(0);
  });
});

describe("the menu bar always gets its action button", () => {
  it("promotes the AI's own contact link", () => {
    const tree = header([{ type: "link", text: "Services", href: "/services" }, { type: "link", text: "Get a quote", href: "/contact" }]);
    const out = ensureHeaderAction(tree, { enquiryHref: "/contact", ctaLabel: "Get a quote" });
    expect(out.changed).toBe("promoted");
    expect(JSON.stringify(out.tree)).toContain('"type":"button","text":"Get a quote","href":"/contact"');
  });
  it("adds the AI-authored call to action beside the menu links", () => {
    const tree = header([{ type: "link", text: "Services", href: "/services" }]);
    const out = ensureHeaderAction(tree, { enquiryHref: "/contact", ctaLabel: "Book a wash" });
    expect(out.changed).toBe("added");
    const menu = out.tree.root.children![1]!;
    expect(menu.children!.at(-1)).toEqual({ type: "button", text: "Book a wash", href: "/contact" });
  });
  it("does nothing when there is nowhere real to send visitors", () => {
    const tree = header([{ type: "link", text: "Services", href: "/services" }]);
    expect(ensureHeaderAction(tree, { ctaLabel: "Book" }).changed).toBe("none");
  });
  it("adds forgotten page links in the AI's style", () => {
    const tree = header([{ type: "link", text: "Services", href: "/services", style: { color: "#111111" } }]);
    const out = completeChromeLinks(tree, ["/", "/services", "/about"], [
      { href: "/", title: "Home" },
      { href: "/services", title: "Services" },
      { href: "/about", title: "About" },
    ]);
    expect(out.added.sort()).toEqual(["/", "/about"]);
    expect(JSON.stringify(out.tree)).toContain('"href":"/about","style":{"color":"#111111"}');
  });
});

describe("composeSiteChrome repairs instead of rejecting", () => {
  it("saves a design that forgot a page link and the action button", async () => {
    vi.resetModules();
    vi.doMock("@/lib/ai/hall-of-fame.server", () => ({
      callBestThinker: async () => ({
        ok: true,
        model: "sol",
        costMicrocents: 0,
        text: JSON.stringify({
          header: { version: 1, root: { type: "row", children: [{ type: "text", text: "Acme Roofing" }, { type: "row", children: [{ type: "link", text: "Home", href: "/" }, { type: "link", text: "Services", href: "/services" }] }] } },
          footer: { version: 1, root: { type: "stack", children: [{ type: "link", text: "Home", href: "/" }, { type: "link", text: "Services", href: "/services" }, { type: "link", text: "Call 555-222-3333", href: "tel:5552223333" }] } },
        }),
      }),
    }));
    const { composeSiteChrome } = await import("./first-build-chrome.server");
    const { readSiteChrome } = await import("./site-chrome");
    const saved: { generation?: unknown } = {};
    const pages = [
      { slug: "home", title: "Home", kind: "home" },
      { slug: "services", title: "Services", kind: "page" },
      { slug: "contact", title: "Contact", kind: "contact" },
    ];
    const db = {
      from(table: string) {
        const chain: Record<string, unknown> = {};
        Object.assign(chain, {
          select: () => chain,
          eq: () => chain,
          order: async () => ({ data: table === "website_pages" ? pages : [], error: null }),
          maybeSingle: async () => ({ data: { generation: {} }, error: null }),
          upsert: async (row: { generation: unknown }) => {
            saved.generation = row.generation;
            return { error: null };
          },
        });
        return chain;
      },
    };
    await composeSiteChrome({
      db: db as never,
      organizationId: "org",
      businessName: "Acme Roofing",
      facts: { phone: "(919) 555-0100", email: null } as never,
      lookSummary: "{}",
      primaryCta: "Get a free quote",
    });
    const chrome = readSiteChrome(saved.generation);
    const head = JSON.stringify(chrome.header);
    expect(head).toContain('"href":"/contact"');
    expect(head).toContain('"type":"button"');
    const foot = JSON.stringify(chrome.footer);
    expect(foot).toContain("tel:9195550100");
    expect(foot).not.toContain("5552223333");
    vi.doUnmock("@/lib/ai/hall-of-fame.server");
  });
});

describe("the build no longer dies before the menu", () => {
  const worker = readFileSync("src/lib/site-engine.worker.server.ts", "utf8");
  const images = readFileSync("src/lib/builder/first-build-images.server.ts", "utf8");
  it("the picture stage has a time budget and renews the lease per picture", () => {
    expect(images).toContain("export function firstBuildImageBudgetMs()");
    expect(images).toContain("picture time budget reached");
    expect(worker).toContain("onShotDone: () => touchLease(db, job)");
  });
  it("a retry reuses pictures the interrupted attempt already stored", () => {
    expect(worker).toContain("reusable: reusablePictures");
    expect(images).toContain("const earlier = (input.reusable ?? []).find(");
  });
  it("sites that already had pages still get a menu bar and footer", () => {
    expect(worker).toContain('kind: "existing_site_chrome"');
  });
  it("the menu designer gets the AI-authored call to action", () => {
    expect(worker).toContain("primaryCta: copy.primaryCta ?? null");
  });
  it("older sites without a menu can get one from the builder", () => {
    expect(readFileSync("src/lib/site-upgrade.functions.ts", "utf8")).toContain("export const designSiteChrome");
    expect(readFileSync("src/routes/_authenticated/app.website.tsx", "utf8")).toContain("<MissingMenuBanner");
  });
  it("no built-in menu design is ever substituted", () => {
    const chrome = readFileSync("src/lib/builder/first-build-chrome.server.ts", "utf8");
    expect(chrome).not.toMatch(/writeSafeChromeFallback/);
    expect(readFileSync("src/routes/s.$slug.$page.tsx", "utf8")).not.toMatch(/<SiteFooter|<SiteNav/);
  });
});
