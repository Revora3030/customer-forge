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
});
