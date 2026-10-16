import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

// A restrained wireframe sphere + drifting particle field. Single render loop
// driven by R3F; low segment counts and no post-processing to stay cheap.
function WireSphere() {
  const ref = useRef();
  useFrame((_, d) => { if (ref.current) { ref.current.rotation.y += d * 0.06; ref.current.rotation.x += d * 0.02; } });
  const geo = useMemo(() => new THREE.IcosahedronGeometry(3.1, 2), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#22d3ee", wireframe: true, transparent: true, opacity: 0.16 }), []);
  return <mesh ref={ref} geometry={geo} material={mat} position={[3.4, 0.2, -4]} />;
}

function Particles({ count = 320 }) {
  const ref = useRef();
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    // Seeded PRNG so the field is stable across renders (no Math.random).
    let s = 0x9e3779b9;
    const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) / 4294967296); };
    for (let i = 0; i < count * 3; i++) pos[i] = (rnd() - 0.5) * 26;
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, [count]);
  const mat = useMemo(() => new THREE.PointsMaterial({ color: "#a78bfa", size: 0.045, transparent: true, opacity: 0.55, sizeAttenuation: true }), []);
  useFrame((_, d) => { if (ref.current) ref.current.rotation.y += d * 0.015; });
  return <points ref={ref} geometry={geo} material={mat} />;
}

export default function NeonScene() {
  return (
    <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 9], fov: 55 }} gl={{ antialias: false, alpha: true, powerPreference: "low-power" }}>
      <WireSphere />
      <Particles />
    </Canvas>
  );
}
