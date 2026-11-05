// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sb = vi.hoisted(() => {
  const eq = vi.fn(async () => ({ error: null as unknown }));
  const update = vi.fn(() => ({ eq }));
  const upload = vi.fn(async () => ({ error: null as unknown }));
  const remove = vi.fn(async () => ({ error: null as unknown }));
  const getPublicUrl = vi.fn((path: string) => ({
    data: { publicUrl: `https://example.test/storage/v1/object/public/avatars/${path}` },
  }));
  return {
    eq,
    update,
    upload,
    remove,
    getPublicUrl,
    auth: { updateUser: vi.fn(), signInWithPassword: vi.fn() },
    from: vi.fn(() => ({ update })),
    storage: { from: vi.fn(() => ({ upload, remove, getPublicUrl })) },
  };
});
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: sb.auth, from: sb.from, storage: sb.storage },
}));
vi.mock("@/lib/media", async () => {
  const actual = await vi.importActual<typeof import("@/lib/media")>("@/lib/media");
  return { ...actual, compressImage: vi.fn(async (file: File) => file) };
});

import {
  AvatarForm,
  ChangeEmailForm,
  ChangePasswordForm,
  DisplayNameForm,
  validateDisplayName,
  validateNewPassword,
} from "@/components/app/AccountControls";
import { validateAvatarFile } from "@/lib/account-avatar";
import { NEUTRAL_EMAIL_CHANGE_MESSAGE } from "@/lib/auth-email-requests";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
async function flush() {
  for (let i = 0; i < 4; i++)
    await act(async () => {
      await Promise.resolve();
    });
}
async function render(node: React.ReactNode) {
  await act(async () => root.render(node));
}
async function type(id: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(`#${id}`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() {
  await act(async () => {
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await flush();
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.clearAllMocks();
  sb.auth.updateUser.mockResolvedValue({ error: null });
  sb.auth.signInWithPassword.mockResolvedValue({ error: null });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("validators", () => {
  it("display name", () => {
    expect(validateDisplayName("  Ada   Lovelace ")).toEqual({ ok: true, value: "Ada Lovelace" });
    expect(validateDisplayName("   ").ok).toBe(false);
    expect(validateDisplayName("x".repeat(81)).ok).toBe(false);
  });
  it("password", () => {
    expect(validateNewPassword("", "longenough", "longenough")).toMatch(/current/);
    expect(validateNewPassword("old", "short", "short")).toMatch(/8/);
    expect(validateNewPassword("old", "longenough", "different")).toMatch(/match/);
    expect(validateNewPassword("samesame", "samesame", "samesame")).toMatch(/different/);
    expect(validateNewPassword("old", "longenough", "longenough")).toBeNull();
  });
});

describe("DisplayNameForm", () => {
  it("saves to auth metadata and profiles", async () => {
    await render(<DisplayNameForm userId="u1" initialName="Old" />);
    await type("acct-name", " New Name ");
    await submit();
    expect(sb.auth.updateUser).toHaveBeenCalledWith({ data: { full_name: "New Name" } });
    expect(sb.from).toHaveBeenCalledWith("profiles");
    expect(sb.eq).toHaveBeenCalledWith("id", "u1");
    expect(host.textContent).toContain("Name saved.");
  });
  it("shows an error when the save fails", async () => {
    sb.eq.mockResolvedValueOnce({ error: new Error("rls") });
    await render(<DisplayNameForm userId="u1" initialName="Old" />);
    await submit();
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/Could not save/);
  });
});

describe("ChangePasswordForm", () => {
  async function fill(cur: string, next: string, conf: string) {
    await type("acct-pw-current", cur);
    await type("acct-pw-new", next);
    await type("acct-pw-confirm", conf);
  }
  it("re-authenticates then updates the password", async () => {
    await render(<ChangePasswordForm email="a@b.co" />);
    await fill("oldpass123", "newpass123", "newpass123");
    await submit();
    expect(sb.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "a@b.co",
      password: "oldpass123",
    });
    expect(sb.auth.updateUser).toHaveBeenCalledWith({ password: "newpass123" });
    expect(host.textContent).toContain("Password changed");
  });
  it("does not update when the current password is wrong", async () => {
    sb.auth.signInWithPassword.mockResolvedValueOnce({ error: new Error("bad") });
    await render(<ChangePasswordForm email="a@b.co" />);
    await fill("wrong", "newpass123", "newpass123");
    await submit();
    expect(sb.auth.updateUser).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/incorrect/);
  });
  it("blocks mismatched passwords before calling auth", async () => {
    await render(<ChangePasswordForm email="a@b.co" />);
    await fill("oldpass123", "newpass123", "nope12345");
    await submit();
    expect(sb.auth.signInWithPassword).not.toHaveBeenCalled();
  });
});


describe("ChangeEmailForm", () => {
  async function fill(email: string, pw: string) {
    await type("acct-email-new", email);
    await type("acct-email-pw", pw);
  }
  it("re-authenticates then requests the email change", async () => {
    sb.auth.updateUser.mockResolvedValueOnce({
      data: { user: { new_email: "new@ex.com" } },
      error: null,
    });
    await render(<ChangeEmailForm email="old@ex.com" />);
    await fill("new@ex.com", "secretpw1");
    await submit();
    expect(sb.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "old@ex.com",
      password: "secretpw1",
    });
    expect(sb.auth.updateUser).toHaveBeenCalledWith(
      { email: "new@ex.com" },
      expect.objectContaining({ emailRedirectTo: expect.stringMatching(/\/app\/settings$/) }),
    );
    expect(host.textContent).toContain(NEUTRAL_EMAIL_CHANGE_MESSAGE.slice(0, 24));
    expect(host.textContent).toMatch(/Confirmation pending for/);
  });
  it("shows the neutral pending copy when Auth says the address exists", async () => {
    sb.auth.updateUser.mockResolvedValueOnce({
      data: { user: null },
      error: { code: "email_exists", message: "Email address already registered" },
    });
    await render(<ChangeEmailForm email="old@ex.com" />);
    await fill("taken@ex.com", "secretpw1");
    await submit();
    expect(host.textContent).toContain(NEUTRAL_EMAIL_CHANGE_MESSAGE.slice(0, 24));
    expect(host.querySelector('[role="status"]')?.textContent).toBe(NEUTRAL_EMAIL_CHANGE_MESSAGE);
    expect(host.textContent).not.toMatch(/Confirmation pending for taken@ex.com/);
    expect(host.textContent).not.toMatch(/Email address already registered/);
  });
  it("does not update when the current password is wrong", async () => {
    sb.auth.signInWithPassword.mockResolvedValueOnce({ error: new Error("bad") });
    await render(<ChangeEmailForm email="old@ex.com" />);
    await fill("new@ex.com", "wrong");
    await submit();
    expect(sb.auth.updateUser).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/incorrect/);
  });
  it("blocks same-as-current before calling auth", async () => {
    await render(<ChangeEmailForm email="old@ex.com" />);
    await fill("OLD@ex.com", "secretpw1");
    await submit();
    expect(sb.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/already your email/);
  });
});

