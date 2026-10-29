/** The three.js half of model_3d_viewer, loaded on demand. */
import { Component, Suspense, useEffect, useMemo, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, OrbitControls, useGLTF } from "@react-three/drei";

class Boundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    this.props.onError();
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Model({ src }: { src: string }) {
  const { scene } = useGLTF(src);
  const object = useMemo(() => scene.clone(true), [scene]);
  useEffect(() => () => { useGLTF.clear(src); }, [src]);
  return <primitive object={object} />;
}

export default function ModelCanvas({ src, alt, onError }: { src: string; alt: string; onError: () => void }) {
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return (
    <div className="rv-model-canvas" role="img" aria-label={alt}>
      <Boundary onError={onError}>
        <Canvas dpr={[1, 2]} camera={{ position: [0, 0.6, 3], fov: 40 }} gl={{ antialias: true, preserveDrawingBuffer: false }}>
          <ambientLight intensity={0.7} />
          <directionalLight position={[3, 4, 5]} intensity={1.4} />
          <directionalLight position={[-4, 2, -3]} intensity={0.5} />
          <Suspense fallback={null}>
            <Bounds fit clip observe margin={1.15}>
              <Model src={src} />
            </Bounds>
          </Suspense>
          <OrbitControls makeDefault enablePan={false} enableDamping autoRotate={!reduced} autoRotateSpeed={0.8} minDistance={0.4} maxDistance={12} />
        </Canvas>
      </Boundary>
    </div>
  );
}
