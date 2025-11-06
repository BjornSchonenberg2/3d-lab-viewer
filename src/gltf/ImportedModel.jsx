import React, { useEffect } from "react";
import * as THREE from "three";
import { useGLTFResilient } from "./useGLTFResilient.js";

export default function ImportedModel({ descriptor, wireframe = false, onScene }) {
  const { gltf, error } = useGLTFResilient(descriptor, onScene);

  useEffect(() => {
    if (!gltf?.scene) return;
    gltf.scene.traverse((obj) => {
      if (obj.isMesh && obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m && "wireframe" in m) m.wireframe = !!wireframe;
          if (m && m instanceof THREE.MeshStandardMaterial) m.needsUpdate = true;
        }
      }
    });
  }, [gltf, wireframe]);

  if (error) return null;
  if (!gltf) return null;
  return <primitive object={gltf.scene} />;
}
