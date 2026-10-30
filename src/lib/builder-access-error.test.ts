import { describe, expect, it } from "vitest";
import { builderAccessBlock } from "./builder-access-error";
import { friendlyError } from "./user-error";
import { newTask, updateTask } from "./builder-queue";

describe("access-aware builder failure recovery", () => {
  it.each([
    ["Your free access has ended and everything you built is saved.", "expired"],
    ["Your subscription is canceled, so your work is saved but locked.", "canceled"],
    ["Your subscription is cancelled.", "canceled"],
    ["This workspace is suspended. Contact support.", "suspended"],
    ["Authentication required", "authentication"],
    ["ACCESS_DENIED: You do not have access to this organization", "permission"],
  ])("marks %s non-retryable without changing authorization", (message, kind) => {
    expect(builderAccessBlock(message)).toMatchObject({ kind, retryable: false });
    const task = newTask("Change the home page");
    const [failed] = updateTask([task], task.id, { state: "failed", error: friendlyError(new Error(message)), retryable: true });
    expect(failed).toMatchObject({ state: "failed", retryable: false });
    expect(failed?.instruction).toBe(task.instruction);
    expect(task.state).toBe("queued");
  });
  it("tells support staff how to get build access instead of a dead-end permission error", () => {
    const block = builderAccessBlock("You don't have permission to do that in this workspace.");
    expect(block).toMatchObject({ kind: "permission", retryable: false });
    expect(block?.message).toMatch(/manager access/);
    expect(block?.message).toMatch(/support session/);
  });
  it("keeps an actionable expired-access explanation when a long server message is sanitized", () => {
    const error = new Error("Your free access has ended and everything you built is saved. " + "Billing details. ".repeat(30));
    expect(friendlyError(error, "Please try again.")).toBe("Your free access has ended. Your work is saved. Open Billing to restore access.");
  });
  it.each(["Failed to fetch", "Load failed", "The request timed out", "Provider quota exceeded", "We couldn't verify your workspace."])("does not misclassify %s as an expired trial", (message) => {
    expect(builderAccessBlock(message)).toBeNull();
    const task = newTask("Change the home page");
    expect(updateTask([task], task.id, { state: "failed", error: message, retryable: true })[0]?.retryable).toBe(true);
  });
  it("keeps internal errors hidden and ordinary safe messages unchanged", () => {
    expect(friendlyError(new Error('column secret_key violates constraint'), "Couldn't save.")).toBe("Couldn't save.");
    expect(friendlyError(new Error("That address is already taken."))).toBe("That address is already taken.");
    expect(friendlyError({ message: "Your session has expired. JWT private-token" })).not.toContain("private-token");
  });
  it("does not prevent fresh requests after access is restored", () => {
    const task = newTask("Change the home page");
    const [failed] = updateTask([task], task.id, { state: "failed", error: "Your free access has ended.", retryable: true });
    const [queued] = updateTask([failed!], task.id, { state: "queued", error: "", retryable: true });
    expect(queued).toMatchObject({ state: "queued", retryable: true });
  });
});
