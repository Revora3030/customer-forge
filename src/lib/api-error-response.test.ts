import { describe, expect, it } from "vitest";
import { isStaleDeployError } from "./client-error-classify";
import {
  createUnhandledErrorResponse,
  createUnresolvedServerFnResponse,
  isUnresolvedServerFnError,
} from "./api-error-response";

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

describe("unresolved server function IDs", () => {
  const fnRequest = new Request("https://revora.example/_serverFn/abc123");

  it("recognises the dev and production wording on server-function requests only", () => {
    expect(
      isUnresolvedServerFnError(fnRequest, new Error("Invalid server function ID: abc123")),
    ).toBe(true);
    expect(
      isUnresolvedServerFnError(fnRequest, new Error("Server function info not found for abc123")),
    ).toBe(true);
    expect(
      isUnresolvedServerFnError(
        fnRequest,
        new Error("Server function module export not resolved for serverFn ID: abc"),
      ),
    ).toBe(true);
    expect(
      isUnresolvedServerFnError(
        new Request("https://revora.example/app"),
        new Error("Invalid server function ID: x"),
      ),
    ).toBe(false);
    expect(
      isUnresolvedServerFnError(fnRequest, new Error('relation "audit_logs" does not exist')),
    ).toBe(false);
    expect(isUnresolvedServerFnError(fnRequest, "Invalid server function ID")).toBe(false);
    expect(isUnresolvedServerFnError(undefined, new Error("Invalid server function ID"))).toBe(
      false,
    );
  });

  it("answers with a non-cacheable 404 the client can classify as a stale build", async () => {
    const response = createUnresolvedServerFnResponse();
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toContain("text/plain");
    const body = await response.text();
    expect(body).not.toContain("abc123");
    expect(isStaleDeployError(new Error(body).message)).toBe(true);
  });
});
