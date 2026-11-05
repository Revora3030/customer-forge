import { describe, expect, it } from "vitest";
import { GENERIC_ERROR_COPY, NETWORK_ERROR_COPY, userSafeMessage } from "./user-error";

describe("userSafeMessage", () => {
  it("hides raw JavaScript errors", () => {
    expect(userSafeMessage("TypeError: Cannot read properties of undefined (reading 'map')")).toBe(GENERIC_ERROR_COPY);
    expect(userSafeMessage("x is not a function")).toBe(GENERIC_ERROR_COPY);
    expect(userSafeMessage("Unexpected token < in JSON at position 0")).toBe(GENERIC_ERROR_COPY);
    expect(userSafeMessage("[object Object]")).toBe(GENERIC_ERROR_COPY);
  });

  it("hides database wording", () => {
    expect(userSafeMessage("Couldn't load that lead: relation \"leads\" does not exist")).toBe(GENERIC_ERROR_COPY);
    expect(userSafeMessage("new row violates row-level security policy")).toBe(GENERIC_ERROR_COPY);
    expect(userSafeMessage("duplicate key value violates unique constraint")).toBe(GENERIC_ERROR_COPY);
  });

  it("turns network failures into plain connection copy", () => {
    expect(userSafeMessage("Failed to fetch")).toBe(NETWORK_ERROR_COPY);
    expect(userSafeMessage("Load failed")).toBe(NETWORK_ERROR_COPY);
  });

  it("leaves our own wording alone, including words that contain marker letters", () => {
    for (const ok of [
      "Couldn't save your changes.",
      "Prices must be under $500.",
      "Add at least 3 girls' services",
      "That email is already in use.",
    ]) {
      expect(userSafeMessage(ok)).toBe(ok);
    }
  });
});
