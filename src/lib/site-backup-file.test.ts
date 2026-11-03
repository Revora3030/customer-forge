import { describe, expect, it } from "vitest";
import { siteBackupFileName } from "./site-backup-file";

describe("siteBackupFileName", () => {
  it("uses the slug and the export day", () => {
    expect(siteBackupFileName("acme-detailing", "2026-11-01T13:00:00.000Z")).toBe(
      "acme-detailing-site-backup-2026-11-01.json",
    );
  });
  it("strips unsafe characters and falls back to 'site'", () => {
    expect(siteBackupFileName("../Ac me!", "2026-11-01T00:00:00Z")).toBe(
      "ac-me-site-backup-2026-11-01.json",
    );
    expect(siteBackupFileName(null, "2026-11-01T00:00:00Z")).toBe(
      "site-site-backup-2026-11-01.json",
    );
  });
});
