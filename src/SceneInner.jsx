import React, { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { OrbitControls, TransformControls, Grid, ContactShadows } from "@react-three/drei";

import ImportedModel from "./gltf/ImportedModel.jsx";
import RoomBox from "./rooms/RoomBox.jsx";
import Node3D from "./nodes/Node3D.jsx";
import Link3D from "./links/Link3D.jsx";
import InteractionLayer from "./interaction/InteractionLayer.jsx";

export default function SceneInner({
                                       // scene/model
                                       modelDescriptor,
                                       wireframe,
                                       modelRef,

                                       // data
                                       rooms = [],
                                       nodes = [],
                                       links = [],

                                       // selection
                                       selected,
                                       setSelected,
                                       onNodePointerDown,

                                       // transforms
                                       moveMode = false,
                                       transformMode = "translate",          // "translate" | "rotate" | "scale"
                                       onEntityTransform,                    // (target, pos)
                                       onEntityRotate,                       // (target, rot)

                                       // visuals
                                       showLights = true,
                                       showLightBounds = false,

                                       // placement
                                       placement,                            // { armed, placeKind, multi, snap }
                                       onPlace,

                                       // global animation toggle
                                       animate = true,

                                       // drag guard from parent (prevents onPointerMissed deselect while dragging)
                                       dragState,                            // { active:boolean, set: fn(boolean) }
                                       missGuardRef,                         // ref<number>

                                       // callback when model scene is ready (optional)
                                       onModelScene,
                                   }) {
    // --- keep a ref to every node/room's top-level THREE.Group
    const nodeRefs = useRef({});
    const roomRefs = useRef({});

    const nodeMap = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);
    const selectedNode = selected?.type === "node" ? nodeMap[selected.id] : null;
    const selectedRoom = selected?.type === "room" ? rooms.find((r) => r.id === selected.id) : null;

    // --- TransformControls (gizmo) that we attach imperatively to the real object
    const tcRef = useRef();

    // attach/detach to the current selection
    useEffect(() => {
        if (!tcRef.current) return;

        let target = null;
        if (moveMode && selectedNode) {
            target = nodeRefs.current[selectedNode.id]?.current || null;
        } else if (moveMode && selectedRoom) {
            target = roomRefs.current[selectedRoom.id]?.current || null;
        }

        if (target) {
            tcRef.current.attach(target);
        } else {
            tcRef.current.detach();
        }
    }, [moveMode, selectedNode?.id, selectedRoom?.id, transformMode]);

    // while dragging, disable orbit + guard selection clearing
    useEffect(() => {
        if (!tcRef.current) return;
        const onDrag = (e) => {
            const dragging = !!e.value;
            dragState?.set?.(dragging);
            if (missGuardRef) missGuardRef.current = performance.now();
        };
        tcRef.current.addEventListener("dragging-changed", onDrag);
        return () => tcRef.current?.removeEventListener("dragging-changed", onDrag);
    }, [dragState, missGuardRef]);

    const stop = (e) => {
        e?.stopPropagation?.();
        if (missGuardRef) missGuardRef.current = performance.now();
    };

    return (
        <>
            <ambientLight intensity={0.6} />
            <directionalLight position={[6, 8, 6]} intensity={0.4} castShadow />

            {modelDescriptor && (
                <group ref={modelRef}>
                    <ImportedModel
                        descriptor={modelDescriptor}
                        wireframe={wireframe}
                        onScene={(scene) => {
                            if (modelRef) modelRef.current = scene;  // raycast target for placement
                            if (typeof onModelScene === "function") onModelScene(scene);
                        }}
                    />
                </group>
            )}

            {/* Rooms */}
            {rooms.map((r) => {
                roomRefs.current[r.id] ||= React.createRef();
                return (
                    <RoomBox
                        ref={roomRefs.current[r.id]}
                        key={r.id}
                        room={r}
                        selected={selected?.type === "room" && selected.id === r.id}
                        onPointerDown={(id) => setSelected?.({ type: "room", id })}
                        dragging={!!dragState?.active}
                    />
                );
            })}

            {/* Nodes */}
            {nodes.map((n) => {
                nodeRefs.current[n.id] ||= React.createRef();
                return (
                    <Node3D
                        ref={nodeRefs.current[n.id]}
                        key={n.id}
                        node={n}
                        selected={selected?.type === "node" && selected.id === n.id}
                        onPointerDown={(id) => {
                            if (dragState?.active) return; // don't fight the gizmo while dragging
                            if (onNodePointerDown) onNodePointerDown(id);
                            else setSelected?.({ type: "node", id });
                        }}
                        showLights={showLights}
                        showLightBoundsGlobal={showLightBounds}
                        dragging={!!dragState?.active}
                    />
                );
            })}

            {/* Links */}
            {links.map((l) => {
                const a = nodeMap[l.from];
                const b = nodeMap[l.to];
                if (!a || !b) return null;
                return (
                    <Link3D
                        key={l.id}
                        link={l}
                        from={a.position}
                        to={b.position}
                        selected={selected?.type === "link" && selected.id === l.id}
                        onPointerDown={() => setSelected?.({ type: "link", id: l.id })}
                        animate={animate}
                    />
                );
            })}

            {/* TransformControls is now standalone and attached to the real object */}
            {moveMode && (selectedNode || selectedRoom) && (
                <TransformControls
                    ref={tcRef}
                    mode={transformMode}
                    size={1.0}
                    space="world"
                    onMouseDown={stop}
                    onMouseUp={stop}
                    onPointerDown={stop}
                    onPointerUp={stop}
                    onObjectChange={() => {
                        const obj = tcRef.current?.object;
                        if (!obj) return;
                        const p = obj.position, r = obj.rotation;

                        if (selectedNode) {
                            onEntityTransform?.({ type: "node", id: selectedNode.id }, [p.x, p.y, p.z]);
                            onEntityRotate?.({ type: "node", id: selectedNode.id }, [r.x, r.y, r.z]);
                        } else if (selectedRoom) {
                            onEntityTransform?.({ type: "room", id: selectedRoom.id }, [p.x, p.y, p.z]);
                            onEntityRotate?.({ type: "room", id: selectedRoom.id }, [r.x, r.y, r.z]);
                        }
                        if (missGuardRef) missGuardRef.current = performance.now();
                    }}
                />
            )}

            <ContactShadows position={[0, -0.001, 0]} opacity={0.3} scale={20} blur={1.6} />
            <Grid args={[20, 20]} sectionColor="#1f2a44" cellColor="#0f1628" infiniteGrid />

            {/* Disable orbiting while dragging or placing */}
            <OrbitControls makeDefault enabled={!placement?.armed && !dragState?.active} enableDamping dampingFactor={0.08} />

            {/* Click-to-place layer (raycasts model + ground) */}
            <InteractionLayer
                armed={!!placement?.armed}
                placeKind={placement?.placeKind}
                multi={!!placement?.multi}
                snap={placement?.snap ?? 0.25}
                onPlace={onPlace}
                modelRef={modelRef}
            />
        </>
    );
}
