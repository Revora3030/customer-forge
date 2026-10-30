import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls, PerformanceMonitor } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsType } from "three-stdlib";
import { CITY_DISTRICTS, districtCounts, districtState, pulseRate, type CitySnapshot, type DistrictId } from "@/lib/ai-city";

type Palette = { ground: string; road: string; structure: string; gold: string; cyan: string; magenta: string; light: string; muted: string; ok: string; danger: string };
type DState = ReturnType<typeof districtState>;
export type CitySceneProps = { snapshot?: CitySnapshot | undefined; selected: DistrictId; onSelect: (id: DistrictId) => void; palette: Palette; motion: boolean; reset: number; onFailure: () => void };

/**
 * Window pattern painted in memory. The old glTF files asked the browser for
 * `/__l5e/assets-v1/…/Textures/colormap.png`, which 404s, so every tower
 * rendered as an untextured black block and the loader pulled a WASM decoder
 * the content-security policy blocks. Nothing here is fetched.
 */
function windowTexture(seed: number, lit: string): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#121a28";
  ctx.fillRect(0, 0, 64, 128);
  for (let y = 6; y < 124; y += 14) {
    for (let x = 5; x < 60; x += 12) {
      const on = ((seed * 17 + x * 3 + y) % 7) > 1;
      ctx.fillStyle = on ? lit : "#1c2838";
      ctx.fillRect(x, y, 7, 9);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function Ground({ palette }: { palette: Palette }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = palette.ground;
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = palette.structure;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 512; i += 32) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke(); }
    ctx.fillStyle = palette.road;
    ctx.fillRect(240, 0, 32, 512); ctx.fillRect(0, 240, 512, 32);
    ctx.fillStyle = palette.gold;
    for (let i = 0; i < 512; i += 24) { ctx.fillRect(255, i, 2, 10); ctx.fillRect(i, 255, 10, 2); }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [palette]);
  useEffect(() => () => texture?.dispose(), [texture]);
  return <mesh rotation-x={-Math.PI / 2} position-y={-0.12} receiveShadow><planeGeometry args={[30, 30]} /><meshStandardMaterial map={texture} color={palette.light} roughness={0.75} metalness={0.35} /></mesh>;
}

function Building({ index, palette, selected, active, state, counts, onSelect }: { index: number; palette: Palette; selected: boolean; active: boolean; state: DState; counts: ReturnType<typeof districtCounts>; compact: boolean; onSelect: () => void }) {
  const district = CITY_DISTRICTS[index];
  const windows = useMemo(() => (district ? windowTexture(index + 1, palette.gold) : null), [district, index, palette.gold]);
  useEffect(() => () => windows?.dispose(), [windows]);
  if (!district) return null;
  // Colour tells the recorded state: green working, red with failures, gold waiting, muted unreadable.
  const tone = palette[district.tone];
  const color = state === "working" ? palette.ok : state === "attention" ? ((counts?.errors ?? 0) > 0 ? palette.danger : palette.gold) : state === "unavailable" ? palette.muted : tone;
  const height = district.height;
  const width = 1.15 + (index % 3) * 0.22;
  return <group position={[district.position[0], 0, district.position[1]]} onClick={event => { event.stopPropagation(); if (event.delta < 5) onSelect(); }}>
    <mesh position-y={-0.02} receiveShadow><boxGeometry args={[5, 0.15, 5]} /><meshStandardMaterial color={palette.structure} metalness={0.6} roughness={0.5} emissive={color} emissiveIntensity={state === "working" ? 0.35 : state === "attention" ? 0.22 : 0.05} /></mesh>
    <mesh position-y={height / 2} castShadow receiveShadow>
      <boxGeometry args={[width, height, width * 0.82]} />
      <meshStandardMaterial map={windows} color={palette.light} emissive={color} emissiveIntensity={state === "working" ? 0.55 : 0.28} metalness={0.35} roughness={0.42} />
    </mesh>
    <mesh position-y={height + 0.18} castShadow>
      <boxGeometry args={[width * 0.55, 0.36, width * 0.45]} />
      <meshStandardMaterial color={tone} emissive={tone} emissiveIntensity={0.45} metalness={0.5} roughness={0.35} />
    </mesh>
    <mesh rotation-x={-Math.PI / 2} position-y={0.07}><ringGeometry args={[2.8, selected ? 2.95 : 2.84, 4]} /><meshBasicMaterial color={selected ? palette.gold : color} transparent opacity={selected ? 1 : state === "idle" ? 0.45 : 0.9} /></mesh>
    <PulseRings color={color} active={active} />
    <Beacon color={color} height={height + 0.7} active={active || state === "attention"} rate={pulseRate(state, counts)} />
  </group>;
}

