import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls, PerformanceMonitor } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsType } from "three-stdlib";
import { CITY_ANIMATION_FPS, CITY_DPR_MIN, cityDprCeiling } from "./city-render";
import { CITY_DISTRICTS, districtCounts, districtState, type CitySnapshot, type DistrictId } from "@/lib/ai-city";
import { buildingStyleFor, cityCameraZoom, type BuildingStyleToken } from "@/lib/city-building-state";
import { skyLighting, type SkyMode, type WeatherState } from "@/lib/city-sky";
import { ApprovalBeacons3D } from "./ApprovalBeacons3D";
import { useApprovalBeacons, useOpenApprovals } from "./use-approval-beacons";

type Palette = { ground: string; road: string; structure: string; gold: string; cyan: string; magenta: string; light: string; muted: string; ok: string; danger: string };
export type CitySceneProps = { snapshot?: CitySnapshot | undefined; selected: DistrictId; /** JC-5: district currently drilled into (camera zoom-in + inspector). */ drilled: DistrictId | null; onSelect: (id: DistrictId) => void; palette: Palette; motion: boolean; reset: number; onFailure: () => void; skyMode?: SkyMode; weather?: WeatherState; showWeather?: boolean };

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

function paletteColor(palette: Palette, token: BuildingStyleToken, tone: string): string {
  if (token.colorKey === "ok") return palette.ok;
  if (token.colorKey === "gold") return palette.gold;
  if (token.colorKey === "danger") return palette.danger;
  if (token.colorKey === "muted") return palette.muted;
  return tone;
}

