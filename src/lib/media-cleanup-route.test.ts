import { describe, expect, it } from "vitest";
import { Route } from "@/routes/api/public/jobs/media-cleanup";

const handlers = ((Route.options as { server?: { handlers?: Record<string, unknown> } }).server?.handlers ?? {}) as Record<string, unknown>;

describe("media-cleanup route", () => {
  it("answers GET with 405 (it deletes files, so it is POST-only)", () => {
    const get = handlers["GET"] as (() => Response) | undefined;
    expect(typeof get).toBe("function");
    const res = get!();
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
  });

  it("still has a POST handler for the scheduler", () => {
    expect(typeof handlers["POST"]).toBe("function");
  });
});
