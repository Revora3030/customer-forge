import { describe, expect, it } from "vitest";
import { decodeHtmlEntities, htmlToText } from "@/lib/html-text";

describe("htmlToText", () => {
  it("drops tags and collapses whitespace", () => {
    expect(htmlToText('<p class="a">Hello   <b>there</b>\n\n friend</p>')).toBe("Hello there friend");
  });

  it("skips script bodies whatever their closing tag looks like", () => {
    expect(htmlToText("a<script>alert(1)</script >b")).toBe("a b");
    expect(htmlToText("a<SCRIPT type=x>alert(1)</SCRIPT\n>b")).toBe("a b");
    expect(htmlToText("a<script>if (x < y) alert('</scrip>')</script\t\n bar>b")).toBe("a b");
  });

  it("swallows the rest of the input after an unterminated script", () => {
    expect(htmlToText("visible<script>alert('never closed'); <p>hidden</p>")).toBe("visible");
    expect(htmlToText("visible<script>alert(1)")).toBe("visible");
  });

  it("never lets a nested-looking tag reassemble into a script", () => {
    // "<scr<script>" is one (unknown) tag; what follows is plain text.
    const text = htmlToText("x<scr<script>ipt>alert(1)</script>y");
    expect(text).toBe("x ipt>alert(1) y");
    expect(text).not.toMatch(/<\s*script/i);
    expect(htmlToText("<<script>script>alert(1)</script>")).not.toMatch(/<\s*script/i);
  });

  it("skips style, noscript, template and svg contents", () => {
    const html =
      "<style>p{color:red}</style><noscript>enable js</noscript><template><p>tpl</p></template>" +
      '<svg viewBox="0 0 1 1"><title>icon</title><text>svgtext</text></svg><svg/>kept';
    expect(htmlToText(html)).toBe("kept");
  });

  it("drops comments, even ones containing tags or '>'", () => {
    expect(htmlToText("a<!-- <b>x</b> -> y > z -->b")).toBe("ab");
  });

  it("keeps a bare '<' that cannot open a tag", () => {
    expect(htmlToText("5 < 6 and 7 > 3")).toBe("5 < 6 and 7 > 3");
    expect(htmlToText("<p>Fast</p> <Cheap")).toBe("Fast <Cheap");
  });

  it("decodes entities in a single pass", () => {
    expect(htmlToText("<p>Sounds good &amp;lt;3</p>")).toBe("Sounds good &lt;3");
    expect(htmlToText("Tom &amp; Jerry &quot;live&quot; &copy; 2026&nbsp;&mdash; ok")).toBe(
      'Tom & Jerry "live" © 2026 — ok',
    );
    expect(decodeHtmlEntities("&unknown; &amp")).toBe("&unknown; &amp");
  });

  it("decodes decimal and hex numeric entities", () => {
    expect(htmlToText("What&#39;s &#x41;&#X42;&#67; &#128512; &#160;x")).toBe("What's ABC 😀 x");
    expect(htmlToText("&#0;&#xD800;&#x110000;")).toBe("���");
    expect(htmlToText("&#38;lt;")).toBe("&lt;");
  });

  it("turns block tags into line breaks in lines mode", () => {
    const html = "<h1>Title</h1><p>One</p><div>Two<br/>Three</div><ul><li>a</li><li>b</li></ul><table><tr><td>c</td></tr></table>";
    expect(htmlToText(html, { whitespace: "lines" })).toBe("Title\n\nOne\n\nTwo\nThree\n\na\n\nb\n\nc");
    expect(htmlToText(html)).toBe("Title One Two Three a b c");
  });

  it("collapses spaces but keeps line structure in lines mode", () => {
    expect(htmlToText("  a \t b <br>  c<br><br><br><br>d  ", { whitespace: "lines" })).toBe("a b\nc\n\nd");
  });

  it("truncates to maxLength after collapsing", () => {
    expect(htmlToText("<p>abc   def</p>", { maxLength: 5 })).toBe("abc d");
  });

  it("runs in linear time on very large and adversarial input", () => {
    const big = "<div><p>word &amp; more</p><script>x</script></div>".repeat(40_000);
    const adversarial = ["<a".repeat(200_000), "<script>".repeat(100_000), "<!--".repeat(100_000), "&#".repeat(200_000), "<".repeat(400_000)];
    const started = performance.now();
    expect(htmlToText(big).length).toBeGreaterThan(400_000);
    for (const input of adversarial) htmlToText(input);
    expect(performance.now() - started).toBeLessThan(2_000);
  });
});

describe("raw-text bodies", () => {
  it("never reads '<' inside a script or style as a tag or comment", () => {
    expect(htmlToText("<p>Hi</p><script>for(i=0;i<n;i++){}</script><p>Visible content here</p>")).toBe("Hi Visible content here");
    expect(htmlToText("<script>var s='<!--';</script><p>Visible</p>")).toBe("Visible");
    expect(htmlToText("<style>a>b{color:red}</style ><p>Shown</p>")).toBe("Shown");
    expect(htmlToText("<script>x='</scriptx>'</script><p>After</p>")).toBe("After");
  });
});
