// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A stand-in for the Radix slider that lets the test fire the same two events a
// real drag fires: many value changes while moving, one commit on release.
vi.mock("@/components/ui/slider", () => ({
  Slider: ({ value, onValueChange, onValueCommit }: { value: number[]; onValueChange: (v: number[]) => void; onValueCommit: (v: number[]) => void }) => (
    <div data-testid="stub-slider" data-value={value[0]}>
      <button data-testid="move-500" onClick={() => onValueChange([500])} />
      <button data-testid="move-700" onClick={() => onValueChange([700])} />
      <button data-testid="release-700" onClick={() => onValueCommit([700])} />
    </div>
  ),
}));

import { FluidViewportSlider } from "./FluidViewportControls";

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
const click = (id: string) => act(() => void (host.querySelector(`[data-testid="${id}"]`) as HTMLElement).click());
const shown = () => host.querySelector('[data-testid="stub-slider"]')?.getAttribute("data-value");

describe("FluidViewportSlider", () => {
  it("shows the dragged width at once but only hands it to the preview on release", () => {
    const onChange = vi.fn();
    act(() => root.render(<FluidViewportSlider width={390} onChange={onChange} />));
    click("move-500");
    click("move-700");
    expect(shown()).toBe("700");
    expect(host.querySelector("output")?.textContent).toBe("700px");
    expect(onChange).not.toHaveBeenCalled();
    click("release-700");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(700);
  });

  it("does not re-render the preview when released on the width it already has", () => {
    const onChange = vi.fn();
    act(() => root.render(<FluidViewportSlider width={700} onChange={onChange} />));
    click("release-700");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clamps to the ceiling it is given", () => {
    const onChange = vi.fn();
    act(() => root.render(<FluidViewportSlider width={390} max={600} onChange={onChange} />));
    click("release-700");
    expect(onChange).toHaveBeenCalledWith(600);
  });
});
