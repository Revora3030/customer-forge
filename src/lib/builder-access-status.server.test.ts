import { beforeEach, describe, expect, it, vi } from "vitest";
import { orgRole, roleAtLeast } from "./org-authz.server";
import { orgEntitlement } from "./entitlement.server";
import { readBuilderAccessStatus } from "./builder-access-status.server";
vi.mock("./org-authz.server", () => ({ orgRole: vi.fn(), roleAtLeast: vi.fn() }));
vi.mock("./entitlement.server", () => ({ orgEntitlement: vi.fn() }));
function client(admin = false, error: unknown = null) {
  const filters: Array<[string, unknown]> = [];
  const chain = { select: () => chain, eq: (key: string, value: unknown) => { filters.push([key, value]); return chain; }, limit: async () => ({ data: admin ? [{ role: "super_admin" }] : [], error }) };
  const db = { from: vi.fn(() => chain) };
  return { db: db as never, filters };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(orgRole).mockResolvedValue("manager");
  vi.mocked(roleAtLeast).mockImplementation((role, min) => min === "viewer" ? role != null : role === "manager");
  vi.mocked(orgEntitlement).mockResolvedValue({ allowed: true, state: "TRIAL", reason: "trial" });
});
describe("read-only builder access trust boundary", () => {
  it("checks own verified identity and membership before reading entitlement", async () => {
    const { db, filters } = client();
    expect(await readBuilderAccessStatus(db, "user-a", "org-a")).toMatchObject({ allowed: true, canManage: true });
    expect(filters).toContainEqual(["user_id", "user-a"]);
    expect(filters).toContainEqual(["role", "super_admin"]);
    expect(orgRole).toHaveBeenCalledWith(db, "org-a", "user-a");
    expect(orgEntitlement).toHaveBeenCalledWith(db, "org-a");
  });
  it("denies a nonmember without reading another tenant's entitlement", async () => {
    vi.mocked(orgRole).mockResolvedValue(null);
    await expect(readBuilderAccessStatus(client().db, "user-a", "org-b")).rejects.toThrow("permission");
    expect(orgEntitlement).not.toHaveBeenCalled();
  });
  it("reports a viewer as read-only while preserving entitlement", async () => {
    vi.mocked(orgRole).mockResolvedValue("viewer");
    expect(await readBuilderAccessStatus(client().db, "user-a", "org-a")).toMatchObject({ allowed: true, canManage: false });
  });
  it("uses only a verified super-admin record for the existing support path", async () => {
    const { db } = client(true);
    expect(await readBuilderAccessStatus(db, "user-a", "org-b")).toMatchObject({ canManage: true });
    expect(orgRole).not.toHaveBeenCalled();
  });
  it("does not turn a denied entitlement or failed lookup into access", async () => {
    vi.mocked(orgEntitlement).mockResolvedValue({ allowed: false, state: "EXPIRED", reason: "Your free access has ended." });
    expect(await readBuilderAccessStatus(client().db, "user-a", "org-a")).toMatchObject({ allowed: false });
    await expect(readBuilderAccessStatus(client(false, { message: "database error" }).db, "user-a", "org-a")).rejects.toThrow("verify");
  });
  it("does not describe an unavailable workspace lookup as an expired trial", async () => {
    vi.mocked(orgEntitlement).mockResolvedValue({ allowed: false, state: "EXPIRED", reason: "We couldn't verify your workspace." });
    await expect(readBuilderAccessStatus(client().db, "user-a", "org-a")).rejects.toThrow("verify");
  });
});