/**
 * A glowing line from the Jarvis Tower hub to a district, lit by that district's
 * recorded state. It is a status indicator only: no packets travel along it,
 * because the records do not say what moves between districts.
 */
function Conduit({ to, color, strength }: { to: [number, number]; color: string; strength: number }) {
  const length = Math.hypot(to[0], to[1]);
  if (!length) return null;
  return <mesh position={[to[0] / 2, 0.015, to[1] / 2]} rotation-y={-Math.atan2(to[1], to[0])}>
    <boxGeometry args={[length, 0.02, 0.14]} />
    <meshBasicMaterial color={color} transparent opacity={strength} depthWrite={false} />
  </mesh>;
}

/** Expanding wave under a district that has a running record with a recent heartbeat. */
function PulseRings({ color, active }: { color: string; active: boolean }) {
  const refs = [useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null)];
  const time = useRef(0);
  useFrame((_, rawDelta) => {
    if (!active) return;
    time.current += Math.min(rawDelta, 0.05);
    refs.forEach((ref, i) => {
      const mesh = ref.current;
      if (!mesh) return;
      const phase = (time.current * 0.5 + i * 0.5) % 1;
      mesh.scale.setScalar(1 + phase * 0.9);
      (mesh.material as THREE.MeshBasicMaterial).opacity = (1 - phase) * 0.55;
    });
  });
  if (!active) return null;
  return <>{refs.map((ref, i) => <mesh key={i} ref={ref} rotation-x={-Math.PI / 2} position-y={0.09}><ringGeometry args={[2.9, 3.0, 4]} /><meshBasicMaterial color={color} transparent opacity={0.4} depthWrite={false} /></mesh>)}</>;
}

