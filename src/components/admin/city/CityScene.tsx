import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Html, Lightformer, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsType } from "three-stdlib";
import { CITY_DISTRICTS, districtState, type CitySnapshot, type DistrictId } from "@/lib/ai-city";
import towerA from "@/assets/city/building-skyscraper-a.asset.json";
import towerB from "@/assets/city/building-skyscraper-b.asset.json";
import towerC from "@/assets/city/building-skyscraper-c.asset.json";
import towerD from "@/assets/city/building-skyscraper-d.asset.json";
import towerE from "@/assets/city/building-skyscraper-e.asset.json";
import factory from "@/assets/city/building-f.asset.json";
import library from "@/assets/city/building-m.asset.json";

type Palette = { ground: string; road: string; structure: string; gold: string; cyan: string; magenta: string; light: string; muted: string };
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

function Building({ index, palette, selected, active, onSelect }: { index: number; palette: Palette; selected: boolean; active: boolean; onSelect: () => void }) {
  const district = CITY_DISTRICTS[index];
  const url = MODEL_URLS[index];
  const { scene } = useGLTF(url ?? towerA.url);
  const building = useMemo(() => {
    const clone = scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    clone.scale.setScalar((district?.height ?? 4) / Math.max(size.y, 0.1));
    const scaled = new THREE.Box3().setFromObject(clone);
    const center = scaled.getCenter(new THREE.Vector3());
    clone.position.set(-center.x, -scaled.min.y, -center.z);
    clone.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; } });
    return clone;
  }, [scene, district]);
  if (!district) return null;
  const color = palette[district.tone];
  return <group position={[district.position[0], 0, district.position[1]]} onClick={event => { event.stopPropagation(); if (event.delta < 5) onSelect(); }}>
    <mesh position-y={-0.02} receiveShadow><boxGeometry args={[5, 0.15, 5]} /><meshStandardMaterial color={palette.structure} metalness={0.6} roughness={0.5} /></mesh>
    <primitive object={building} />
    <mesh rotation-x={-Math.PI / 2} position-y={0.07}><ringGeometry args={[2.8, selected ? 2.95 : 2.84, 4]} /><meshBasicMaterial color={selected ? palette.gold : color} transparent opacity={selected ? 1 : 0.45} /></mesh>
    <Beacon color={color} height={district.height + 0.7} active={active} />
  </group>;
}

function Beacon({ color, height, active }: { color: string; height: number; active: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const time = useRef(0);
  useFrame((_, rawDelta) => {
    if (!active || !ref.current) return;
    time.current += Math.min(rawDelta, 0.05);
    ref.current.rotation.y += Math.min(rawDelta, 0.05);
    ref.current.scale.setScalar(0.8 + Math.sin(time.current * 2) * 0.2);
  });
  return <mesh ref={ref} position-y={height}><octahedronGeometry args={[0.22]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 3 : 0.2} /></mesh>;
}

function CityControls({ selected, reset, controls }: { selected: DistrictId; reset: number; controls: React.RefObject<OrbitControlsType | null> }) {
  const { size, camera } = useThree();
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
    control.target.set(x * 0.35, 1.5, z * 0.35);
    control.update();
  }, [selected, controls]);
  useEffect(() => {
    camera.position.set(25, 26, 30);
    controls.current?.target.set(0, 1.5, 0);
    controls.current?.update();
  }, [reset, camera, controls]);
  return null;
}

export default function CityScene({ snapshot, selected, onSelect, palette, motion, reset, onFailure }: CitySceneProps) {
  const controls = useRef<OrbitControlsType>(null);
  const anyActive = CITY_DISTRICTS.some(d => districtState(d.id, snapshot, Date.now()) === "working");
  return <Canvas orthographic shadows dpr={[1, 1.5]} frameloop={motion && anyActive ? "always" : "demand"} camera={{ position: [25, 26, 30], zoom: 20, near: 0.1, far: 150 }} gl={{ antialias: true, powerPreference: "low-power" }} onCreated={({ gl }) => { gl.domElement.addEventListener("webglcontextlost", onFailure, { once: true }); }} fallback={<div role="alert">3D unavailable. Switch to Operations.</div>}>
    <color attach="background" args={[palette.ground]} />
    <ambientLight intensity={1.2} />
    <directionalLight position={[10, 20, 8]} intensity={2.5} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={20} shadow-camera-bottom={-20} />
    <Environment resolution={64}><Lightformer intensity={2} position={[0, 12, 0]} rotation-x={Math.PI / 2} scale={[25, 25, 1]} /><Lightformer intensity={1.5} color={palette.cyan} position={[-15, 3, 0]} rotation-y={Math.PI / 2} scale={[20, 10, 1]} /></Environment>
    <Ground palette={palette} />
    {CITY_DISTRICTS.map((d, index) => <Suspense key={d.id} fallback={<Html position={[d.position[0], 1, d.position[1]]} center><span className="text-xs text-muted-foreground">Loading {d.name}…</span></Html>}><Building index={index} palette={palette} selected={selected === d.id} active={motion && districtState(d.id, snapshot, Date.now()) === "working"} onSelect={() => onSelect(d.id)} /></Suspense>)}
    <OrbitControls ref={controls} makeDefault enableDamping enableRotate minZoom={8} maxZoom={65} minPolarAngle={0.35} maxPolarAngle={1.25} target={[0, 1.5, 0]} touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }} />
    <CityControls selected={selected} reset={reset} controls={controls} />
  </Canvas>;
}