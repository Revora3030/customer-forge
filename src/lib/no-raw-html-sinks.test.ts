/**
 * Visitor- and owner-supplied text is rendered as React text (auto-escaped)
 * and emails are React Email templates, so the app has no raw-HTML sink for
 * user input today. This guard keeps it that way: any new
 * dangerouslySetInnerHTML / innerHTML / insertAdjacentHTML / document.write
 * must be reviewed and either render trusted, static markup or sanitize with
 * DOMPurify (Apache-2.0) in the browser first, then be added below with why.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "..");
const SINK = /dangerouslySetInnerHTML|\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|document\.write\(/;

/** Reviewed sinks: file -> reason. */
const REVIEWED: Record<string, string> = {
  "components/ui/chart.tsx": "shadcn chart: CSS variables built from the developer's static chart config, no user input",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && name !== "routeTree.gen.ts") out.push(path);
  }
  return out;
}

describe("no unreviewed raw-HTML sinks", () => {
  it("only the reviewed files write raw HTML", () => {
    const found = walk(SRC)
      .filter((file) => SINK.test(readFileSync(file, "utf8")))
      .map((file) => relative(SRC, file).split("\\").join("/"))
      .sort();
    expect(found).toEqual(Object.keys(REVIEWED).sort());
  });
});
