import { describe, expect, it } from "vitest";
import { isStaffRow, staffSessionIds, TEST_ACCOUNT_EMAILS } from "./staff-sessions";


const rows = [
  { session_id: "s1", email: null, event_name: "signup_started" },
  { session_id: "s1", email: "Owner@Example.com", event_name: "checkout_started" },
  { session_id: "s2", email: null, event_name: "signup_started" },
];

describe("staff session filtering", () => {
  it("drops every row in a session where a staff email appears", () => {
    const staff = new Set(["owner@example.com"]);
    const sessions = staffSessionIds(rows, staff);
    const kept = rows.filter((r) => !isStaffRow(r, sessions, staff));
    expect(kept.map((r) => r.session_id)).toEqual(["s2"]);
  });

  it("keeps everything when no staff emails are known", () => {
    expect(staffSessionIds(rows, []).size).toBe(0);
  });

  it("drops the owner's confirmed test accounts and their whole session", () => {
    const testRows = [
      { session_id: "t1", email: "bigdawg09091@gmail.com", event_name: "signup_completed" },
      { session_id: "t1", email: null, event_name: "checkout_started" },
      { session_id: "t2", email: "someone@example.com", event_name: "signup_completed" },
    ];
    const known = new Set<string>(TEST_ACCOUNT_EMAILS);
    expect(known.has("bigdawg09091@gmail.com")).toBe(true);
    expect(known.has("danaysiaingram42@gmail.com")).toBe(true);
    const sessions = staffSessionIds(testRows, known);
    const kept = testRows.filter((r) => !isStaffRow(r, sessions, known));
    expect(kept.map((r) => r.session_id)).toEqual(["t2"]);
  });
});

