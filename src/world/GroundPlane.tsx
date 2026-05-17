/**
 * GroundPlane: Drivable terrain surface for the game world.
 *
 * When elevation data is available we build a terrain mesh and matching
 * trimesh collider so vehicle physics follows slopes.
 */

import { useEffect, useMemo } from 'react';
import { RigidBody, CuboidCollider, MeshCollider } from '@react-three/rapier';
import { useWorldStore } from '../stores/worldStore';
import { createTerrainGeometry } from '../utils/terrain';

export default function GroundPlane() {
  const terrainData = useWorldStore((s) => s.terrainData);

  const terrainGeometry = useMemo(() => {
    if (!terrainData) return null;
    return createTerrainGeometry(terrainData);
  }, [terrainData]);

  useEffect(() => {
    return () => {
      terrainGeometry?.dispose();
    };
  }, [terrainGeometry]);

  if (terrainGeometry) {
    return (
      <RigidBody type="fixed" friction={1.0} restitution={0.0} colliders={false}>
        <MeshCollider type="trimesh">
          <mesh geometry={terrainGeometry} receiveShadow>
            <meshStandardMaterial
              color="#5a8a3c"
              roughness={0.95}
              metalness={0.0}
            />
          </mesh>
        </MeshCollider>
      </RigidBody>
    );
  }

  return (
    <>
      {/* Physics ground — single flat collider. Top surface at Y=0. */}
      <RigidBody type="fixed" friction={1.0} restitution={0.0} colliders={false}>
        <CuboidCollider args={[2000, 0.1, 2000]} position={[0, -0.1, 0]} />
      </RigidBody>

      {/* Visual ground — grass plane */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.001, 0]}
        receiveShadow
      >
        <planeGeometry args={[4000, 4000]} />
        <meshStandardMaterial
          color="#5a8a3c"
          roughness={0.95}
          metalness={0.0}
        />
      </mesh>
    </>
  );
}
