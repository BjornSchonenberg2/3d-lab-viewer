import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { OrbitControls, StatsGl } from "@react-three/drei";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { v4 as uuid } from "uuid";
import { STATIC_MODELS } from "./data/models/registry";

import SceneInner from "./SceneInner.jsx";
// If you are NOT using SceneInner, comment the line above and uncomment the 4 lines below:
// import ImportedModel from "./gltf/ImportedModel.jsx";
// import RoomBox from "./rooms/RoomBox.jsx";
// import Node3D from "./nodes/Node3D.jsx";
// import Link3D from "./links/Link3D.jsx";

import { DEFAULT_CLUSTERS, clusterColor } from "./utils/clusters.js";
import { TAU, clamp, snapValue } from "./utils/math.js";
import { Btn, IconBtn, Input, Select, Checkbox, Slider, Panel } from "./ui/Controls.jsx";

/* ============================ Per-node signals (visuals) ============================ */
function RingWave({ color = "#7cf", speed = 1, maxR = 0.7, thickness = 0.02 }) {
  const ref = useRef();
  useFrame(() => {
    if (!ref.current) return;
    const t = (performance.now() * 0.001 * speed) % 1;
    const r = 0.1 + t * maxR;
    const o = 1.0 - t;
    ref.current.scale.setScalar(r);
    ref.current.material.opacity = o * 0.6;
  });
  return (
      <mesh ref={ref} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1 - thickness, 1, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>
  );
}

function NodeSignals({ node, linksTo, style = "waves", color, speed = 1, size = 1 }) {
  if (style === "none") return null;
  if (style === "waves")
    return (
        <group position={node.position}>
          {[0, 1].map((i) => (
              <RingWave key={i} color={color || node.color || "#7cf"} speed={speed * (1 + i * 0.2)} maxR={0.6 * size} />
          ))}
        </group>
    );
  if (style === "rays")
    return (
        <group position={node.position}>
          {Array.from({ length: 6 }).map((_, i) => {
            const a = (i / 6) * TAU + performance.now() * 0.001 * speed;
            const x = Math.cos(a) * 0.35 * size;
            const z = Math.sin(a) * 0.35 * size;
            return (
                <mesh key={i} position={[x, 0.05, z]} rotation={[-Math.PI / 2, 0, 0]}>
                  <planeGeometry args={[0.05, 0.25]} />
                  <meshBasicMaterial color={color || node.color || "#7cf"} transparent opacity={0.6} />
                </mesh>
            );
          })}
        </group>
    );
  return null;
}

/* ============================ Per-node outgoing link editor ============================ */
function OutgoingLinksEditor({ node, nodes, links, setLinks }) {
  const outgoing = links
      .filter((l) => l.from === node.id)
      .map((l) => ({ ...l, targetName: nodes.find((n) => n.id === l.to)?.label || l.to }));

  const patch = (id, p) => setLinks((prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const patchNested = (id, path, value) =>
      setLinks((prev) =>
          prev.map((x) => {
            if (x.id !== id) return x;
            const copy = { ...x };
            let cur = copy;
            for (let i = 0; i < path.length - 1; i++) {
              const k = path[i];
              cur[k] = cur[k] ? { ...cur[k] } : {};
              cur = cur[k];
            }
            cur[path[path.length - 1]] = value;
            return copy;
          })
      );

  return (
      <div style={{ borderTop: "1px dashed rgba(255,255,255,0.15)", paddingTop: 8, marginTop: 8 }}>
        <div style={{ fontWeight: 900, marginBottom: 6 }}>Outgoing Links (flow per link)</div>
        {outgoing.length === 0 && <div style={{ opacity: 0.75, fontSize: 12 }}>No links originate from this node.</div>}
        {outgoing.map((l) => (
            <div key={l.id} style={{ padding: 8, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, marginBottom: 8 }}>
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
                to <strong>{l.targetName}</strong> (id: {l.id})
              </div>

              {/* Core */}
              <label>
                Style{" "}
                <select value={l.style || "particles"} onChange={(e) => patch(l.id, { style: e.target.value })}>
                  <option value="particles">particles</option>
                  <option value="wavy">wavy</option>
                  <option value="icons">icons</option>
                  <option value="dashed">dashed</option>
                  <option value="solid">solid</option>
                  <option value="epic">epic</option>
                </select>
              </label>

              <label style={{ display: "block", marginTop: 6 }}>
                Speed
                <input type="range" min={0} max={4} step={0.01} value={l.speed ?? 1}
                       onChange={(e) => patch(l.id, { speed: Number(e.target.value) })} />
              </label>

              <label style={{ display: "block", marginTop: 6 }}>
                Color
                <input type="color" value={l.color || "#7cf"} onChange={(e) => patch(l.id, { color: e.target.value })} />
              </label>

              {/* Curve block */}
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed rgba(255,255,255,0.12)" }}>
                <div style={{ fontWeight: 800, marginBottom: 4 }}>Curve</div>
                <label>
                  Mode{" "}
                  <select value={l.curve?.mode || "up"}
                          onChange={(e) => patchNested(l.id, ["curve", "mode"], e.target.value)}>
                    <option value="straight">straight</option>
                    <option value="up">up</option>
                    <option value="side">side</option>
                    <option value="arc">arc</option>
                  </select>
                </label>
                <label style={{ display: "block", marginTop: 6 }}>
                  Bend
                  <input type="range" min={0} max={1} step={0.01}
                         value={l.curve?.bend ?? 0.3}
                         onChange={(e) => patchNested(l.id, ["curve", "bend"], Number(e.target.value))} />
                </label>
                <label style={{ display: "block", marginTop: 6 }}>
                  Noise Amp
                  <input type="range" min={0} max={0.6} step={0.005}
                         value={l.curve?.noiseAmp ?? 0}
                         onChange={(e) => patchNested(l.id, ["curve", "noiseAmp"], Number(e.target.value))} />
                </label>
                <label style={{ display: "block", marginTop: 6 }}>
                  Noise Freq
                  <input type="range" min={0.2} max={8} step={0.05}
                         value={l.curve?.noiseFreq ?? 1.5}
                         onChange={(e) => patchNested(l.id, ["curve", "noiseFreq"], Number(e.target.value))} />
                </label>
              </div>

              {/* Particles / Wavy */}
              {(l.style === "particles" || l.style === "wavy") && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed rgba(255,255,255,0.12)" }}>
                    <div style={{ fontWeight: 800, marginBottom: 4 }}>Particles</div>
                    <label>
                      Count
                      <input type="range" min={1} max={120} step={1}
                             value={l.particles?.count ?? 24}
                             onChange={(e) => patchNested(l.id, ["particles", "count"], Number(e.target.value))} />
                    </label>
                    <label style={{ display: "block", marginTop: 6 }}>
                      Size
                      <input type="range" min={0.02} max={0.4} step={0.01}
                             value={l.particles?.size ?? 0.06}
                             onChange={(e) => patchNested(l.id, ["particles", "size"], Number(e.target.value))} />
                    </label>
                    <label style={{ display: "block", marginTop: 6 }}>
                      Opacity
                      <input type="range" min={0.1} max={1} step={0.01}
                             value={l.particles?.opacity ?? 1}
                             onChange={(e) => patchNested(l.id, ["particles", "opacity"], Number(e.target.value))} />
                    </label>
                    <label style={{ display: "block", marginTop: 6 }}>
                      Wave Amp
                      <input type="range" min={0} max={0.6} step={0.005}
                             value={l.particles?.waveAmp ?? (l.style === "wavy" ? 0.18 : 0.06)}
                             onChange={(e) => patchNested(l.id, ["particles", "waveAmp"], Number(e.target.value))} />
                    </label>
                    <label style={{ display: "block", marginTop: 6 }}>
                      Wave Freq
                      <input type="range" min={0.2} max={8} step={0.05}
                             value={l.particles?.waveFreq ?? 2}
                             onChange={(e) => patchNested(l.id, ["particles", "waveFreq"], Number(e.target.value))} />
                    </label>
                    <label style={{ display: "block", marginTop: 6 }}>
                      Shape
                      <select
                          value={l.particles?.shape || "sphere"}
                          onChange={(e) => patchNested(l.id, ["particles", "shape"], e.target.value)}
                      >
                        <option value="sphere">sphere</option>
                        <option value="box">box</option>
                        <option value="octa">octa</option>
                      </select>
                    </label>
                  </div>
              )}

              {/* Icons */}
              {l.style === "icons" && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed rgba(255,255,255,0.12)" }}>
                    <div style={{ fontWeight: 800, marginBottom: 4 }}>Icons</div>
                    <label>Char <input value={l.icon?.char ?? "▶"} onChange={(e) => patchNested(l.id, ["icon", "char"], e.target.value)} /></label>
                    <label style={{ display: "block", marginTop: 6 }}>
                      Count
                      <input type="range" min={1} max={12} step={1}
                             value={l.icon?.count ?? 4}
                             onChange={(e) => patchNested(l.id, ["icon", "count"], Number(e.target.value))} />
                    </label>
                    <label style={{ display: "block", marginTop: 6 }}>
                      Size
                      <input type="range" min={0.06} max={0.6} step={0.01}
                             value={l.icon?.size ?? 0.14}
                             onChange={(e) => patchNested(l.id, ["icon", "size"], Number(e.target.value))} />
                    </label>
                    <label style={{ display: "block", marginTop: 6 }}>
                      Color
                      <input type="color"
                             value={l.icon?.color ?? (l.color || "#ffffff")}
                             onChange={(e) => patchNested(l.id, ["icon", "color"], e.target.value)} />
                    </label>
                  </div>
              )}

              {/* Dashed */}
              {l.style === "dashed" && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed rgba(255,255,255,0.12)" }}>
                    <div style={{ fontWeight: 800, marginBottom: 4 }}>Dash</div>
                    <label>
                      Length
                      <input type="range" min={0.2} max={4} step={0.05}
                             value={l.dash?.length ?? 1}
                             onChange={(e) => patchNested(l.id, ["dash", "length"], Number(e.target.value))} />
                    </label>
                    <label style={{ display: "block", marginTop: 6 }}>
                      Gap
                      <input type="range" min={0.05} max={2} step={0.05}
                             value={l.dash?.gap ?? 0.25}
                             onChange={(e) => patchNested(l.id, ["dash", "gap"], Number(e.target.value))} />
                    </label>
                    <label style={{ display: "block", marginTop: 6 }}>
                      Animate
                      <input type="checkbox"
                             checked={(l.dash?.animate ?? true) === true}
                             onChange={(e) => patchNested(l.id, ["dash", "animate"], e.target.checked)} />
                    </label>
                  </div>
              )}

              {/* Epic tube */}
              {l.style === "epic" && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed rgba(255,255,255,0.12)" }}>
                    <div style={{ fontWeight: 800, marginBottom: 4 }}>Tube</div>
                    <label>
                      Thickness
                      <input type="range" min={0.02} max={0.25} step={0.005}
                             value={l.tube?.thickness ?? 0.07}
                             onChange={(e) => patchNested(l.id, ["tube", "thickness"], Number(e.target.value))} />
                    </label>
                    <label style={{ display: "block", marginTop: 6 }}>
                      Glow
                      <input type="range" min={0} max={3} step={0.05}
                             value={l.tube?.glow ?? 1.4}
                             onChange={(e) => patchNested(l.id, ["tube", "glow"], Number(e.target.value))} />
                    </label>
                    <label style={{ display: "block", marginTop: 6 }}>
                      Color
                      <input type="color" value={l.tube?.color ?? (l.color || "#80d8ff")}
                             onChange={(e) => patchNested(l.id, ["tube", "color"], e.target.value)} />
                    </label>
                    <label style={{ display: "block", marginTop: 6 }}>
                      Trail
                      <input type="checkbox"
                             checked={(l.tube?.trail ?? true) === true}
                             onChange={(e) => patchNested(l.id, ["tube", "trail"], e.target.checked)} />
                    </label>
                  </div>
              )}
            </div>
        ))}
      </div>
  );
}

