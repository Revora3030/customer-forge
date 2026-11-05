import { describe, expect, it } from "vitest";
import { JARVIS_ACTION_CLASSES } from "@/lib/jarvis-actions";
import {
  agentApprovalSafety,
  approvalSafety,
  isBulkApproveEligible,
  JARVIS_APPROVAL_FACTS,
  jarvisApprovalSafety,
  safetyLines,
} from "./approval-safety";

const approvable = Object.entries(JARVIS_ACTION_CLASSES).filter(([, cls]) => !cls.autoRuns);

describe("approval safety summary (JC-37)", () => {
  it("covers every action that needs approval, and nothing else", () => {
    expect(Object.keys(JARVIS_APPROVAL_FACTS).sort()).toEqual(approvable.map(([id]) => id).sort());
  });

  it("agrees with the action class for every approvable action", () => {
    for (const [id, cls] of approvable) {
      const safety = jarvisApprovalSafety(id);
      expect(safety.classified, id).toBe(true);
      if (!cls.external) expect(safety.sendsToPerson, id).not.toBe("yes");
      if (cls.effect === "destructive") expect(safety.undoable, id).not.toBe("yes");
      if (cls.effect === "destructive") expect(safety.changesLiveData, id).toBe("yes");
    }
  });

  it("says a demo link goes to a person, costs nothing known, and can't be undone", () => {
    const safety = jarvisApprovalSafety("demo.send");
    expect(safetyLines(safety).map((line) => [line.label, line.value])).toEqual([
      ["Sends to a person", "Yes"],
      ["Spends money", "Not known"],
      ["Changes live data", "Yes"],
      ["Can be undone", "No, it can't be undone"],
    ]);
  });

  it("marks paid research as spending and leaving nothing to undo", () => {
    const lines = safetyLines(jarvisApprovalSafety("research.ask"));
    expect(lines.find((line) => line.key === "spends")?.value).toBe("Yes");
    expect(lines.find((line) => line.key === "undo")?.value).toBe("Nothing to undo");
  });

  it("never reads an unclassified action as safe", () => {
    for (const id of ["totally.new", "__proto__", "constructor", ""]) {
      const safety = jarvisApprovalSafety(id);
      expect(safety.classified).toBe(false);
      expect(safetyLines(safety).every((line) => line.value === "Not known")).toBe(true);
    }
    expect(agentApprovalSafety("something_else").classified).toBe(false);
  });

  it("marks the workspace agent's send tools as customer sends that can't be recalled", () => {
    for (const tool of ["reviews.request", "quotes.send", "bookings.reminder", "send_sms"]) {
      const safety = agentApprovalSafety(tool);
      expect(safety.sendsToPerson, tool).toBe("yes");
      expect(safety.undoable, tool).toBe("no");
    }
  });

  it("ignores anything a model could write: the result depends only on the action id", () => {
    expect(jarvisApprovalSafety("demo.send")).toEqual(jarvisApprovalSafety("demo.send"));
    expect(jarvisApprovalSafety("demo.send").sendsToPerson).toBe("yes");
  });
});

describe("isBulkApproveEligible (JC-55)", () => {
  it("matches the NB4 hard gate via approvalSafety alias", () => {
    expect(approvalSafety).toBe(jarvisApprovalSafety);
    expect(isBulkApproveEligible(approvalSafety("code.pr"))).toBe(true);
    expect(isBulkApproveEligible(approvalSafety("demo.send"))).toBe(false);
    expect(isBulkApproveEligible(approvalSafety("research.ask"))).toBe(false);
    expect(isBulkApproveEligible(approvalSafety("claude.code"))).toBe(false);
  });
});
