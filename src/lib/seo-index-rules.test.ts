import { describe, expect, it } from "vitest";
import { Route as ShareRoute } from "@/routes/share";
import { Route as DemoDashboardRoute } from "@/routes/demo.dashboard";
import { Route as LocalStateRoute } from "@/routes/local.$industry.$state";
import { localPageContent } from "@/lib/local-pages";

type Head = { meta?: Array<Record<string, string>>; links?: Array<Record<string, string>> };
const headOf = (route: unknown, args: unknown = {}): Head =>
  ((route as { options: { head: (a: unknown) => Head } }).options.head(args));
const robots = (head: Head) => head.meta?.find((m) => m["name"] === "robots")?.["content"];

describe("index rules", () => {
  it("keeps /share and /demo/dashboard out of the index", () => {
    expect(robots(headOf(ShareRoute))).toMatch(/noindex/);
    expect(robots(headOf(DemoDashboardRoute))).toMatch(/noindex/);
  });

  it("makes each /local/<category>/<state> page canonical to itself, not to /local/<category>", () => {
    const content = localPageContent("hvac", "tennessee");
    expect(content).not.toBeNull();
    const head = headOf(LocalStateRoute, { match: { context: { content } } });
    const canonical = head.links?.find((l) => l["rel"] === "canonical")?.["href"] ?? "";
    expect(canonical.endsWith("/local/hvac/tennessee")).toBe(true);
  });
});
