import { describe, expect, it } from "vitest";
import { approvalsFocus } from "./approvals-focus";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const rows = [
  { id: A, state: "pending" },
  { id: B, state: "approved" },
];

describe("approvalsFocus", () => {
  it("opens History when the linked request was already decided", () => {
    expect(approvalsFocus(rows, B)).toEqual({ section: "history" });
  });
  it("leaves History alone for a waiting request", () => {
    expect(approvalsFocus(rows, A)).toEqual({ section: "waiting" });
  });
  it("does nothing without a link or for an unknown id", () => {
    expect(approvalsFocus(rows, undefined)).toEqual({ section: "none" });
    expect(approvalsFocus(rows, "33333333-3333-3333-3333-333333333333")).toEqual({ section: "none" });
  });
});
