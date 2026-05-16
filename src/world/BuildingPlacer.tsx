/**
 * BuildingPlacer: Renders Kenney building blocks at real-world GPS positions.
 * Each building's footprint, height, and type are derived from OSM data.
 */

import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { useWorldStore } from '../stores/worldStore';
import { selectBuildingAsset, computeBuildingScale, ASSET_SCALE } from './assetMapper';
import { projectToLocal, polygonCentroid, polygonDimensions, polygonRotation } from '../utils/geo';

interface BuildingInstance {
  position: [number, number, number];
  scale: [number, number, number];
  rotation: number;
  modelPath: string;
  key: string;
}

/**
 * Preprocess all buildings into instances with computed transforms.
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

      // Get centroid position in local 3D space
      const centroid = polygonCentroid(building.geometry);
      const { x, z } = projectToLocal(centroid.lat, centroid.lon, refLat, refLon);

      // Get real-world footprint dimensions
      const dims = polygonDimensions(building.geometry, refLat, refLon);
      const realWidth = dims.width;
      const realDepth = dims.depth;

      // Skip tiny buildings (probably errors)
      if (realWidth < 2 || realDepth < 2) continue;

      // Select appropriate Kenney model
      const asset = selectBuildingAsset(
        building.buildingType,
        building.heightMeters,
        building.levels,
        building.id
      );

      // Compute scale to match real dimensions
      const scale = computeBuildingScale(
        realWidth,
        realDepth,
        building.heightMeters,
        asset
      );

      // Compute rotation from building polygon orientation
      const rotation = polygonRotation(building.geometry, refLat, refLon);

      instances.push({
        position: [x, 0, z],
        scale: [scale[0] * ASSET_SCALE, scale[1] * ASSET_SCALE, scale[2] * ASSET_SCALE],
        rotation,
        modelPath: asset.modelPath,
        key: `bld-${building.id}`,
      });
    }

    return instances;
  }, [worldData, refLat, refLon]);
}

/**
 * Individual building component with physics collider.
 */
function BuildingMesh({ instance }: { instance: BuildingInstance }) {
  const { scene } = useGLTF(instance.modelPath);
  const cloned = useMemo(() => scene.clone(true), [scene]);

  return (
    <RigidBody
      type="fixed"
      position={instance.position}
      rotation={[0, instance.rotation, 0]}
      colliders="cuboid"
    >
      <primitive
        object={cloned}
        scale={instance.scale}
      />
    </RigidBody>
  );
}

/**
 * Main BuildingPlacer component — renders all buildings in the world.
 */
export default function BuildingPlacer() {
  const instances = useBuildingInstances();

  // Group by model path for potential instancing
  const grouped = useMemo(() => {
    const groups = new Map<string, BuildingInstance[]>();
    for (const inst of instances) {
      const arr = groups.get(inst.modelPath) || [];
      arr.push(inst);
      groups.set(inst.modelPath, arr);
    }
    return groups;
  }, [instances]);

  return (
    <group name="buildings">
      {instances.map((inst) => (
        <BuildingMesh key={inst.key} instance={inst} />
      ))}
    </group>
  );
}
