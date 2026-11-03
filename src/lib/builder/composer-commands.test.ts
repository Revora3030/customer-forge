import { describe, expect, it } from "vitest";
import {
  COMPOSER_COMMANDS,
  LAYOUT_ONLY_INSTRUCTION,
  applyItem,
  expandMentions,
  findTrigger,
  isLayoutImage,
  itemsFor,
  withLayoutInstruction,
} from "./composer-commands";

describe("composer triggers", () => {
  it("opens the command menu only for a leading slash", () => {
    expect(findTrigger("/", 1)).toMatchObject({ kind: "command", query: "" });
    expect(findTrigger("/se", 3)).toMatchObject({ kind: "command", query: "se" });
    expect(findTrigger("add /seo", 8)).toBeNull();
    expect(findTrigger("/seo now", 8)).toBeNull();
    expect(findTrigger("https://x.com/a", 15)).toBeNull();
  });

  it("opens mentions at the start of a word and not inside an email", () => {
    expect(findTrigger("fix @Pa", 7)).toMatchObject({ kind: "mention", query: "pa", start: 4 });
    expect(findTrigger("@", 1)).toMatchObject({ kind: "mention", query: "" });
    expect(findTrigger("mail me@example", 15)).toBeNull();
  });

  it("filters by prefix and lists all five commands and three chips", () => {
    expect(COMPOSER_COMMANDS.map((c) => c.label)).toEqual(["/page", "/theme", "/seo", "/revert", "/lead-test"]);
    expect(itemsFor({ kind: "command", query: "", start: 0, end: 1 })).toHaveLength(5);
    expect(itemsFor({ kind: "command", query: "le", start: 0, end: 3 }).map((i) => i.id)).toEqual(["lead-test"]);
    expect(itemsFor({ kind: "mention", query: "", start: 0, end: 1 }).map((i) => i.label)).toEqual(["@Pages", "@Forms", "@Brand"]);
    expect(itemsFor({ kind: "mention", query: "zz", start: 0, end: 3 })).toEqual([]);
  });
});

describe("applying a choice", () => {
  it("replaces the slash token with the template and puts the caret after it", () => {
    const trigger = findTrigger("/pa", 3)!;
    const seo = COMPOSER_COMMANDS.find((c) => c.id === "page")!;
    const out = applyItem("/pa", trigger, seo);
    expect(out.value).toBe("Add a new page for ");
    expect(out.caret).toBe(out.value.length);
  });

  it("keeps text after the caret when inserting a chip", () => {
    const value = "fix @Br the footer";
    const trigger = findTrigger(value, 7)!;
    const chip = itemsFor(trigger)[0]!;
    expect(applyItem(value, trigger, chip)).toEqual({ value: "fix @Brand the footer", caret: 11 });
  });
});

describe("mention scope", () => {
  it("adds one scope line and invents nothing", () => {
    expect(expandMentions("update @Pages and @Brand")).toBe(
      "[Scope: only touch the site's pages and the brand (name, logo, colours, fonts and tone of voice).] update @Pages and @Brand",
    );
    expect(expandMentions("change @pages @PAGES")).toContain("only touch the site's pages.]");
  });
  it("leaves ordinary text and unknown @words alone", () => {
    expect(expandMentions("ask me@example.com and @someone")).toBe("ask me@example.com and @someone");
  });
});

describe("layout-only image drop", () => {
  it("accepts still images only", () => {
    expect(isLayoutImage({ type: "image/png" })).toBe(true);
    expect(isLayoutImage({ type: "video/mp4" })).toBe(false);
    expect(isLayoutImage({ type: "application/pdf" })).toBe(false);
  });
  it("asks for structure and forbids copying, once, without overwriting typed words", () => {
    expect(LAYOUT_ONLY_INSTRUCTION).toMatch(/layout reference only/);
    expect(LAYOUT_ONLY_INSTRUCTION).toMatch(/Do not copy any of its words/);
    const once = withLayoutInstruction("make it like this");
    expect(once.startsWith("make it like this")).toBe(true);
    expect(withLayoutInstruction(once)).toBe(once);
    expect(withLayoutInstruction("")).toBe(LAYOUT_ONLY_INSTRUCTION);
  });
});
