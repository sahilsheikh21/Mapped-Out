/**
 * RoadGenerator: Renders OSM roads and builds one merged road collider mesh.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RigidBody, MeshCollider } from '@react-three/rapier';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { useWorldStore } from '../stores/worldStore';
import { projectToLocal } from '../utils/geo';
import { Text } from '@react-three/drei';
import { sampleTerrainHeight } from '../utils/terrain';
import {
  ROAD_EDGE_COLOR,
  ROAD_EDGE_WIDTH,
  ROAD_FAR_MIN_WIDTH,
  ROAD_FAR_WIDTH_SCALE,
  ROAD_LOD_DISTANCE,
} from '../utils/constants';

const NON_DRIVABLE_ROADS = new Set(['footway', 'path', 'pedestrian', 'cycleway', 'steps', 'bridleway']);

function parseLayer(tags: Record<string, string> | undefined): number {
  if (!tags?.layer) return 0;
  const parsed = Number.parseInt(tags.layer, 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(-5, Math.min(5, parsed));
}

function isTruthyStructureTag(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized !== '' && normalized !== 'no' && normalized !== 'false' && normalized !== '0';
}

function structureProfile(t: number): number {
  // Smoothly ramp from 0 at both ends to 1 around the center.
  const s = Math.sin(Math.PI * t);
  return s * s;
}

function getStructureYOffset(
  tags: Record<string, string> | undefined,
  t: number,
  pointCount: number
): number {
  const layer = parseLayer(tags);
  const profile = pointCount > 2 ? structureProfile(t) : 1;
  const hasBridge = isTruthyStructureTag(tags?.bridge);
  const hasTunnel = isTruthyStructureTag(tags?.tunnel);

  const layerLift = layer * 2.0;

  if (hasBridge) {
    const bridgeLift = 4.0 + Math.max(0, layer - 1) * 1.5;
    return layerLift + bridgeLift * profile;
  }

  if (hasTunnel) {
    const tunnelDrop = 3.0 + Math.max(0, -layer - 1) * 1.0;
    return layerLift - tunnelDrop * profile;
  }

  if (layer !== 0) {
    return layerLift * profile;
  }

  return 0;
}

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

function polylineLength(points: THREE.Vector3[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += points[i].distanceTo(points[i - 1]);
  }
  return total;
}

function interpolatePointAlongPolyline(points: THREE.Vector3[], distance: number): THREE.Vector3 {
  if (points.length === 0) return new THREE.Vector3();
  if (points.length === 1) return points[0].clone();

  const total = polylineLength(points);
  const target = Math.max(0, Math.min(total, distance));
  let traveled = 0;

  for (let i = 1; i < points.length; i += 1) {
    const segmentLength = points[i].distanceTo(points[i - 1]);
    if (traveled + segmentLength >= target) {
      const t = segmentLength > 1e-6 ? (target - traveled) / segmentLength : 0;
      return new THREE.Vector3().lerpVectors(points[i - 1], points[i], t);
    }
    traveled += segmentLength;
  }

  return points[points.length - 1].clone();
}

function createDashedCenterGeometry(points: THREE.Vector3[]): THREE.BufferGeometry | null {
  const total = polylineLength(points);
  if (total < 8) return null;

  const dashLength = 4.2;
  const gapLength = 3.4;
  const lineWidth = 0.2;
  const pieces: THREE.BufferGeometry[] = [];

  let cursor = 2;
  while (cursor < total - 2) {
    const start = cursor;
    const end = Math.min(total - 1, start + dashLength);

    const p1 = interpolatePointAlongPolyline(points, start);
    const p2 = interpolatePointAlongPolyline(points, end);
    if (p1.distanceToSquared(p2) > 0.08) {
      pieces.push(createRoadRibbon([p1, p2], lineWidth));
    }

    cursor = end + gapLength;
  }

  if (pieces.length === 0) return null;
  const merged = mergeGeometries(pieces, false);
  for (const piece of pieces) piece.dispose();
  return merged || null;
}

/**
 * Road color by type (matching Kenney's aesthetic palette).
 */