function Beacon({ color, height, active, rate }: { color: string; height: number; active: boolean; rate: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const time = useRef(0);
  useFrame((_, rawDelta) => {
    if (!active || !ref.current) return;
    time.current += Math.min(rawDelta, 0.05);
    ref.current.rotation.y += Math.min(rawDelta, 0.05);
    // A waiting or failed district blinks faster than a working one pulses.
    ref.current.scale.setScalar(0.8 + Math.sin(time.current * rate) * 0.2);
  });
  return <mesh ref={ref} position-y={height}><octahedronGeometry args={[0.22]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 3 : 0.2} /></mesh>;
}

/**
 * Phone gestures for an isometric map: one finger pans (with damping, so a
 * flick glides to a stop), two fingers pinch-zoom toward the fingers and twist
 * to rotate. Desktop mouse keeps rotate / zoom / right-drag pan.
 */
const CITY_TOUCHES = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
/** How far the look-at point may wander from the city centre before panning stops. */
const CITY_PAN_LIMIT = 14;

/** Keeps a pan or flick from sliding the city off screen; the camera moves with the target. */
function keepCityInView(event?: { target?: unknown }) {
  const control = event?.target as OrbitControlsType | undefined;
  if (!control?.target) return;
  const t = control.target;
  const x = Math.max(-CITY_PAN_LIMIT, Math.min(CITY_PAN_LIMIT, t.x));
  const z = Math.max(-CITY_PAN_LIMIT, Math.min(CITY_PAN_LIMIT, t.z));
  if (x === t.x && z === t.z && t.y === 1.5) return;
  const dx = x - t.x, dy = 1.5 - t.y, dz = z - t.z;
  t.set(x, 1.5, z);
  control.object.position.x += dx; control.object.position.y += dy; control.object.position.z += dz;
}

function CityControls({ selected, reset, controls }: { selected: DistrictId; reset: number; controls: React.RefObject<OrbitControlsType | null> }) {
  const { size, camera, invalidate } = useThree();
  const goal = useRef(new THREE.Vector3(0, 1.5, 0));
  const flying = useRef(false);
  // Glide the look-at point to the chosen district; keep rendering only while it moves.
  useFrame((_, delta) => {
    const control = controls.current;
    if (!control || !flying.current) return;
    control.target.lerp(goal.current, 1 - Math.exp(-6 * Math.min(delta, 0.05)));
    control.update();
    if (control.target.distanceTo(goal.current) < 0.01) { control.target.copy(goal.current); control.update(); flying.current = false; }
    else invalidate();
  });
  useEffect(() => {
    if (!(camera instanceof THREE.OrthographicCamera)) return;
    camera.zoom = Math.max(10, Math.min(24, size.width / 42));
    camera.updateProjectionMatrix();
  }, [size.width, camera]);
  useEffect(() => {
    const control = controls.current;
    if (!control) return;
    const district = CITY_DISTRICTS.find(d => d.id === selected);
    const x = district?.position[0] ?? 0, z = district?.position[1] ?? 0;
    goal.current.set(x * 0.35, 1.5, z * 0.35);
    flying.current = true;
    invalidate();
  }, [selected, controls, invalidate]);
  useEffect(() => {
    camera.position.set(25, 26, 30);
    goal.current.set(0, 1.5, 0);
    controls.current?.target.set(0, 1.5, 0);
    controls.current?.update();
  }, [reset, camera, controls]);
  return null;
}

export default function CityScene({ snapshot, selected, onSelect, palette, motion, reset, onFailure }: CitySceneProps) {
  const now = Date.now();
  // On phones only the chosen district carries a full label; the others show just a count.
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)");
    const sync = () => setCompact(media.matches);
    sync(); media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  // Pixel ratio follows the screen up to 2x; if the frame rate drops while animating it falls back to 1x.
  const ceiling = useMemo(() => Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, compact ? 1.5 : 2), [compact]);
  const [dpr, setDpr] = useState(ceiling);
  useEffect(() => setDpr(ceiling), [ceiling]);
  const controls = useRef<OrbitControlsType>(null);
  const anyActive = CITY_DISTRICTS.some(d => districtState(d.id, snapshot, Date.now()) === "working");
  return <Canvas orthographic shadows dpr={dpr} frameloop={motion && anyActive ? "always" : "demand"} camera={{ position: [25, 26, 30], zoom: 20, near: 0.1, far: 150 }} gl={{ antialias: true, powerPreference: "low-power" }} onCreated={({ gl }) => { gl.domElement.addEventListener("webglcontextlost", onFailure, { once: true }); }} fallback={<div role="alert">3D unavailable. Switch to Operations.</div>}>
    <color attach="background" args={[palette.ground]} />
    <fogExp2 attach="fog" args={[palette.ground, 0.011]} />
    <ambientLight intensity={0.95} color="#9fb4c4" />
    <directionalLight position={[-12, 9, -14]} intensity={0.9} color={palette.cyan} />
    <pointLight position={[0, 9, 0]} intensity={22} distance={22} decay={2} color={palette.gold} />
    <directionalLight position={[10, 20, 8]} intensity={2.2} color="#ffe2b0" castShadow shadow-mapSize-width={compact ? 1024 : 2048} shadow-mapSize-height={compact ? 1024 : 2048} shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={20} shadow-camera-bottom={-20} />
    <Environment resolution={64}><Lightformer intensity={2} position={[0, 12, 0]} rotation-x={Math.PI / 2} scale={[25, 25, 1]} /><Lightformer intensity={1.5} color={palette.cyan} position={[-15, 3, 0]} rotation-y={Math.PI / 2} scale={[20, 10, 1]} /></Environment>
    <Ground palette={palette} />
    {CITY_DISTRICTS.filter(d => d.id !== "executive").map(d => {
      const state = districtState(d.id, snapshot, now);
      const counts = districtCounts(snapshot, d.id, now);
      const color = state === "working" ? palette.ok : state === "attention" ? ((counts?.errors ?? 0) > 0 ? palette.danger : palette.gold) : palette.muted;
      return <Conduit key={`c-${d.id}`} to={d.position} color={color} strength={state === "working" || state === "attention" ? 0.85 : state === "unavailable" ? 0.12 : 0.28} />;
    })}
    {CITY_DISTRICTS.map((d, index) => <Suspense key={d.id} fallback={null}><Building index={index} palette={palette} selected={selected === d.id} active={motion && districtState(d.id, snapshot, now) === "working"} state={districtState(d.id, snapshot, now)} counts={districtCounts(snapshot, d.id, now)} compact={compact} onSelect={() => onSelect(d.id)} /></Suspense>)}
    <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.09} enableRotate zoomToCursor screenSpacePanning={false} panSpeed={1.1} minZoom={8} maxZoom={65} minPolarAngle={0.35} maxPolarAngle={1.25} target={[0, 1.5, 0]} onChange={keepCityInView} touches={CITY_TOUCHES} />
    {motion && anyActive ? <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(ceiling)} /> : null}
    <CityControls selected={selected} reset={reset} controls={controls} />
  </Canvas>;
}