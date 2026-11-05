import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CITY_DISTRICTS } from "@/lib/ai-city";
import { beaconDistricts, type ApprovalBeaconState } from "@/lib/city-approval-beacons";

const ORDER = CITY_DISTRICTS.map((d) => d.id);

function Diamond({
  gold,
  height,
  motion,
  onOpen,
}: {
  gold: string;
  height: number;
  motion: boolean;
  onOpen: () => void;
}) {
  const ref = useRef<THREE.Group>(null);
  const time = useRef(0);
  useFrame((_, rawDelta) => {
    // Reduced motion: the beacon stays put, fully lit. It never bobs or spins.
    if (!motion || !ref.current) return;
    time.current += Math.min(rawDelta, 0.05);
    ref.current.rotation.y += Math.min(rawDelta, 0.05) * 0.8;
    ref.current.position.y = height + Math.sin(time.current * 2.2) * 0.12;
  });
  // Unlit, un-fogged and not tone-mapped, so it stays gold in a dusk or night sky.
  return (
    <group
      ref={ref}
      position-y={height}
      onClick={(event) => {
        event.stopPropagation();
        if (event.delta < 5) onOpen();
      }}
    >
      <mesh>
        <octahedronGeometry args={[0.34]} />
        <meshBasicMaterial color={gold} fog={false} toneMapped={false} />
      </mesh>
      <mesh position-y={-0.55}>
        <cylinderGeometry args={[0.025, 0.025, 0.7, 6]} />
        <meshBasicMaterial color={gold} fog={false} toneMapped={false} transparent opacity={0.8} />
      </mesh>
    </group>
  );
}

/** Gold beacons over the districts that own a waiting approval. Nothing when the read failed. */
export function ApprovalBeacons3D({
  state,
  gold,
  motion,
  onOpen,
}: {
  state: ApprovalBeaconState;
  gold: string;
  motion: boolean;
  onOpen: () => void;
}) {
  return (
    <>
      {beaconDistricts(state, ORDER).map(({ id }) => {
        const d = CITY_DISTRICTS.find((district) => district.id === id)!;
        return (
          <group key={id} position={[d.position[0], 0, d.position[1]]}>
            <Diamond gold={gold} height={d.height + 1.7} motion={motion} onOpen={onOpen} />
          </group>
        );
      })}
    </>
  );
}
