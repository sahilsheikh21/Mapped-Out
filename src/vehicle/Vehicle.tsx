/**
 * Vehicle: Rapier-powered car with keyboard controls.
 * Uses a simple RigidBody + forces approach for stability.
 */

import { useRef, useEffect, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { RigidBody, CuboidCollider, useRapier } from '@react-three/rapier';
import type { RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { useVehicleStore } from '../stores/vehicleStore';
import { useWorldStore } from '../stores/worldStore';
import { ASSET_SCALE, CAR_MAX_SPEED, CAR_STEER_ANGLE } from '../utils/constants';
import { clamp, lerp } from '../utils/math';

// Keyboard input tracking
const keys: Record<string, boolean> = {};

export default function Vehicle() {
  const bodyRef = useRef<RapierRigidBody>(null);
  const meshRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF('/assets/kenney-vehicles/sedan-sports.glb');
  const carModel = useMemo(() => scene.clone(true), [scene]);

  const setSpeed = useVehicleStore((s) => s.setSpeed);
  const setPosition = useVehicleStore((s) => s.setPosition);
  const setRotation = useVehicleStore((s) => s.setRotation);

  const spawnPosition = useWorldStore((s) => s.spawnPosition);

  const [currentSteer, setCurrentSteer] = useState(0);

  // Register keyboard listeners
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keys[e.code] = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys[e.code] = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  useFrame((_, delta) => {
    if (!bodyRef.current) return;

    const body = bodyRef.current;

    // Read input
    const forward = keys['KeyW'] || keys['ArrowUp'] ? 1 : 0;
    const backward = keys['KeyS'] || keys['ArrowDown'] ? 1 : 0;
    const left = keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0;
    const right = keys['KeyD'] || keys['ArrowRight'] ? 1 : 0;
    const brake = keys['Space'] ? 1 : 0;
    const resetCar = keys['KeyR'];

    // Reset car
    if (resetCar) {
      body.setTranslation({ x: spawnPosition[0], y: spawnPosition[1], z: spawnPosition[2] }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0));
      body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
      return;
    }

    // Current velocity
    const linvel = body.linvel();
    const currentVel = new THREE.Vector3(linvel.x, linvel.y, linvel.z);
    const speed = Math.sqrt(currentVel.x ** 2 + currentVel.z ** 2);

    // Get car's forward direction from rotation
    const rotation = body.rotation();
    const quat = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
    const forwardDir = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
    const rightDir = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);

    // Throttle / Brake forces (converted to velocity changes per frame)
    const acceleration = 25.0; // m/s^2
    const maxSpeed = CAR_MAX_SPEED;

    if (forward && speed < maxSpeed) {
      currentVel.add(forwardDir.clone().multiplyScalar(acceleration * delta));
    }

    if (backward) {
      currentVel.add(forwardDir.clone().multiplyScalar(-acceleration * 0.5 * delta));
    }

    if (brake) {
      currentVel.x *= 0.95;
      currentVel.z *= 0.95;
    }

    // Lateral friction (prevent sliding)
    const lateralSpeed = rightDir.x * currentVel.x + rightDir.z * currentVel.z;
    const frictionForce = 0.92; // How much lateral speed is kept (0.92 = 8% lost per frame)

    currentVel.x -= rightDir.x * lateralSpeed * (1 - frictionForce);
    currentVel.z -= rightDir.z * lateralSpeed * (1 - frictionForce);

    // Natural drag
    if (!forward && !backward) {
      currentVel.x *= 0.98;
      currentVel.z *= 0.98;
    }

    // Apply the final computed velocity
    body.setLinvel({ x: currentVel.x, y: currentVel.y, z: currentVel.z }, true);

    // Steering (apply torque for rotation)
    const steerInput = right - left;
    const targetSteer = steerInput * CAR_STEER_ANGLE;
    const newSteer = lerp(currentSteer, targetSteer, 0.15);
    setCurrentSteer(newSteer);

    if (speed > 0.5) {
      const steerTorque = newSteer * 15 * Math.min(speed / 5, 1);
      body.applyTorqueImpulse({
        x: 0,
        y: -steerTorque * delta,
        z: 0,
      }, true);
    }

    // Angular damping for stable rotation
    const angvel = body.angvel();
    body.setAngvel({
      x: angvel.x * 0.9,
      y: angvel.y * 0.95,
      z: angvel.z * 0.9,
    }, true);

    // Update store
    const pos = body.translation();
    const rot = body.rotation();
    setSpeed(speed);
    setPosition([pos.x, pos.y, pos.z]);
    setRotation([rot.x, rot.y, rot.z, rot.w]);
  });

  const carScale = ASSET_SCALE * 0.9;

  return (
    <RigidBody
      ref={bodyRef}
      type="dynamic"
      mass={15}
      position={spawnPosition}
      linearDamping={0.3}
      angularDamping={0.8}
      canSleep={false}
      enabledRotations={[false, true, false]}
      colliders={false}
    >
      <CuboidCollider args={[1.2, 0.4, 2.2]} position={[0, 0.4, 0]} friction={0} />
      <group ref={meshRef}>
        <primitive
          object={carModel}
          scale={[carScale, carScale, carScale]}
          position={[0, 0, 0]}
          rotation={[0, Math.PI, 0]}
        />
      </group>
    </RigidBody>
  );
}
