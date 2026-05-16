/**
 * GroundPlane: Large flat ground surface for the game world.
 * Green grass with subtle grid pattern.
 */

import { RigidBody } from '@react-three/rapier';

export default function GroundPlane() {
  return (
    <RigidBody type="fixed" friction={0.6} restitution={0.1}>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.01, 0]}
        receiveShadow
      >
        <planeGeometry args={[2000, 2000]} />
        <meshStandardMaterial
          color="#5a8a3c"
          roughness={0.95}
          metalness={0.0}
        />
      </mesh>
    </RigidBody>
  );
}
