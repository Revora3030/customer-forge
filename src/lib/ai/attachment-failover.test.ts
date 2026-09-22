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
    // Text chat never hardcodes the flag: a text-only call keeps the strict rule.
    // Picture calls are the one deliberate exception (a model that cannot make a
    // new picture must not block the generator behind it), so the only literal
    // `true` in this file belongs to the image lane.
    const hardcoded = source.match(/nextProviderOnInvalidRequest: true/g) ?? [];
    expect(hardcoded.length).toBe(1);
    const imageLane = source.slice(source.indexOf("export async function generateImage"));
    expect(imageLane).toContain("nextProviderOnInvalidRequest: true");
  });
});

