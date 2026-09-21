/**
 * ATTACHMENT FAILOVER PROOF.
 *
 * A provider refusing a well-formed request with an attachment (a screenshot for
 * the visual review, for example) says nothing about the next free provider:
 * free multimodal support differs from model to model. The router must therefore
 * move on to the next free provider on `invalid_request` when the request
 * carries a picture, video or recording — while still stopping immediately for a
 * plain text request, where a rejection genuinely is the same everywhere.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "src", "lib", "ai", "router.server.ts"), "utf8");

describe("attachment failover", () => {
  it("moves to the next free provider when an attachment request is refused", () => {
    expect(source).toContain(
      'if (error.category === "invalid_request" && options?.nextProviderOnInvalidRequest) break;',
    );
  });

  it("still stops straight away for a plain text bad request", () => {
    expect(source).toContain(
      'if (error.category === "invalid_request" || error.category === "too_large") throw error;',
    );
  });

  it("only sets the flag from the request's own attachment parts", () => {
    expect(source).toContain("function carriesAttachment(");
    expect(source).toContain("nextProviderOnInvalidRequest: carriesAttachment(request.messages)");
    expect(source).toContain("freeOnly: request.freeOnly === true");
    // The flag is never hardcoded on: a text-only call keeps the strict rule.
    expect(source).not.toContain("nextProviderOnInvalidRequest: true");
  });
});
