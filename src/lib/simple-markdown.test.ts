import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown } from "./simple-markdown";

describe("parseMarkdown", () => {
  it("parses the blocks Jarvis replies use", () => {
    const blocks = parseMarkdown(
      [
        "## 6️⃣ Quick-copy drafts",
        "",
        "Intro with **bold** and *italic*.",
        "",
        "- first",
        "- second",
        "",
        "1. one",
        "2. two",
        "",
        "```",
        "Subject: A free website",
        "## not a heading",
        "```",
        "",
        "---",
        "> quoted",
      ].join("\n"),
    );
    expect(blocks.map((block) => block.type)).toEqual(["heading", "paragraph", "list", "list", "code", "rule", "quote"]);
    expect(blocks[0]).toMatchObject({ type: "heading", level: 2 });
    expect(blocks[3]).toMatchObject({ type: "list", ordered: true, start: 1 });
    expect(blocks[4]).toMatchObject({ type: "code", text: "Subject: A free website\n## not a heading" });
  });

  it("closes an unterminated code fence at the end of the reply", () => {
    expect(parseMarkdown("```\nhello")).toEqual([{ type: "code", lang: "", text: "hello" }]);
  });
});

describe("parseInline", () => {
  it("handles emphasis, code and safe links", () => {
    expect(parseInline("a **b** *c* `d`")).toEqual([
      { type: "text", text: "a " },
      { type: "strong", children: [{ type: "text", text: "b" }] },
      { type: "text", text: " " },
      { type: "em", children: [{ type: "text", text: "c" }] },
      { type: "text", text: " " },
      { type: "code", text: "d" },
    ]);
    expect(parseInline("[site](https://example.com)")[0]).toMatchObject({ type: "link", href: "https://example.com" });
  });

  it("never turns unsafe links or raw HTML into markup", () => {
    expect(parseInline("[x](javascript:alert(1))")[0]).toMatchObject({ type: "text" });
    expect(parseInline("<script>alert(1)</script>")).toEqual([{ type: "text", text: "<script>alert(1)</script>" }]);
  });

  it("leaves snake_case names alone", () => {
    expect(parseInline("jarvis_messages and site_settings")).toEqual([{ type: "text", text: "jarvis_messages and site_settings" }]);
  });
});