describe("avatar validators via shared helper", () => {
  it("rejects unsupported types", () => {
    const file = new File(["x"], "a.gif", { type: "image/gif" });
    expect(validateAvatarFile(file).ok).toBe(false);
  });
});

describe("AvatarForm", () => {
  it("uploads a photo and shows success", async () => {
    sb.auth.updateUser.mockResolvedValue({ error: null });
    await render(<AvatarForm userId="u1" initialUrl={null} displayName="Ada" />);
    expect(host.querySelector("[data-slot=\"avatar-fallback\"], span")?.textContent || host.textContent).toContain("A");
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File([new Uint8Array(8)], "me.jpg", { type: "image/jpeg" });
    await act(async () => {
      Object.defineProperty(input, "files", { value: { 0: file, length: 1, item: () => file } });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();
    expect(sb.upload).toHaveBeenCalled();
    expect(sb.auth.updateUser).toHaveBeenCalled();
    expect(host.textContent).toContain("Photo saved.");
  });
  it("clears a managed photo", async () => {
    sb.auth.updateUser.mockResolvedValue({ error: null });
    const url = "https://example.test/storage/v1/object/public/avatars/u1/avatar.jpg";
    await render(<AvatarForm userId="u1" initialUrl={url} displayName="Ada" />);
    const removeBtn = Array.from(host.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Remove"),
    )!;
    await act(async () => {
      removeBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    expect(sb.remove).toHaveBeenCalled();
    expect(host.textContent).toContain("Photo removed.");
  });
});
