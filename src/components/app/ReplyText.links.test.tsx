import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReplyText } from "./ReplyText";

const html = (text: string) => renderToStaticMarkup(<ReplyText text={text} />);
const site = ["https:", "", "example.com", "s", "acme"].join("/");

describe("builder chat replies render links cleanly", () => {
  it("turns a markdown link into one link with its label (no stray brackets)", () => {
    const out = html(`Your draft is ready: [Open your site](${site}).`);
    expect(out).toContain(`href="${site}"`);
    expect(out).toContain(">Open your site</a>");
    expect(out).not.toContain("[Open your site]");
    expect(out).not.toContain("](");
    expect(out).toMatch(/<\/a>\.<\/p>|<\/a>\./);
  });

  it("keeps mailto/tel markdown links in the same tab and drops unsafe schemes", () => {
    const mail = html("[Email us](mailto:hi@example.com) or [call](tel:+19195550100)");
    expect(mail).toContain('href="mailto:hi@example.com"');
    expect(mail).toContain('href="tel:+19195550100"');
    expect(mail).not.toMatch(/href="mailto:[^"]*"[^>]*target/);
    const bad = html("[click](javascript:alert(1))");
    expect(bad).not.toContain("href=");
  });

  it("keeps sentence punctuation after a bare URL as visible text", () => {
    const out = html(`Preview it here (${site}).`);
    expect(out).toContain(`href="${site}"`);
    expect(out).toMatch(/<\/a>\)\./);
  });

  it("only shows an ellipsis when the display text was actually cut", () => {
    expect(html(`See ${site}`)).not.toContain("…");
    const long = `${site}/${"a".repeat(80)}`;
    expect(html(`See ${long}`)).toContain("…");
  });

  it("still renders bold, code and plain text as before", () => {
    const out = html("**Done** — updated `hero` copy");
    expect(out).toContain("<strong");
    expect(out).toContain("<code");
  });
});
