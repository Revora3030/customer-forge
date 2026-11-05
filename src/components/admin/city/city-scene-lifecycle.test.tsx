// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { useDisposable } from "./city-dispose";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Stands in for a three.js texture: counts how many exist and how many were disposed. */
class FakeTexture {
  static created = 0;
  static disposed = 0;
  disposedOnce = false;
  constructor() { FakeTexture.created += 1; }
  dispose() { if (this.disposedOnce) throw new Error("disposed twice"); this.disposedOnce = true; FakeTexture.disposed += 1; }
}

function Tower({ seed }: { seed: number }) {
  useDisposable(() => new FakeTexture(), [seed]);
  return null;
}

describe("AI City GPU resource lifecycle (JC-17)", () => {
  it("disposes every texture across 200 mount/unmount cycles", () => {
    FakeTexture.created = 0; FakeTexture.disposed = 0;
    for (let i = 0; i < 200; i++) {
      const host = document.createElement("div");
      const root = createRoot(host);
      act(() => root.render(<><Tower seed={0} /><Tower seed={1} /></>));
      act(() => root.unmount());
    }
    expect(FakeTexture.created).toBe(400);
    expect(FakeTexture.disposed).toBe(FakeTexture.created);
  });

  it("disposes the old texture when its inputs change, and the last one on unmount", () => {
    FakeTexture.created = 0; FakeTexture.disposed = 0;
    const root = createRoot(document.createElement("div"));
    for (const seed of [1, 2, 3]) act(() => root.render(<Tower seed={seed} />));
    expect(FakeTexture.created - FakeTexture.disposed).toBe(1);
    act(() => root.unmount());
    expect(FakeTexture.disposed).toBe(FakeTexture.created);
  });

  it("holds nothing when the factory returns null (no 2D canvas available)", () => {
    const root = createRoot(document.createElement("div"));
    function Empty() { return <>{String(useDisposable(() => null, []))}</>; }
    expect(() => { act(() => root.render(<Empty />)); act(() => root.unmount()); }).not.toThrow();
  });

  it("creates every scene texture through the disposing hook and unhooks the context-lost handler", () => {
    const scene = readFileSync(join(process.cwd(), "src/components/admin/city/CityScene.tsx"), "utf8");
    expect(scene.match(/useDisposable\(/g)?.length).toBe(2);
    expect(scene).not.toMatch(/useMemo\(\(\) => \(district \? windowTexture/);
    expect(scene).toContain('removeEventListener("webglcontextlost", onFailure)');
    expect(scene).toMatch(/contextCleanup\.current\?\.\(\)/);
  });
});
