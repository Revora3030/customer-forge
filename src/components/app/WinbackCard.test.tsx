import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WinbackView } from "./WinbackCard";
import type { WinbackCustomer } from "@/lib/winback";

const NOW = new Date("2026-10-27T12:00:00Z");
const customer = (over: Partial<WinbackCustomer> = {}): WinbackCustomer => ({
  id: "c1", name: "Maria Lopez", email: "m@example.com", phone: "555-010-0199", tags: [],
  created_at: "2025-01-01T00:00:00Z", last_appointment_at: "2026-02-01T00:00:00Z", next_appointment_at: null, ...over,
});

describe("WinbackView", () => {
  it("lists a quiet customer with text and email links the owner sends themselves", () => {
    const html = renderToStaticMarkup(<WinbackView customers={[customer()]} businessName="Northside Plumbing" now={NOW} onMark={() => undefined} />);
    expect(html).toContain("Maria Lopez");
    expect(html).toContain("Last seen 9 months ago");
    expect(html).toContain('href="sms:5550100199?&amp;body=');
    expect(html).toContain('href="mailto:m@example.com?subject=');
    expect(html).toContain("you press send");
    expect(html).toContain("Mark as messaged");
  });
  it("says so plainly when nobody has gone quiet, never inventing a list", () => {
    const html = renderToStaticMarkup(<WinbackView customers={[customer({ last_appointment_at: "2026-10-01T00:00:00Z" })]} businessName="N" now={NOW} />);
    expect(html).toContain("No customers have been quiet for 180 days");
    expect(html).not.toContain("Maria");
  });
});
