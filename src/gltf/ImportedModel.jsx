
import React, { useEffect, useMemo } from "react";
import { Center } from "@react-three/drei";
import * as THREE from "three";
import { useGLTFResilient } from "./useGLTFResilient.js";

/**
 * Ultra-fast wireframe overlay:
 * - One-time build of a single merged EdgesGeometry (no BufferGeometryUtils).
 * - Overlay lives beside meshes (not as their child), so it doesn't hide with them.
 * - Toggling is just visibility flips; we never touch PBR materials.
 *
 * Props:
 *  - descriptor: { type, url, urlModifier? }
 *  - wireframe: boolean
 *  - wireOpacity: number (0..1)
 *  - onScene(scene): callback when ready
 *  - wireAngle?: number (edge threshold in degrees; default 35; raise to 50–60 for fewer lines)
 */
export default function ImportedModel({
                                        descriptor,
                                        wireframe = false,
                                        wireOpacity = 1,
                                        onScene,
                                        wireAngle = 35,
                                      }) {
  const { gltf, error } = useGLTFResilient(descriptor, onScene);

  // shared cheap material for lines
  const lineMat = useMemo(() => {
    const m = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
    m.depthTest = true;   // keep proper occlusion vs. itself/rooms
    m.depthWrite = false; // don't write depth
    return m;
  }, []);

  useEffect(() => {
    if (!gltf?.scene) return;

    const scene = gltf.scene;

    // nuke any previous overlay (hot reload)
    const old = scene.getObjectByName("__wire_overlay__");
    if (old && old.parent) old.parent.remove(old);

    // ensure world transforms are current
    scene.updateMatrixWorld(true);

    // collect all meshes up front for fast toggling later
    const meshList = [];
    scene.traverse((o) => {
      if ((o.isMesh || o.isSkinnedMesh) && o.geometry) meshList.push(o);
    });

    // build one merged edges geometry in SCENE LOCAL space
    const sceneInv = scene.matrixWorld.clone().invert();

    // First pass: compute total vertex count so we can allocate once
    let totalFloats = 0;
    const transforms = [];
    const sources = [];
    for (const mesh of meshList) {
      try {
        const eg = new THREE.EdgesGeometry(mesh.geometry, wireAngle);
        // bake mesh into scene-local space
        const mat = sceneInv.clone().multiply(mesh.matrixWorld);
        eg.applyMatrix4(mat);
        const pos = eg.getAttribute("position");
        if (pos && pos.array && pos.array.length) {
          totalFloats += pos.array.length;
          transforms.push(null); // placeholder to keep index alignment
          sources.push(eg);
        } else {
          eg.dispose();
        }
      } catch {
        // ignore non-buffer or invalid geometry
      }
    }

    const overlayRoot = new THREE.Group();
    overlayRoot.name = "__wire_overlay__";
    overlayRoot.visible = false; // start hidden until user toggles wireframe
    scene.add(overlayRoot);

    if (totalFloats > 0) {
      const mergedPositions = new Float32Array(totalFloats);
      let offset = 0;

      for (const eg of sources) {
        const pos = eg.getAttribute("position");
        mergedPositions.set(pos.array, offset);
        offset += pos.array.length;
        eg.dispose();
      }

      const merged = new THREE.BufferGeometry();
      merged.setAttribute("position", new THREE.BufferAttribute(mergedPositions, 3));
      merged.computeBoundingSphere();
      merged.computeBoundingBox();

      const lines = new THREE.LineSegments(merged, lineMat);
      lines.name = "__wire_lines__";
      lines.matrixAutoUpdate = false;
      lines.frustumCulled = true;
      overlayRoot.add(lines);

      // stash for fast toggling
      scene.userData.__wire = { overlayRoot, lines, lineMat, meshList };
    } else {
      // nothing to draw (edge case)
      scene.userData.__wire = { overlayRoot, lines: null, lineMat, meshList };
    }

    // cleanup on descriptor change/unmount
    return () => {
      const w = scene.userData.__wire;
      if (w?.overlayRoot?.parent) w.overlayRoot.parent.remove(w.overlayRoot);
      scene.userData.__wire = undefined;
    };
  }, [gltf, wireAngle, lineMat]);

  // toggle visibility — no material changes (fast)
  useEffect(() => {
    if (!gltf?.scene) return;
    const w = gltf.scene.userData.__wire;
    if (!w) return;

    // show/hide base meshes quickly
    for (const mesh of w.meshList || []) {
      mesh.visible = !wireframe;
      // keep any prior wireframe flags OFF to avoid shader recompiles
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) if (m && "wireframe" in m) m.wireframe = false;
    }

    // show/hide overlay
    if (w.overlayRoot) w.overlayRoot.visible = !!wireframe;
  }, [gltf, wireframe]);

  // update opacity on the single line material
  useEffect(() => {
    const o = Math.max(0.02, Math.min(1, Number(wireOpacity) || 1));
    lineMat.opacity = o;
    lineMat.transparent = o < 1;
    lineMat.needsUpdate = true;
  }, [lineMat, wireOpacity]);

    if (error || !gltf) return null;
    return (
          <Center disableY>
              <primitive object={gltf.scene} />
            </Center>
       );
}
