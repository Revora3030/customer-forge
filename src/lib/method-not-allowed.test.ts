import { describe, expect, it } from "vitest";
import { methodNotAllowed } from "./method-not-allowed";
import { Route as growthDigest } from "@/routes/api/public/jobs/growth-digest";

describe("methodNotAllowed", () => {
  it("returns 405 with an Allow header and no caching", async () => {
    const res = methodNotAllowed();
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: false, error: "method_not_allowed" });
  });

  it("is wired as the GET handler of POST-only job routes", () => {
    const handlers = (growthDigest.options as { server?: { handlers?: Record<string, unknown> } }).server?.handlers;
    const get = handlers?.["GET"] as (() => Response) | undefined;
    expect(typeof get).toBe("function");
    expect(get!().status).toBe(405);
  });
});
