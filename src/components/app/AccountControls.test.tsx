// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sb = vi.hoisted(() => {
  const eq = vi.fn(async () => ({ error: null as unknown }));
  const update = vi.fn(() => ({ eq }));
  return {
    eq,
    update,
    auth: { updateUser: vi.fn(), signInWithPassword: vi.fn() },
    from: vi.fn(() => ({ update })),
  };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: sb.auth, from: sb.from } }));

import {
  ChangePasswordForm,
  DisplayNameForm,
  validateDisplayName,
  validateNewPassword,
} from "@/components/app/AccountControls";

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
