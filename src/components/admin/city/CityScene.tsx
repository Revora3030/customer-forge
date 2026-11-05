import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls, PerformanceMonitor } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsType } from "three-stdlib";
import { CITY_ANIMATION_FPS, CITY_DPR_MIN, CITY_DRAW_CALL_BUDGET, CITY_RAIN_MAX, cityDprCeiling } from "./city-render";
import { useDisposable } from "./city-dispose";
import { CITY_DISTRICTS, districtCounts, districtState, pulseRate, type CitySnapshot, type DistrictId } from "@/lib/ai-city";
import { skyLighting, type SkyMode, type WeatherState } from "@/lib/city-sky";
import { ApprovalBeacons3D } from "./ApprovalBeacons3D";
import { useApprovalBeacons, useOpenApprovals } from "./use-approval-beacons";

type Palette = { ground: string; road: string; structure: string; gold: string; cyan: string; magenta: string; light: string; muted: string; ok: string; danger: string };
type DState = ReturnType<typeof districtState>;
export type CitySceneProps = { snapshot?: CitySnapshot | undefined; selected: DistrictId; onSelect: (id: DistrictId) => void; palette: Palette; motion: boolean; reset: number; onFailure: () => void; skyMode?: SkyMode; weather?: WeatherState; showWeather?: boolean };

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
  const texture = useDisposable(() => {
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
  return <mesh rotation-x={-Math.PI / 2} position-y={-0.12} receiveShadow><planeGeometry args={[30, 30]} /><meshStandardMaterial map={texture} color={palette.light} roughness={0.75} metalness={0.35} /></mesh>;
}

function Building({ index, palette, selected, active, state, counts, onSelect }: { index: number; palette: Palette; selected: boolean; active: boolean; state: DState; counts: ReturnType<typeof districtCounts>; compact: boolean; onSelect: () => void }) {
  const district = CITY_DISTRICTS[index];
  const windows = useDisposable(() => (district ? windowTexture(index + 1, palette.gold) : null), [district, index, palette.gold]);
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
 * Touch gestures (tablets; phones get the flat map): one finger orbits the city
 * (with damping, so a flick glides to a stop), two fingers pinch-zoom and pan.
 * Desktop mouse keeps rotate / zoom / right-drag pan.
 */
const CITY_TOUCHES = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
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

/**
 * The canvas runs with frameloop="demand". While a district is animating this
 * asks for a frame CITY_ANIMATION_FPS times a second, and not at all when the
 * tab is hidden, instead of rendering every display refresh.
 */
function AnimationClock({ running }: { running: boolean }) {
  const invalidate = useThree(state => state.invalidate);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => { if (!document.hidden) invalidate(); }, 1000 / CITY_ANIMATION_FPS);
    return () => window.clearInterval(timer);
  }, [running, invalidate]);
  return null;
}


/**
 * Sparse rain streaks from measured failure density. No motion when density is 0.
 * One InstancedMesh, so any number of streaks is a single draw call (JC-18).
 */
