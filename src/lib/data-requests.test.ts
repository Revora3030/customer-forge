import { describe, expect, it } from "vitest";
import { REVORA } from "@/lib/brand";
import { dataRequestMailto } from "./data-requests";

describe("data request emails", () => {
  it("addresses the deletion request to Revora with the workspace details", () => {
    const url = dataRequestMailto("delete", {
      email: "a@b.co",
      businessName: "Acme & Sons",
      organizationId: "org-1",
    });
    expect(url.startsWith(`mailto:${REVORA.email}?subject=`)).toBe(true);
    const body = decodeURIComponent(url.split("&body=")[1] ?? "");
    expect(body).toContain("Please delete my Revora account");
    expect(body).toContain("Account email: a@b.co");
    expect(body).toContain("Business: Acme & Sons");
    expect(body).toContain("Workspace ID: org-1");
  });
  it("asks for a copy of the data on export", () => {
    const url = dataRequestMailto("export", {});
    expect(decodeURIComponent(url)).toContain("Request for a copy of my data");
  });
});
