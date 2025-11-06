import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

export default function EpicTube({
                                   curve,
                                   thickness = 0.07,
                                   glow = 1.4,
                                   color = "#80d8ff",
                                   speed = 1,
                                   trail = true,
                                   selected = false,
                                   widthHint = 2,
                                   animate = true,
                                 }) {
  const matRef = useRef();
  const geom = useMemo(() => {
    const tubularSegments = 240;
    return new THREE.TubeGeometry(curve, tubularSegments, thickness, 12, false);
  }, [curve, thickness]);

  const color3 = useMemo(() => new THREE.Color(color), [color]);

  useFrame(({ clock }) => {
    if (!matRef.current) return;
    const t = clock.getElapsedTime();
    const pulse = animate ? 0.85 + Math.sin(t * speed * 1.7) * 0.15 : 1.0;
    matRef.current.emissiveIntensity = (glow || 1.4) * pulse * (selected ? 1.2 : 1);
  });

  const headRef = useRef();
  useFrame(({ clock }) => {
    if (!headRef.current) return;
    const t = ((animate ? clock.getElapsedTime() : 0) * speed * 0.12) % 1;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    headRef.current.position.copy(p);
    headRef.current.lookAt(p.clone().add(tan));
  });

  return (
      <group>
        <mesh geometry={geom}>
          <meshPhysicalMaterial
              ref={matRef}
              color={color3}
              emissive={color3.clone().multiplyScalar(0.7)}
              emissiveIntensity={glow}
              roughness={0.25}
              metalness={0.0}
              transparent
              opacity={selected ? 1 : 0.98}
              side={THREE.DoubleSide}
          />
        </mesh>

        {trail && (
            <mesh ref={headRef}>
              <coneGeometry args={[thickness * 1.6, thickness * 5, 8]} />
              <meshBasicMaterial color={color3} transparent opacity={0.95} />
            </mesh>
        )}
      </group>
  );
}
