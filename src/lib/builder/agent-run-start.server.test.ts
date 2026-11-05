import { describe, expect, it, vi } from "vitest";
import { startChatAgentRun, type ChatRunDeps } from "./agent-run-start.server";

const input = {
  organizationId: "org-1",
  userId: "user-1",
  instruction: "Send review requests to last week's customers",
  hasAttachments: false,
};
const deps = (
  over: Partial<ChatRunDeps> = {},
): ChatRunDeps & { createRun: ReturnType<typeof vi.fn> } =>
  ({
    enabled: () => true,
    killSwitchOn: () => false,
    createRun: vi.fn(async () => ({ id: "run-1" })),
    ...over,
  }) as never;

describe("startChatAgentRun", () => {
  it("starts a run for business work and says only what happened", async () => {
    const d = deps();
    const result = await startChatAgentRun(input, d);
    expect(result).toMatchObject({ kind: "started", runId: "run-1" });
    expect(d.createRun).toHaveBeenCalledWith({
      organizationId: "org-1",
      userId: "user-1",
      goal: input.instruction,
    });
  });

  it("never starts a run for a website edit; the site planner keeps it", async () => {
    const d = deps();
    expect(
      await startChatAgentRun({ ...input, instruction: "Change the hero headline" }, d),
    ).toEqual({ kind: "site" });
    expect(d.createRun).not.toHaveBeenCalled();
  });

  it("changes nothing when the agent loop is off", async () => {
    const d = deps({ enabled: () => false });
    expect(await startChatAgentRun(input, d)).toEqual({ kind: "site" });
    expect(d.createRun).not.toHaveBeenCalled();
  });

  it("refuses plainly when the global kill switch is on", async () => {
    const d = deps({ killSwitchOn: () => true });
    const result = await startChatAgentRun(input, d);
    expect(result.kind).toBe("refused");
    expect(d.createRun).not.toHaveBeenCalled();
  });

  it("refuses plainly, without falling back to the site planner, when the run cannot be created", async () => {
    const d = deps({
      createRun: vi.fn(async () => {
        throw new Error("db down");
      }),
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await startChatAgentRun(input, d);
    spy.mockRestore();
    expect(result).toMatchObject({ kind: "refused" });
    expect((result as { reply: string }).reply).toMatch(/nothing was sent/i);
  });
});
