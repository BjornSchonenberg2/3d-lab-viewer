import { useEffect, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

export async function loadGLTFFallback({ url, urlModifier, dracoCandidates }) {
  return new Promise((resolve, reject) => {
    let i = 0;

    const tryLoad = () => {
      // Use a manager so we can set the URL modifier here (correct API)
      const manager = new THREE.LoadingManager();
      if (urlModifier) manager.setURLModifier(urlModifier);

      const loader = new GLTFLoader(manager);

      // Try DRACO candidates until one works
      const draco = new DRACOLoader(manager);
      const path = dracoCandidates[i];
      if (path) {
        try {
          draco.setDecoderPath(path);
          draco.setDecoderConfig({ type: "wasm" });
          loader.setDRACOLoader(draco);
        } catch {}
      }

      loader.load(
          url,
          (g) => resolve(g),
          undefined,
          (err) => {
            if (i < dracoCandidates.length - 1) {
              i += 1;
              tryLoad();
            } else {
              reject(err);
            }
          }
      );
    };

    tryLoad();
  });
}

export function useGLTFResilient(descriptor, onReady) {
  const [gltf, setGltf] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!descriptor?.url) return;
      try {
        const candidates = [
          `${process.env.PUBLIC_URL || ""}/draco/`,
          "/draco/",
          "https://www.gstatic.com/draco/v1/decoders/",
        ];
        const g = await loadGLTFFallback({
          url: descriptor.url,
          urlModifier: descriptor.urlModifier,
          dracoCandidates: candidates,
        });
        if (!cancelled) {
          setGltf(g);
          onReady && onReady(g.scene);
        }
      } catch (e) {
        if (!cancelled) setError(e);
      }
    })();

    return () => {
      cancelled = true;
      descriptor?.cleanup && descriptor.cleanup();
    };
  }, [descriptor?.url, descriptor?.urlModifier, onReady]);

  return { gltf, error };
}
