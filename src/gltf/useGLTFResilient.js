// src/gltf/useGLTFResilient.js
import { useEffect, useState } from "react";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

export function useGLTFResilient(descriptor, onReady) {
  const [gltf, setGltf] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function go() {
      if (!descriptor?.url) return;
      try {
        const loader = new GLTFLoader();
        loader.setCrossOrigin("anonymous");

        // If descriptor provided a URL modifier (e.g., zip->gltf mapping),
        // hook it up so external buffers/textures resolve.
        if (typeof descriptor.urlModifier === "function") {
          loader.setURLModifier(descriptor.urlModifier);
        }

        // Optional Meshopt (won’t break if missing)
        try {
          const { MeshoptDecoder } = await import(
              "three/examples/jsm/libs/meshopt_decoder.module.js"
              );
          loader.setMeshoptDecoder(MeshoptDecoder);
        } catch {}

        // DRACO from /public/draco/ (you have this folder)
        const draco = new DRACOLoader();
        draco.setDecoderPath("/draco/");
        draco.setDecoderConfig({ type: "wasm" });
        draco.preload();
        loader.setDRACOLoader(draco);

        loader.load(
            descriptor.url,
            (g) => {
              if (cancelled) return;
              setGltf(g);
              onReady && onReady(g.scene);
            },
            undefined,
            (e) => {
              if (cancelled) return;
              console.error("GLTF load error:", e);
              setError(e);
            }
        );
      } catch (e) {
        if (!cancelled) {
          console.error("GLTF load error:", e);
          setError(e);
        }
      }
    }

    go();
    return () => {
      // IMPORTANT: do not revoke blob URLs here in dev (React 18 Strict re-mount)
      // If you really want to revoke, do it where you *replace* the descriptor.
      cancelled = true;
    };
  }, [descriptor?.url, descriptor?.urlModifier, onReady]);

  return { gltf, error };
}
