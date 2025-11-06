import React, { memo } from "react";

const GeometryForShape = memo(function GeometryForShape({ shape }) {
  switch (shape?.type) {
    case "box":
      return <boxGeometry args={shape.scale || [0.6, 0.3, 0.6]} />;
    case "cylinder":
      return <cylinderGeometry args={[shape.radius || 0.25, shape.radius || 0.25, shape.height || 0.8, 24]} />;
    case "cone":
      return <coneGeometry args={[shape.radius || 0.32, shape.height || 0.8, 24]} />;
    case "switch":
      return <boxGeometry args={[shape.w || 0.9, shape.h || 0.12, shape.d || 0.35]} />;
    case "sphere":
    default:
      return <sphereGeometry args={[shape?.radius || 0.32, 32, 32]} />;
  }
});

export default GeometryForShape;
