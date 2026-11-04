// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiUpgradeBanner } from "@/components/app/AiUpgradeBanner";
import type { AiUpgradeFollowUp } from "@/lib/builder/ai-upgrade-followups";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const followUps: AiUpgradeFollowUp[] = [
  { kind: "layout_upgrade", reason: "Basic layout", slots: ["s1"], recordedAt: "2026-10-30T10:00:00Z" },
];

let root: Root | null = null;
let host: HTMLElement | null = null;

async function mount(props: Partial<Parameters<typeof AiUpgradeBanner>[0]> = {}) {
  const onApprove = vi.fn();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<AiUpgradeBanner organizationId="org-1" followUps={followUps} canManage onApprove={onApprove} {...props} />);
  });
  return { onApprove, host: host! };
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("AiUpgradeBanner", () => {
  it("never queues anything until the owner presses the button", async () => {
    const { onApprove, host } = await mount();
    expect(onApprove).not.toHaveBeenCalled();
    const button = host.querySelector<HTMLButtonElement>('[data-testid="approve-ai-upgrade"]');
    expect(button?.textContent).toContain("Upgrade with AI (uses credits)");
    await act(async () => button!.click());
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onApprove.mock.calls[0]![0]).toMatch(/Do not invent/);
    expect(host.querySelector('[data-testid="ai-upgrade-requested"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="approve-ai-upgrade"]')).toBeNull();
  });
  it("remembers the approval for the same build", async () => {
    window.localStorage.setItem("rv:ai-upgrade-requested:org-1:layout_upgrade@2026-10-30T10:00:00Z", "1");
    const { host } = await mount();
    expect(host.querySelector('[data-testid="ai-upgrade-requested"]')).not.toBeNull();
  });
  it("waits while the builder is busy", async () => {
    const { onApprove, host } = await mount({ busy: true });
    const button = host.querySelector<HTMLButtonElement>('[data-testid="approve-ai-upgrade"]');
    expect(button?.disabled).toBe(true);
    await act(async () => button!.click());
    expect(onApprove).not.toHaveBeenCalled();
  });
  it("offers no button to someone who cannot manage the site", async () => {
    const { host } = await mount({ canManage: false });
    expect(host.querySelector('[data-testid="approve-ai-upgrade"]')).toBeNull();
    expect(host.textContent).toContain("Ask the site owner");
  });
  it("shows nothing without pending upgrades", async () => {
    const { host } = await mount({ followUps: [] });
    expect(host.querySelector('[data-testid="ai-upgrade-banner"]')).toBeNull();
  });
});
