/**
 * Plain text of an HTML document or fragment, for reading, searching and
 * counting — never for rendering. A single character walk instead of tag
 * regexes (which CodeQL rightly flags as bypassable):
 *
 * - everything inside a tag is dropped, as are comments; a "<" that opens no
 *   tag ("5 < 6", or one with no ">" after it) is kept as text;
 * - the contents of script, style, noscript, template and svg are skipped,
 *   whatever their closing tag looks like (`</script >`, `</SCRIPT\n>`), and
 *   an unterminated one swallows the rest of the input;
 * - block tags (br, p, div, li, h1–h6, tr) become line breaks;
 * - entities are decoded in ONE pass, so "&amp;lt;" reads as the text "&lt;";
 * - whitespace is collapsed.
 *
 * Because entities are decoded, the result may contain "<" or "&" as plain
 * text. Callers must treat it as text (escape it if it is ever shown as HTML).
 */

export type HtmlToTextOptions = {
  /**
   * "inline" (default): every whitespace run, line breaks included, becomes
   * one space and the result is trimmed. "lines": spaces and tabs collapse,
   * line breaks are kept, each line is trimmed and blank runs are capped at
   * one empty line.
   */
  whitespace?: "inline" | "lines";
  /** Cut the collapsed text to at most this many characters. */
  maxLength?: number;
};

const SKIPPED = new Set(["script", "style", "noscript", "template", "svg"]);
const BLOCK = new Set(["br", "p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr"]);

const NAMED: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  copy: "©",
  reg: "®",
  trade: "™",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  sbquo: "‚",
  ldquo: "“",
  rdquo: "”",
  bdquo: "„",
  laquo: "«",
  raquo: "»",
  bull: "•",
  middot: "·",
  deg: "°",
  times: "×",
  divide: "÷",
  euro: "€",
  pound: "£",
  cent: "¢",
  yen: "¥",
  sect: "§",
  para: "¶",
  shy: "",
  zwj: "",
  zwnj: "",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
};

const ENTITY = /&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z][a-zA-Z0-9]{1,31});/g;
// The tag name right after "<" (or "</"). Only a short prefix of the tag is
// inspected, so a huge attribute list never costs more than one scan.
const TAG_NAME = /^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)/;

function decodeEntity(entity: string, body: string): string {
  if (body[0] === "#") {
    const hex = body[1] === "x" || body[1] === "X";
    const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
    if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
      return "�";
    }
    // nbsp written numerically reads as a plain space, like &nbsp;.
    return code === 0xa0 ? " " : String.fromCodePoint(code);
  }
  return NAMED[body] ?? NAMED[body.toLowerCase()] ?? entity;
}

/** Decodes common named, decimal and hex entities in a single pass. */
export function decodeHtmlEntities(text: string): string {
  return text.replace(ENTITY, decodeEntity);
}

/** A tag starts at "<" only when a letter, "/", "!" or "?" follows (as in browsers). */
function startsTag(next: string | undefined): boolean {
  return next !== undefined && /[a-zA-Z/!?]/.test(next);
}

export function htmlToText(html: string, options: HtmlToTextOptions = {}): string {
  let out = "";
  let index = 0;
  let skipUntil: string | null = null;
  const length = html.length;

  while (index < length) {
    if (skipUntil) {
      // Raw-text body (script, style…): nothing inside is a tag or comment, so
      // "i<n" or "'<!--'" in minified code can't end or extend the skip. Jump
      // straight to the matching end tag; an unterminated body hides the rest.
      const endTag = new RegExp(`<${skipUntil.replace("/", "\\/")}(?=[\\s/>])`, "gi");
      endTag.lastIndex = index;
      const found = endTag.exec(html);
      if (!found) break;
      const close = html.indexOf(">", found.index + found[0].length);
      if (close === -1) break;
      index = close + 1;
      skipUntil = null;
      out += " ";
      continue;
    }
    let open = html.indexOf("<", index);
    // A "<" that cannot open a tag ("5 < 6", "a<-b") is ordinary text.
    while (open !== -1 && !startsTag(html[open + 1])) open = html.indexOf("<", open + 1);
    if (open === -1) {
      out += html.slice(index);
      break;
    }
    out += html.slice(index, open);

    if (html.startsWith("<!--", open)) {
      const end = html.indexOf("-->", open + 4);
      if (end === -1) break;
      index = end + 3;
      continue;
    }

    const close = html.indexOf(">", open + 1);
    if (close === -1) {
      // No ">" anywhere after it, so this "<" opens nothing: keep the rest as
      // text, exactly as tag regexes did.
      out += html.slice(open);
      break;
    }
    const match = TAG_NAME.exec(html.slice(open, Math.min(close + 1, open + 64)));
    const name = match ? `${match[1] ?? ""}${(match[2] ?? "").toLowerCase()}` : "";
    index = close + 1;

    if (SKIPPED.has(name)) {
      // A self-closing <svg/> has no body to skip.
      if (html[close - 1] !== "/") skipUntil = `/${name}`;
      out += " ";
    } else if (BLOCK.has(name.replace(/^\//, ""))) {
      out += "\n";
    } else {
      out += " ";
    }
  }

  let text = decodeHtmlEntities(out);
  if (options.whitespace === "lines") {
    text = text
      .replace(/[^\S\n]+/g, " ")
      .replace(/ ?\n ?/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } else {
    text = text.replace(/\s+/g, " ").trim();
  }
  return options.maxLength !== undefined ? text.slice(0, options.maxLength) : text;
}
