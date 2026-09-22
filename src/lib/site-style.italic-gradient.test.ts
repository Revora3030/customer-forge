import { describe, expect, it } from "vitest";
import { blockCss, blockRules, normalizeStyleInput, readBlockStyle } from "@/lib/site-style";
import { siteFontHasItalic, siteFontHref } from "@/lib/site-theme";

const settings = (patch: Record<string, unknown>, device = "desktop") => ({
  style: { [device]: patch },
});

describe("italic emphasis", () => {
  it("accepts an explicit italic flag and renders a real italic", () => {
    const style = readBlockStyle(settings({ italic: true }), "desktop");
    expect(style.italic).toBe(true);
    expect(blockCss(style).fontStyle).toBe("italic");
  });

  it("turns italic back off when the model asks for upright type", () => {
    const style = readBlockStyle(settings({ italic: false }), "desktop");
    expect(blockCss(style).fontStyle).toBe("normal");
  });

  it("understands fontStyle wording the model is likely to use", () => {
    expect(normalizeStyleInput({ fontStyle: "italic" })["italic"]).toBe(true);
    expect(normalizeStyleInput({ fontStyle: "normal" })["italic"]).toBe(false);
    expect(readBlockStyle(settings({ fontStyle: "italic" }), "desktop").italic).toBe(true);
  });

  it("ignores a nonsense italic value instead of guessing", () => {
    expect(readBlockStyle(settings({ italic: "sideways" }), "desktop").italic).toBeNull();
  });

  it("requests the italic face only for families that really have one", () => {
    expect(siteFontHasItalic("Playfair Display")).toBe(true);
    expect(siteFontHasItalic("Oswald")).toBe(false);
    expect(siteFontHref("Playfair Display")).toContain("ital,wght@");
    expect(siteFontHref("Oswald")).not.toContain("ital");
  });
});

describe("gradient backgrounds", () => {
  it("blends both stops at the requested angle", () => {
    const style = readBlockStyle(
      settings({ bgColor: "#0a0a0a", bgGradient: "#d4af37", bgGradientAngle: 135 }),
      "desktop",
    );
    expect(blockCss(style).backgroundImage).toBe("linear-gradient(135deg,#0a0a0a,#d4af37)");
  });

  it("defaults to a downward gradient when no angle is given", () => {
    const style = readBlockStyle(settings({ bgColor: "black", bgGradient: "gold" }), "desktop");
    expect(blockCss(style).backgroundImage).toBe("linear-gradient(180deg,#000000,#d4af37)");
  });

  it("reads a written direction as its angle", () => {
    expect(normalizeStyleInput({ gradientDirection: "to bottom right" })["bgGradientAngle"]).toBe(135);
    expect(normalizeStyleInput({ gradient: "#111111" })["bgGradient"]).toBe("#111111");
  });

  it("keeps a picture background ahead of a gradient", () => {
    const style = readBlockStyle(
      settings({
        bgImage: "https://example.com/car.jpg",
        bgColor: "#0a0a0a",
        bgGradient: "#d4af37",
      }),
      "desktop",
    );
    expect(String(blockCss(style).backgroundImage)).toContain("example.com/car.jpg");
  });

  it("rejects unsafe gradient values", () => {
    const style = readBlockStyle(
      settings({ bgGradient: "url(https://evil.test/x.css)", bgGradientAngle: 9000 }),
      "desktop",
    );
    expect(style.bgGradient).toBeNull();
    expect(style.bgGradientAngle).toBeNull();
  });

  it("emits a whole gradient in a phone-only override", () => {
    const css = blockRules("abc123", {
      style: {
        desktop: { bgColor: "#0a0a0a", bgGradient: "#d4af37", bgGradientAngle: 135 },
        mobile: { bgGradient: "#ffffff" },
      },
    });
    expect(css).toContain("linear-gradient(135deg,#0a0a0a,#ffffff)");
  });
});
