/**
 * BuildingPlacer: Extrudes OSM building footprints into custom procedural buildings.
 * Footprints and heights stay true to map geometry while facades are styled in-app.
 */

import { memo, useMemo } from 'react';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { useGameStore } from '../stores/gameStore';
import { useWorldStore } from '../stores/worldStore';
import { projectToLocal } from '../utils/geo';
import {
  getBuildingStyle,
  getFacadeTextures,
  getWindowGlowIntensity,
  type BuildingFootprintMetrics,
} from './buildingTheme';

interface BuildingInstance {
  position: [number, number, number];
  shapePoints: THREE.Vector2[];
  wallHeight: number;
  colliderSize: [number, number, number];
  colliderOffset: [number, number, number];
  style: ReturnType<typeof getBuildingStyle>;
  key: string;
}

interface ProjectedPoint {
  x: number;
  z: number;
}

function sanitizePolygon(points: ProjectedPoint[]): ProjectedPoint[] {
  if (points.length < 3) return [];

  const cleaned = [...points];
  const first = cleaned[0];
  const last = cleaned[cleaned.length - 1];

  if (Math.hypot(first.x - last.x, first.z - last.z) < 0.001) {
    cleaned.pop();
  }

  return cleaned;
}

function computePolygonCentroid(points: ProjectedPoint[]): ProjectedPoint {
  let twiceArea = 0;
  let centroidX = 0;
  let centroidZ = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const cross = current.x * next.z - next.x * current.z;
    twiceArea += cross;
    centroidX += (current.x + next.x) * cross;
    centroidZ += (current.z + next.z) * cross;
  }

  if (Math.abs(twiceArea) < 0.001) {
    const averageX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const averageZ = points.reduce((sum, point) => sum + point.z, 0) / points.length;
    return { x: averageX, z: averageZ };
  }

  return {
    x: centroidX / (3 * twiceArea),
    z: centroidZ / (3 * twiceArea),
  };
}

function computeFootprintMetrics(points: ProjectedPoint[]): BuildingFootprintMetrics {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  const polygon = points.map((point) => new THREE.Vector2(point.x, point.z));
  const area = Math.abs(THREE.ShapeUtils.area(polygon));

  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }

  return {
    width: maxX - minX,
    depth: maxZ - minZ,
    area,
    minX,
    maxX,
    minZ,
    maxZ,
  };
}

function createShapePoints(points: ProjectedPoint[], centroid: ProjectedPoint): THREE.Vector2[] {
  const shapePoints = points.map((point) => new THREE.Vector2(point.x - centroid.x, centroid.z - point.z));

  if (THREE.ShapeUtils.isClockWise(shapePoints)) {
    shapePoints.reverse();
  }

  return shapePoints;
}

/**
 * Preprocess all buildings into footprint-driven instances.
 */
function useBuildingInstances(): BuildingInstance[] {
  const worldData = useWorldStore((s) => s.worldData);
  const refLat = useWorldStore((s) => s.refLat);
  const refLon = useWorldStore((s) => s.refLon);

  return useMemo(() => {
    if (!worldData) return [];

    const instances: BuildingInstance[] = [];

    for (const building of worldData.buildings) {
      if (!building.geometry || building.geometry.length < 3) continue;

      const projectedPoints = sanitizePolygon(
        building.geometry.map((point) => projectToLocal(point.lat, point.lon, refLat, refLon))
      );

      if (projectedPoints.length < 3) continue;

      const footprint = computeFootprintMetrics(projectedPoints);

      if (footprint.width < 2 || footprint.depth < 2 || footprint.area < 8) continue;

      const totalHeight = Math.max(3, building.heightMeters);
      const centroid = computePolygonCentroid(projectedPoints);
      const shapePoints = createShapePoints(projectedPoints, centroid);
      const style = getBuildingStyle(
        building.buildingType,
        building.levels,
        totalHeight,
        footprint,
        `building-${building.id}`
      );
      const wallHeight = Math.max(1.2, totalHeight - style.roofHeight);

      instances.push({
        position: [centroid.x, 0, centroid.z],
        shapePoints,
        wallHeight,
        colliderSize: [
          Math.max(footprint.width / 2, 1.5),
          Math.max(totalHeight / 2, 1.5),
          Math.max(footprint.depth / 2, 1.5),
        ],
        colliderOffset: [0, totalHeight / 2, 0],
        style,
        key: `bld-${building.id}`,
      });
    }

    return instances;
  }, [worldData, refLat, refLon]);
}

/**
 * Individual procedural building with accurate footprint and height.
 */
const BuildingMesh = memo(function BuildingMesh({ instance }: { instance: BuildingInstance }) {
  const timeOfDay = useGameStore((s) => s.timeOfDay);
  const facadeTextures = useMemo(
    () => getFacadeTextures(instance.style.facadeVariant),
    [instance.style.facadeVariant]
  );

  const bodyGeometry = useMemo(() => {
    const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(instance.shapePoints), {
      depth: instance.wallHeight,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 1,
    });

    geometry.rotateX(-Math.PI / 2);
    geometry.computeVertexNormals();
    return geometry;
  }, [instance.shapePoints, instance.wallHeight]);

  const roofGeometry = useMemo(() => {
    const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(instance.shapePoints), {
      depth: instance.style.roofHeight,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 1,
    });

    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, instance.wallHeight, 0);
    geometry.computeVertexNormals();
    return geometry;
  }, [instance.shapePoints, instance.style.roofHeight, instance.wallHeight]);

  const windowGlowIntensity = getWindowGlowIntensity(timeOfDay, instance.style.facadeVariant);

  return (
    <RigidBody
      type="fixed"
      position={instance.position}
      colliders={false}
    >
      <group>
        <CuboidCollider args={instance.colliderSize} position={instance.colliderOffset} />
        <mesh geometry={bodyGeometry} castShadow receiveShadow>
          <meshStandardMaterial
            attach="material-0"
            color={instance.style.roofColor}
            roughness={instance.style.roofRoughness}
            metalness={instance.style.roofMetalness}
          />
          <meshStandardMaterial
            attach="material-1"
            color={instance.style.wallColor}
            map={facadeTextures.albedo}
            emissive={instance.style.windowGlowColor}
            emissiveMap={facadeTextures.emissive}
            emissiveIntensity={windowGlowIntensity}
            roughness={instance.style.wallRoughness}
            metalness={instance.style.wallMetalness}
          />
        </mesh>
        <mesh geometry={roofGeometry} castShadow receiveShadow>
          <meshStandardMaterial
            color={instance.style.roofColor}
            roughness={instance.style.roofRoughness}
            metalness={instance.style.roofMetalness}
          />
        </mesh>
        {instance.style.rooftopDetails.map((detail, index) => (
          <mesh
            key={`${instance.key}-roof-${index}`}
            position={detail.position}
            castShadow
            receiveShadow
          >
            <boxGeometry args={detail.size} />
            <meshStandardMaterial color={detail.color} roughness={0.85} metalness={0.12} />
          </mesh>
        ))}
      </group>
    </RigidBody>
  );
});

/**
 * Main BuildingPlacer component — renders all buildings in the world.
 */
export default function BuildingPlacer() {
  const instances = useBuildingInstances();

  return (
    <group name="buildings">
      {instances.map((inst) => (
        <BuildingMesh key={inst.key} instance={inst} />
      ))}
    </group>
  );
}
