/** The three.js half of building_explorer, loaded on demand (React Three Fiber + drei, MIT). */
import { Component, useState, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { dprCap } from "@/lib/builder/premium-effects";

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

const FLOOR_HEIGHT = 0.32;
const GAP = 0.06;

function Floor({ index, count, active, hovered, accent, onSelect, onHover }: {
  index: number; count: number; active: boolean; hovered: boolean; accent: string;
  onSelect: (i: number) => void; onHover: (i: number | null) => void;
}) {
  const y = (index - (count - 1) / 2) * (FLOOR_HEIGHT + GAP);
  return (
    <mesh position={[active ? 0.18 : 0, y, 0]}
      onClick={(event) => { event.stopPropagation(); onSelect(index); }}
      onPointerOver={(event) => { event.stopPropagation(); onHover(index); }}
      onPointerOut={() => onHover(null)}>
      <boxGeometry args={[1.6, FLOOR_HEIGHT, 1.1]} />
      <meshStandardMaterial color={active ? accent : hovered ? "#3a4450" : "#1f262e"} metalness={0.25} roughness={0.45} transparent opacity={active ? 1 : 0.88} />
    </mesh>
  );
}

export default function BuildingCanvas({ count, selected, onSelect, accent, reducedMotion, onError, label }: {
  count: number; selected: number; onSelect: (i: number) => void; accent: string | undefined;
  reducedMotion: boolean; onError: () => void; label: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const colour = accent && /^#[0-9a-f]{6}$/i.test(accent) ? accent : "#3b82f6";
  const height = count * (FLOOR_HEIGHT + GAP);
  return (
    <div className="rv-building-canvas" role="img" aria-label={`${label}: 3D floor stack, use the floor list to choose a level`} style={{ cursor: hovered != null ? "pointer" : "grab" }}>
      <Boundary onError={onError}>
        <Canvas dpr={[1, dprCap(typeof window === "undefined" ? 1280 : window.innerWidth)]} performance={{ min: 0.5 }}
          camera={{ position: [2.6, 1.2, 3.2], fov: 38 }} gl={{ antialias: true, preserveDrawingBuffer: false }}
          onCreated={({ gl }) => gl.domElement.addEventListener("webglcontextlost", onError, { once: true })}>
          <ambientLight intensity={0.55} />
          <directionalLight position={[4, 6, 5]} intensity={1.3} />
          <directionalLight position={[-4, 2, -3]} intensity={0.4} />
          <group scale={Math.min(1, 3.2 / Math.max(height, 0.1))}>
            {Array.from({ length: count }, (_, i) => (
              <Floor key={i} index={i} count={count} active={i === selected} hovered={i === hovered} accent={colour} onSelect={onSelect} onHover={setHovered} />
            ))}
          </group>
          {/* No zoom: the mouse wheel always scrolls the page. */}
          <OrbitControls makeDefault enableZoom={false} enablePan={false} enableDamping autoRotate={!reducedMotion && hovered == null} autoRotateSpeed={0.6} minPolarAngle={Math.PI / 3} maxPolarAngle={Math.PI / 1.9} />
        </Canvas>
      </Boundary>
    </div>
  );
}
