/**
 * RoadGenerator: Renders roads as flat ribbon meshes along OSM road polylines.
 * 
 * Roads are VISUAL ONLY — no individual physics colliders.
 * The car drives on the GroundPlane's single CuboidCollider at Y=0.
 * This avoids hundreds of trimesh colliders that cause:
 * - Massive physics overhead (each trimesh = expensive broadphase entry)
 * - Collision fighting between road surface and ground plane
 * - Vehicle jitter from overlapping colliders at intersections
 */

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { RigidBody, MeshCollider } from '@react-three/rapier';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { useWorldStore } from '../stores/worldStore';
import { projectToLocal } from '../utils/geo';
import { Text } from '@react-three/drei';
import { sampleTerrainHeight } from '../utils/terrain';

const NON_DRIVABLE_ROADS = new Set(['footway', 'path', 'pedestrian', 'cycleway', 'steps', 'bridleway']);

/**
 * Create a ribbon mesh geometry along a polyline with a given width.
 */
function createRoadRibbon(
  points: THREE.Vector3[],
  width: number
): THREE.BufferGeometry {
  if (points.length < 2) return new THREE.BufferGeometry();

  const vertices: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  let totalLength = 0;

  for (let i = 0; i < points.length; i++) {
    // Compute direction
    let dir: THREE.Vector3;
    if (i === 0) {
      dir = new THREE.Vector3().subVectors(points[1], points[0]).normalize();
    } else if (i === points.length - 1) {
      dir = new THREE.Vector3().subVectors(points[i], points[i - 1]).normalize();
    } else {
      const d1 = new THREE.Vector3().subVectors(points[i], points[i - 1]).normalize();
      const d2 = new THREE.Vector3().subVectors(points[i + 1], points[i]).normalize();
      dir = new THREE.Vector3().addVectors(d1, d2).normalize();
    }

    // Perpendicular direction (cross with up)
    const up = new THREE.Vector3(0, 1, 0);
    const perp = new THREE.Vector3().crossVectors(up, dir).normalize();

    const halfW = width / 2;
    const left = new THREE.Vector3().copy(points[i]).addScaledVector(perp, halfW);
    const right = new THREE.Vector3().copy(points[i]).addScaledVector(perp, -halfW);

    vertices.push(left.x, left.y, left.z);
    vertices.push(right.x, right.y, right.z);

    normals.push(0, 1, 0, 0, 1, 0);

    if (i > 0) {
      totalLength += points[i].distanceTo(points[i - 1]);
    }
    const u = totalLength / width;
    uvs.push(0, u, 1, u);

    if (i < points.length - 1) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);

  return geo;
}

/**
 * Road color by type (matching Kenney's aesthetic palette).
 */
function roadColor(roadType: string): string {
  switch (roadType) {
    case 'motorway':
    case 'trunk':
      return '#3a3a3a';
    case 'primary':
    case 'secondary':
      return '#4a4a4a';
    case 'tertiary':
    case 'residential':
    case 'living_street':
      return '#555555';
    case 'service':
      return '#606060';
    case 'footway':
    case 'path':
    case 'pedestrian':
    case 'cycleway':
      return '#888888';
    default:
      return '#505050';
  }
}

/**
 * Single road component — visual only, no physics collider.
 */
function RoadMesh({ road }: { road: { points: THREE.Vector3[]; width: number; type: string; id: number; name: string | null; midPoint?: THREE.Vector3; rotY?: number } }) {
  const geometry = useMemo(
    () => createRoadRibbon(road.points, road.width),
    [road.points, road.width]
  );

  const color = roadColor(road.type);

  return (
    <group>
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial
          color={color}
          roughness={0.9}
          metalness={0.05}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>
      {road.name && road.midPoint && (
        <Text
          position={[road.midPoint.x, 0.05, road.midPoint.z]}
          rotation={[-Math.PI / 2, 0, road.rotY || 0]}
          fontSize={road.width * 0.4}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          characters="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-=_+[]{}|;:',.<>?/ "
        >
          {road.name}
        </Text>
      )}
    </group>
  );
}

/**
 * Main RoadGenerator — renders all roads as ribbon meshes.
 */
export default function RoadGenerator() {
  const worldData = useWorldStore((s) => s.worldData);
  const refLat = useWorldStore((s) => s.refLat);
  const refLon = useWorldStore((s) => s.refLon);
  const terrainData = useWorldStore((s) => s.terrainData);

  const roads = useMemo(() => {
    if (!worldData) return [];

    return worldData.roads
      .filter((r) => r.geometry && r.geometry.length >= 2)
      .map((road) => {
        const points = road.geometry.map((pt) => {
          const { x, z } = projectToLocal(pt.lat, pt.lon, refLat, refLon);
          const groundY = sampleTerrainHeight(x, z, terrainData);
          
          // Layer road heights to prevent Z-fighting between different road types
          let height = 0.02;
          if (road.roadType === 'motorway' || road.roadType === 'trunk') height = 0.05;
          else if (road.roadType === 'primary') height = 0.04;
          else if (road.roadType === 'secondary') height = 0.03;
          
          return new THREE.Vector3(x, groundY + height, z);
        });

        let midPoint: THREE.Vector3 | undefined;
        let rotY = 0;
        if (points.length >= 2) {
          const index = Math.floor(points.length / 2);
          const p1 = points[Math.max(0, index - 1)];
          const p2 = points[Math.min(points.length - 1, index + 1)] || points[index];
          midPoint = points[index];
          
          if (p1 && p2) {
            // angle along the road
            rotY = Math.atan2(p2.z - p1.z, p2.x - p1.x); 
          }
        }

        return {
          points,
          width: road.widthMeters,
          type: road.roadType,
          drivable: !NON_DRIVABLE_ROADS.has(road.roadType),
          id: road.id,
          name: road.tags?.name || null,
          midPoint,
          rotY,
        };
      });
  }, [worldData, refLat, refLon, terrainData]);

  const roadColliderGeometry = useMemo(() => {
    const colliderPieces: THREE.BufferGeometry[] = [];

    for (const road of roads) {
      if (!road.drivable || road.points.length < 2) continue;
      const colliderWidth = Math.max(road.width * 0.95, 3);
      const piece = createRoadRibbon(road.points, colliderWidth);
      // Lift collider slightly above terrain so vehicle raycasts prefer road surface.
      piece.translate(0, 0.015, 0);
      colliderPieces.push(piece);
    }

    if (colliderPieces.length === 0) return null;

    const merged = mergeGeometries(colliderPieces, false);
    for (const piece of colliderPieces) piece.dispose();

    if (!merged) return null;
    merged.computeVertexNormals();
    return merged;
  }, [roads]);

  useEffect(() => {
    return () => {
      roadColliderGeometry?.dispose();
    };
  }, [roadColliderGeometry]);

  return (
    <group name="roads">
      {roads.map((road) => (
        <RoadMesh key={`road-${road.id}`} road={road} />
      ))}
      {roadColliderGeometry && (
        <RigidBody type="fixed" colliders={false} friction={1.2} restitution={0}>
          <MeshCollider type="trimesh">
            <mesh geometry={roadColliderGeometry} visible={false}>
              <meshBasicMaterial visible={false} />
            </mesh>
          </MeshCollider>
        </RigidBody>
      )}
    </group>
  );
}
