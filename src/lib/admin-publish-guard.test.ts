import { describe, expect, it } from "vitest";
import {
  assertCanSetPublishState,
  CHECK_FAILED_MESSAGE,
  NO_SECTIONS_MESSAGE,
  NO_VERSION_MESSAGE,
  type PublishGuardClient,
} from "./admin-publish-guard";
import { friendlyError } from "./user-error";

const ORG = "22222222-2222-4222-8222-222222222222";

function fakeClient(counts: { website_versions: number; website_sections: number }, fail = false) {
  const calls: Array<{ table: string; filters: Record<string, unknown> }> = [];
  const client: PublishGuardClient = {
    from(table) {
      return {
        select() {
          const filters: Record<string, unknown> = {};
          calls.push({ table, filters });
          const query = {
            eq(column: string, value: unknown) {
              filters[column] = value;
              return query;
            },
            then(resolve: (r: { count: number | null; error: unknown }) => unknown) {
              const count = counts[table as keyof typeof counts] ?? 0;
              return Promise.resolve(fail ? { count: null, error: new Error("x") } : { count, error: null }).then(resolve);
            },
          };
          return query as never;
        },
      };
    },
  };
  return { client, calls };
}

describe("assertCanSetPublishState", () => {
  it("refuses published when the org has no saved version", async () => {
    const { client } = fakeClient({ website_versions: 0, website_sections: 5 });
    await expect(assertCanSetPublishState(client, ORG, "published")).rejects.toThrow(NO_VERSION_MESSAGE);
  });

  it("refuses published when the org has no visible sections", async () => {
    const { client, calls } = fakeClient({ website_versions: 2, website_sections: 0 });
    await expect(assertCanSetPublishState(client, ORG, "published")).rejects.toThrow(NO_SECTIONS_MESSAGE);
    const sections = calls.find((c) => c.table === "website_sections");
    expect(sections?.filters).toEqual({ organization_id: ORG, is_visible: true });
  });

  it("allows published when a version and a visible section exist", async () => {
    const { client, calls } = fakeClient({ website_versions: 1, website_sections: 3 });
    await expect(assertCanSetPublishState(client, ORG, "published")).resolves.toBeUndefined();
    expect(calls.every((c) => c.filters.organization_id === ORG)).toBe(true);
  });

  it("refuses published when the content check itself fails", async () => {
    const { client } = fakeClient({ website_versions: 1, website_sections: 1 }, true);
    await expect(assertCanSetPublishState(client, ORG, "published")).rejects.toThrow(CHECK_FAILED_MESSAGE);
  });

  it.each(["unpublished", "draft", "preview"])("always allows %s without querying", async (state) => {
    const { client, calls } = fakeClient({ website_versions: 0, website_sections: 0 });
    await expect(assertCanSetPublishState(client, ORG, state)).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it("uses messages the admin UI shows as-is", () => {
    for (const m of [NO_VERSION_MESSAGE, NO_SECTIONS_MESSAGE, CHECK_FAILED_MESSAGE]) {
      expect(friendlyError(new Error(m))).toBe(m);
    }
  });
});
