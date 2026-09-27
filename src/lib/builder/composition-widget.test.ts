import { describe, expect, it } from "vitest";
import { validateComposition } from "./composition-tree";

describe("composition widgets", () => {
  it("author an AI-local theme and presentation without weakening widget safety", () => {
    const ok = validateComposition({
      version: 1,
      root: {
        type: "widget",
        text: "booking_form",
        widgetPresentation: {
          title: "Reserve your vehicle detail",
          description: "Choose the service and a time that works.",
          actionLabel: "Request this appointment",
          backLabel: "Change service",
          successTitle: "Request received",
          successBody: "The team will confirm your appointment.",
          fieldLabels: {
            service: "Detail package",
            name: "Name",
            phone: "Mobile",
            email: "Email",
            location: "Vehicle location",
            date: "Date",
            time: "Time",
            details: "Anything else about the vehicle?",
          },
          theme: {
            surface: "#f4efe7",
            text: "#1f2937",
            muted: "#475569",
            border: "#64748b",
            action: "#0f766e",
            actionText: "#ffffff",
            selected: "#dbeafe",
            selectedText: "#1e3a8a",
          },
        },
      },
    });
    expect(ok.ok).toBe(true);

    const badContrast = validateComposition({
      version: 1,
      root: {
        type: "widget",
        text: "booking_form",
        widgetPresentation: {
          title: "Book",
          theme: { surface: "#ffffff", text: "#ffffff" },
        },
      },
    });
    expect(badContrast.ok).toBe(false);
  });

  it("keeps supported widgets valid and rejects unknown widgets", () => {
    const ok = validateComposition({
      version: 1,
      root: {
        type: "stack",
        children: [{ type: "widget", text: "booking_form" }],
      },
    });
    expect(ok.ok).toBe(true);

    const bad = validateComposition({
      version: 1,
      root: { type: "widget", text: "fake_form" },
    });
    expect(bad.ok).toBe(false);
  });
});
