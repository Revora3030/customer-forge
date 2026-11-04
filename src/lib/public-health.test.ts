import { describe, expect, it } from "vitest";
import { publicHealthPayload, publicHealthResponse } from "./public-health";

describe("public health probe", () => {
  it("returns ok with no secrets or env data", async () => {
    const res = publicHealthResponse("GET", new Date("2026-01-01T00:00:00Z"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toEqual({ status: "ok", service: "revora-customer-forge", time: "2026-01-01T00:00:00.000Z" });
    expect(Object.keys(publicHealthPayload())).toEqual(["status", "service", "time"]);
  });
  it("HEAD returns an empty 200", async () => {
    const res = publicHealthResponse("HEAD");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
  });
});
