import { describe, expect, it, vi, afterEach } from "vitest";
import { drivePhotoPath, parseDriveFolderId, planDriveImport } from "./drive-intake";
import { importDriveFolder, listDriveFolder } from "./drive-intake.server";

const ORG = "11111111-1111-1111-1111-111111111111";
const ID = "1AbCdEfGhIjKlMnOpQrStUv";

describe("parseDriveFolderId", () => {
  it("accepts folder links, open?id links and bare ids", () => {
    expect(parseDriveFolderId(`https://drive.google.com/drive/folders/${ID}?usp=sharing`)).toBe(ID);
    expect(parseDriveFolderId(`https://drive.google.com/drive/u/0/folders/${ID}`)).toBe(ID);
    expect(parseDriveFolderId(`https://drive.google.com/open?id=${ID}`)).toBe(ID);
    expect(parseDriveFolderId(ID)).toBe(ID);
  });
  it("rejects other hosts and junk", () => {
    expect(parseDriveFolderId(`https://evil.example/drive/folders/${ID}`)).toBeNull();
    expect(parseDriveFolderId("' or 1=1")).toBeNull();
    expect(parseDriveFolderId("")).toBeNull();
  });
});

describe("planDriveImport", () => {
  it("skips non-images, oversize and already-imported files, and caps a batch", () => {
    const done = { id: "done1234567", name: "a.jpg", mimeType: "image/jpeg", size: 10 };
    const files = [
      done,
      { id: "heic1234567", name: "b.heic", mimeType: "image/heic", size: 10 },
      { id: "big12345678", name: "c.jpg", mimeType: "image/jpeg", size: 50 * 1024 * 1024 },
      { id: "new1", name: "d.png", mimeType: "image/png", size: null },
      { id: "new2", name: "e.png", mimeType: "image/png", size: 5 },
    ];
    const plan = planDriveImport(ORG, files, new Set([drivePhotoPath(ORG, done)]), 1);
    expect(plan.toImport.map((f) => f.id)).toEqual(["new1"]);
    expect(plan.remaining).toBe(1);
    expect(plan.skipped.map((s) => s.reason)).toEqual([
      "already_imported",
      "unsupported_type",
      "too_large",
    ]);
  });
  it("keeps paths inside the org folder", () => {
    expect(drivePhotoPath(ORG, { id: "../x", mimeType: "image/png" })).toBe(`${ORG}/drive-x.png`);
  });
});

describe("drive server", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("reports needs_connection without credentials", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "");
    vi.stubEnv("GOOGLE_DRIVE_API_KEY", "");
    await expect(listDriveFolder(ID, vi.fn() as never)).rejects.toMatchObject({
      failure: "needs_connection",
    });
  });
  it("imports new images once into the org's folder as owner photos", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "k");
    vi.stubEnv("GOOGLE_DRIVE_API_KEY", "c");
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("alt=media")) return new Response(new Uint8Array([1, 2, 3]));
      return Response.json({
        files: [
          { id: "img1", name: "job.jpg", mimeType: "image/jpeg", size: "3" },
          { id: "vid1", name: "v.mp4", mimeType: "video/mp4" },
        ],
      });
    });
    const inserts: unknown[] = [];
    const uploads: string[] = [];
    const db = {
      from: () => ({
        select: () => ({ eq: () => ({ like: async () => ({ data: [], error: null }) }) }),
        insert: async (row: unknown) => (inserts.push(row), { error: null }),
      }),
      storage: {
        from: () => ({
          upload: async (p: string) => (uploads.push(p), { error: null }),
          remove: async () => ({}),
        }),
      },
    };
    const r = await importDriveFolder(db as never, ORG, ID, "work", fetchImpl as never);
    expect(r).toMatchObject({ imported: 1, found: 2, failed: [] });
    expect(uploads).toEqual([`${ORG}/drive-img1.jpg`]);
    expect(inserts[0]).toMatchObject({ organization_id: ORG, source: "owner", category: "work" });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(
      "connector-gateway.lovable.dev/google_drive/drive/v3/files",
    );
  });
});
