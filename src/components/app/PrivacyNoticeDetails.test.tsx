// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrivacyNoticeDetails } from "./PrivacyNoticeDetails";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function type(field: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  act(() => {
    setter?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("PrivacyNoticeDetails", () => {
  it("saves the owner's answers into generation without dropping other keys", () => {
    const onSave = vi.fn();
    act(() =>
      root.render(
        <PrivacyNoticeDetails generation={{ copy: { hero: "Hi" } }} canManage onSave={onSave} />,
      ),
    );
    const [retention, sharing] = Array.from(host.querySelectorAll("textarea"));
    const button = host.querySelector("button")!;
    expect(button.disabled).toBe(true);
    type(retention!, "One year.");
    type(sharing!, "No one.");
    expect(button.disabled).toBe(false);
    act(() => button.click());
    expect(onSave).toHaveBeenCalledWith({
      copy: { hero: "Hi" },
      privacyNotice: { retention: "One year.", sharing: "No one." },
    });
  });

  it("is read-only for members who cannot manage the site", () => {
    act(() =>
      root.render(<PrivacyNoticeDetails generation={null} canManage={false} onSave={vi.fn()} />),
    );
    expect(host.querySelector("textarea")!.disabled).toBe(true);
    expect(host.querySelector("button")!.disabled).toBe(true);
    expect(host.textContent).toContain("Review with a lawyer before relying on this.");
  });
});
