// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mfa = vi.hoisted(() => ({
  listFactors: vi.fn(),
  enroll: vi.fn(),
  unenroll: vi.fn(),
  challengeAndVerify: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { mfa } } }));
vi.mock("@/lib/ui/notify", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { TwoFactorCard } from "@/components/app/TwoFactorCard";
import { SecondFactorPrompt } from "@/components/auth/SecondFactorPrompt";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
async function render(node: React.ReactNode) {
  await act(async () => {
    root.render(node);
  });
  await act(async () => {
    await Promise.resolve();
  });
}
async function click(el: Element | null | undefined) {
  await act(async () => {
    (el as HTMLElement).click();
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
}
function button(label: RegExp) {
  return [...host.querySelectorAll("button")].find((b) => label.test(b.textContent ?? ""));
}
async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit(form: HTMLFormElement) {
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  Object.values(mfa).forEach((fn) => fn.mockReset());
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("TwoFactorCard", () => {
  it("shows Coming soon, not an error, while MFA is off in the auth settings", async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [] }, error: null });
    mfa.enroll.mockResolvedValue({ data: null, error: { message: "MFA enroll is disabled for TOTP" } });
    await render(<TwoFactorCard />);
    expect(host.textContent).toContain("Off");
    await click(button(/Turn on sign-in code/));
    expect(host.textContent).toContain("Coming soon");
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it("enrolls with a QR code and turns on after a correct code", async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [] }, error: null });
    mfa.enroll.mockResolvedValue({
      data: { id: "f1", totp: { qr_code: "data:image/svg+xml;utf8,<svg/>", secret: "SECRETKEY" } },
      error: null,
    });
    mfa.challengeAndVerify.mockResolvedValue({ data: {}, error: null });
    await render(<TwoFactorCard />);
    await click(button(/Turn on sign-in code/));
    expect(host.querySelector("img")?.getAttribute("src")).toContain("data:image/svg+xml");
    expect(host.textContent).toContain("SECRETKEY");
    await type(host.querySelector("#two-factor-setup-code") as HTMLInputElement, "123 456");
    await submit(host.querySelector("form") as HTMLFormElement);
    expect(mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: "f1", code: "123456" });
    expect(host.textContent).toContain("On");
    expect(button(/Turn off/)).toBeTruthy();
  });

  it("shows On for an account that already has a verified authenticator", async () => {
    mfa.listFactors.mockResolvedValue({
      data: { all: [{ id: "f9", factor_type: "totp", status: "verified" }] },
      error: null,
    });
    await render(<TwoFactorCard />);
    expect(button(/Turn off/)).toBeTruthy();
  });
});

describe("SecondFactorPrompt", () => {
  it("requires the code: a wrong code stays on the step, a right one continues", async () => {
    mfa.listFactors.mockResolvedValue({
      data: { all: [{ id: "f9", factor_type: "totp", status: "verified" }] },
      error: null,
    });
    const onVerified = vi.fn();
    mfa.challengeAndVerify.mockResolvedValueOnce({ data: null, error: { message: "Invalid TOTP code" } });
    await render(<SecondFactorPrompt onVerified={onVerified} onCancel={vi.fn()} />);
    const form = host.querySelector("form") as HTMLFormElement;
    await submit(form);
    expect(host.textContent).toContain("Enter the 6-digit code");
    expect(mfa.challengeAndVerify).not.toHaveBeenCalled();
    await type(host.querySelector("#two-factor-code") as HTMLInputElement, "000000");
    await submit(form);
    expect(onVerified).not.toHaveBeenCalled();
    expect(host.textContent).toContain("didn't match");
    mfa.challengeAndVerify.mockResolvedValueOnce({ data: {}, error: null });
    await type(host.querySelector("#two-factor-code") as HTMLInputElement, "123456");
    await submit(form);
    expect(mfa.challengeAndVerify).toHaveBeenLastCalledWith({ factorId: "f9", code: "123456" });
    expect(onVerified).toHaveBeenCalledTimes(1);
  });
});
