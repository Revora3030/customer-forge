import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./site-theme.functions.ts", import.meta.url), "utf8");
const saveBlock = source.slice(source.indexOf("export const saveSiteThemeColors"));

describe("site theme server functions: ownership and scope", () => {
  it("both run behind sign-in", () => {
    expect(source.match(/\.middleware\(\[requireSupabaseAuth\]\)/g)?.length).toBe(2);
  });
  it("saving needs at least the manager role and an active entitlement, checked before any write", () => {
    expect(saveBlock).toMatch(/requireOrgRole\([^)]*"manager"\)/);
    expect(saveBlock.indexOf("requireOrgRole")).toBeLessThan(saveBlock.indexOf(".update("));
    expect(saveBlock.indexOf("assertOrgEntitled")).toBeLessThan(saveBlock.indexOf(".update("));
  });
  it("only writes the three existing colour columns, scoped to the workspace, via the caller's own client", () => {
    expect(saveBlock).toContain("context.supabase");
    expect(saveBlock).not.toMatch(/supabaseAdmin|service_role/);
    expect(saveBlock).toMatch(/\.eq\("organization_id", data\.organizationId\)/);
    const update = saveBlock.slice(saveBlock.indexOf(".update("), saveBlock.indexOf(".eq("));
    expect([...update.matchAll(/^\s+(\w+_color):/gm)].map((m) => m[1])).toEqual(["primary_color", "secondary_color", "accent_color"]);
  });
  it("reading reports canEdit from the role so the UI can disable Save", () => {
    expect(source).toMatch(/canEdit: roleAtLeast\(role, "manager"\)/);
  });
});
