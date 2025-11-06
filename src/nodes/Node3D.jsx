import React, { memo, forwardRef, useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import GeometryForShape from "../geometry/GeometryForShape.jsx";
import LightBounds from "../lights/LightBounds.jsx";
import { clusterColor } from "../utils/clusters.js";

/**
 * Node3D
 * - forwards its root group ref so TransformControls can attach directly
 * - positions & rotates from node.position / node.rotation
 * - clickable surface -> calls onPointerDown(node.id)
 * - optional light (spot/point) driven by node.light {type, yaw, pitch, distance, intensity}
 * - shows LightBounds helper when enabled
 */
const Node3D = memo(
    forwardRef(function Node3D(
        { node, selected, onPointerDown, showLights, dragging, showLightBoundsGlobal },
        ref
    ) {
        const emissiveColor = useMemo(
            () => new THREE.Color(node.color || clusterColor(node.cluster)),
            [node.color, node.cluster]
        );
        const emissiveIntensity = node.glowOn ? (node.glow ?? 0.8) : 0.0;

        const light = node.light || {};
        const yaw = (light.yaw ?? 0) * (Math.PI / 180);
        const pitch = (light.pitch ?? -30) * (Math.PI / 180);
        const dist = light.distance ?? 8;
        const intensity = light.intensity ?? 1.2;

        // compute light direction from yaw/pitch (y up)
        const dir = useMemo(() => {
            const v = new THREE.Vector3();
            v.x = Math.cos(pitch) * Math.sin(yaw);
            v.y = Math.sin(pitch);
            v.z = Math.cos(pitch) * Math.cos(yaw);
            return v.normalize();
        }, [yaw, pitch]);

        const shape = node.shape || { kind: "sphere", radius: 0.32 };
        const baseColor = node.color || clusterColor(node.cluster);

        const handlePointerDown = (e) => {
            // prevent canvas onPointerMissed from clearing selection
            e.stopPropagation();
            if (dragging) return;
            onPointerDown?.(node.id);
        };

        // SpotLight target wiring
        const spotRef = useRef();
        const targetRef = useRef();

        useEffect(() => {
            if (spotRef.current && targetRef.current) {
                spotRef.current.target = targetRef.current;
            }
        }, []);

        // keep target in front of node based on current dir/dist
        useEffect(() => {
            if (!targetRef.current) return;
            targetRef.current.position.set(dir.x * dist, dir.y * dist, dir.z * dist);
        }, [dir, dist]);

        return (
            <group
                ref={ref}
                position={node.position || [0, 0, 0]}
                rotation={node.rotation || [0, 0, 0]}
                onPointerDown={handlePointerDown}
            >
                {/* main body */}
                <mesh castShadow receiveShadow>
                    <GeometryForShape shape={shape} />
                    <meshStandardMaterial
                        color={baseColor}
                        emissive={emissiveColor}
                        emissiveIntensity={emissiveIntensity}
                        roughness={0.35}
                        metalness={0.05}
                    />
                </mesh>

                {/* selection overlay */}
                {selected && (
                    <mesh>
                        <GeometryForShape
                            shape={{
                                ...shape,
                                radius: (shape.radius ?? 0.32) + 0.02,
                                w: (shape.w ?? 0.5) + 0.02,
                                h: (shape.h ?? 0.5) + 0.02,
                                d: (shape.d ?? 0.5) + 0.02,
                                scale: shape.scale?.map ? shape.scale.map((v) => v + 0.02) : shape.scale
                            }}
                        />
                        <meshBasicMaterial color="#00e1ff" wireframe transparent opacity={0.9} depthWrite={false} />
                    </mesh>
                )}

                {/* optional light */}
                {showLights && light.type && (
                    <>
                        {light.type === "spot" ? (
                            <>
                                <spotLight
                                    ref={spotRef}
                                    position={[0, 0, 0]}
                                    intensity={intensity}
                                    distance={dist}
                                    angle={(light.angle ?? 25) * (Math.PI / 180)}
                                    penumbra={0.45}
                                    color={light.color || baseColor}
                                    castShadow
                                />
                                <object3D ref={targetRef} />
                            </>
                        ) : (
                            <pointLight
                                position={[0, 0, 0]}
                                intensity={intensity}
                                distance={dist}
                                color={light.color || baseColor}
                                castShadow
                            />
                        )}
                    </>
                )}

                {/* visualizer for light extents */}
                <LightBounds node={node} globalOn={showLightBoundsGlobal} />
            </group>
        );
    })
);

export default Node3D;