const RAIN_DUMMY = new THREE.Object3D();
function Rain({ density, color }: { density: number; color: string }) {
  const drops = useMemo(() => {
    const count = Math.max(0, Math.min(CITY_RAIN_MAX, Math.round(density * CITY_RAIN_MAX)));
    return Array.from({ length: count }, (_, i) => ({
      x: ((i * 47) % 200) / 10 - 10,
      z: ((i * 91) % 200) / 10 - 10,
      y: 8 + ((i * 13) % 40) / 10,
      speed: 4 + (i % 5),
    }));
  }, [density]);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const heights = useRef<number[]>([]);
  const place = (root: THREE.InstancedMesh) => {
    drops.forEach((drop, i) => {
      RAIN_DUMMY.position.set(drop.x, heights.current[i] ?? drop.y, drop.z);
      RAIN_DUMMY.updateMatrix();
      root.setMatrixAt(i, RAIN_DUMMY.matrix);
    });
    root.instanceMatrix.needsUpdate = true;
  };
  useEffect(() => {
    heights.current = drops.map(drop => drop.y);
    if (mesh.current) place(mesh.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drops]);
  useFrame((_, rawDelta) => {
    const root = mesh.current;
    if (!root || density <= 0) return;
    const delta = Math.min(rawDelta, 0.05);
    drops.forEach((drop, i) => {
      let y = (heights.current[i] ?? drop.y) - drop.speed * delta;
      if (y < 0) y = drop.y;
      heights.current[i] = y;
    });
    place(root);
  });
  if (density <= 0 || drops.length === 0) return null;
  return (
    <instancedMesh key={drops.length} ref={mesh} args={[undefined, undefined, drops.length]} frustumCulled={false}>
      <boxGeometry args={[0.02, 0.35, 0.02]} />
      <meshBasicMaterial color={color} transparent opacity={0.35 + density * 0.35} depthWrite={false} />
    </instancedMesh>
  );
}

/**
 * Dev-only readout (never in a production build): frames per second and the
 * draw calls of the last frame, against the CITY_DRAW_CALL_BUDGET. Written to a
 * small overlay element that is removed when the scene unmounts.
 */
function DevStats() {
  const gl = useThree(state => state.gl);
  const overlay = useRef<HTMLDivElement | null>(null);
  const frames = useRef({ count: 0, since: 0 });
  useEffect(() => {
    const host = gl.domElement.parentElement;
    if (!host) return;
    const el = document.createElement("div");
    el.setAttribute("data-testid", "city-dev-stats");
    el.setAttribute("aria-hidden", "true");
    el.style.cssText = "position:absolute;left:8px;top:8px;z-index:20;pointer-events:none;font:11px/1.3 monospace;background:rgba(0,0,0,.6);color:#9f9;padding:2px 6px;border-radius:4px";
    host.appendChild(el);
    overlay.current = el;
    return () => { el.remove(); overlay.current = null; };
  }, [gl]);
  useFrame(() => {
    const el = overlay.current;
    if (!el) return;
    const now = performance.now();
    const tally = frames.current;
    if (tally.since === 0) tally.since = now;
    tally.count += 1;
    if (now - tally.since < 1000) return;
    const fps = Math.round((tally.count * 1000) / (now - tally.since));
    const calls = gl.info.render.calls;
    tally.count = 0; tally.since = now;
    el.textContent = `${fps} fps · ${calls} draw calls / ${CITY_DRAW_CALL_BUDGET}`;
    el.setAttribute("data-draw-calls", String(calls));
    el.style.color = calls > CITY_DRAW_CALL_BUDGET ? "#f99" : "#9f9";
  });
  return null;
}

export default function CityScene({ snapshot, selected, onSelect, palette, motion, reset, onFailure, skyMode = "neutral", weather, showWeather = false }: CitySceneProps) {
  const now = Date.now();
  // On phones only the chosen district carries a full label; the others show just a count.
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)");
    const sync = () => setCompact(media.matches);
    sync(); media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  // Pixel ratio follows the screen but never above CITY_DPR_MAX; if the frame rate drops while animating it falls back to 1x.
  const ceiling = useMemo(() => cityDprCeiling(typeof window === "undefined" ? 1 : window.devicePixelRatio), []);
  const [dpr, setDpr] = useState(ceiling);
  const controls = useRef<OrbitControlsType>(null);
  // Removes the context-lost listener on unmount so a remounted city does not leave handlers behind (JC-17).
  const contextCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => { contextCleanup.current?.(); contextCleanup.current = null; }, []);
  const anyActive = CITY_DISTRICTS.some(d => districtState(d.id, snapshot, Date.now()) === "working");
  const lighting = skyLighting(skyMode, palette.ground);
  const approvals = useApprovalBeacons();
  const openApprovals = useOpenApprovals();
  const beaconsPulse = motion && approvals.status === "ok" && approvals.total > 0;
  const rainOn = Boolean(showWeather && motion && weather && weather.kind === "rain" && weather.density > 0);
  return <Canvas orthographic shadows dpr={[CITY_DPR_MIN, dpr]} frameloop="demand" camera={{ position: [25, 26, 30], zoom: 20, near: 0.1, far: 150 }} gl={{ antialias: true, powerPreference: "low-power" }} onCreated={({ gl }) => { const canvas = gl.domElement; canvas.addEventListener("webglcontextlost", onFailure, { once: true }); contextCleanup.current = () => canvas.removeEventListener("webglcontextlost", onFailure); }} fallback={<div role="alert">3D unavailable. Switch to Operations.</div>}>
    <color attach="background" args={[lighting.background]} />
    <fogExp2 attach="fog" args={[lighting.fog, skyMode === "amber" ? 0.016 : 0.011]} />
    <ambientLight intensity={lighting.ambient} color={lighting.ambientColor} />
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
    {motion && anyActive ? <PerformanceMonitor bounds={() => [CITY_ANIMATION_FPS * 0.6, CITY_ANIMATION_FPS * 0.9]} onDecline={() => setDpr(CITY_DPR_MIN)} onIncline={() => setDpr(ceiling)} /> : null}
    <CityControls selected={selected} reset={reset} controls={controls} />
    <ApprovalBeacons3D state={approvals} gold={palette.gold} motion={motion} onOpen={openApprovals} />
    {rainOn ? <Rain density={weather!.density} color={palette.cyan} /> : null}
    {import.meta.env.DEV ? <DevStats /> : null}
    <AnimationClock running={(motion && anyActive) || rainOn || beaconsPulse} />
  </Canvas>;
}