// src/data/models/registry.js
// Drop your .glb/.gltf files into this folder. Non-recursive by default.
import yachtUrl from "./yacht.glb"; // bundler turns this into a URL

const ctx = require.context("./", false, /\.(glb|gltf)$/i);

const nice = (p) =>
    p.replace(/^.\//, "").replace(/\.(glb|gltf)$/i, "").replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (m) => m.toUpperCase());

export const STATIC_MODELS = [
    { id: "yacht", name: "Yacht", type: "glb", url: yachtUrl },
];