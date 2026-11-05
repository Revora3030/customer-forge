import { describe, expect, it } from "vitest";
import { isOneClickUnsubscribe, unsubscribeResponse } from "./one-click-unsubscribe";

const URL_ = "https://revoragrowthsystems.com/unsubscribe/outreach/tok";

describe("RFC 8058 one-click unsubscribe POST", () => {
  it("accepts the urlencoded one-click body", async () => {
    const request = new Request(URL_, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    });
    expect(await isOneClickUnsubscribe(request)).toBe(true);
  });

  it("accepts the multipart/form-data one-click body", async () => {
    const form = new FormData();
    form.set("List-Unsubscribe", "One-Click");
    expect(await isOneClickUnsubscribe(new Request(URL_, { method: "POST", body: form }))).toBe(true);
  });

  it("treats the page's own button (no field), other values and other types as a browser post", async () => {
    const button = new Request(URL_, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "" });
    expect(await isOneClickUnsubscribe(button)).toBe(false);
    const other = new Request(URL_, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=Yes" });
    expect(await isOneClickUnsubscribe(other)).toBe(false);
    const json = new Request(URL_, { method: "POST", headers: { "content-type": "application/json" }, body: '{"List-Unsubscribe":"One-Click"}' });
    expect(await isOneClickUnsubscribe(json)).toBe(false);
  });

  it("answers a one-click post with a bare status and a browser post with a 303 back to the page", () => {
    const request = new Request(URL_, { method: "POST" });
    expect(unsubscribeResponse(request, true, true).status).toBe(200);
    expect(unsubscribeResponse(request, true, false).status).toBe(404);
    const done = unsubscribeResponse(request, false, true);
    expect(done.status).toBe(303);
    expect(done.headers.get("location")).toBe(`${URL_}?done=1`);
    expect(unsubscribeResponse(request, false, false).headers.get("location")).toBe(`${URL_}?invalid=1`);
  });
});
