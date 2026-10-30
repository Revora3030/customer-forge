import { describe, expect, it } from "vitest";
import { siteThemeStyle } from "@/lib/site-theme";
import { contrastRatio } from "@/lib/readable-color";
import { CINEMATIC_CSS } from "@/components/site/cinematic-css";

const vars = (input: Parameters<typeof siteThemeStyle>[0]) => (siteThemeStyle(input) ?? {}) as Record<string, string>;

describe("--primary-ink: brand colour as readable text", () => {
  it("darkens a pale brand on a white page until it passes AA, keeping --primary untouched", () => {
    const theme = vars({ primaryColor: "#f5c518" });
    expect(theme["--primary"]).toBe("#f5c518");
    expect(contrastRatio("#f5c518", theme["--background"]!)!).toBeLessThan(4.5);
    expect(contrastRatio(theme["--primary-ink"]!, theme["--background"]!)!).toBeGreaterThanOrEqual(4.5);
  });

  it("lightens a dark brand on a dark surface until it passes AA", () => {
    const theme = vars({ primaryColor: "#1d3557", secondaryColor: "#0b0c10" });
    expect(contrastRatio(theme["--primary-ink"]!, theme["--background"]!)!).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps an already-readable brand exactly as authored", () => {
    const theme = vars({ primaryColor: "#0b5394" });
    expect(theme["--primary-ink"]).toBe("#0b5394");
  });

  it("falls back to the page ink when there is no brand colour", () => {
    const theme = vars({});
    expect(theme["--primary-ink"]).toBe(theme["--foreground"]);
  });

  it("dial_selector option label uses the readable ink, with the old fallbacks kept", () => {
    expect(String(CINEMATIC_CSS)).toContain("color:var(--primary-ink,var(--primary,currentColor))");
  });
});
