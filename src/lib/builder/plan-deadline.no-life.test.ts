import { describe, expect, it } from "vitest";
import { PLAN_NO_LIFE_MS, recoveryLooksDead } from "./plan-deadline";
import { ownerWords, pageContextPrefix } from "./preview-bridge";

describe("lost planning requests", () => {
  it("stops waiting after 4 minutes with no sign of server work", () => {
    expect(PLAN_NO_LIFE_MS).toBe(4 * 60_000);
    expect(recoveryLooksDead(0, 4 * 60_000)).toBe(true);
    expect(recoveryLooksDead(0, 4 * 60_000 - 1)).toBe(false);
  });
});

describe("owner chat bubble", () => {
  it("hides the open-page note added for the AI", () => {
    const sent = `${pageContextPrefix({ id: "p", title: "Home", slug: "home" })} Hey`;
    expect(ownerWords(sent)).toBe("Hey");
  });
  it("hides block and element ids but keeps the block name", () => {
    expect(ownerWords('On the "Hero" block (id 1b332c6c-1c8d-4b84-a66d-e0efd0ca0571): make it bigger')).toBe(
      'On the "Hero" block: make it bigger',
    );
  });
});
