import { describe, expect, it, vi, beforeEach } from "vitest";

const storage = vi.hoisted(() => {
  const upload = vi.fn(async () => ({ error: null as unknown }));
  const remove = vi.fn(async () => ({ error: null as unknown }));
  const getPublicUrl = vi.fn((path: string) => ({
    data: { publicUrl: `https://example.test/storage/v1/object/public/avatars/${path}` },
  }));
  return {
    upload,
    remove,
    getPublicUrl,
    from: vi.fn(() => ({ upload, remove, getPublicUrl })),
  };
});

const sb = vi.hoisted(() => {
  const eq = vi.fn(async () => ({ error: null as unknown }));
  const update = vi.fn(() => ({ eq }));
  return {
    eq,
    update,
    auth: { updateUser: vi.fn(async () => ({ error: null })) },
    from: vi.fn(() => ({ update })),
    storage,
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: sb.auth, from: sb.from, storage: sb.storage },
}));

vi.mock("@/lib/media", async () => {
  const actual = await vi.importActual<typeof import("@/lib/media")>("@/lib/media");
  return {
    ...actual,
    compressImage: vi.fn(async (file: File) => file),
  };
});

import {
  AVATAR_MAX_BYTES,
  avatarObjectPath,
  clearAccountAvatar,
  isManagedAvatarUrl,
  managedAvatarPathFromUrl,
  uploadAccountAvatar,
  validateAvatarFile,
} from "@/lib/account-avatar";

beforeEach(() => {
  vi.clearAllMocks();
  storage.upload.mockResolvedValue({ error: null });
  storage.remove.mockResolvedValue({ error: null });
  sb.auth.updateUser.mockResolvedValue({ error: null });
  sb.eq.mockResolvedValue({ error: null });
});

describe("validateAvatarFile", () => {
  it("rejects missing, wrong type, and oversized files", () => {
    expect(validateAvatarFile(null).ok).toBe(false);
    const bad = new File(["x"], "a.gif", { type: "image/gif" });
    expect(validateAvatarFile(bad)).toEqual({
      ok: false,
      message: "Use a JPG, PNG, WebP, or AVIF photo.",
    });
    const big = new File([new Uint8Array(AVATAR_MAX_BYTES + 1)], "a.jpg", { type: "image/jpeg" });
    expect(validateAvatarFile(big).ok).toBe(false);
  });
  it("accepts a normal jpeg", () => {
    const file = new File([new Uint8Array(32)], "me.jpg", { type: "image/jpeg" });
    const v = validateAvatarFile(file);
    expect(v.ok).toBe(true);
  });
});

describe("path helpers", () => {
  it("builds a stable object path", () => {
    expect(avatarObjectPath("u1", "Photo.JPEG")).toBe("u1/avatar.jpg");
    expect(avatarObjectPath("u1", "x.png")).toBe("u1/avatar.png");
  });
  it("detects managed public URLs", () => {
    const url = "https://x/storage/v1/object/public/avatars/u1/avatar.jpg?v=1";
    expect(isManagedAvatarUrl(url)).toBe(true);
    expect(managedAvatarPathFromUrl(url, "u1")).toBe("u1/avatar.jpg");
    expect(managedAvatarPathFromUrl(url, "other")).toBeNull();
    expect(isManagedAvatarUrl("https://lh3.googleusercontent.com/a/x")).toBe(false);
  });
});

describe("uploadAccountAvatar", () => {
  it("uploads, then writes auth metadata and profiles", async () => {
    const file = new File([new Uint8Array(16)], "me.jpg", { type: "image/jpeg" });
    const url = await uploadAccountAvatar("u1", file);
    expect(storage.from).toHaveBeenCalledWith("avatars");
    expect(storage.upload).toHaveBeenCalled();
    expect(sb.auth.updateUser).toHaveBeenCalledWith({
      data: { avatar_url: url, picture: url },
    });
    expect(sb.from).toHaveBeenCalledWith("profiles");
    expect(sb.eq).toHaveBeenCalledWith("id", "u1");
    expect(url).toContain("/avatars/u1/avatar.jpg");
  });
});

describe("clearAccountAvatar", () => {
  it("removes storage object and nulls metadata/profile", async () => {
    const url = "https://x/storage/v1/object/public/avatars/u1/avatar.jpg";
    await clearAccountAvatar("u1", url);
    expect(storage.remove).toHaveBeenCalledWith(["u1/avatar.jpg"]);
    expect(sb.auth.updateUser).toHaveBeenCalledWith({
      data: { avatar_url: null, picture: null },
    });
    expect(sb.eq).toHaveBeenCalledWith("id", "u1");
  });
});
