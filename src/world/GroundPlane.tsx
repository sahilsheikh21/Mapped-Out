/**
 * GroundPlane: Large flat ground surface for the game world.
 * Uses an explicit CuboidCollider since Rapier can't auto-detect
 * colliders from rotated plane geometries.
 */

import { RigidBody, CuboidCollider } from '@react-three/rapier';

export default function GroundPlane() {
  return (
    <>
      {/* Physics ground — thin box collider at y=0 */}
      <RigidBody type="fixed" friction={0.8} restitution={0.0} colliders={false}>
        <CuboidCollider args={[1000, 0.1, 1000]} position={[0, -0.1, 0]} />
      </RigidBody>

      {/* Visual ground — grass plane */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[2000, 2000]} />
        <meshStandardMaterial
          color="#5a8a3c"
          roughness={0.95}
          metalness={0.0}
        />
      </mesh>
    </>
  );
}
