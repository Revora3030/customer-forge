import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Html, Lightformer, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsType } from "three-stdlib";
import { CITY_DISTRICTS, districtCounts, districtState, type CitySnapshot, type DistrictId } from "@/lib/ai-city";
import towerA from "@/assets/city/building-skyscraper-a.asset.json";
import towerB from "@/assets/city/building-skyscraper-b.asset.json";
import towerC from "@/assets/city/building-skyscraper-c.asset.json";
import towerD from "@/assets/city/building-skyscraper-d.asset.json";
import towerE from "@/assets/city/building-skyscraper-e.asset.json";
import factory from "@/assets/city/building-f.asset.json";
import library from "@/assets/city/building-m.asset.json";

type Palette = { ground: string; road: string; structure: string; gold: string; cyan: string; magenta: string; light: string; muted: string; ok: string; danger: string };
type DState = ReturnType<typeof districtState>;
const MODEL_URLS = [towerA.url, factory.url, towerC.url, towerD.url, towerB.url, towerE.url, library.url];
export type CitySceneProps = { snapshot?: CitySnapshot | undefined; selected: DistrictId; onSelect: (id: DistrictId) => void; palette: Palette; motion: boolean; reset: number; onFailure: () => void };

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

function Building({ index, palette, selected, active, state, counts, compact, onSelect }: { index: number; palette: Palette; selected: boolean; active: boolean; state: DState; counts: ReturnType<typeof districtCounts>; compact: boolean; onSelect: () => void }) {
  const district = CITY_DISTRICTS[index];
  const url = MODEL_URLS[index];
  // These CC0 assets are uncompressed: never initialize WASM decoders or fetch CDN decoder code.
  const { scene } = useGLTF(url ?? towerA.url, false, false);
  const building = useMemo(() => {
    const clone = scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    clone.scale.setScalar((district?.height ?? 4) / Math.max(size.y, 0.1));
    const scaled = new THREE.Box3().setFromObject(clone);
    const center = scaled.getCenter(new THREE.Vector3());
    clone.position.set(-center.x, -scaled.min.y, -center.z);
    clone.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
      const tint = (material: THREE.Material) => {
        const copy = material.clone();
        if (copy instanceof THREE.MeshStandardMaterial) {
          copy.color.set(palette.structure);
          copy.metalness = 0.45;
          copy.roughness = 0.55;
        }
        return copy;
      };
      object.material = Array.isArray(object.material) ? object.material.map(tint) : tint(object.material);
    });
    return clone;
  }, [scene, district, palette.structure]);
  useEffect(() => () => building.traverse(object => {
    if (object instanceof THREE.Mesh) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => material.dispose());
    }
  }), [building]);
  if (!district) return null;
  // Colour tells the recorded state: green working, red with failures, gold waiting, muted unreadable.
  const tone = palette[district.tone];
  const color = state === "working" ? palette.ok : state === "attention" ? ((counts?.errors ?? 0) > 0 ? palette.danger : palette.gold) : state === "unavailable" ? palette.muted : tone;
  return <group position={[district.position[0], 0, district.position[1]]} onClick={event => { event.stopPropagation(); if (event.delta < 5) onSelect(); }}>
    <mesh position-y={-0.02} receiveShadow><boxGeometry args={[5, 0.15, 5]} /><meshStandardMaterial color={palette.structure} metalness={0.6} roughness={0.5} emissive={color} emissiveIntensity={state === "working" ? 0.2 : state === "attention" ? 0.14 : 0} /></mesh>
    <primitive object={building} />
    <mesh rotation-x={-Math.PI / 2} position-y={0.07}><ringGeometry args={[2.8, selected ? 2.95 : 2.84, 4]} /><meshBasicMaterial color={selected ? palette.gold : color} transparent opacity={selected ? 1 : state === "idle" ? 0.45 : 0.9} /></mesh>
    <PulseRings color={color} active={active} />
    <Beacon color={color} height={district.height + 0.7} active={active || state === "attention"} urgent={state === "attention"} />
    <Html position={[0, district.height + 1.2, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
      {compact && !selected ? (counts && counts.running + counts.queued + counts.errors ? <div aria-hidden="true" className="rounded-full border border-border bg-background/90 px-1.5 text-[10px] leading-4 text-foreground">{counts.running + counts.queued + counts.errors}</div> : null) : <div aria-hidden="true" className={`whitespace-nowrap rounded border bg-background/85 px-2 py-0.5 text-center text-[11px] leading-tight text-foreground backdrop-blur-sm ${selected ? "border-gold" : "border-border"}`}>
        <div className="font-medium">{district.name}</div>
        {counts === null ? <div className="text-[10px] text-destructive">records unavailable</div> : counts.running + counts.queued + counts.errors ? <div className="text-[10px] text-muted-foreground">{[counts.running ? `${counts.running} running` : "", counts.queued ? `${counts.queued} waiting` : "", counts.errors ? `${counts.errors} failed` : ""].filter(Boolean).join(" · ")}</div> : null}
      </div>}
    </Html>
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

function Beacon({ color, height, active, urgent = false }: { color: string; height: number; active: boolean; urgent?: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const time = useRef(0);
  useFrame((_, rawDelta) => {
    if (!active || !ref.current) return;
    time.current += Math.min(rawDelta, 0.05);
    ref.current.rotation.y += Math.min(rawDelta, 0.05);
    // A waiting or failed district blinks faster than a working one pulses.
    ref.current.scale.setScalar(0.8 + Math.sin(time.current * (urgent ? 5 : 2)) * 0.2);
  });
  return <mesh ref={ref} position-y={height}><octahedronGeometry args={[0.22]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 3 : 0.2} /></mesh>;
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
  const controls = useRef<OrbitControlsType>(null);
  const anyActive = CITY_DISTRICTS.some(d => districtState(d.id, snapshot, Date.now()) === "working");
  return <Canvas orthographic shadows dpr={[1, 1.5]} frameloop={motion && anyActive ? "always" : "demand"} camera={{ position: [25, 26, 30], zoom: 20, near: 0.1, far: 150 }} gl={{ antialias: true, powerPreference: "low-power" }} onCreated={({ gl }) => { gl.domElement.addEventListener("webglcontextlost", onFailure, { once: true }); }} fallback={<div role="alert">3D unavailable. Switch to Operations.</div>}>
    <color attach="background" args={[palette.ground]} />
    <fogExp2 attach="fog" args={[palette.ground, 0.011]} />
    <ambientLight intensity={0.95} color="#9fb4c4" />
    <directionalLight position={[-12, 9, -14]} intensity={0.9} color={palette.cyan} />
    <pointLight position={[0, 9, 0]} intensity={22} distance={22} decay={2} color={palette.gold} />
    <directionalLight position={[10, 20, 8]} intensity={2.2} color="#ffe2b0" castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={20} shadow-camera-bottom={-20} />
    <Environment resolution={64}><Lightformer intensity={2} position={[0, 12, 0]} rotation-x={Math.PI / 2} scale={[25, 25, 1]} /><Lightformer intensity={1.5} color={palette.cyan} position={[-15, 3, 0]} rotation-y={Math.PI / 2} scale={[20, 10, 1]} /></Environment>
    <Ground palette={palette} />
    {CITY_DISTRICTS.filter(d => d.id !== "executive").map(d => {
      const state = districtState(d.id, snapshot, now);
      const counts = districtCounts(snapshot, d.id, now);
      const color = state === "working" ? palette.ok : state === "attention" ? ((counts?.errors ?? 0) > 0 ? palette.danger : palette.gold) : palette.muted;
      return <Conduit key={`c-${d.id}`} to={d.position} color={color} strength={state === "working" || state === "attention" ? 0.85 : state === "unavailable" ? 0.12 : 0.28} />;
    })}
    {CITY_DISTRICTS.map((d, index) => <Suspense key={d.id} fallback={null}><Building index={index} palette={palette} selected={selected === d.id} active={motion && districtState(d.id, snapshot, now) === "working"} state={districtState(d.id, snapshot, now)} counts={districtCounts(snapshot, d.id, now)} compact={compact} onSelect={() => onSelect(d.id)} /></Suspense>)}
    <OrbitControls ref={controls} makeDefault enableDamping enableRotate minZoom={8} maxZoom={65} minPolarAngle={0.35} maxPolarAngle={1.25} target={[0, 1.5, 0]} touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }} />
    <CityControls selected={selected} reset={reset} controls={controls} />
  </Canvas>;
}