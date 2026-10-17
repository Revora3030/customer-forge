import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { repoMap } from "@/lib/jarvis-repo.server";

describe("Jarvis's map of the codebase", () => {
  it("counts files per folder, two levels deep", () => {
    expect(repoMap(["package.json", "src/lib/a.ts", "src/lib/b.ts", "src/lib/ai/c.ts", "src/routes/x.tsx", "docs/readme.md"])).toEqual({
      "(root)": 1,
      "src/lib": 3,
      "src/routes": 1,
      docs: 1,
    });
  });

  it("reads GitHub with a token, caches the tree, and goes into every Jarvis prompt", () => {
    const repo = readFileSync("src/lib/jarvis-repo.server.ts", "utf8");
    expect(repo).toContain('process.env["REVORA_GITHUB_READ_TOKEN"] ?? process.env["REVORA_GITHUB_WRITE_TOKEN"]');
    expect(repo).toContain("Date.now() - snapshot.at < TREE_TTL_MS");
    const fns = readFileSync("src/lib/jarvis.functions.ts", "utf8");
    expect(fns).toContain("diagnostics, repository,");
    const agent = readFileSync("src/lib/jarvis-agent.server.ts", "utf8");
    expect(agent).toContain("bounded(await readFiles(action.paths, action.line), MAX_CODE_RESULT_CHARS)");
  });
});
