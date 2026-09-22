/**
 * Builder styling must be expressive but never injectable: colours, URLs and
 * every option are validated against closed lists before becoming CSS.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_BLOCK_STYLE,
  blockCss,
  readBlockStyle,
  safeColor,
  safeImageUrl,
  writeBlockStyle,
} from "@/lib/site-style";

describe("safeColor", () => {
  it("accepts hex and safe named colours", () => {
    expect(safeColor("#FFD700")).toBe("#ffd700");
    expect(safeColor("#fff")).toBe("#fff");
    expect(safeColor("red")).toBe("#dc2626");
    expect(safeColor("Navy")).toBe("#172554");
    expect(safeColor("expression(alert(1))")).toBeNull();
    expect(safeColor("#fff; background:url(javascript:alert(1))")).toBeNull();
  });
});

describe("safeImageUrl", () => {
  it("accepts http(s) and internal paths, rejects script URLs", () => {
    expect(safeImageUrl("https://cdn.example.com/a.jpg")).toBe("https://cdn.example.com/a.jpg");
    expect(safeImageUrl("/media/a.jpg")).toBe("/media/a.jpg");
    expect(safeImageUrl("javascript:alert(1)")).toBeNull();
    expect(safeImageUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
  });
});

describe("readBlockStyle / writeBlockStyle", () => {
  it("falls back to defaults for unknown values", () => {
    expect(readBlockStyle({ style: { size: "gigantic", align: "justify" } })).toEqual(
      DEFAULT_BLOCK_STYLE,
    );
    expect(readBlockStyle(null)).toEqual(DEFAULT_BLOCK_STYLE);
  });

  it("round-trips a valid change and keeps unrelated settings", () => {
    const next = writeBlockStyle({ effect: "glass" }, { align: "center", textColor: "#112233" });
    expect(next["effect"]).toBe("glass");
    const read = readBlockStyle(next);
    expect(read.align).toBe("center");
    expect(read.textColor).toBe("#112233");
  });

  it("accepts precise values inside safe visual ranges", () => {
    const style = readBlockStyle(writeBlockStyle({}, {
      size: 37,
      lineHeight: 1.22,
      gap: 27,
      padTop: 73,
      marginTop: -12,
      maxWidth: 1180,
      radius: 18,
      borderWidth: 3,
      opacity: 94,
    }));
    expect(style).toMatchObject({
      size: 37,
      lineHeight: 1.22,
      gap: 27,
      padTop: 73,
      marginTop: -12,
      maxWidth: 1180,
      radius: 18,
      borderWidth: 3,
      opacity: 94,
    });
  });

  it("drops unsafe values on write", () => {
    const next = writeBlockStyle({}, {
      textColor: "url(javascript:alert(1))",
      bgImage: "javascript:alert(1)",
    } as never);
    const read = readBlockStyle(next);
    expect(read.textColor).toBeNull();
    expect(read.bgImage).toBeNull();
  });
});

describe("blockCss", () => {
  it("emits nothing when nothing was chosen", () => {
    expect(blockCss(DEFAULT_BLOCK_STYLE)).toEqual({});
  });

  it("encodes background image URLs so quotes cannot break out", () => {
    const css = blockCss(readBlockStyle({ style: { bgImage: 'https://x.test/a b".jpg' } }));
    expect(String(css.backgroundImage ?? "")).not.toContain('".jpg"');
  });
});
