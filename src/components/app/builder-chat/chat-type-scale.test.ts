/**
 * ds-11: chat text never drops below 12px (text-xs). Arbitrary 8–11.5px
 * sizes were the main legibility problem on a phone.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const chatFiles = [
  "src/components/app/BuilderAssistant.tsx",
  "src/components/app/BuilderShell.tsx",
  ...readdirSync("src/components/app/builder-chat")
    .filter((name) => name.endsWith(".tsx") && !name.endsWith(".test.tsx"))
    .map((name) => `src/components/app/builder-chat/${name}`),
];

describe("builder chat type scale", () => {
  it.each(chatFiles)("%s has no text below 12px", (path) => {
    const source = readFileSync(path, "utf8");
    expect(source.match(/text-\[(8|9|10|11)(\.5)?px\]/g) ?? []).toEqual([]);
  });

  it("keeps the composer at 16px so iOS never zooms on focus", () => {
    expect(readFileSync("src/components/app/BuilderAssistant.tsx", "utf8")).toContain("text-[16px]");
    expect(readFileSync("src/components/app/builder-workspace.css", "utf8")).toContain("#website-assistant textarea { font-size: 16px; }");
  });
});
