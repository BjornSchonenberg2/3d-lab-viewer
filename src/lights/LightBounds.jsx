// LightBounds.jsx
import React, { useMemo } from "react";
import * as THREE from "three";

/**
 * Renders wireframe bounds originating at the NODE origin.
 * The parent group (Node3D) already positions at node.position.
 */
export default function LightBounds({ node, globalOn }) {
  const light = node.light || {};
  const show = globalOn || light.showBounds;
  if (!show || light.type === "none") return null;

  const dist = light.distance ?? 9;
  const angle = Math.min(Math.max(light.angle ?? 0.6, 0.01), 1.5);
  const safeDist = Math.max(0.001, dist);
  const radius = Math.tan(angle) * safeDist;
  const yaw = (light.yaw ?? 0) * (Math.PI / 180);
  const pitch = (light.pitch ?? -30) * (Math.PI / 180);

  const dir = useMemo(() => {
    const d = new THREE.Vector3(0, -1, 0);
    d.applyEuler(new THREE.Euler(pitch, yaw, 0, "YXZ")).normalize();
    return d;
  }, [yaw, pitch]);

  if (light.type === "point") {
    const r = light.distance ?? 8;
    return (
        <mesh>
          <sphereGeometry args={[Math.max(0.01, r), 24, 16]} />
          <meshBasicMaterial
              color={light.color || "#ffffff"}
              wireframe
              transparent
              opacity={0.6}
          />
        </mesh>
    );
  }

  if (light.type === "spot") {
    const coneGeom = new THREE.ConeGeometry(Math.max(0.001, radius), safeDist, 24, 1, true);
    // Apex at origin, base towards -Y (we rotate later)
    coneGeom.translate(0, -safeDist / 2, 0);
    const up = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(up, dir);

    return (
        <group quaternion={q}>
          <mesh geometry={coneGeom}>
            <meshBasicMaterial
                color={light.color || "#ffffff"}
                wireframe
                transparent
                opacity={0.7}
            />
          </mesh>
          {/* small marker at the cone tip */}
          <mesh position={[0, -safeDist, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.01, 0.01, 0.2, 8]} />
            <meshBasicMaterial
                color={light.color || "#ffffff"}
                transparent
                opacity={0.8}
            />
          </mesh>
        </group>
    );
  }

  return null;
}
