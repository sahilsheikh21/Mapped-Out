/**
 * GroundPlane: Large flat ground surface for the game world.
 * This is the ONLY drivable surface collider — roads are visual only.
 * Uses a CuboidCollider since Rapier can't auto-detect
 * colliders from rotated plane geometries.
 */

import { RigidBody, CuboidCollider } from '@react-three/rapier';

export default function GroundPlane() {
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
