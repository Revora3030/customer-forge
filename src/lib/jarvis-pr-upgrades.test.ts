import { describe, expect, it } from "vitest";
import { appendReplyMeta, parseActions, splitReplyMeta, unknownPackageImports } from "./jarvis-actions";
import { claudeFixComment, claudeIssueBranch } from "./jarvis-claude-code.server";

const deps = new Set(["@tanstack/react-router", "react", "zod", "@supabase/supabase-js"]);

describe("unknownPackageImports", () => {
  it("catches the Astro + @sentry/node file Jarvis wrote for PR 299", () => {
    const file = "import type { APIRoute } from 'astro';\nimport * as Sentry from '@sentry/node';\nexport const GET: APIRoute = async () => new Response('ok');";
    expect(unknownPackageImports("", file, deps)).toEqual(["astro", "@sentry/node"]);
  });

  it("allows the app's own packages, aliases, relative paths and node builtins", () => {
    const file = [
      'import { createFileRoute } from "@tanstack/react-router";',
      'import { z } from "zod";',
      'import { x } from "@/lib/x";',
      'import { y } from "./y";',
      'import { createHash } from "node:crypto";',
      'const mod = await import("@supabase/supabase-js/dist/main");',
    ].join("\n");
    expect(unknownPackageImports("", file, deps)).toEqual([]);
  });

  it("only counts imports the change adds", () => {
    const before = 'import legacy from "left-pad";\n';
    expect(unknownPackageImports(before, `${before}const a = 1;`, deps)).toEqual([]);
    expect(unknownPackageImports(before, `${before}import b from "lodash";`, deps)).toEqual(["lodash"]);
  });
});

describe("claude.fix", () => {
  it("parses a pull request number and survives the reply meta round trip", () => {
    const parsed = parseActions([{ id: "claude.fix", args: { pr: 299, note: "CodeQL fails" } }], []);
    expect(parsed.proposals).toEqual([{ id: "claude.fix", pr: 299, note: "CodeQL fails" }]);
    expect(parseActions([{ id: "claude.fix", args: { pr: "abc" } }], []).rejected[0]).toMatch(/pull request number/);
    const stored = appendReplyMeta("Done.", { ran: [], proposals: parsed.proposals });
    expect(splitReplyMeta(stored).meta.proposals).toEqual(parsed.proposals);
  });

  it("asks Claude to fix named failing checks without force-pushing or skipping tests", () => {
    const text = claudeFixComment(["CodeQL", "Typecheck, lint, test, build"], "", "owner@example.com");
    expect(text.startsWith("@claude")).toBe(true);
    expect(text).toContain("CodeQL, Typecheck, lint, test, build");
    expect(text).toMatch(/no force-push/);
    expect(text).toMatch(/never skip or disable a test/);
    expect(claudeFixComment([], "", "x")).toMatch(/review comments/);
  });

  it("finds the newest branch Claude Code pushed for an issue", () => {
    expect(claudeIssueBranch(["claude/issue-7-20261019_0100", "claude/issue-7-20261019_0200", "claude/issue-70-1"], 7)).toBe(
      "claude/issue-7-20261019_0200",
    );
    expect(claudeIssueBranch(["claude/issue-70-1"], 7)).toBeNull();
  });
});
