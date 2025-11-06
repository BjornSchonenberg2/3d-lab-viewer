import React, { memo, forwardRef, useMemo } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import DissolveEdgesMaterial from "../materials/DissolveEdgesMaterial.jsx";

/**
 * RoomBox
 * - forwards root ref so TransformControls can attach directly
 * - positioned at room.center, sized by room.size [w,h,d]
 * - clickable to select room
 * - translucent body + glowing edges (DissolveEdgesMaterial)
 */
const RoomBox = memo(
    forwardRef(function RoomBox(
        { room, selected, onPointerDown, opacity = 0.12, dragging, gap = { size: 0.14, falloff: 0.06, center: [0, 0, 0] } },
        ref
    ) {
        const size = room.size || [2, 2, 2];
        const geo = useMemo(() => new THREE.BoxGeometry(size[0], size[1], size[2]), [size]);
        const edges = useMemo(() => new THREE.EdgesGeometry(geo), [geo]);

        return (
            <group
                ref={ref}
                position={room.center || [0, 0, 0]}
                rotation={room.rotation || [0, 0, 0]}
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

                {/* label */}
                {room.name && (
                    <Html position={[0, size[1] / 2 + 0.1, 0]} occlude>
                        <div
                            style={{
                                background: "rgba(0,0,0,0.6)",
                                color: "#fff",
                                fontSize: 11,
                                padding: "2px 6px",
                                borderRadius: 6,
                                border: "1px solid rgba(255,255,255,0.2)",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {room.name}
                        </div>
                    </Html>
                )}
            </group>
        );
    })
);

export default RoomBox;
