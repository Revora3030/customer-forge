import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLAUDE_CODE_LABEL, claudeCodeBody, claudeCodeTitle } from "@/lib/jarvis-claude-code.server";

describe("Claude Code requests from Jarvis", () => {
  it("titles the issue from the first line and keeps the full request in the body", () => {
    expect(claudeCodeTitle("Add a pricing FAQ\nwith schema")).toBe("Add a pricing FAQ");
    expect(claudeCodeTitle("x".repeat(200))).toHaveLength(88);
    const body = claudeCodeBody("Add a pricing FAQ\nwith schema", "owner@example.com");
    expect(body.startsWith("Add a pricing FAQ\nwith schema")).toBe(true);
    expect(body).toContain("pull request into lovable-sync");
  });

  it("is super-admin only and audited", () => {
    const fns = readFileSync("src/lib/jarvis.functions.ts", "utf8");
    const send = fns.slice(fns.indexOf("export const sendClaudeCodeRequestFn"));
    expect(send).toContain("await guardedAdmin(context);");
    expect(send).toContain('action: "jarvis.claude_code.requested"');
    expect(fns.slice(fns.indexOf("export const listClaudeCodeRequestsFn"))).toContain("await guardedAdmin(context);");
  });

  it("only lets the repo's own people start Claude Code, on the label Jarvis sets", () => {
    const workflow = readFileSync(".github/workflows/claude-code.yml", "utf8");
    expect(workflow).toContain(`github.event.label.name == '${CLAUDE_CODE_LABEL}'`);
    expect(workflow.match(/\["OWNER","MEMBER","COLLABORATOR"\]/g)).toHaveLength(2);
    expect(workflow).toContain("anthropics/claude-code-action@v1");
  });
});
