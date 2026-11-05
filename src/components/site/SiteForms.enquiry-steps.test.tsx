// @vitest-environment jsdom
/** CG-15: the two-step enquiry form (what you need + how soon, then contact). */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sent: Record<string, unknown>[] = [];
vi.mock("@tanstack/react-start", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-start")>()),
  useServerFn: () => async ({ data }: { data: Record<string, unknown> }) => {
    sent.push(data);
    return { ok: true };
  },
}));
vi.mock("@/lib/public-site.functions", () => ({
  submitPublicLead: async () => ({ ok: true }),
  trackPublicEvent: async () => ({}),
}));

const { EnquiryForm } = await import("@/components/site/SiteForms");
type Props = Parameters<typeof EnquiryForm>[0];

const DRAIN = "11111111-1111-4111-8111-111111111111";
const HEATER = "22222222-2222-4222-8222-222222222222";
const service = (id: string, name: string) => ({ id, name, description: "", price: null, starting_price: null, duration_minutes: 60, bookable: false, featured: false, sort_order: 0 });
const siteWith = (services: unknown[]) =>
  ({ slug: "harbor-line", org: { id: "o", name: "Harbor Line Plumbing", slug: "harbor-line" }, profile: null, services }) as unknown as Props["site"];

let root: Root | null = null;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  window.matchMedia ??= () =>
    ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) as unknown as MediaQueryList;
  sent.length = 0;
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

function mount(site: Props["site"]) {
  act(() => {
    root = createRoot(document.body);
    root.render(<EnquiryForm site={site} />);
  });
}
const form = () => document.getElementById("contact-form") as HTMLFormElement;
const button = (label: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label)!;
const setValue = (name: string, value: string) => {
  const el = form().querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLTextAreaElement;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
};
const submit = async () => {
  await act(async () => {
    form().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
};

describe("two-step enquiry form", () => {
  it("keeps the single-step form when there is one service", () => {
    mount(siteWith([service(DRAIN, "Drain cleaning")]));
    expect(form().getAttribute("data-rv-enquiry-step")).toBeNull();
    expect(form().querySelector('[name="name"]')).not.toBeNull();
  });

  it("asks what and how soon first, with the spam guard already in the form", () => {
    mount(siteWith([service(DRAIN, "Drain cleaning"), service(HEATER, "Water heater repair")]));
    expect(form().getAttribute("data-rv-enquiry-step")).toBe("need");
    expect(document.body.textContent).toContain("Step 1 of 2");
    expect(form().querySelector('[name="name"]')).toBeNull();
    expect(form().querySelector('[name="company_website"]')).not.toBeNull();
    expect(button("Drain cleaning")).toBeTruthy();
    expect(button("Not sure yet")).toBeTruthy();
  });

  it("carries the service and timing into the lead", async () => {
    mount(siteWith([service(DRAIN, "Drain cleaning"), service(HEATER, "Water heater repair")]));
    act(() => button("Water heater repair").click());
    act(() => button("As soon as possible").click());
    expect(button("Water heater repair").getAttribute("aria-pressed")).toBe("true");
    await submit();
    expect(form().getAttribute("data-rv-enquiry-step")).toBe("contact");
    expect(document.body.textContent).toContain("Water heater repair · As soon as possible");
    expect(form().querySelector('[name="company_website"]')).not.toBeNull();
    setValue("name", "Pat Visitor");
    setValue("email", "pat@example.com");
    setValue("message", "No hot water since Monday");
    await submit();
    const leads = sent.filter((data) => "kind" in data);
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({
      kind: "inquiry",
      serviceId: HEATER,
      serviceInterest: "Water heater repair",
      message: "No hot water since Monday\n\nTiming: As soon as possible",
      companyWebsite: "",
    });
  });

  it("lets the visitor go back and change their answer", async () => {
    mount(siteWith([service(DRAIN, "Drain cleaning"), service(HEATER, "Water heater repair")]));
    await submit();
    expect(document.body.textContent).toContain("Not sure yet");
    act(() => button("Change").click());
    expect(form().getAttribute("data-rv-enquiry-step")).toBe("need");
  });
});
