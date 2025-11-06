import React, { memo, forwardRef, useMemo, useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { Billboard, Text } from "@react-three/drei";
import { useThree, useFrame } from "@react-three/fiber";

import GeometryForShape from "../geometry/GeometryForShape.jsx";
import LightBounds from "../lights/LightBounds.jsx";
import { clusterColor } from "../utils/clusters.js";

const Node3D = memo(
    forwardRef(function Node3D(
        {
            node,
            selected = false,
            onPointerDown,
            dragging = false,

            // visuals
            showLights = true,
            showLightBoundsGlobal = false,

            // labels
            labelsOn = true,
            labelMode = "billboard",   // "billboard" | "3d" | "static"
            labelSize = 0.24,
            labelMaxWidth = 24,        // wider before wrapping
            label3DLayers = 8,         // how many stacked layers for 3D look
            label3DStep = 0.01,        // depth step per layer (world units)
        },
        ref
    ) {
        const position = node?.position || [0, 0, 0];
        const rotation = node?.rotation || [0, 0, 0];
        const baseColor = node?.color || clusterColor(node?.cluster);
        const visible = node?.visible !== false;

        const labelText = node?.label || node?.name || node?.id;

        const handlePointerDown = (e) => {
            e.stopPropagation();
            if (dragging) return;
            onPointerDown?.(node.id);
        };

        // label vertical offset based on shape
        const yOffset = useMemo(() => {
            const s = node?.shape || {};
            const t = (s.type || "sphere").toLowerCase();
            if (t === "sphere")   return (s.radius ?? 0.32) + 0.12;
            if (t === "cylinder") return (s.height ?? 0.6) / 2 + 0.12;
            if (t === "cone")     return (s.height ?? 0.7) / 2 + 0.12;
            if (t === "disc" || t === "circle") return (s.height ?? 0.08) / 2 + 0.12;
            if (t === "hexagon")  return (s.height ?? 0.5) / 2 + 0.12;
            if (t === "switch")   return (s.h ?? 0.12) / 2 + 0.12;
            if (t === "box" || t === "square") return (s.scale?.[1] ?? 0.3) / 2 + 0.12;
            return 0.44;
        }, [node?.shape]);

        // STATIC label visibility toggle (only show when camera is in front)
        const labelRef = useRef();
        const { camera } = useThree();
        useFrame(() => {
            if (!labelRef.current) return;
            if (labelMode !== "static") {
                labelRef.current.visible = true;
                return;
            }
            const m = labelRef.current.matrixWorld;
            const forward = new THREE.Vector3(0, 0, 1).applyMatrix4(new THREE.Matrix4().extractRotation(m));
            const worldPos = new THREE.Vector3().setFromMatrixPosition(m);
            const toCam = new THREE.Vector3().subVectors(camera.position, worldPos).normalize();
            labelRef.current.visible = forward.dot(toCam) > 0;
        });

        // Check if the 3D font file exists to avoid crashes; fall back if missing


        const textProps = {
            fontSize: labelSize,
            maxWidth: labelMaxWidth,
            anchorX: "center",
            anchorY: "bottom",
            color: "white",
            outlineWidth: 0.005,
            outlineColor: "#000000",
            depthTest: false,
            depthWrite: false,
            renderOrder: 9999,
        };

        // selection halo inflate
        const inflateShape = (shape) => {
            const s = shape || {};
            const t = (s.type || "sphere").toLowerCase();
            if (t === "sphere") return { ...s, radius: (s.radius ?? 0.32) + 0.02 };
            if (t === "cylinder" || t === "hexagon" || t === "disc" || t === "circle")
                return { ...s, radius: (s.radius ?? 0.35) + 0.02, height: (s.height ?? 0.6) + 0.02 };
            if (t === "cone") return { ...s, radius: (s.radius ?? 0.35) + 0.02, height: (s.height ?? 0.7) + 0.02 };
            if (t === "switch") return { ...s, w: (s.w ?? 0.9) + 0.02, h: (s.h ?? 0.12) + 0.02, d: (s.d ?? 0.35) + 0.02 };
            if (t === "box" || t === "square") return { ...s, scale: (s.scale || [0.6, 0.3, 0.6]).map((v) => v + 0.02) };
            return s;
        };

        if (!visible) return null;

        return (
            <group
                ref={ref}
                position={position}
                rotation={rotation}
                onPointerDown={handlePointerDown}
                castShadow
                receiveShadow
            >
                {/* main mesh */}
                <mesh castShadow receiveShadow>
                    <GeometryForShape shape={node.shape} />
                    <meshStandardMaterial color={baseColor} roughness={0.35} metalness={0.05} />
                </mesh>

                {/* selection halo */}
                {selected && (
                    <mesh renderOrder={9998}>
                        <GeometryForShape shape={inflateShape(node.shape)} />
                        <meshBasicMaterial color="#ffffff" transparent opacity={0.18} depthWrite={false} />
                    </mesh>
                )}

                {/* optional light */}
                {showLights && (
                    <>
                        <pointLight intensity={0.6} distance={3.5} decay={2} position={[0, yOffset, 0]} />
                        {showLightBoundsGlobal && <LightBounds center={[0, yOffset, 0]} radius={3.5} />}
                    </>
                )}

                {/* labels */}
                {/* labels */}
                {/* labels */}
                {labelsOn && labelText && (
                    <>
                        {labelMode === "billboard" && (
                            <Billboard follow position={[0, yOffset, 0]}>
                                <Text
                                    fontSize={labelSize}
                                    maxWidth={labelMaxWidth}
                                    anchorX="center"
                                    anchorY="bottom"
                                    color="white"
                                    outlineWidth={0.005}
                                    outlineColor="#000"
                                    depthTest={false}
                                    depthWrite={false}
                                    renderOrder={9999}
                                >
                                    {labelText}
                                </Text>
                            </Billboard>
                        )}

                        {labelMode === "3d" && (
                            <group position={[0, yOffset, 0]}>
                                {/* FRONT stack */}
                                {Array.from({ length: label3DLayers }).map((_, i) => (
                                    <Text
                                        key={`f${i}`}
                                        position={[0, 0, -i * label3DStep]}
                                        fontSize={labelSize}
                                        maxWidth={labelMaxWidth}
                                        anchorX="center"
                                        anchorY="bottom"
                                        color={i === 0 ? "white" : "#e5e5e5"}
                                        outlineWidth={i === 0 ? 0.006 : 0}
                                        outlineColor="#000"
                                        depthTest={false}
                                        depthWrite={false}
                                        renderOrder={9999}
                                    >
                                        {labelText}
                                    </Text>
                                ))}
                                {/* BACK stack (mirrored) */}
                                <group rotation={[0, Math.PI, 0]}>
                                    {Array.from({ length: label3DLayers }).map((_, i) => (
                                        <Text
                                            key={`b${i}`}
                                            position={[0, 0, -i * label3DStep]}
                                            fontSize={labelSize}
                                            maxWidth={labelMaxWidth}
                                            anchorX="center"
                                            anchorY="bottom"
                                            color={i === 0 ? "white" : "#e5e5e5"}
                                            outlineWidth={i === 0 ? 0.006 : 0}
                                            outlineColor="#000"
                                            depthTest={false}
                                            depthWrite={false}
                                            renderOrder={9999}
                                        >
                                            {labelText}
                                        </Text>
                                    ))}
                                </group>
                            </group>
                        )}

                        {labelMode === "static" && (
                            <>
                                {/* FRONT */}
                                <group position={[0, yOffset, 0]} rotation={[0, 0, 0]}>
                                    <Text
                                        fontSize={labelSize}
                                        maxWidth={labelMaxWidth}
                                        anchorX="center"
                                        anchorY="bottom"
                                        color="white"
                                        outlineWidth={0.005}
                                        outlineColor="#000"
                                        depthTest={false}
                                        depthWrite={false}
                                        renderOrder={9999}
                                    >
                                        {labelText}
                                    </Text>
                                </group>
                                {/* BACK (mirrored) */}
                                <group position={[0, yOffset, 0]} rotation={[0, Math.PI, 0]}>
                                    <Text
                                        fontSize={labelSize}
                                        maxWidth={labelMaxWidth}
                                        anchorX="center"
                                        anchorY="bottom"
                                        color="white"
                                        outlineWidth={0.005}
                                        outlineColor="#000"
                                        depthTest={false}
                                        depthWrite={false}
                                        renderOrder={9999}
                                    >
                                        {labelText}
                                    </Text>
                                </group>
                            </>
                        )}
                    </>
                )}



                {/* (Optional) other visuals like LightBounds driven by node.light */}
                <LightBounds node={node} globalOn={showLightBoundsGlobal} />
            </group>
        );
    })
);

export default Node3D;
