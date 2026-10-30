// @vitest-environment jsdom
/**
 * A visitor who arrives from a package's "Book" button (`#book-<serviceId>`)
 * must still be able to change their mind. The address bar names a service, and
 * that service is only meant to be the starting point: picking another one, or a
 * date, has to stick and must not yank the page back to the top of the form.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-start")>()),
  // Lead capture and event tracking are exercised elsewhere; here they only
  // need to not reach the network.
  useServerFn: () => async () => ({}),
}));
vi.mock("@/lib/public-site.functions", () => ({
  submitPublicLead: async () => ({ ok: true }),
  trackPublicEvent: async () => ({}),
}));

const { BookingForm } = await import("@/components/site/SiteForms");

const DRAIN = "11111111-1111-4111-8111-111111111111";
const HEATER = "22222222-2222-4222-8222-222222222222";

type BookingProps = Parameters<typeof BookingForm>[0];

const site = {
  slug: "harbor-line-plumbing-test-wilmington",
  org: { name: "Harbor Line Plumbing", slug: "harbor-line-plumbing-test-wilmington" },
  profile: null,
  services: [
    {
      id: DRAIN,
      name: "Drain cleaning",
      description: "Clear a blocked drain.",
      price: "180",
      starting_price: null,
      duration_minutes: 60,
      bookable: true,
      featured: false,
      sort_order: 0,
    },
    {
      id: HEATER,
      name: "Water heater repair",
      description: "Restore hot water.",
      price: "240",
      starting_price: null,
      duration_minutes: 90,
      bookable: true,
      featured: false,
      sort_order: 1,
    },
  ],
} as unknown as BookingProps["site"];

let root: Root | null = null;
let scrolls = 0;

/** What the service picker currently shows the visitor. */
const shownService = () => document.querySelector('[role="combobox"]')?.textContent ?? "";

const option = (label: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find((el) => el.textContent?.includes(label));

/**
 * Put the deep link in the address bar the way a real arrival does: the browser
 * has already settled on that hash before the page's own code runs, so nothing
 * fires a change event while the visitor is filling the form in.
 */
const arriveAt = (hash: string) => window.history.replaceState(null, "", hash);

function mount() {
  act(() => {
    root = createRoot(document.body);
    root.render(<BookingForm site={site} />);
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  scrolls = 0;
  // jsdom has no layout: count the page jumps the form makes instead of
  // performing them. The dropdown scrolling its own highlighted option into
  // view is expected, so only the form panel counts here.
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
    if (this.id === "book") scrolls += 1;
  };
  window.matchMedia ??= () =>
    ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) as unknown as MediaQueryList;
  arriveAt("/");
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  arriveAt("/");
  document.body.innerHTML = "";
});

describe("booking form reached through a service deep link", () => {
  it("starts on the service named in the address bar", () => {
    arriveAt(`#book-${HEATER}`);
    mount();
    expect(shownService()).toContain("Water heater repair");
    expect(scrolls).toBe(1);
  });

  it("lets the visitor switch service, and keeps that choice without jumping the page", () => {
    arriveAt(`#book-${DRAIN}`);
    mount();
    expect(shownService()).toContain("Drain cleaning");
    const scrollsBeforePicking = scrolls;

    act(() => document.querySelector<HTMLElement>('[role="combobox"]')?.click());
    act(() => option("Water heater repair")?.click());

    // The address bar still names Drain cleaning; the visitor's pick wins.
    expect(shownService()).toContain("Water heater repair");
    expect(scrolls).toBe(scrollsBeforePicking);
  });
});