/* ================================= App ================================= */
export default function Interactive3DNodeShowcase() {
  // Model & scene
  const [projectName, setProjectName] = useState("Showcase");
  const [modelDescriptor, setModelDescriptor] = useState(null);
  const [modelBlob, setModelBlob] = useState(null);
  const [modelFilename, setModelFilename] = useState("");
  const [modelBounds, setModelBounds] = useState(null);
  const modelRef = useRef();
  const [modelVisible, setModelVisible] = useState(true);
  const [currentModelId, setCurrentModelId] = useState(localStorage.getItem("epic3d.static.current") || (STATIC_MODELS[0]?.id || ""));

  // Entities
  const [rooms, setRooms] = useState(() => {
    const saved = localStorage.getItem("epic3d.rooms.v7");
    if (saved) return JSON.parse(saved);
    return [
      { id: uuid(), name: "Room A", center: [0, 0.6, 0], size: [4, 1.6, 3], color: "#274064", visible: true, rotation: [0,0,0] },
      { id: uuid(), name: "Room B", center: [5, 0.6, 0], size: [3, 1.6, 2.2], color: "#3a3359", visible: true, rotation: [0,0,0] },
    ];
  });

  const [nodes, setNodes] = useState(() => {
    const saved = localStorage.getItem("epic3d.nodes.v7");
    if (saved) return JSON.parse(saved);
    return [
      {
        id: uuid(),
        kind: "node",
        label: "Sender A",
        position: [-1, 0.4, 0],
        rotation: [0,0,0],
        role: "sender",
        cluster: "AV",
        color: "#54eec8",
        glowOn: true,
        glow: 0.6,
        shape: { type: "sphere", radius: 0.32 },
        light: { type: "none", enabled: false },
        anim: { spin: true, spinY: 0.6 },
        signal: { style: "waves", speed: 1, size: 1 },
      },
      {
        id: uuid(),
        kind: "node",
        label: "Light 01",
        position: [0.5, 0.5, 0.5],
        rotation: [0,0,0],
        role: "receiver",
        cluster: "Lights",
        color: "#fff3a1",
        glowOn: false,
        glow: 0.2,
        shape: { type: "cone", radius: 0.28, height: 0.6 },
        light: { type: "spot", enabled: false, intensity: 300, distance: 10, yaw: 0, pitch: -25, showBounds: false, color: "#ffffff", angle: 0.6, penumbra: 0.35 },
        anim: { bob: true, bobAmp: 0.2, bobSpeed: 1 },
        signal: { style: "rays", speed: 1, size: 1 },
      },
      {
        id: uuid(),
        kind: "node",
        label: "Receiver B",
        position: [1.1, 0.4, -0.4],
        rotation: [0,0,0],
        role: "receiver",
        cluster: "Network",
        color: "#7fbaff",
        glowOn: false,
        glow: 0.3,
        shape: { type: "box", scale: [0.5, 0.5, 0.5] },
        light: { type: "none", enabled: false },
        anim: {},
        signal: { style: "waves", speed: 0.8, size: 0.8 },
      },
      {
        id: uuid(),
        kind: "switch",
        label: "Switch A",
        position: [-0.2, 0.35, 1.0],
        rotation: [0,0,0],
        role: "bidir",
        cluster: "Network",
        color: "#9bd0ff",
        glowOn: true,
        glow: 0.4,
        shape: { type: "switch", w: 1.1, h: 0.12, d: 0.35 },
        light: { type: "none", enabled: false },
        anim: {},
        signal: { style: "rays", speed: 1.2, size: 1 },
      },
    ];
  });

  const [links, setLinks] = useState(() => {
    const saved = localStorage.getItem("epic3d.links.v7");
    return saved ? JSON.parse(saved) : [];
  });

  // Link defaults (kept for your create-link flow)
  const [linkDefaults, setLinkDefaults] = useState(() => {
    const saved = localStorage.getItem("epic3d.linkDefaults.v1");
    return (
        (saved && JSON.parse(saved)) || {
          style: "particles",
          speed: 0.9,
          width: 2,
          color: "#7cf",
          active: true,
          particles: { count: 12, size: 0.06, opacity: 1, waveAmp: 0.0, waveFreq: 1.5, shape: "sphere" },
          tube: { thickness: 0.07, glow: 1.4, color: "#9bf", trail: true },
          icon: { char: "▶", size: 0.12, count: 4, color: "#fff" },
          curve: { mode: "up", bend: 0.3 },
        }
    );
  });

  // Actions HUD
  const [actions, setActions] = useState(() => {
    const saved = localStorage.getItem("epic3d.actions.v7");
    return saved ? JSON.parse(saved) : [{ id: uuid(), label: "Toggle Light 01", steps: [{ type: "toggleLight", nodeId: null }] }];
  });

  // Selection & modes
  const [selected, setSelected] = useState(null); // { type:'node'|'room'|'link', id }
  const [mode, setMode] = useState("select"); // 'select' | 'link'
  const [linkFromId, setLinkFromId] = useState(null);
  const [moveMode, setMoveMode] = useState(true);
  const [transformMode, setTransformMode] = useState("translate"); // 'translate' | 'rotate' | 'scale'

  // View & perf
  const [wireframe, setWireframe] = useState(false);
  const [wireOpacity, setWireOpacity] = useState(0.6); // NEW: default a bit subtle
  const [labelsOn, setLabelsOn] = useState(true);
  const [labelMode, setLabelMode] = useState("billboard"); // "billboard" | "3d" | "static"
  const [labelSize, setLabelSize] = useState(0.24);        // world units

  const [showLights, setShowLights] = useState(true);
  const [showLightBounds, setShowLightBounds] = useState(false);
  const [roomOpacity, setRoomOpacity] = useState(0.12);
  const [animate, setAnimate] = useState(true);
  const [perf, setPerf] = useState("med"); // 'low' | 'med' | 'high'
  const [bg, setBg] = useState("#0b1020");

  // Room gap FX (global)
  const [roomGap, setRoomGap] = useState({
    enabled: false,
    shape: "sphere", // 'sphere' | 'box'
    center: [0, 0.8, 0],
    radius: 0.0,
    endRadius: 1.5,
    speed: 0.6,
    animate: false,
    loop: false,
  });

  // Placement
  const [placement, setPlacement] = useState({
    armed: false,
    multi: false,
    snap: 0.25,
    placeKind: "node", // 'node' | 'switch' | 'room'
  });
  const placingNode = placement.armed && placement.placeKind === "node";
  const placingSwitch = placement.armed && placement.placeKind === "switch";
  const placingRoom = placement.armed && placement.placeKind === "room";

  // Drag state & deselect guard
  const [dragActive, setDragActive] = useState(false);
  const dragState = useMemo(() => ({ active: dragActive, set: setDragActive }), [dragActive]);
  const missGuardRef = useRef(0);
  const missGuardMS = 220;

  // UI interaction flag
  const [uiInteracting, setUiInteracting] = useState(false);
  const uiStart = () => setUiInteracting(true);
  const uiStop = () => setUiInteracting(false);

  // Autosave
  useEffect(() => localStorage.setItem("epic3d.rooms.v7", JSON.stringify(rooms)), [rooms]);
  useEffect(() => localStorage.setItem("epic3d.nodes.v7", JSON.stringify(nodes)), [nodes]);
  useEffect(() => localStorage.setItem("epic3d.links.v7", JSON.stringify(links)), [links]);
  useEffect(() => localStorage.setItem("epic3d.actions.v7", JSON.stringify(actions)), [actions]);
  useEffect(() => localStorage.setItem("epic3d.linkDefaults.v1", JSON.stringify(linkDefaults)), [linkDefaults]);
  useEffect(() => {
    const meta = STATIC_MODELS.find(m => m.id === currentModelId);
    if (!meta) {
      if (STATIC_MODELS[0]) {
        // fallback so a model *always* shows
        setCurrentModelId(STATIC_MODELS[0].id);
      } else {
        setModelDescriptor(null);
        setModelBlob(null);
        setModelFilename("");
      }
      return;
    }
    setModelDescriptor({ type: meta.type, url: meta.url });
    setModelBlob(null);
    setModelFilename(`${meta.name}.${meta.type}`);
    localStorage.setItem("epic3d.static.current", meta.id);
  }, [currentModelId]);


  useEffect(() => {
    const stop = () => setUiInteracting(false);
    window.addEventListener("pointerup", stop);
    window.addEventListener("blur", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("blur", stop);
    };
  }, []);

  // Global keys
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setMode("select");
        setLinkFromId(null);
        setPlacement((p) => ({ ...p, armed: false }));
        setSelected(null);
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selected) requestDelete(selected);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const selectedNode = selected?.type === "node" ? nodes.find((n) => n.id === selected.id) : null;
  const selectedRoom = selected?.type === "room" ? rooms.find((r) => r.id === selected.id) : null;
  const selectedLink = selected?.type === "link" ? links.find((l) => l.id === selected.id) : null;

  const setNode = (id, patch) => setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  const setRoom = (id, patch) => setRooms((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  /* Import / Export */
  const onModelFiles = useCallback(async (fileOrList) => {
    const file = (fileOrList && fileOrList[0]) || fileOrList;
    if (!file) return;
    const ext = file.name.toLowerCase().split(".").pop();
    if (ext === "glb" || ext === "gltf") {
      const url = URL.createObjectURL(file);
      setModelDescriptor({ type: ext, url, cleanup: () => URL.revokeObjectURL(url) });
      setModelBlob(file);
      setModelFilename(file.name);
      return;
    }
    if (ext === "zip") {
      const zip = await JSZip.loadAsync(file);
      const gltfEntry = Object.values(zip.files).find((f) => f.name.toLowerCase().endsWith(".gltf"));
      const glbEntry = Object.values(zip.files).find((f) => f.name.toLowerCase().endsWith(".glb"));
      const blobMap = new Map();
      await Promise.all(
          Object.values(zip.files).map(async (f) => {
            if (f.dir) return;
            const b = await f.async("blob");
            blobMap.set(f.name, b);
          })
      );
      const makeURL = (name) => URL.createObjectURL(blobMap.get(name));

      if (gltfEntry) {
        const base = gltfEntry.name.split("/").slice(0, -1).join("/") + (gltfEntry.name.includes("/") ? "/" : "");
        const gltfUrl = makeURL(gltfEntry.name);
        const urlModifier = (url) => {
          if (url.startsWith("blob:") || url.startsWith("data:")) return url;
          const rel = decodeURIComponent(url).replace(/^[^#?]*\//, "");
          const full = base + rel;
          if (blobMap.has(full)) return makeURL(full);
          if (blobMap.has(rel)) return makeURL(rel);
          return url;
        };
        setModelDescriptor({ type: "zip:gltf", url: gltfUrl, urlModifier, cleanup: () => URL.revokeObjectURL(gltfUrl) });
        setModelBlob(file);
        setModelFilename(file.name);
        return;
      }
      if (glbEntry) {
        const blob = blobMap.get(glbEntry.name);
        const url = URL.createObjectURL(blob);
        setModelDescriptor({ type: "zip:glb", url, cleanup: () => URL.revokeObjectURL(url) });
        setModelBlob(file);
        setModelFilename(file.name);
        return;
      }
      alert("Zip must contain a .gltf or .glb");
      return;
    }
    alert("Unsupported model type (use .glb/.gltf or .zip)");
  }, []);

  const fileRef = useRef(null);

  const exportZip = async () => {
    const zip = new JSZip();
    const payload = {
      version: 8,
      project: { name: projectName },
      rooms,
      nodes,
      links,
      actions,
      model: { filename: modelFilename, type: modelDescriptor?.type || null },
      linkDefaults,
      roomGap,
    };
    zip.file("scene.json", JSON.stringify(payload, null, 2));
    if (modelBlob) zip.folder("models").file(modelFilename || "model.glb", modelBlob);
    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, (projectName || "showcase") + ".zip");
  };

  const importPackage = async (file) => {
    const ext = file.name.toLowerCase().split(".").pop();
    try {
      if (ext === "zip") {
        const zip = await JSZip.loadAsync(file);
        const txt = await zip.file("scene.json").async("string");
        const obj = JSON.parse(txt);
        setRooms(obj.rooms || []);
        setNodes(obj.nodes || []);
        setLinks(obj.links || []);
        setActions(obj.actions || []);
        setProjectName(obj.project?.name || "Showcase");
        obj.linkDefaults && setLinkDefaults(obj.linkDefaults);
        obj.roomGap && setRoomGap({ ...roomGap, ...obj.roomGap });
        const modelEntry = Object.values(zip.files).find((f) => f.name.startsWith("models/") && !f.dir);
        if (modelEntry) {
          const blob = await modelEntry.async("blob");
          const url = URL.createObjectURL(blob);
          setModelDescriptor({ type: "glb", url, cleanup: () => URL.revokeObjectURL(url) });
          setModelBlob(blob);
          setModelFilename(modelEntry.name.split("/").pop());
        } else {
          setModelDescriptor(null);
          setModelBlob(null);
          setModelFilename("");
        }
      } else {
        const txt = await file.text();
        const obj = JSON.parse(txt);
        setRooms(obj.rooms || []);
        setNodes(obj.nodes || []);
        setLinks(obj.links || []);
        setActions(obj.actions || []);
        setProjectName(obj.project?.name || "Showcase");
        obj.linkDefaults && setLinkDefaults(obj.linkDefaults);
        obj.roomGap && setRoomGap({ ...roomGap, ...obj.roomGap });
      }
      setSelected(null);
    } catch (e) {
      alert("Import failed: " + e.message);
    }
  };

  /* Selection & Linking */
  const onEntityTransform = (target, position) => {
    if (target.type === "node") setNode(target.id, { position });
    if (target.type === "room") setRoom(target.id, { center: position });
  };
  const onEntityRotate = (target, rotation) => {
    if (target.type === "node") setNode(target.id, { rotation });
    if (target.type === "room") setRoom(target.id, { rotation });
  };

  // For moving a room with its nodes
  const roomDragRef = useRef({ id: null, startCenter: [0, 0, 0], nodeStarts: [] });
  const onRoomDragPack = (room) => {
    roomDragRef.current = {
      id: room.id,
      startCenter: [...room.center],
      nodeStarts: nodes.filter((n) => n.roomId === room.id).map((n) => ({ id: n.id, pos: [...n.position] })),
    };
  };
  const onRoomDragApply = (roomId, newCenter) => {
    const pack = roomDragRef.current;
    if (!pack || pack.id !== roomId) return;
    const dx = newCenter[0] - pack.startCenter[0];
    const dy = newCenter[1] - pack.startCenter[1];
    const dz = newCenter[2] - pack.startCenter[2];
    setRoom(roomId, { center: newCenter });
    if (pack.nodeStarts.length) {
      setNodes((prev) =>
          prev.map((n) =>
              n.roomId === roomId
                  ? {
                    ...n,
                    position: [
                      pack.nodeStarts.find((s) => s.id === n.id).pos[0] + dx,
                      pack.nodeStarts.find((s) => s.id === n.id).pos[1] + dy,
                      pack.nodeStarts.find((s) => s.id === n.id).pos[2] + dz,
                    ],
                  }
                  : n
          )
      );
    }
  };
// Duplicate a room; offsets it on X so it's not overlapping the original
  const duplicateRoom = (roomId) => {
    const orig = rooms.find((r) => r.id === roomId);
    if (!orig) return;
    const offX = Math.max(1, (orig.size?.[0] ?? 1)) + 0.5;

    const copy = {
      ...orig,
      id: uuid(),
      name: `${orig.name} Copy`,
      center: [ (orig.center?.[0] ?? 0) + offX, (orig.center?.[1] ?? 0), (orig.center?.[2] ?? 0) ],
      // keep size/rotation/color/visible as-is
    };

    setRooms((prev) => [...prev, copy]);
    setSelected({ type: "room", id: copy.id });
  };

  const onPlace = (kind, p, multi) => {
    if (kind === "room") {
      const r = {
        id: uuid(),
        name: "Room " + (rooms.length + 1),
        center: p,
        rotation: [0,0,0],
        size: [3, 1.6, 2.2],
        color: "#253454",
        visible: true,
      };
      setRooms((prev) => [...prev, r]);
      setSelected({ type: "room", id: r.id });
      if (!multi) setPlacement((pv) => ({ ...pv, armed: false }));
      return;
    }

    const isSwitch = kind === "switch";
    const n = {
      id: uuid(),
      kind,
      label: (isSwitch ? "Switch " : "Node ") + (nodes.length + 1),
      position: p,
      rotation: [0,0,0],
      role: isSwitch ? "bidir" : "sender",
      cluster: isSwitch ? "Network" : "AV",
      color: isSwitch ? "#9bd0ff" : "#6ee7d8",
      glowOn: false,
      glow: 0.3,
      shape: isSwitch ? { type: "switch", w: 1.1, h: 0.12, d: 0.35 } : { type: "sphere", radius: 0.28 },
      light: { type: "none", enabled: false },
      anim: {},
      signal: { style: isSwitch ? "rays" : "waves", speed: 1, size: 1 },
    };
    // assign to room if inside one
    const roomHit = rooms.find(
        (r) =>
            Math.abs(p[0] - r.center[0]) <= r.size[0] / 2 &&
            Math.abs(p[1] - r.center[1]) <= r.size[1] / 2 &&
            Math.abs(p[2] - r.center[2]) <= r.size[2] / 2
    );
    if (roomHit) n.roomId = roomHit.id;

    setNodes((prev) => [...prev, n]);
    setSelected({ type: "node", id: n.id });
    if (!multi) setPlacement((pv) => ({ ...pv, armed: false }));
  };

  const requestDelete = (target) => {
    if (!target) return;
    if (target.type === "node") {
      const linked = links.filter((l) => l.from === target.id || l.to === target.id);
      if (linked.length) setConfirm({ open: true, payload: target, text: `Delete node and ${linked.length} linked connection(s)?` });
      else setNodes((prev) => prev.filter((n) => n.id !== target.id));
    }
    if (target.type === "link") setLinks((prev) => prev.filter((l) => l.id !== target.id));
    if (target.type === "room") {
      const inRoom = nodes.filter((n) => n.roomId === target.id).length;
      setConfirm({ open: true, payload: target, text: inRoom ? `Delete room and ${inRoom} node(s) inside?` : `Delete room?` });
    }
  };

  const applyConfirmDelete = () => {
    const t = confirm.payload;
    if (!t) return;
    if (t.type === "node") {
      setLinks((prev) => prev.filter((l) => l.from !== t.id && l.to !== t.id));
      setNodes((prev) => prev.filter((n) => n.id !== t.id));
    }
    if (t.type === "room") {
      const ids = nodes.filter((n) => n.roomId === t.id).map((n) => n.id);
      setLinks((prev) => prev.filter((l) => !ids.includes(l.from) && !ids.includes(l.to)));
      setNodes((prev) => prev.filter((n) => n.roomId !== t.id));
      setRooms((prev) => prev.filter((r) => r.id !== t.id));
    }
    setSelected(null);
    setConfirm({ open: false, payload: null, text: "" });
  };

  const handleNodeDown = (id) => {
    if (dragActive) return;
    if (mode === "link") {
      if (!linkFromId) {
        setLinkFromId(id);
        setSelected({ type: "node", id });
        return;
      }
      if (linkFromId === id) {
        setLinkFromId(null);
        return;
      }
      const a = nodes.find((n) => n.id === linkFromId);
      const b = nodes.find((n) => n.id === id);
      const epic = (a && a.kind === "switch") || (b && b.kind === "switch");
      const base = { ...linkDefaults };
      if (epic) base.style = "epic";

      setLinks((prev) => [
        ...prev,
        {
          id: uuid(),
          from: linkFromId,
          to: id,
          ...base,
        },
      ]);
      setMode("select");
      setLinkFromId(null);
      setSelected({ type: "node", id });
      return;
    }
    setSelected({ type: "node", id });
  };

  // Confirm delete modal
  const [confirm, setConfirm] = useState({ open: false, payload: null, text: "" });

  // Links map for per-node signals
  const signalMap = useMemo(() => {
    const m = {};
    nodes.forEach((n) => (m[n.id] = []));
    links.forEach((l) => {
      if (m[l.from]) m[l.from].push(l.to);
      if (m[l.to]) m[l.to].push(l.from);
    });
    return m;
  }, [nodes, links]);

  /* Drag & drop for import */
  const [dragOver, setDragOver] = useState(false);
  useEffect(() => {
    const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
    const onDragLeave = () => setDragOver(false);
    const onDrop = (e) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) {
        if (f.name.toLowerCase().endsWith(".zip") || f.name.toLowerCase().endsWith(".json")) importPackage(f);
        else onModelFiles(f);
      }
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [onModelFiles]);

  /* Top bar */
  const TopBar = () => (
      <div
          onPointerDown={(e) => { e.stopPropagation(); uiStart(); }}
          onPointerUp={uiStop}
          onPointerCancel={uiStop}
          onPointerLeave={uiStop}
          style={{
            position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
            zIndex: 30, display: "flex", gap: 10, alignItems: "center", padding: 10,
            borderRadius: 14, background: "linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04))",
            border: "1px solid rgba(255,255,255,0.18)", boxShadow: "0 12px 28px rgba(0,0,0,0.45)",
            backdropFilter: "blur(14px) saturate(1.2)",
          }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Input style={{ width: 180 }} value={projectName} onChange={(e) => setProjectName(e.target.value)} />
          <Btn variant="primary" glow onClick={() => fileRef.current && fileRef.current.click()}>
            Import
          </Btn>
          <input
              ref={fileRef}
              type="file"
              accept=".zip,.json,.glb,.gltf"
              style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }}
              onChange={(e) => {
                const f = e.target.files && e.target.files[0];
                if (f) (f.name.toLowerCase().endsWith(".zip") || f.name.toLowerCase().endsWith(".json")) ? importPackage(f) : onModelFiles(f);
                e.target.value = "";
              }}
          />
          <Btn onClick={exportZip} disabled={!nodes.length && !modelBlob}>
            Export
          </Btn>
        </div>
        <div style={{ width: 10, height: 22, opacity: 0.25, borderLeft: "1px solid rgba(255,255,255,0.28)" }} />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Btn onClick={() => setWireframe((v) => !v)}>{wireframe ? "Wireframe: On" : "Wireframe: Off"}</Btn>
          <Btn onClick={() => setShowLights((v) => !v)}>{showLights ? "Lights: On" : "Lights: Off"}</Btn>
          <Btn onClick={() => setShowLightBounds((v) => !v)}>{showLightBounds ? "Light Bounds: On" : "Light Bounds: Off"}</Btn>
          <Btn onClick={() => setAnimate((v) => !v)}>{animate ? "Anim: On" : "Anim: Off"}</Btn>
          <Btn onClick={() => setMoveMode((v) => !v)}>{moveMode ? "Move: On" : "Move: Off"}</Btn>
          {/* NEW: transform mode selector */}
          <Select disabled={!moveMode} value={transformMode} onChange={(e) => setTransformMode(e.target.value)} style={{ opacity: moveMode ? 1 : 0.5 }}>
            <option value="translate">Translate</option>
            <option value="rotate">Rotate</option>
            <option value="scale">Scale</option>
          </Select>
          {/* Static Model selector */}
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, opacity: 0.85 }}>Model</span>
            <Select
                style={{ minWidth: 180 }}
                value={currentModelId}
                onChange={(e) => setCurrentModelId(e.target.value)}
            >
              <option value="">(none)</option>
              {STATIC_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </Select>
            <Btn onClick={() => setModelVisible((v) => !v)}>
              {modelVisible ? "Hide Model" : "Show Model"}
            </Btn>
          </label>

        </div>
        <div style={{ marginTop: 8 }}>
          <label>
            Wireframe Transparency
            <Slider
                value={wireOpacity}
                min={0.05}
                max={1}
                step={0.01}
                onChange={(v) => setWireOpacity(v)}
            />
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Btn onClick={() => setLabelsOn(v => !v)}>{labelsOn ? "Labels: On" : "Labels: Off"}</Btn>
          <Select value={labelMode} onChange={(e) => setLabelMode(e.target.value)}>
            <option value="billboard">Billboard</option>
            <option value="3d">3D</option>
            <option value="static">Static</option>
          </Select>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, opacity: 0.85 }}>Size</span>
            <Input
                type="number"
                step="0.02"
                value={labelSize}
                onChange={(e) => setLabelSize(Math.max(0.04, Number(e.target.value) || 0.04))}
                onWheel={(e) => {
                  e.preventDefault(); e.stopPropagation();
                  const dir = e.deltaY < 0 ? 1 : -1;
                  const next = Math.max(0.04, +(labelSize + dir * 0.02).toFixed(3));
                  setLabelSize(next);
                }}
                style={{ width: 80 }}
            />
          </label>
        </div>


      </div>
  );

  const LegendTree = () => {
    const [filter, setFilter] = useState("");
    const grouped = useMemo(() => {
      const result = {};
      rooms.forEach((r) => {
        result[r.id] = { room: r, cats: {} };
        DEFAULT_CLUSTERS.forEach((c) => (result[r.id].cats[c] = []));
      });
      const unassigned = { id: "__no_room__", name: "Unassigned", center: [0, 0, 0], size: [0, 0, 0] };
      result[unassigned.id] = { room: unassigned, cats: {} };
      DEFAULT_CLUSTERS.forEach((c) => (result[unassigned.id].cats[c] = []));
      nodes.forEach((n) => {
        const bucket = n.roomId && result[n.roomId] ? result[n.roomId] : result[unassigned.id];
        if (!bucket.cats[n.cluster]) bucket.cats[n.cluster] = [];
        bucket.cats[n.cluster].push(n);
      });
      return result;
    }, [nodes, rooms]);

    const quickLink = (id) => {
      setMode("link");
      setLinkFromId(id);
      setSelected({ type: "node", id });
    };

    return (
        <Panel title="Legend / Tree">
          <div style={{ display: "grid", gap: 8, marginBottom: 8 }}>
            <Input value={filter} placeholder="Filter…" onChange={(e) => setFilter(e.target.value)} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn
                  variant={placingRoom ? "primary" : "ghost"}
                  glow={placingRoom}
                  onClick={() =>
                      setPlacement((p) => (p.placeKind === "room" ? { ...p, armed: !p.armed } : { ...p, armed: true, placeKind: "room" }))
                  }
              >
                {placingRoom ? "Placing Room (ON)" : "Place Room"}
              </Btn>

              <Btn
                  variant={placingNode ? "primary" : "ghost"}
                  glow={placingNode}
                  onClick={() =>
                      setPlacement((p) => (p.placeKind === "node" ? { ...p, armed: !p.armed } : { ...p, armed: true, placeKind: "node" }))
                  }
              >
                {placingNode ? "Placing Node (ON)" : "Place Node"}
              </Btn>

              <Btn
                  variant={placingSwitch ? "primary" : "ghost"}
                  glow={placingSwitch}
                  onClick={() =>
                      setPlacement((p) => (p.placeKind === "switch" ? { ...p, armed: !p.armed } : { ...p, armed: true, placeKind: "switch" }))
                  }
              >
                {placingSwitch ? "Placing Switch (ON)" : "Place Switch"}
              </Btn>

              <Btn
                  variant={mode === "link" ? "primary" : "ghost"}
                  glow={mode === "link"}
                  onClick={() => {
                    setLinkFromId(null);
                    setMode((m) => (m === "link" ? "select" : "link"));
                  }}
              >
                {mode === "link" ? "Link Mode (ON)" : "Link Mode"}
              </Btn>

              <Checkbox checked={placement.multi} onChange={(v) => setPlacement((p) => ({ ...p, multi: v, armed: v || p.armed }))} label="multi" />
            </div>
          </div>

          {Object.values(grouped).map((bucket) => {
            const rid = bucket.room.id;
            const itemsByCat = bucket.cats;
            return (
                <div key={rid} style={{ marginBottom: 10, borderTop: "1px dashed rgba(255,255,255,0.1)", paddingTop: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <div
                        style={{ fontWeight: 800, color: "#a8c0ff", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                        onClick={() => setSelected({ type: "room", id: rid })}
                    >
                      {bucket.room.name}
                    </div>
                    {rid !== "__no_room__" && (
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <Checkbox
                              checked={rooms.find((r) => r.id === rid)?.visible !== false}
                              onChange={(v) => setRooms((prev) => prev.map((r) => (r.id === rid ? { ...r, visible: v } : r)))}
                              label="visible"
                          />
                          <Btn onClick={() => duplicateRoom(rid)}>Duplicate</Btn>
                          <Btn onClick={() => requestDelete({ type: "room", id: rid })}>Delete</Btn>
                        </div>
                    )}
                  </div>

                  <div>
                    {DEFAULT_CLUSTERS.map((cat) => {
                      const list = (itemsByCat[cat] || []).filter((n) => !filter || n.label.toLowerCase().includes(filter.toLowerCase()));
                      return (
                          <div key={cat} style={{ marginLeft: 8, marginBottom: 6 }}>
                            <div style={{ color: "#9fb6d8", fontWeight: 700 }}>
                              {cat} <span style={{ opacity: 0.6 }}>({list.length})</span>
                            </div>
                            <div style={{ marginLeft: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                              {list.map((n) => (
                                  <div
                                      key={n.id}
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        border: "1px solid rgba(255,255,255,0.08)",
                                        borderRadius: 10,
                                        padding: "5px 7px",
                                        background: selected?.type === "node" && selected?.id === n.id ? "rgba(0,225,255,0.12)" : "rgba(255,255,255,0.04)",
                                      }}
                                  >
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                      <span style={{ width: 10, height: 10, borderRadius: 3, background: n.color || clusterColor(n.cluster) }} />
                                      <a onClick={() => setSelected({ type: "node", id: n.id })} style={{ color: "#fff", cursor: "pointer", textDecoration: "none" }}>
                                        {n.label}
                                      </a>
                                      {n.kind === "switch" && <span style={{ opacity: 0.7, fontSize: 11 }}>(switch)</span>}
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                      <IconBtn label="⚭" title="Link from this node" onClick={() => quickLink(n.id)} />
                                      {n.light?.type !== "none" && (
                                          <Checkbox checked={!!n.light.enabled} onChange={(v) => setNode(n.id, { light: { ...n.light, enabled: v } })} label="light" />
                                      )}
                                      <Btn onClick={() => requestDelete({ type: "node", id: n.id })}>✕</Btn>
                                    </div>
                                  </div>
                              ))}
                            </div>
                          </div>
                      );
                    })}
                  </div>
                </div>
            );
          })}
        </Panel>
    );
  };

  const FlowDefaultsPanel = () => (
      <Panel title="Flow / Link Defaults">
        <div style={{ display: "grid", gap: 8 }}>
          <label>
            Style
            <Select
                value={linkDefaults.style}
                onChange={(e) => setLinkDefaults((d) => ({ ...d, style: e.target.value }))}
            >
              <option value="particles">particles</option>
              <option value="wavy">wavy</option>
              <option value="icons">icons</option>
              <option value="dashed">dashed</option>
              <option value="solid">solid</option>
              <option value="epic">epic</option>
            </Select>
          </label>
          <label>
            Active <Checkbox checked={!!linkDefaults.active} onChange={(v) => setLinkDefaults((d) => ({ ...d, active: v }))} />
          </label>
          <label>
            Speed
            <Slider value={linkDefaults.speed ?? 0.9} min={0} max={4} step={0.05} onChange={(v) => setLinkDefaults((d) => ({ ...d, speed: v }))} />
          </label>
          <label>
            Width (for lines)
            <Slider value={linkDefaults.width ?? 2} min={1} max={6} step={0.1} onChange={(v) => setLinkDefaults((d) => ({ ...d, width: v }))} />
          </label>
          <label>
            Color
            <Input type="color" value={linkDefaults.color || "#7cf"} onChange={(e) => setLinkDefaults((d) => ({ ...d, color: e.target.value }))} />
          </label>

          {/* Curve */}
          <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px dashed rgba(255,255,255,0.2)" }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Curve</div>
            <label>
              Mode
              <Select
                  value={linkDefaults.curve?.mode || "up"}
                  onChange={(e) => setLinkDefaults((d) => ({ ...d, curve: { ...(d.curve || {}), mode: e.target.value } }))}
              >
                <option value="straight">straight</option>
                <option value="up">up</option>
                <option value="side">side</option>
              </Select>
            </label>
            <label>
              Bend
              <Slider
                  value={linkDefaults.curve?.bend ?? 0.3}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(v) => setLinkDefaults((d) => ({ ...d, curve: { ...(d.curve || {}), bend: v } }))}
              />
            </label>
          </div>

          {(linkDefaults.style === "particles" || linkDefaults.style === "wavy") && (
              <>
                <label>
                  Particle Count
                  <Slider
                      value={linkDefaults.particles?.count ?? 12}
                      min={1}
                      max={80}
                      step={1}
                      onChange={(v) => setLinkDefaults((d) => ({ ...d, particles: { ...(d.particles || {}), count: v } }))}
                  />
                </label>
                <label>
                  Particle Size
                  <Slider
                      value={linkDefaults.particles?.size ?? 0.06}
                      min={0.02}
                      max={0.3}
                      step={0.01}
                      onChange={(v) => setLinkDefaults((d) => ({ ...d, particles: { ...(d.particles || {}), size: v } }))}
                  />
                </label>
                <label>
                  Opacity
                  <Slider
                      value={linkDefaults.particles?.opacity ?? 1}
                      min={0.1}
                      max={1}
                      step={0.05}
                      onChange={(v) => setLinkDefaults((d) => ({ ...d, particles: { ...(d.particles || {}), opacity: v } }))}
                  />
                </label>
                <label>
                  Wave Amplitude
                  <Slider
                      value={linkDefaults.particles?.waveAmp ?? (linkDefaults.style === "wavy" ? 0.15 : 0)}
                      min={0}
                      max={0.6}
                      step={0.01}
                      onChange={(v) => setLinkDefaults((d) => ({ ...d, particles: { ...(d.particles || {}), waveAmp: v } }))}
                  />
                </label>
                <label>
                  Wave Frequency
                  <Slider
                      value={linkDefaults.particles?.waveFreq ?? 2}
                      min={0.2}
                      max={8}
                      step={0.05}
                      onChange={(v) => setLinkDefaults((d) => ({ ...d, particles: { ...(d.particles || {}), waveFreq: v } }))}
                  />
                </label>
                <label>
                  Shape
                  <Select
                      value={linkDefaults.particles?.shape || "sphere"}
                      onChange={(e) => setLinkDefaults((d) => ({ ...d, particles: { ...(d.particles || {}), shape: e.target.value } }))}
                  >
                    <option value="sphere">sphere</option>
                    <option value="box">box</option>
                    <option value="octa">octa</option>
                  </Select>
                </label>
              </>
          )}

          {linkDefaults.style === "epic" && (
              <>
                <label>
                  Tube Thickness
                  <Slider
                      value={linkDefaults.tube?.thickness ?? 0.06}
                      min={0.02}
                      max={0.25}
                      step={0.005}
                      onChange={(v) => setLinkDefaults((d) => ({ ...d, tube: { ...(d.tube || {}), thickness: v } }))}
                  />
                </label>
                <label>
                  Tube Glow
                  <Slider
                      value={linkDefaults.tube?.glow ?? 1.3}
                      min={0}
                      max={3}
                      step={0.05}
                      onChange={(v) => setLinkDefaults((d) => ({ ...d, tube: { ...(d.tube || {}), glow: v } }))}
                  />
                </label>
                <label>
                  Trail Particles
                  <Checkbox
                      checked={(linkDefaults.tube?.trail ?? true) === true}
                      onChange={(v) => setLinkDefaults((d) => ({ ...d, tube: { ...(d.tube || {}), trail: v } }))}
                      label="enabled"
                  />
                </label>
              </>
          )}

          {linkDefaults.style === "icons" && (
              <>
                <label>
                  Icon (emoji or char)
                  <Input
                      value={linkDefaults.icon?.char ?? "▶"}
                      onChange={(e) => setLinkDefaults((d) => ({ ...d, icon: { ...(d.icon || {}), char: e.target.value } }))}
                  />
                </label>
                <label>
                  Icon Count
                  <Slider
                      value={linkDefaults.icon?.count ?? 4}
                      min={1}
                      max={8}
                      step={1}
                      onChange={(v) => setLinkDefaults((d) => ({ ...d, icon: { ...(d.icon || {}), count: v } }))}
                  />
                </label>
                <label>
                  Icon Size
                  <Slider
                      value={linkDefaults.icon?.size ?? 0.12}
                      min={0.06}
                      max={0.4}
                      step={0.01}
                      onChange={(v) => setLinkDefaults((d) => ({ ...d, icon: { ...(d.icon || {}), size: v } }))}
                  />
                </label>
              </>
          )}
        </div>
      </Panel>
  );

  const LinksPanel = () => (
      <Panel title="Links">
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Btn onClick={() => setMode(mode === "link" ? "select" : "link")} glow={mode === "link"} variant={mode === "link" ? "primary" : "ghost"}>
              {mode === "link" ? "Link Mode: ON" : "Link Mode: OFF"}
            </Btn>
            {linkFromId && <span style={{ fontSize: 12, opacity: 0.85 }}>From: {nodes.find((n) => n.id === linkFromId)?.label || linkFromId} → pick target…</span>}
          </div>
          {selectedLink && <Btn onClick={() => requestDelete({ type: "link", id: selectedLink.id })}>Delete Selected Link</Btn>}
          <div style={{ fontSize: 11, opacity: 0.8 }}>Tip: Click first node, then second. Switch in pair ⇒ glowing tube.</div>
        </div>
      </Panel>
  );

  const runAction = (action) => {
    action.steps.forEach((s) => {
      if (s.type === "toggleLight" && s.nodeId) {
        const n = nodes.find((x) => x.id === s.nodeId);
        if (!n) return;
        const cur = !!n.light?.enabled;
        setNode(n.id, { light: { ...(n.light || { type: "point", intensity: 200, distance: 8 }), enabled: !cur } });
      }
      if (s.type === "toggleGlow" && s.nodeId) {
        const n = nodes.find((x) => x.id === s.nodeId);
        if (!n) return;
        setNode(n.id, { glowOn: !n.glowOn });
      }
      if (s.type === "setSignalStyle" && s.nodeId) {
        const n = nodes.find((x) => x.id === s.nodeId);
        if (!n) return;
        setNode(n.id, { signal: { ...(n.signal || {}), style: s.value || "waves" } });
      }
    });
  };

  const ActionsPanel = () => {
    const [working, setWorking] = useState({ label: "", stepType: "toggleLight", nodeId: "", value: "waves" });
    const addStep = (actId) => {
      setActions((prev) =>
          prev.map((a) =>
              a.id === actId ? { ...a, steps: [...a.steps, { type: working.stepType, nodeId: working.nodeId || null, value: working.value }] } : a
          )
      );
    };
    const addAction = () => setActions((prev) => [...prev, { id: uuid(), label: working.label || `Action ${prev.length + 1}`, steps: [] }]);
    return (
        <Panel title="Actions / On-screen Buttons">
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
              <label>
                Label
                <Input value={working.label} onChange={(e) => setWorking((w) => ({ ...w, label: e.target.value }))} />
              </label>
              <div />
              <label>
                Step
                <Select value={working.stepType} onChange={(e) => setWorking((w) => ({ ...w, stepType: e.target.value }))}>
                  <option value="toggleLight">Toggle Light</option>
                  <option value="toggleGlow">Toggle Glow</option>
                  <option value="setSignalStyle">Set Signal Style</option>
                </Select>
              </label>
              <label>
                Target Node
                <Select value={working.nodeId} onChange={(e) => setWorking((w) => ({ ...w, nodeId: e.target.value }))}>
                  <option value="">(none)</option>
                  {nodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.label}
                      </option>
                  ))}
                </Select>
              </label>
              {working.stepType === "setSignalStyle" && (
                  <label>
                    Style Value
                    <Select value={working.value} onChange={(e) => setWorking((w) => ({ ...w, value: e.target.value }))}>
                      <option value="waves">waves</option>
                      <option value="rays">rays</option>
                      <option value="none">none</option>
                    </Select>
                  </label>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn variant="primary" glow onClick={addAction}>
                + New Action
              </Btn>
            </div>
            <div style={{ marginTop: 6, borderTop: "1px dashed rgba(255,255,255,0.15)", paddingTop: 8 }}>
              {actions.map((a) => (
                  <div key={a.id} style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 12, padding: 8, marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong>{a.label}</strong>
                      <div style={{ display: "flex", gap: 8 }}>
                        <Btn onClick={() => runAction(a)}>Run</Btn>
                        <Btn onClick={() => setActions((prev) => prev.filter((x) => x.id !== a.id))}>Delete</Btn>
                      </div>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 11, opacity: 0.9 }}>Steps: {a.steps.length || 0}</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                      <Btn onClick={() => addStep(a.id)}>+ Add Step</Btn>
                    </div>
                  </div>
              ))}
            </div>
          </div>
        </Panel>
    );
  };

  return (
      <div style={{ position: "fixed", inset: 0, background: "radial-gradient(1200px 800px at 20% 0%, #15203a, #0b1020)", color: "#fff" }}>
        <TopBar />

        {/* LEFT column (scrollable) */}
        <div
            onPointerDown={(e) => { e.stopPropagation(); uiStart(); }}
            onPointerUp={uiStop}
            onPointerCancel={uiStop}
            onPointerLeave={uiStop}
            style={{
              position: "absolute", left: 16, top: 64, bottom: 16, zIndex: 20, display: "grid", gap: 12, width: 440,
              pointerEvents: "auto", overflowY: "auto",
            }}
            className="glass-scroll"
        >
          <Panel title="Placement">
            <div style={{ display: "grid", gap: 8 }}>
              <label>
                Snap
                <Input type="number" step="0.05" value={placement.snap} onChange={(e) => setPlacement((p) => ({ ...p, snap: Number(e.target.value) || 0 }))} />
              </label>
              <div style={{ opacity: 0.75 }}>Click model/ground to place. Esc cancels.</div>
            </div>
          </Panel>

          <LegendTree />
          <LinksPanel />
          <FlowDefaultsPanel />

          <Panel title="Rooms FX (Wireframe Gap / Dissolve)">
            <div style={{ display: "grid", gap: 8 }}>
              <Checkbox checked={roomGap.enabled} onChange={(v) => setRoomGap((g) => ({ ...g, enabled: v }))} label="enabled" />
              <label>
                Shape
                <Select value={roomGap.shape} onChange={(e) => setRoomGap((g) => ({ ...g, shape: e.target.value }))}>
                  <option value="sphere">sphere</option>
                  <option value="box">box</option>
                </Select>
              </label>
              <label>
                Center (x,y,z)
                <Input
                    value={roomGap.center.join(", ")}
                    onChange={(e) => {
                      const parts = e.target.value.split(",").map((v) => Number(v.trim()));
                      if (parts.length === 3 && parts.every((v) => !Number.isNaN(v))) setRoomGap((g) => ({ ...g, center: parts }));
                    }}
                />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label>
                  Start radius
                  <Slider value={roomGap.radius} min={0} max={6} step={0.01} onChange={(v) => setRoomGap((g) => ({ ...g, radius: v }))} />
                </label>
                <label>
                  End radius
                  <Slider value={roomGap.endRadius} min={0} max={10} step={0.01} onChange={(v) => setRoomGap((g) => ({ ...g, endRadius: v }))} />
                </label>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Checkbox checked={roomGap.animate} onChange={(v) => setRoomGap((g) => ({ ...g, animate: v }))} label="animate" />
                <Checkbox checked={roomGap.loop} onChange={(v) => setRoomGap((g) => ({ ...g, loop: v }))} label="loop" />
              </div>
              <label>
                Speed
                <Slider value={roomGap.speed} min={0.05} max={3} step={0.05} onChange={(v) => setRoomGap((g) => ({ ...g, speed: v }))} />
              </label>
              <Btn onClick={() => { if (modelBounds?.center) setRoomGap((g) => ({ ...g, center: modelBounds.center })); }}>
                Center to model
              </Btn>
            </div>
          </Panel>

          <Panel title="Filters & View">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
              <Btn onClick={() => setWireframe((v) => !v)}>{wireframe ? "Wireframe: On" : "Wireframe: Off"}</Btn>
              <Btn onClick={() => setShowLights((v) => !v)}>{showLights ? "Lights: On" : "Lights: Off"}</Btn>
              <Btn onClick={() => setShowLightBounds((v) => !v)}>{showLightBounds ? "Light Bounds: On" : "Light Bounds: Off"}</Btn>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
              <label>
                <div style={{ fontSize: 10, opacity: 0.8 }}>Perf</div>
                <Select value={perf} onChange={(e) => setPerf(e.target.value)}>
                  <option value="low">Low</option>
                  <option value="med">Medium</option>
                  <option value="high">High</option>
                </Select>
              </label>
              <label>
                <div style={{ fontSize: 10, opacity: 0.8 }}>BG</div>
                <Input type="color" value={bg} onChange={(e) => setBg(e.target.value)} />
              </label>
            </div>
          </Panel>

          <ActionsPanel />
        </div>

        {/* RIGHT column (scrollable) */}
        <div
            onPointerDown={(e) => { e.stopPropagation(); uiStart(); }}
            onPointerUp={uiStop}
            onPointerCancel={uiStop}
            onPointerLeave={uiStop}
            style={{
              position: "absolute", right: 16, top: 64, bottom: 16, zIndex: 20, display: "grid", gap: 12, width: 380,
              pointerEvents: "auto", overflowY: "auto",
            }}
            className="glass-scroll"
        >
          {(() => {
            const n = selectedNode;
            const r = selectedRoom;
            const l = selectedLink;
            if (!n && !r && !l) return <Panel title="Inspector">Select something to edit its properties.</Panel>;
            if (n)
              return (
                  <Panel title={n.kind === "switch" ? "Switch Inspector" : "Node Inspector"}>
                    <div style={{ display: "grid", gap: 8 }}>

                      <label>
                        Name
                        <Input value={n.label} onChange={(e) => setNode(n.id, { label: e.target.value })} />
                      </label>
                      <label>
                        Role
                        <Select value={n.role || "none"} onChange={(e) => setNode(n.id, { role: e.target.value })}>
                          <option value="none">none</option>
                          <option value="sender">sender</option>
                          <option value="receiver">receiver</option>
                          <option value="bidir">bidir</option>
                        </Select>
                      </label>
                      <label>
                        Cluster
                        <Select value={n.cluster} onChange={(e) => setNode(n.id, { cluster: e.target.value })}>
                          {DEFAULT_CLUSTERS.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                          ))}
                        </Select>
                      </label>
                      <label>
                        Color
                        <Input type="color" value={n.color || "#ffffff"} onChange={(e) => setNode(n.id, { color: e.target.value })} />
                      </label>
                      <label>
                        Room
                        <Select value={n.roomId || ""} onChange={(e) => setNode(n.id, { roomId: e.target.value || undefined })}>
                          <option value="">No room</option>
                          {rooms.map((rr) => (
                              <option key={rr.id} value={rr.id}>
                                {rr.name}
                              </option>
                          ))}
                        </Select>
                      </label>
                      <label>
                        Position (x,y,z)
                        <Input
                            value={(n.position || [0,0,0]).join(", ")}
                            onChange={(e) => {
                              const parts = e.target.value.split(",").map((v) => Number(v.trim()));
                              if (parts.length === 3 && parts.every((v) => !Number.isNaN(v))) setNode(n.id, { position: parts });
                            }}
                        />
                      </label>
                      <label>
                        Rotation (x,y,z radians)
                        <Input
                            value={(n.rotation || [0,0,0]).map((v) => +v.toFixed(3)).join(", ")}
                            onChange={(e) => {
                              const parts = e.target.value.split(",").map((v) => Number(v.trim()));
                              if (parts.length === 3 && parts.every((v) => !Number.isNaN(v))) setNode(n.id, { rotation: parts });
                            }}
                        />
                      </label>
                      {/* --- Shape & Size --- */}
                      {(() => {
                        const shape = n.shape || { type: "sphere", radius: 0.32 };
                        const setShape = (patch) => setNode(n.id, { shape: { ...shape, ...patch } });

                        const setShapeType = (type) => {
                          // sensible defaults per shape
                          const defaults = {
                            sphere:   { type: "sphere",   radius: 0.32 },
                            box:      { type: "box",      scale: [0.6, 0.3, 0.6] },
                            square:   { type: "square",   scale: [0.6, 0.3, 0.6] }, // alias of box
                            disc:     { type: "disc",     radius: 0.35, height: 0.08 },
                            circle:   { type: "circle",   radius: 0.35, height: 0.08 }, // alias of disc
                            cylinder: { type: "cylinder", radius: 0.3,  height: 0.6 },
                            hexagon:  { type: "hexagon",  radius: 0.35, height: 0.5 },
                            cone:     { type: "cone",     radius: 0.35, height: 0.7 },
                            switch:   { type: "switch",   w: 0.9, h: 0.12, d: 0.35 },
                          };
                          setNode(n.id, { shape: defaults[type] || { type } });
                        };

                        const NumberInput = ({ value, onChange, step = 0.05, min = 0.01 }) => (
                            <Input
                                type="number"
                                step={step}
                                value={value}
                                onChange={(e) => onChange(Math.max(min, Number(e.target.value) || min))}
                                onWheel={(e) => {
                                  e.preventDefault(); e.stopPropagation();
                                  const dir = e.deltaY < 0 ? 1 : -1;
                                  onChange(Math.max(min, +(value + dir * step).toFixed(3)));
                                }}
                            />
                        );

                        return (
                            <>
                              <div style={{ borderTop: "1px dashed rgba(255,255,255,0.15)", paddingTop: 8, marginTop: 8 }}>
                                <div style={{ fontWeight: 900, marginBottom: 6 }}>Shape</div>
                                <Select
                                    value={(shape.type || "sphere").toLowerCase()}
                                    onChange={(e) => setShapeType(e.target.value)}
                                >
                                  <option value="sphere">Sphere</option>
                                  <option value="square">Square (Box)</option>
                                  <option value="disc">Circle (Disc)</option>
                                  <option value="cylinder">Cylinder</option>
                                  <option value="hexagon">Hexagon</option>
                                  <option value="cone">Cone</option>
                                  <option value="switch">Switch</option>
                                </Select>
                              </div>

                              {/* Per-shape size controls */}
                              {["sphere"].includes(shape.type) && (
                                  <label>
                                    Radius
                                    <NumberInput value={shape.radius ?? 0.32} onChange={(v) => setShape({ radius: v })} step={0.02} />
                                  </label>
                              )}

                              {["box", "square"].includes(shape.type) && (
                                  <div>
                                    <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 4 }}>Scale (x,y,z)</div>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                                      <label>
                                        X
                                        <NumberInput
                                            value={shape.scale?.[0] ?? 0.6}
                                            onChange={(v) => setShape({ scale: [v, shape.scale?.[1] ?? 0.3, shape.scale?.[2] ?? 0.6] })}
                                            step={0.05}
                                        />
                                      </label>
                                      <label>
                                        Y
                                        <NumberInput
                                            value={shape.scale?.[1] ?? 0.3}
                                            onChange={(v) => setShape({ scale: [shape.scale?.[0] ?? 0.6, v, shape.scale?.[2] ?? 0.6] })}
                                            step={0.05}
                                        />
                                      </label>
                                      <label>
                                        Z
                                        <NumberInput
                                            value={shape.scale?.[2] ?? 0.6}
                                            onChange={(v) => setShape({ scale: [shape.scale?.[0] ?? 0.6, shape.scale?.[1] ?? 0.3, v] })}
                                            step={0.05}
                                        />
                                      </label>
                                    </div>
                                  </div>
                              )}

                              {["disc", "circle", "cylinder", "hexagon", "cone"].includes(shape.type) && (
                                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                    <label>
                                      Radius
                                      <NumberInput value={shape.radius ?? 0.35} onChange={(v) => setShape({ radius: v })} step={0.02} />
                                    </label>
                                    <label>
                                      Height
                                      <NumberInput
                                          value={shape.height ?? (shape.type === "disc" || shape.type === "circle" ? 0.08 : 0.6)}
                                          onChange={(v) => setShape({ height: v })}
                                          step={0.02}
                                      />
                                    </label>
                                  </div>
                              )}

                              {shape.type === "switch" && (
                                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                                    <label>
                                      W
                                      <NumberInput value={shape.w ?? 0.9} onChange={(v) => setShape({ w: v })} step={0.02} />
                                    </label>
                                    <label>
                                      H
                                      <NumberInput value={shape.h ?? 0.12} onChange={(v) => setShape({ h: v })} step={0.02} />
                                    </label>
                                    <label>
                                      D
                                      <NumberInput value={shape.d ?? 0.35} onChange={(v) => setShape({ d: v })} step={0.02} />
                                    </label>
                                  </div>
                              )}
                            </>
                        );
                      })()}

                      {/* Light */}
                      <div style={{ borderTop: "1px dashed rgba(255,255,255,0.15)", paddingTop: 8, marginTop: 8 }}>
                        <div style={{ fontWeight: 900, marginBottom: 6 }}>Light</div>
                        <label>
                          Type
                          <Select value={n.light?.type || "none"} onChange={(e) => setNode(n.id, { light: { ...(n.light || {}), type: e.target.value } })}>
                            <option value="none">none</option>
                            <option value="point">point</option>
                            <option value="spot">spot</option>
                          </Select>
                        </label>
                        {n.light?.type !== "none" && (
                            <>
                              <label>
                                Color
                                <Input type="color" value={n.light.color || "#ffffff"} onChange={(e) => setNode(n.id, { light: { ...n.light, color: e.target.value } })} />
                              </label>
                              <label>
                                Intensity
                                <Slider value={n.light.intensity ?? 200} min={0} max={2000} step={1} onChange={(v) => setNode(n.id, { light: { ...n.light, intensity: v } })} />
                              </label>
                              <label>
                                Distance
                                <Slider value={n.light.distance ?? 8} min={0} max={50} step={0.1} onChange={(v) => setNode(n.id, { light: { ...n.light, distance: v } })} />
                              </label>
                              {n.light.type === "spot" && (
                                  <>
                                    <label>
                                      Angle
                                      <Slider value={n.light.angle ?? 0.6} min={0.05} max={1.5} step={0.01} onChange={(v) => setNode(n.id, { light: { ...n.light, angle: v } })} />
                                    </label>
                                    <label>
                                      Penumbra
                                      <Slider value={n.light.penumbra ?? 0.35} min={0} max={1} step={0.01} onChange={(v) => setNode(n.id, { light: { ...n.light, penumbra: v } })} />
                                    </label>
                                    <label>
                                      Yaw (°)
                                      <Slider value={n.light.yaw ?? 0} min={-180} max={180} step={1} onChange={(v) => setNode(n.id, { light: { ...n.light, yaw: v } })} />
                                    </label>
                                    <label>
                                      Pitch (°)
                                      <Slider value={n.light.pitch ?? -25} min={-89} max={89} step={1} onChange={(v) => setNode(n.id, { light: { ...n.light, pitch: v } })} />
                                    </label>
                                  </>
                              )}
                              <Checkbox checked={!!n.light.enabled} onChange={(v) => setNode(n.id, { light: { ...n.light, enabled: v } })} label="enabled" />
                              <Checkbox checked={!!n.light.showBounds} onChange={(v) => setNode(n.id, { light: { ...n.light, showBounds: v } })} label="show bounds" />
                            </>
                        )}
                      </div>

                      {/* Signals */}
                      <div style={{ borderTop: "1px dashed rgba(255,255,255,0.15)", paddingTop: 8, marginTop: 8 }}>
                        <div style={{ fontWeight: 900, marginBottom: 6 }}>Signals</div>
                        <label>
                          Style
                          <Select value={n.signal?.style || "waves"} onChange={(e) => setNode(n.id, { signal: { ...n.signal, style: e.target.value } })}>
                            <option value="none">none</option>
                            <option value="waves">waves</option>
                            <option value="rays">rays</option>
                          </Select>
                        </label>
                        <label>
                          Color
                          <Input type="color" value={n.signal?.color || n.color || "#7cf"} onChange={(e) => setNode(n.id, { signal: { ...n.signal, color: e.target.value } })} />
                        </label>
                        <label>
                          Speed
                          <Slider value={n.signal?.speed ?? 1} min={0.2} max={4} step={0.05} onChange={(v) => setNode(n.id, { signal: { ...n.signal, speed: v } })} />
                        </label>
                        <label>
                          Size
                          <Slider value={n.signal?.size ?? 1} min={0.5} max={2} step={0.05} onChange={(v) => setNode(n.id, { signal: { ...n.signal, size: v } })} />
                        </label>
                      </div>

                      {/* NEW: Per-node outgoing link flow editor */}
                      <OutgoingLinksEditor node={n} nodes={nodes} links={links} setLinks={setLinks} />

                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                        <Btn onClick={() => setMode(mode === "link" ? "select" : "link")} glow={mode === "link"}>
                          {mode === "link" ? "Link: ON" : "Link: OFF"}
                        </Btn>
                        <Btn onClick={() => requestDelete({ type: "node", id: n.id })}>Delete</Btn>
                      </div>
                    </div>
                  </Panel>
              );
            if (r)
              return (
                  <Panel title="Room Inspector">
                    <div style={{ display: "grid", gap: 8 }}>
                      <label>
                        Name
                        <Input value={r.name} onChange={(e) => setRoom(r.id, { name: e.target.value })} />
                      </label>
                      <label>
                        Visible <Checkbox checked={r.visible !== false} onChange={(v) => setRoom(r.id, { visible: v })} />
                      </label>
                      <label>
                        Center (x,y,z)
                        <Input
                            value={(r.center || [0,0,0]).join(", ")}
                            onChange={(e) => {
                              const parts = e.target.value.split(",").map((v) => Number(v.trim()) || 0);
                              if (parts.length === 3) setRoom(r.id, { center: parts });
                            }}
                        />
                      </label>
                      <label>
                        Rotation (x,y,z radians)
                        <Input
                            value={(r.rotation || [0,0,0]).map((v) => +v.toFixed(3)).join(", ")}
                            onChange={(e) => {
                              const parts = e.target.value.split(",").map((v) => Number(v.trim()) || 0);
                              if (parts.length === 3) setRoom(r.id, { rotation: parts });
                            }}
                        />
                      </label>
                      <div>
                          <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 4 }}>Size (x,y,z)</div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                            <label>
                              X
                              <Input
                                type="number"
                                step="0.1"
                                value={r.size?.[0] ?? 1}
                                onChange={(e) => {
                                  const nx = Math.max(0.1, Number(e.target.value) || 0.1);
                                  setRoom(r.id, { size: [nx, r.size?.[1] ?? 1, r.size?.[2] ?? 1] });
                                }}
                                onWheel={(e) => {
                                  e.preventDefault(); e.stopPropagation();
                                  const dir = e.deltaY < 0 ? 1 : -1;
                                  const nx = Math.max(0.1, +( (r.size?.[0] ?? 1) + dir * 0.1 ).toFixed(2));
                                  setRoom(r.id, { size: [nx, r.size?.[1] ?? 1, r.size?.[2] ?? 1] });
                                }}
                              />
                            </label>
                            <label>
                              Y
                              <Input
                                type="number"
                                step="0.1"
                                value={r.size?.[1] ?? 1}
                                onChange={(e) => {
                                  const ny = Math.max(0.1, Number(e.target.value) || 0.1);
                                  setRoom(r.id, { size: [r.size?.[0] ?? 1, ny, r.size?.[2] ?? 1] });
                                }}
                                onWheel={(e) => {
                                  e.preventDefault(); e.stopPropagation();
                                  const dir = e.deltaY < 0 ? 1 : -1;
                                  const ny = Math.max(0.1, +( (r.size?.[1] ?? 1) + dir * 0.1 ).toFixed(2));
                                  setRoom(r.id, { size: [r.size?.[0] ?? 1, ny, r.size?.[2] ?? 1] });
                                }}
                              />
                            </label>
                            <label>
                              Z
                              <Input
                                type="number"
                                step="0.1"
                                value={r.size?.[2] ?? 1}
                                onChange={(e) => {
                                  const nz = Math.max(0.1, Number(e.target.value) || 0.1);
                                  setRoom(r.id, { size: [r.size?.[0] ?? 1, r.size?.[1] ?? 1, nz] });
                                }}
                                onWheel={(e) => {
                                  e.preventDefault(); e.stopPropagation();
                                  const dir = e.deltaY < 0 ? 1 : -1;
                                  const nz = Math.max(0.1, +( (r.size?.[2] ?? 1) + dir * 0.1 ).toFixed(2));
                                  setRoom(r.id, { size: [r.size?.[0] ?? 1, r.size?.[1] ?? 1, nz] });
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      <label>
                        Opacity
                        <Slider value={roomOpacity} min={0.02} max={0.5} step={0.01} onChange={(v) => setRoomOpacity(v)} />
                      </label>
                      <Btn onClick={() => duplicateRoom(r.id)}>Duplicate Room</Btn>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                        <Btn onClick={() => requestDelete({ type: "room", id: r.id })}>Delete Room</Btn>
                      </div>
                    </div>
                  </Panel>
              );
            if (l)
              return (
                  <Panel title="Link Inspector">
                    <div style={{ display: "grid", gap: 8 }}>
                      <label>
                        Style
                        <Select
                            value={l.style || "particles"}
                            onChange={(e) => setLinks((prev) => prev.map((x) => (x.id === l.id ? { ...x, style: e.target.value } : x)))}
                        >
                          <option value="particles">particles</option>
                          <option value="wavy">wavy</option>
                          <option value="icons">icons</option>
                          <option value="dashed">dashed</option>
                          <option value="solid">solid</option>
                          <option value="epic">epic</option>
                        </Select>
                      </label>
                      <label>
                        Active <Checkbox checked={!!l.active} onChange={(v) => setLinks((prev) => prev.map((x) => (x.id === l.id ? { ...x, active: v } : x)))} />
                      </label>
                      <label>
                        Speed
                        <Slider value={l.speed ?? 0.9} min={0} max={4} step={0.05} onChange={(v) => setLinks((prev) => prev.map((x) => (x.id === l.id ? { ...x, speed: v } : x)))} />
                      </label>
                      <label>
                        Width (for lines)
                        <Slider value={l.width ?? 2} min={1} max={6} step={0.1} onChange={(v) => setLinks((prev) => prev.map((x) => (x.id === l.id ? { ...x, width: v } : x)))} />
                      </label>
                      <label>
                        Color
                        <Input type="color" value={l.color || "#7cf"} onChange={(e) => setLinks((prev) => prev.map((x) => (x.id === l.id ? { ...x, color: e.target.value } : x)))} />
                      </label>

                      <div style={{ borderTop: "1px dashed rgba(255,255,255,0.2)", paddingTop: 6, marginTop: 6 }}>
                        <div style={{ fontWeight: 800, marginBottom: 6 }}>Curve</div>
                        <label>
                          Mode
                          <Select
                              value={l.curve?.mode || "up"}
                              onChange={(e) => setLinks((prev) => prev.map((x) => (x.id === l.id ? { ...x, curve: { ...(x.curve || {}), mode: e.target.value } } : x)))}
                          >
                            <option value="straight">straight</option>
                            <option value="up">up</option>
                            <option value="side">side</option>
                          </Select>
                        </label>
                        <label>
                          Bend
                          <Slider
                              value={l.curve?.bend ?? 0.3}
                              min={0}
                              max={1}
                              step={0.01}
                              onChange={(v) => setLinks((prev) => prev.map((x) => (x.id === l.id ? { ...x, curve: { ...(x.curve || {}), bend: v } } : x)))}
                          />
                        </label>
                      </div>

                      {(l.style === "particles" || l.style === "wavy") && (
                          <>
                            <label>
                              Particle Count
                              <Slider
                                  value={l.particles?.count ?? 10}
                                  min={1}
                                  max={80}
                                  step={1}
                                  onChange={(v) => setLinks((prev) => prev.map((x) => (x.id === l.id ? { ...x, particles: { ...(x.particles || {}), count: v } } : x)))}
                              />
                            </label>
                            <label>
                              Particle Size
                              <Slider
                                  value={l.particles?.size ?? 0.06}
                                  min={0.02}
                                  max={0.3}
                                  step={0.01}
                                  onChange={(v) => setLinks((prev) => prev.map((x) => (x.id === l.id ? { ...x, particles: { ...(x.particles || {}), size: v } } : x)))}
                              />
                            </label>
                            <label>
                              Opacity
                              <Slider
                                  value={l.particles?.opacity ?? 1}
                                  min={0.1}
                                  max={1}
                                  step={0.05}
                                  onChange={(v) => setLinks((prev) => prev.map((x) => (x.id === l.id ? { ...x, particles: { ...(x.particles || {}), opacity: v } } : x)))}
                              />
                            </label>
                            <label>
                              Wave Amplitude
                              <Slider
                                  value={l.particles?.waveAmp ?? (l.style === "wavy" ? 0.15 : 0)}
                                  min={0}
                                  max={0.6}
                                  step={0.01}
                                  onChange={(v) => setLinks((prev) => prev.map((x) => (x.id === l.id ? { ...x, particles: { ...(x.particles || {}), waveAmp: v } } : x)))}
                              />
                            </label>
                            <label>
                              Wave Frequency
                              <Slider
                                  value={l.particles?.waveFreq ?? 2}
                                  min={0.2}
                                  max={8}
                                  step={0.05}
                                  onChange={(v) => setLinks((prev) => prev.map((x) => (x.id === l.id ? { ...x, particles: { ...(x.particles || {}), waveFreq: v } } : x)))}
                              />
                            </label>
                            <label>
                              Shape
                              <Select
                                  value={l.particles?.shape || "sphere"}
                                  onChange={(e) => setLinks((prev) => prev.map((x) => (x.id === l.id ? { ...x, particles: { ...(x.particles || {}), shape: e.target.value } } : x)))}
                              >
                                <option value="sphere">sphere</option>
                                <option value="box">box</option>
                                <option value="octa">octa</option>
                              </Select>
                            </label>
                          </>
                      )}

                      {l.style === "epic" && (
                          <>
                            <label>
                              Tube Thickness
                              <Slider
                                  value={l.tube?.thickness ?? 0.06}
                                  min={0.02}
                                  max={0.25}
                                  step={0.005}
                                  onChange={(v) => setLinks((prev) => prev.map((x) => (x.id === l.id ? { ...x, tube: { ...(x.tube || {}), thickness: v } } : x)))}
                              />
                            </label>
                            <label>
                              Tube Glow
                              <Slider
                                  value={l.tube?.glow ?? 1.3}
                                  min={0}
                                  max={3}
                                  step={0.05}
                                  onChange={(v) => setLinks((prev) => prev.map((x) => (x.id === l.id ? { ...x, tube: { ...(x.tube || {}), glow: v } } : x)))}
                              />
                            </label>
                            <label>
                              Trail Particles
                              <Checkbox
                                  checked={(l.tube?.trail ?? true) === true}
                                  onChange={(v) => setLinks((prev) => prev.map((x) => (x.id === l.id ? { ...x, tube: { ...(x.tube || {}), trail: v } } : x)))}
                                  label="enabled"
                              />
                            </label>
                          </>
                      )}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                      <Btn onClick={() => requestDelete({ type: "link", id: l.id })}>Delete Link</Btn>
                    </div>
                  </Panel>
              );
            return null;
          })()}
        </div>

        {/* HUD actions */}
        <div
            onPointerDown={(e) => { e.stopPropagation(); uiStart(); }}
            onPointerUp={uiStop}
            onPointerCancel={uiStop}
            onPointerLeave={uiStop}
            style={{
              position: "absolute",
              bottom: 16,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 30,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              padding: 10,
              borderRadius: 14,
              background: "linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04))",
              border: "1px solid rgba(255,255,255,0.18)",
              boxShadow: "0 12px 28px rgba(0,0,0,0.45)",
              backdropFilter: "blur(14px) saturate(1.2)",
            }}
        >
          {actions.map((a) => (
              <Btn key={a.id} onClick={() => runAction(a)}>
                {a.label}
              </Btn>
          ))}
        </div>

        {/* DRAG overlay */}
        {dragOver && (
            <div
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 15,
                  display: "grid",
                  placeItems: "center",
                  background: "rgba(10,15,25,0.55)",
                  border: "3px dashed rgba(80,227,194,0.6)",
                  color: "#fff",
                  fontWeight: 900,
                  letterSpacing: 0.5,
                }}
            >
              Drop to import (.glb/.gltf/.zip)
            </div>
        )}

        {/* 3D canvas fills behind */}
        <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
          <Canvas
              shadows
              camera={{ position: [6, 4.5, 6], fov: 55 }}
              dpr={perf === "low" ? 1 : perf === "med" ? [1, 1.6] : [1.25, 2]}
              onCreated={({ gl }) => {
                gl.setClearColor(bg);
                gl.outputColorSpace = THREE.SRGBColorSpace;
                gl.toneMapping = THREE.ACESFilmicToneMapping;
                gl.physicallyCorrectLights = true;
                gl.oncontextmenu = (e) => e.preventDefault();
              }}
              onPointerMissed={(e) => {
                const justDragged = performance.now() - (missGuardRef.current || 0) < missGuardMS;
                if (uiInteracting) return;
                if ((e.button === 0 || e.button === undefined) && !dragActive && !justDragged) {
                  setSelected(null);
                  setMode("select");
                  setLinkFromId(null);
                }
              }}
              frameloop={animate ? "always" : "demand"}
          >
            <SceneInner
                modelDescriptor={modelDescriptor}
                wireframe={wireframe}
                wireOpacity={wireOpacity}
            showModel={modelVisible}
                labelsOn={labelsOn}
                labelMode={labelMode}
                labelSize={labelSize}
                rooms={rooms}
                nodes={nodes}
                links={links}
                selected={selected}
                setSelected={setSelected}
                onEntityTransform={onEntityTransform}
                onEntityRotate={onEntityRotate}
                transformMode={transformMode}
                onRoomDragPack={onRoomDragPack}
                onRoomDragApply={onRoomDragApply}
                placement={placement}
                onPlace={onPlace}
                showLights={showLights}
                showLightBounds={showLightBounds}
                roomOpacity={roomOpacity}
                modelRef={modelRef}
                animate={animate}
                dragState={dragState}
                signalMap={signalMap}
                bg={bg}
                missGuardRef={missGuardRef}
                onNodePointerDown={handleNodeDown}
                moveMode={moveMode}
                roomGap={roomGap}
                onModelScene={(scene) => {
                  const box = new THREE.Box3().setFromObject(scene);
                  const c = box.getCenter(new THREE.Vector3());
                  setModelBounds({ min: box.min.toArray(), max: box.max.toArray(), center: c.toArray() });
                  if (!roomGap.center || roomGap.center.join(",") === "0,0.8,0") {
                    setRoomGap((g) => ({ ...g, center: c.toArray() }));
                  }
                }}
            />

            {perf === "high" && <StatsGl showPanel={0} className="stats" />}
            {/* Render node signal effects */}
            {nodes.filter((n) => !n.hidden && n.role !== "none").map((n) => (
                signalMap[n.id] && (
                    <NodeSignals
                        key={`sig-${n.id}`}
                        node={n}
                        linksTo={signalMap[n.id]}
                        style={n.signal?.style || "waves"}
                        color={n.signal?.color || n.color}
                        speed={n.signal?.speed || 1}
                        size={n.signal?.size || 1}
                    />
                )
            ))}
          </Canvas>
        </div>

        {/* Confirm delete modal */}
        {confirm.open && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "grid", placeItems: "center", zIndex: 1000 }}>
              <div
                  style={{
                    width: 780,
                    maxWidth: "94vw",
                    background: "#0f1524",
                    border: "1px solid rgba(255,255,255,0.14)",
                    borderRadius: 16,
                    boxShadow: "0 28px 80px rgba(0,0,0,0.55)",
                    color: "#fff",
                  }}
              >
                <div style={{ padding: 16, borderBottom: "1px solid rgba(255,255,255,0.12)", fontWeight: 900 }}>Confirm Delete</div>
                <div style={{ padding: 16 }}>{confirm.text}</div>
                <div style={{ padding: 16, display: "flex", justifyContent: "flex-end", gap: 8, borderTop: "1px solid rgba(255,255,255,0.12)" }}>
                  <Btn onClick={() => setConfirm({ open: false, payload: null, text: "" })}>Cancel</Btn>
                  <Btn variant="primary" glow onClick={applyConfirmDelete}>
                    Delete
                  </Btn>
                </div>
              </div>
            </div>
        )}
      </div>
  );
}
