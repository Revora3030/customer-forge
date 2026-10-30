import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Regression guards for the two write paths that must stay all-or-nothing.
 *
 * The real transactional behaviour lives in Postgres (`submit_public_conversion`
 * and `restore_website_state`), and it is verified directly against the database.
 * These tests stop the application code from quietly drifting back to a chain of
 * separate inserts, which is what previously allowed a half-saved booking or a
 * half-restored website.
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("public submissions are written in one database transaction", () => {
  // Error-code -> visitor-message mapping lives in site-submission-gate.ts (shared with the RPC caller).
  const source = read("./public-site.functions.ts") + read("./site-submission-gate.ts");

  it("saves lead, quote, booking, timeline and notification through the transactional function", () => {
    expect(source).toContain('supabase.rpc("submit_public_conversion"');
  });

  it("does not insert those rows one by one any more", () => {
    for (const table of ["leads", "quote_requests", "appointments", "notifications"]) {
      expect(source).not.toContain(`.from("${table}")\n      .insert(`);
    }
  });

  it("reports a taken slot instead of a false success", () => {
    expect(source).toContain("BOOKING_CONFLICT");
    expect(source).toContain("That time was just taken");
  });

  it("refuses service or form ids that belong to another business", () => {
    expect(source).toContain("INVALID_SERVICE");
    expect(source).toContain("INVALID_QUOTE_FORM");
  });

  it("keeps the saved request when owner alerts or automations fail", () => {
    expect(source).toContain("post-submission delivery failed");
    expect(source).toContain("notified: deliveryOk");
  });
});

describe("website restore is written in one database transaction", () => {
  const source = read("./site-restore.functions.ts");

  it("restores through the transactional function", () => {
    expect(source).toContain('supabase.rpc("restore_website_state"');
  });

  it("no longer runs its own delete-then-upsert chain", () => {
    expect(source).not.toContain('.from("website_pages")\n        .upsert(');
    expect(source).not.toContain('.from("website_components")\n        .delete()');
  });

  it("tells the customer nothing changed when the restore does not run", () => {
    expect(source).toContain("nothing was changed");
    expect(source).toContain("SITE_STATE_RESTORE_FAILED");
  });

  it("still verifies the result instead of trusting the call", () => {
    expect(source).toContain("snapshotsMatch(after");
  });
});

describe("repeated public submissions cannot duplicate or flood a workspace", () => {
  // Error-code -> visitor-message mapping lives in site-submission-gate.ts (shared with the RPC caller).
  const source = read("./public-site.functions.ts") + read("./site-submission-gate.ts");

  it("treats an immediate repeat submission as the request already saved", () => {
    expect(source).toContain("saved.duplicate");
    expect(source).toContain("duplicate: true");
  });

  it("tells a flooding submitter to wait instead of failing silently", () => {
    expect(source).toContain("RATE_LIMITED");
    expect(source).toContain("wait a few minutes");
  });
});
