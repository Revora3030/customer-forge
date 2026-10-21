import { describe, expect, it } from "vitest";
import { safeOmniRouteBaseUrl } from "./omniroute-url";

describe("OmniRoute base URL", () => {
  it("accepts a public https address", () => {
    expect(safeOmniRouteBaseUrl("https://omni.example.com/v1/")).toBe("https://omni.example.com/v1");
  });
  it("rejects http, localhost, private networks and credentials", () => {
    for (const bad of ["http://omni.example.com/v1", "https://localhost:20128/v1", "https://127.0.0.1/v1", "https://10.0.0.5/v1", "https://192.168.1.2/v1", "https://u:p@omni.example.com/v1", "nonsense", ""]) {
      expect(safeOmniRouteBaseUrl(bad)).toBeNull();
    }
  });
});
