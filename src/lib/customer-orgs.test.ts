import { describe, expect, it } from "vitest";
import { customerOrgIds } from "./customer-orgs";

describe("customerOrgIds", () => {
  const orgs = [
    { id: "staff-only", is_demo: false },
    { id: "client", is_demo: false },
    { id: "demo", is_demo: true },
    { id: "empty", is_demo: false },
  ];
  const members = [
    { organization_id: "staff-only", user_id: "admin" },
    { organization_id: "client", user_id: "admin" },
    { organization_id: "client", user_id: "owner" },
    { organization_id: "demo", user_id: "owner" },
  ];
  it("counts only non-demo workspaces with a non-staff member", () => {
    expect([...customerOrgIds(orgs, members, ["admin"])]).toEqual(["client"]);
  });
});
