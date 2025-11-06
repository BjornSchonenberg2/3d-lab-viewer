import React, { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { QuadraticBezierLine } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import FlowParticles from "./FlowParticles.jsx";
import IconFlow from "./IconFlow.jsx";
import EpicTube from "./EpicTube.jsx";

const UP = new THREE.Vector3(0, 1, 0);
const V0 = new THREE.Vector3();
const V1 = new THREE.Vector3();
const V2 = new THREE.Vector3();

function midpoint(from, to, mode = "up", bend = 0.3) {
  const a = V0.set(from[0], from[1], from[2]);
  const b = V1.set(to[0], to[1], to[2]);
  const m = a.clone().lerp(b, 0.5);

  if (!bend || mode === "straight") return m;

  const dir = b.clone().sub(a);
  const side = dir.clone().cross(UP).normalize();
  const lift = UP.clone();

  if (mode === "up") m.addScaledVector(lift, dir.length() * bend * 0.6);
  else if (mode === "side") m.addScaledVector(side, dir.length() * bend * 0.6);
  else if (mode === "arc") {
    m.addScaledVector(lift, dir.length() * bend * 0.45);
    m.addScaledVector(side, dir.length() * bend * 0.45);
  }
  return m;
}

export default React.memo(function Link3D({
                                            link,
                                            from,
                                            to,
                                            selected,
                                            onPointerDown,
                                            animate = true,
                                          }) {
  const style   = link?.style || "particles";
  const color   = link?.color || "#7cf";
  const width   = link?.width ?? 2;
  const active  = link?.active !== false;
  const speed   = link?.speed ?? 1;

  const mode     = link?.curve?.mode ?? "up";
  const bend     = link?.curve?.bend ?? 0.3;
  const noiseAmp = link?.curve?.noiseAmp ?? 0;
  const noiseFrq = link?.curve?.noiseFreq ?? 1.5;

  // Base midpoint (parametric)
  const baseMid = useMemo(() => midpoint(from, to, mode, bend), [from, to, mode, bend]);

  // Live "mid" we can wiggle per frame
  const midRef = useRef(baseMid.clone());
  useEffect(() => { midRef.current.copy(baseMid); }, [baseMid]);

  // A persistent bezier curve we mutate per-frame (so children always have same object ref)
  const bezierRef = useRef(
      new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(...from),
          baseMid.clone(),
          new THREE.Vector3(...to)
      )
  );

  // Keep endpoints up-to-date when from/to change
  useEffect(() => {
    const c = bezierRef.current;
    c.v0.set(from[0], from[1], from[2]);
    c.v1.copy(midRef.current);
    c.v2.set(to[0], to[1], to[2]);
  }, [from, to]);

  // Wiggle the midpoint (noise) + push into curve each frame
  useFrame(({ clock }) => {
    if (!animate) return;
    const c = bezierRef.current;
    if (!c) return;

    // Curve wiggle
    if (noiseAmp > 0) {
      const t = clock.getElapsedTime() * (noiseFrq || 1.5);
      midRef.current.set(
          baseMid.x + Math.sin(t * 1.13 + from[0]) * noiseAmp,
          baseMid.y + Math.cos(t * 0.87 + to[1]) * noiseAmp,
          baseMid.z + Math.sin(t * 1.41 + from[2]) * noiseAmp
      );
      c.v1.copy(midRef.current); // push new control point
    }
  });

  // Dashed animation: directly mutate the LineMaterial dashOffset
  const dashedRef = useRef();
  const dashOffset = useRef(0);
  useFrame((_, delta) => {
    if (!animate || style !== "dashed") return;
    if (link?.dash?.animate === false) return;
    dashOffset.current -= (speed || 1) * (delta * 0.8);
    const mat = dashedRef.current?.material;
    if (mat) {
      if (typeof mat.dashOffset !== "undefined") mat.dashOffset = dashOffset.current;
      else if (mat.uniforms?.dashOffset) mat.uniforms.dashOffset.value = dashOffset.current;
    }
  });

  if (!active) return null;

  const pointerProps = onPointerDown ? { onPointerDown } : {};

  return (
      <group {...pointerProps}>
        {style === "solid" && (
            <QuadraticBezierLine
                start={from}
                end={to}
                mid={[midRef.current.x, midRef.current.y, midRef.current.z]}
                color={color}
                lineWidth={width}
                transparent
                opacity={selected ? 1 : 0.92}
                depthWrite={false}
            />
        )}

        {style === "dashed" && (
            <QuadraticBezierLine
                ref={dashedRef}
                start={from}
                end={to}
                mid={[midRef.current.x, midRef.current.y, midRef.current.z]}
                color={color}
                lineWidth={width}
                dashed
                dashScale={link?.dash?.length ?? 1}
                dashSize={link?.dash?.gap ?? 0.25}
                // dashOffset is driven per-frame on the material
                transparent
                opacity={selected ? 1 : 0.96}
                depthWrite={false}
            />
        )}

        {(style === "particles" || style === "wavy") && (
            <FlowParticles
                curve={bezierRef.current}
                count={link.particles?.count ?? 24}
                size={link.particles?.size ?? 0.06}
                color={link.particles?.color ?? color}
                speed={(speed || 1) * (style === "wavy" ? 1.1 : 1)}
                opacity={link.particles?.opacity ?? 1}
                waveAmp={link.particles?.waveAmp ?? (style === "wavy" ? 0.18 : 0.06)}
                waveFreq={link.particles?.waveFreq ?? 2}
                shape={link.particles?.shape || "sphere"}
                selected={!!selected}
                animate={animate}
            />
        )}

        {style === "icons" && (
            <IconFlow
                curve={bezierRef.current}
                char={(link.icon?.char ?? "▶").toString()}
                count={link.icon?.count ?? 4}
                size={link.icon?.size ?? 0.14}
                color={link.icon?.color ?? color}
                speed={speed || 1}
                opacity={0.95}
                selected={!!selected}
                animate={animate}
            />
        )}

        {style === "epic" && (
            <EpicTube
                curve={bezierRef.current}
                thickness={link.tube?.thickness ?? 0.07}
                glow={link.tube?.glow ?? 1.4}
                color={link.tube?.color ?? color}
                speed={speed || 1}
                trail={link.tube?.trail !== false}
                selected={!!selected}
                widthHint={width}
                animate={animate}
            />
        )}
      </group>
  );
});