function roadColor(roadType: string, isStructure: boolean): string {
  if (isStructure) {
    return '#4a4f56';
  }

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
function RoadMesh({ road }: { road: { points: THREE.Vector3[]; width: number; type: string; isStructure: boolean; drivable: boolean; id: number; name: string | null; midPoint?: THREE.Vector3; rotY?: number } }) {
  const farWidth = Math.max(road.width * ROAD_FAR_WIDTH_SCALE, ROAD_FAR_MIN_WIDTH);
  const lodAnchor = road.midPoint ?? road.points[0];
  const lodDistanceSq = ROAD_LOD_DISTANCE * ROAD_LOD_DISTANCE;
  const nearGroupRef = useRef<THREE.Group | null>(null);
  const farGroupRef = useRef<THREE.Group | null>(null);
  const lodIsFarRef = useRef(false);

  const geometry = useMemo(
    () => createRoadRibbon(road.points, road.width),
    [road.points, road.width]
  );

  const edgeGeometry = useMemo(() => {
    if (!road.drivable) return null;
    return createRoadRibbon(road.points, road.width + ROAD_EDGE_WIDTH * 2);
  }, [road.drivable, road.points, road.width]);

  const farGeometry = useMemo(
    () => createRoadRibbon(road.points, farWidth),
    [road.points, farWidth]
  );

  const farEdgeGeometry = useMemo(() => {
    if (!road.drivable) return null;
    return createRoadRibbon(road.points, farWidth + ROAD_EDGE_WIDTH * 2);
  }, [road.drivable, road.points, farWidth]);

  const centerStripeGeometry = useMemo(() => {
    if (!road.drivable || road.isStructure) return null;
    if (road.type === 'service' || road.type === 'living_street') return null;
    if (road.width < 6) return null;
    return createDashedCenterGeometry(road.points);
  }, [road.drivable, road.isStructure, road.type, road.width, road.points]);

  const underDeckGeometry = useMemo(() => {
    if (!road.isStructure) return null;
    return createRoadRibbon(road.points, road.width + 1.1);
  }, [road.isStructure, road.points, road.width]);

  const farUnderDeckGeometry = useMemo(() => {
    if (!road.isStructure) return null;
    return createRoadRibbon(road.points, farWidth + 1.1);
  }, [road.isStructure, road.points, farWidth]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      edgeGeometry?.dispose();
      farGeometry.dispose();
      farEdgeGeometry?.dispose();
      centerStripeGeometry?.dispose();
      underDeckGeometry?.dispose();
      farUnderDeckGeometry?.dispose();
    };
  }, [geometry, edgeGeometry, farGeometry, farEdgeGeometry, centerStripeGeometry, underDeckGeometry, farUnderDeckGeometry]);

  const color = roadColor(road.type, road.isStructure);

  useFrame(({ camera }) => {
    if (!lodAnchor) return;
    const dx = camera.position.x - lodAnchor.x;
    const dy = camera.position.y - lodAnchor.y;
    const dz = camera.position.z - lodAnchor.z;
    const isFar = (dx * dx + dy * dy + dz * dz) > lodDistanceSq;

    if (isFar !== lodIsFarRef.current) {
      lodIsFarRef.current = isFar;
      if (nearGroupRef.current) nearGroupRef.current.visible = !isFar;
      if (farGroupRef.current) farGroupRef.current.visible = isFar;
    }
  });

  return (
    <group>
      <group ref={nearGroupRef} visible>
        {road.isStructure && underDeckGeometry && (
          <mesh geometry={underDeckGeometry} position={[0, -0.32, 0]} receiveShadow>
            <meshStandardMaterial
              color="#373c43"
              roughness={0.95}
              metalness={0.03}
              polygonOffset
              polygonOffsetFactor={-2}
              polygonOffsetUnits={-2}
            />
          </mesh>
        )}
        {edgeGeometry && (
          <mesh geometry={edgeGeometry} position={[0, -0.01, 0]} receiveShadow>
            <meshStandardMaterial color={ROAD_EDGE_COLOR} roughness={0.95} metalness={0.02} />
          </mesh>
        )}
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
        {centerStripeGeometry && (
          <mesh geometry={centerStripeGeometry} position={[0, 0.03, 0]} receiveShadow>
            <meshStandardMaterial color="#d7dbe1" roughness={0.72} metalness={0.05} />
          </mesh>
        )}
        {road.name && road.midPoint && (
          <Text
            position={[road.midPoint.x, road.midPoint.y + 0.05, road.midPoint.z]}
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
      <group ref={farGroupRef} visible={false}>
        {road.isStructure && farUnderDeckGeometry && (
          <mesh geometry={farUnderDeckGeometry} position={[0, -0.32, 0]} receiveShadow>
            <meshStandardMaterial
              color="#373c43"
              roughness={0.95}
              metalness={0.03}
              polygonOffset
              polygonOffsetFactor={-2}
              polygonOffsetUnits={-2}
            />
          </mesh>
        )}
        {farEdgeGeometry && (
          <mesh geometry={farEdgeGeometry} position={[0, -0.012, 0]} receiveShadow>
            <meshStandardMaterial color={ROAD_EDGE_COLOR} roughness={0.95} metalness={0.02} />
          </mesh>
        )}
        <mesh geometry={farGeometry} receiveShadow>
          <meshStandardMaterial
            color={color}
            roughness={0.9}
            metalness={0.05}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </mesh>
      </group>
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
        const pointCount = road.geometry.length;
        const hasBridge = isTruthyStructureTag(road.tags?.bridge);
        const layer = parseLayer(road.tags);
        const isStructure = hasBridge || layer > 0;
        const points = road.geometry.map((pt, index) => {
          const { x, z } = projectToLocal(pt.lat, pt.lon, refLat, refLon);
          const groundY = sampleTerrainHeight(x, z, terrainData);
          const t = pointCount <= 1 ? 0 : index / (pointCount - 1);
          const structureYOffset = getStructureYOffset(road.tags, t, pointCount);
          
          // Layer road heights to prevent Z-fighting between different road types
          let height = 0.02;
          if (road.roadType === 'motorway' || road.roadType === 'trunk') height = 0.05;
          else if (road.roadType === 'primary') height = 0.04;
          else if (road.roadType === 'secondary') height = 0.03;
          
          return new THREE.Vector3(x, groundY + structureYOffset + height, z);
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

        const visualWidth = road.widthMeters * (isStructure ? 1.15 : 1);

        return {
          points,
          width: visualWidth,
          type: road.roadType,
          isStructure,
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
