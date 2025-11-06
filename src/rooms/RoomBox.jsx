import React, { memo, forwardRef, useMemo } from "react";
import * as THREE from "three";
import { Billboard, Text } from "@react-three/drei";
import DissolveEdgesMaterial from "../materials/DissolveEdgesMaterial.jsx";

/**
 * RoomBox
 * - forwards root ref so TransformControls can attach directly
 * - positioned at room.center, sized by room.size [w,h,d]
 * - clickable to select room
 * - translucent body + glowing edges (DissolveEdgesMaterial)
 * - two-sided labels (billboard / 3d layered / static)
 */
const RoomBox = memo(
    forwardRef(function RoomBox(
        {
            room,
            selected,
            onPointerDown,
            dragging,
            opacity = 0.12,
            gap = { size: 0.14, falloff: 0.06, center: [0, 0, 0] },

            // labels
            labelsOn = true,
            labelMode = "billboard", // "billboard" | "3d" | "static"
            labelSize = 0.24,
            labelMaxWidth = 24,
            label3DLayers = 8,
            label3DStep = 0.01,
        },
        ref
    ) {
        const size = room.size || [2, 2, 2];
        const center = room.center || [0, 0, 0];
        const rotation = room.rotation || [0, 0, 0];

        const geo = useMemo(() => new THREE.BoxGeometry(size[0], size[1], size[2]), [size]);
        const edges = useMemo(() => new THREE.EdgesGeometry(geo), [geo]);

        const labelY = (size[1] || 0) / 2 + 0.12;

        return (
            <group
                ref={ref}
                position={center}
                rotation={rotation}
                onPointerDown={(e) => {
                    e.stopPropagation();
                    if (!dragging) onPointerDown?.(room.id);
                }}
            >
                {/* body */}
                <mesh geometry={geo} castShadow receiveShadow>
                    <meshStandardMaterial
                        color={room.color || "#1b2a44"}
                        transparent
                        opacity={opacity}
                        roughness={0.75}
                        metalness={0.05}
                    />
                </mesh>

                {/* edges */}
                <lineSegments geometry={edges}>
                    <DissolveEdgesMaterial color={selected ? "#00e1ff" : "#8aa1c3"} gap={gap} />
                </lineSegments>

                {/* labels */}
                {labelsOn && room?.name && (
                    <>
                        {labelMode === "billboard" && (
                            <Billboard follow position={[0, labelY, 0]}>
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
                                    {room.name}
                                </Text>
                            </Billboard>
                        )}

                        {labelMode === "3d" && (
                            <group position={[0, labelY, 0]}>
                                {/* FRONT stack */}
                                {Array.from({ length: label3DLayers }).map((_, i) => (
                                    <Text
                                        key={`rf${i}`}
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
                                        {room.name}
                                    </Text>
                                ))}
                                {/* BACK stack */}
                                <group rotation={[0, Math.PI, 0]}>
                                    {Array.from({ length: label3DLayers }).map((_, i) => (
                                        <Text
                                            key={`rb${i}`}
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
                                            {room.name}
                                        </Text>
                                    ))}
                                </group>
                            </group>
                        )}

                        {labelMode === "static" && (
                            <>
                                {/* FRONT */}
                                <group position={[0, labelY, 0]} rotation={[0, 0, 0]}>
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
                                        {room.name}
                                    </Text>
                                </group>
                                {/* BACK */}
                                <group position={[0, labelY, 0]} rotation={[0, Math.PI, 0]}>
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
                                        {room.name}
                                    </Text>
                                </group>
                            </>
                        )}
                    </>
                )}
            </group>
        );
    })
);

export default RoomBox;
