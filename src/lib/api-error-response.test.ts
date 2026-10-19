import { describe, expect, it } from "vitest";
import { createUnhandledErrorResponse } from "./api-error-response";

describe("createUnhandledErrorResponse", () => {
  it("returns a non-cacheable JSON 500 for API failures without exposing details", async () => {
    const response = createUnhandledErrorResponse(
      new Request("https://revora.example/api/example"),
      "<private server exception>",
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ error: "Internal Server Error" });
  });

  it("keeps the HTML error page for normal page requests", async () => {
    const response = createUnhandledErrorResponse(
      new Request("https://revora.example/app"),
      "<html>safe error page</html>",
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("text/html");
    await expect(response.text()).resolves.toBe("<html>safe error page</html>");
  });

  it("falls back to the HTML error page when no request exists", async () => {
    const response = createUnhandledErrorResponse(undefined, "<html>safe error page</html>");
    expect(response.headers.get("content-type")).toContain("text/html");
  });
});