function Building({ index, palette, selected, style, onSelect }: { index: number; palette: Palette; selected: boolean; style: BuildingStyleToken; compact: boolean; onSelect: () => void }) {
  const district = CITY_DISTRICTS[index];
  const windows = useMemo(() => (district ? windowTexture(index + 1, palette.gold) : null), [district, index, palette.gold]);
  const body = useRef<THREE.MeshStandardMaterial>(null);
  const time = useRef(0);
  useEffect(() => () => windows?.dispose(), [windows]);
  // JC-1: rising window lights when working; failed strobe on body emissive (≤2 Hz).
  useFrame((_, rawDelta) => {
    const mat = body.current;
    if (!mat) return;
    const dt = Math.min(rawDelta, 0.05);
    time.current += dt;
    if (style.risingWindows && windows) {
      windows.offset.y = (windows.offset.y + dt * 0.18) % 1;
      windows.needsUpdate = true;
    }
    if (style.strobe) {
      // Square wave at beaconHz (capped at FAILED_STROBE_HZ by the token).
      const hz = style.beaconHz;
      const on = hz > 0 && Math.sin(time.current * Math.PI * 2 * hz) >= 0;
      mat.emissiveIntensity = on ? 0.95 : 0.18;
    } else if (style.dim) {
      mat.emissiveIntensity = 0.12;
    } else if (style.risingWindows) {
      mat.emissiveIntensity = 0.4 + Math.sin(time.current * style.beaconHz) * 0.2;
    }
  });
  if (!district) return null;
  const tone = palette[district.tone];
  const color = paletteColor(palette, style, tone);
  const height = district.height;
  const width = 1.15 + (index % 3) * 0.22;
  const baseEmissive = style.strobe ? 0.5 : style.dim ? 0.08 : style.state === "working" ? 0.55 : 0.28;
  return <group position={[district.position[0], 0, district.position[1]]} userData={{ buildingState: style.state, buildingIcon: style.icon }} onClick={event => { event.stopPropagation(); if (event.delta < 5) onSelect(); }}>
    <mesh position-y={-0.02} receiveShadow><boxGeometry args={[5, 0.15, 5]} /><meshStandardMaterial color={palette.structure} metalness={0.6} roughness={0.5} emissive={color} emissiveIntensity={style.state === "working" ? 0.35 : style.state === "failed" || style.state === "waiting" ? 0.22 : 0.05} /></mesh>
    <mesh position-y={height / 2} castShadow receiveShadow>
      <boxGeometry args={[width, height, width * 0.82]} />
      <meshStandardMaterial ref={body} map={windows} color={palette.light} emissive={color} emissiveIntensity={baseEmissive} metalness={0.35} roughness={0.42} />
    </mesh>
    <mesh position-y={height + 0.18} castShadow>
      <boxGeometry args={[width * 0.55, 0.36, width * 0.45]} />
      <meshStandardMaterial color={tone} emissive={tone} emissiveIntensity={style.dim ? 0.15 : 0.45} metalness={0.5} roughness={0.35} />
    </mesh>
    <mesh rotation-x={-Math.PI / 2} position-y={0.07}><ringGeometry args={[2.8, selected ? 2.95 : 2.84, 4]} /><meshBasicMaterial color={selected || style.goldRing ? palette.gold : color} transparent opacity={selected ? 1 : style.dim ? 0.35 : style.goldRing ? 0.85 : 0.9} /></mesh>
    {style.goldRing ? <WaitingRing color={palette.gold} active={style.goldRing} rate={style.beaconHz} /> : null}
    {style.state === "working" ? <PulseRings color={color} active /> : null}
    <Beacon color={color} height={height + 0.7} active={style.beaconHz > 0} rate={style.beaconHz} strobe={style.strobe} />
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

/** JC-1 waiting: slow gold ring that breathes; static when rate is 0. */
function WaitingRing({ color, active, rate }: { color: string; active: boolean; rate: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const time = useRef(0);
  useFrame((_, rawDelta) => {
    if (!active || !ref.current || rate <= 0) return;
    time.current += Math.min(rawDelta, 0.05);
    const phase = 0.55 + Math.sin(time.current * Math.PI * 2 * rate) * 0.35;
    (ref.current.material as THREE.MeshBasicMaterial).opacity = phase;
    ref.current.scale.setScalar(1 + (1 - phase) * 0.08);
  });
  if (!active) return null;
  return <mesh ref={ref} rotation-x={-Math.PI / 2} position-y={0.1}><ringGeometry args={[2.95, 3.15, 48]} /><meshBasicMaterial color={color} transparent opacity={0.7} depthWrite={false} /></mesh>;
}

function Beacon({ color, height, active, rate, strobe = false }: { color: string; height: number; active: boolean; rate: number; strobe?: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const time = useRef(0);
  useFrame((_, rawDelta) => {
    if (!active || !ref.current) return;
    time.current += Math.min(rawDelta, 0.05);
    ref.current.rotation.y += Math.min(rawDelta, 0.05);
    if (strobe && rate > 0) {
      const on = Math.sin(time.current * Math.PI * 2 * rate) >= 0;
      ref.current.scale.setScalar(on ? 1.05 : 0.7);
      (ref.current.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 4 : 0.35;
    } else {
      ref.current.scale.setScalar(0.8 + Math.sin(time.current * Math.PI * 2 * Math.max(rate, 0.01)) * 0.2);
    }
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
  // Clamp pan on X/Z only so JC-5 drill-down can raise the look-at Y.
  const x = Math.max(-CITY_PAN_LIMIT, Math.min(CITY_PAN_LIMIT, t.x));
  const z = Math.max(-CITY_PAN_LIMIT, Math.min(CITY_PAN_LIMIT, t.z));
  const y = Math.max(0.5, Math.min(4, t.y));
  if (x === t.x && z === t.z && y === t.y) return;
  const dx = x - t.x, dy = y - t.y, dz = z - t.z;
  t.set(x, y, z);
  control.object.position.x += dx; control.object.position.y += dy; control.object.position.z += dz;
}

function CityControls({ selected, drilled, reset, controls }: { selected: DistrictId; drilled: DistrictId | null; reset: number; controls: React.RefObject<OrbitControlsType | null> }) {
  const { size, camera, invalidate } = useThree();
  const goal = useRef(new THREE.Vector3(0, 1.5, 0));
  const zoomGoal = useRef(cityCameraZoom(typeof window === "undefined" ? 840 : window.innerWidth, false));
  const flying = useRef(false);
  // Glide look-at + orthographic zoom for JC-5 drill-down; keep rendering while it moves.
  useFrame((_, delta) => {
    const control = controls.current;
    if (!control || !flying.current) return;
    const dt = Math.min(delta, 0.05);
    const ease = 1 - Math.exp(-6 * dt);
    control.target.lerp(goal.current, ease);
    if (camera instanceof THREE.OrthographicCamera) {
      camera.zoom += (zoomGoal.current - camera.zoom) * ease;
      camera.updateProjectionMatrix();
    }
    control.update();
    const targetDone = control.target.distanceTo(goal.current) < 0.01;
    const zoomDone = !(camera instanceof THREE.OrthographicCamera) || Math.abs(camera.zoom - zoomGoal.current) < 0.05;
    if (targetDone && zoomDone) {
      control.target.copy(goal.current);
      if (camera instanceof THREE.OrthographicCamera) { camera.zoom = zoomGoal.current; camera.updateProjectionMatrix(); }
      control.update();
      flying.current = false;
    } else invalidate();
  });
  useEffect(() => {
    const focus = drilled ?? selected;
    const district = CITY_DISTRICTS.find(d => d.id === focus);
    const x = district?.position[0] ?? 0, z = district?.position[1] ?? 0;
    // Drill-down looks at the tower; overview stays a soft pull toward the district.
    const pull = drilled ? 1 : 0.35;
    goal.current.set(x * pull, drilled ? 2.2 : 1.5, z * pull);
    zoomGoal.current = cityCameraZoom(size.width, Boolean(drilled));
    flying.current = true;
    invalidate();
  }, [selected, drilled, size.width, controls, invalidate]);
  useEffect(() => {
    camera.position.set(25, 26, 30);
    goal.current.set(0, 1.5, 0);
    zoomGoal.current = cityCameraZoom(size.width, false);
    if (camera instanceof THREE.OrthographicCamera) {
      camera.zoom = zoomGoal.current;
      camera.updateProjectionMatrix();
    }
    controls.current?.target.set(0, 1.5, 0);
    controls.current?.update();
  }, [reset, camera, controls, size.width]);
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


/** Sparse rain streaks from measured failure density. No motion when density is 0. */
function Rain({ density, color }: { density: number; color: string }) {
  const drops = useMemo(() => {
    const count = Math.max(0, Math.min(120, Math.round(density * 120)));
    return Array.from({ length: count }, (_, i) => ({
      x: ((i * 47) % 200) / 10 - 10,
      z: ((i * 91) % 200) / 10 - 10,
      y: 8 + ((i * 13) % 40) / 10,
      speed: 4 + (i % 5),
    }));
  }, [density]);
  const group = useRef<THREE.Group>(null);
  useFrame((_, rawDelta) => {
    const root = group.current;
    if (!root || density <= 0) return;
    const delta = Math.min(rawDelta, 0.05);
    root.children.forEach((child, i) => {
      const drop = drops[i];
      if (!drop) return;
      child.position.y -= drop.speed * delta;
      if (child.position.y < 0) child.position.y = drop.y;
    });
  });
  if (density <= 0 || drops.length === 0) return null;
  return (
    <group ref={group} aria-hidden>
      {drops.map((drop, i) => (
        <mesh key={i} position={[drop.x, drop.y, drop.z]}>
          <boxGeometry args={[0.02, 0.35, 0.02]} />
          <meshBasicMaterial color={color} transparent opacity={0.35 + density * 0.35} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

export default function CityScene({ snapshot, selected, drilled, onSelect, palette, motion, reset, onFailure, skyMode = "neutral", weather, showWeather = false }: CitySceneProps) {
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
  const anyActive = motion && CITY_DISTRICTS.some(d => {
    const s = buildingStyleFor(d.id, snapshot, Date.now(), true);
    return s.risingWindows || s.goldRing || s.strobe;
  });
  const lighting = skyLighting(skyMode, palette.ground);
  const approvals = useApprovalBeacons();
  const openApprovals = useOpenApprovals();
  const beaconsPulse = motion && approvals.status === "ok" && approvals.total > 0;
  const rainOn = Boolean(showWeather && motion && weather && weather.kind === "rain" && weather.density > 0);
  return <Canvas orthographic shadows dpr={[CITY_DPR_MIN, dpr]} frameloop="demand" camera={{ position: [25, 26, 30], zoom: 20, near: 0.1, far: 150 }} gl={{ antialias: true, powerPreference: "low-power" }} onCreated={({ gl }) => { gl.domElement.addEventListener("webglcontextlost", onFailure, { once: true }); }} fallback={<div role="alert">3D unavailable. Switch to Operations.</div>}>
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
    {CITY_DISTRICTS.map((d, index) => <Suspense key={d.id} fallback={null}><Building index={index} palette={palette} selected={selected === d.id || drilled === d.id} style={buildingStyleFor(d.id, snapshot, now, motion)} compact={compact} onSelect={() => onSelect(d.id)} /></Suspense>)}
    <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.09} enableRotate zoomToCursor screenSpacePanning={false} panSpeed={1.1} minZoom={8} maxZoom={65} minPolarAngle={0.35} maxPolarAngle={1.25} target={[0, 1.5, 0]} onChange={keepCityInView} touches={CITY_TOUCHES} />
    {motion && anyActive ? <PerformanceMonitor bounds={() => [CITY_ANIMATION_FPS * 0.6, CITY_ANIMATION_FPS * 0.9]} onDecline={() => setDpr(CITY_DPR_MIN)} onIncline={() => setDpr(ceiling)} /> : null}
    <CityControls selected={selected} drilled={drilled} reset={reset} controls={controls} />
    <ApprovalBeacons3D state={approvals} gold={palette.gold} motion={motion} onOpen={openApprovals} />
    {rainOn ? <Rain density={weather!.density} color={palette.cyan} /> : null}
    <AnimationClock running={Boolean(anyActive || rainOn || beaconsPulse || drilled)} />
  </Canvas>;
}