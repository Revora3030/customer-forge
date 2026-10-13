import { describe, expect, it } from "vitest";

import { inspectHtml } from "@/lib/agent/verify";

function placeholderCheck(markup: string) {
  const html = `<h1>Our services</h1><p>${"Verified business content. ".repeat(30)}</p>${markup}`;
  return inspectHtml(html, "/markup-regression").checks.find(
    (check) => check.label === "No draft or placeholder text is showing",
  );
}

for (const tag of ["script", "style"] as const) {
  describe(`${tag} text extraction`, () => {
    it.each([">", " >", "\t>", "\n>", ' data-test="x">'])(
      "excludes raw text with closing suffix %j",
      (ending) => {
        expect(placeholderCheck(`<${tag}>lorem ipsum hidden</${tag}${ending}`)).toMatchObject({
          ok: true,
        });
      },
    );

    it("does not hide visible content inside similarly named custom elements", () => {
      const markup = `<${tag}-widget>lorem ipsum visible</${tag}-widget><${tag}>hidden</${tag}>`;
      expect(placeholderCheck(markup)).toMatchObject({ ok: false });
    });

    it("does not treat a similarly named closing tag as the raw-text end", () => {
      const markup = `<${tag}>hidden</${tag}-widget>lorem ipsum hidden</${tag}>`;
      expect(placeholderCheck(markup)).toMatchObject({ ok: true });
    });
  });
}
