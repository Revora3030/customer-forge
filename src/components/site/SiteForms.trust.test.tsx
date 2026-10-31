// @vitest-environment jsdom
/**
 * Trust copy on the public lead forms: time zone wording, the consent line,
 * and the phone-or-email hint.
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

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  window.matchMedia ??= () =>
    ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) as unknown as MediaQueryList;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

function mount() {
  act(() => {
    root = createRoot(document.body);
    root.render(<BookingForm site={site} />);
  });
}

describe("lead form trust copy and errors", () => {
  it("names the business's local time, never the visitor's device", () => {
    mount();
    const text = document.body.textContent ?? "";
    expect(text).toContain("Times are in Harbor Line Plumbing's local time");
    expect(text).not.toMatch(/device's local time|your local time/i);
  });

  it("shows the consent line under the submit button", () => {
    mount();
    expect(document.body.textContent).toContain("We'll only use your details to reply to your request.");
    expect(document.body.textContent).not.toMatch(/you agree/i);
  });

  it("explains that phone or email is needed", () => {
    mount();
    expect(document.body.textContent).toContain("Phone or email — at least one, so we can reply.");
  });

  it("reports a problem inline as an alert instead of a vanishing toast", () => {
    mount();
    const form = document.getElementById("book") as HTMLFormElement;
    act(() => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    const alert = document.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Choose a preferred date.");
  });

  it("does not mark phone and email invalid for a non-contact problem", () => {
    mount();
    const form = document.getElementById("book") as HTMLFormElement;
    act(() => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Choose a preferred date.");
    expect(document.querySelector('input[name="phone"]')?.hasAttribute("aria-invalid")).toBe(false);
    expect(document.querySelector('input[name="email"]')?.hasAttribute("aria-invalid")).toBe(false);
  });
});
