/**
 * PropPlacer: Places trees, lampposts, and decorative elements.
 */

import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { useWorldStore } from '../stores/worldStore';
import { selectTree } from './assetMapper';
import { projectToLocal } from '../utils/geo';
import { ASSET_SCALE } from '../utils/constants';
import { seededRandom } from '../utils/math';
import { sampleTerrainHeight } from '../utils/terrain';

function TreeMesh({ position, modelPath, scale }: { position: [number, number, number]; modelPath: string; scale: number }) {
  const { scene } = useGLTF(modelPath);
  const cloned = useMemo(() => scene.clone(true), [scene]);

  return (
    <primitive
      object={cloned}
      position={position}
      scale={[scale, scale, scale]}
    />
  );
}

export default function PropPlacer() {
  const worldData = useWorldStore((s) => s.worldData);
  const refLat = useWorldStore((s) => s.refLat);
  const refLon = useWorldStore((s) => s.refLon);
  const terrainData = useWorldStore((s) => s.terrainData);

  const trees = useMemo(() => {
    if (!worldData) return [];

    return worldData.trees.map((tree) => {
      const { x, z } = projectToLocal(tree.lat, tree.lon, refLat, refLon);
      const y = sampleTerrainHeight(x, z, terrainData);
      const modelPath = selectTree(`tree-${tree.id}`);
      const scale = (0.7 + seededRandom(`treeScale-${tree.id}`) * 0.6) * ASSET_SCALE;

      return {
        position: [x, y, z] as [number, number, number],
        modelPath,
        scale,
        key: `tree-${tree.id}`,
      };
    });
  }, [worldData, refLat, refLon, terrainData]);

  return (
    <group name="props">
      {trees.map((tree) => (
        <TreeMesh
          key={tree.key}
          position={tree.position}
          modelPath={tree.modelPath}
          scale={tree.scale}
        />
      ))}
    </group>
  );
}
