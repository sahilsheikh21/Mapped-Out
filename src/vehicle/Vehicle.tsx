/**
 * Vehicle: Rapier-powered car with keyboard controls.
 * Uses a simple RigidBody + forces approach for stability.
 */

import { useRef, useEffect, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import type { RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { useVehicleStore } from '../stores/vehicleStore';
import { useWorldStore } from '../stores/worldStore';
import {
  ASSET_SCALE,
  CAR_ACCELERATION,
  CAR_BRAKE_FORCE,
  CAR_DRAG,
  CAR_LATERAL_GRIP,
  CAR_MASS,
  CAR_MAX_SPEED,
  CAR_MAX_YAW_RATE,
  CAR_REVERSE_SPEED,
  CAR_ROLLING_RESISTANCE,
  CAR_STEER_ANGLE,
  CAR_STEER_RESPONSE,
  CAR_STEER_RETURN,
  CAR_TURN_GRIP,
} from '../utils/constants';
import { clamp, lerp } from '../utils/math';

// Keyboard input tracking
const keys: Record<string, boolean> = {};

export default function Vehicle() {
  const bodyRef = useRef<RapierRigidBody>(null);
  const meshRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF('/assets/kenney-vehicles/sedan-sports.glb');
  const carModel = useMemo(() => scene.clone(true), [scene]);

  const setSpeed = useVehicleStore((s) => s.setSpeed);
  const setSteerAngle = useVehicleStore((s) => s.setSteerAngle);
  const setInput = useVehicleStore((s) => s.setInput);
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
    const onBlur = () => {
      Object.keys(keys).forEach((key) => {
        keys[key] = false;
      });
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
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
    const throttleInput = forward - backward;
    const steerInput = right - left;

    setInput({
      throttle: Math.max(throttleInput, 0),
      brake,
      steering: steerInput,
      handbrake: false,
    });

    // Reset car
    if (resetCar) {
      setCurrentSteer(0);
      setSteerAngle(0);
      setInput({ throttle: 0, brake: 0, steering: 0, handbrake: false });
      body.setTranslation({ x: spawnPosition[0], y: spawnPosition[1], z: spawnPosition[2] }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0));
      body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
      return;
    }

    // Clamp delta to avoid massive impulses after lag spikes (max 0.05s)
    const dt = Math.min(delta, 0.05);

    const linvel = body.linvel();
    const currentVel = new THREE.Vector3(linvel.x, linvel.y, linvel.z);
    const speed = Math.sqrt(currentVel.x ** 2 + currentVel.z ** 2);

    // Get car's forward and right directions
    const rotation = body.rotation();
    const quat = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
    const forwardDir = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
    const rightDir = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);
    const forwardSpeed = forwardDir.x * currentVel.x + forwardDir.z * currentVel.z;
    const lateralSpeed = rightDir.x * currentVel.x + rightDir.z * currentVel.z;
    const signedSpeed = throttleInput === 0 ? forwardSpeed : speed * Math.sign(forwardSpeed || throttleInput);
    const speedLimit = throttleInput >= 0 ? CAR_MAX_SPEED : CAR_REVERSE_SPEED;
    const mass = body.mass();

    // Engine drive
    if (throttleInput !== 0 && Math.abs(signedSpeed) < speedLimit) {
      const tractionForce = CAR_ACCELERATION * mass;
      body.applyImpulse({
        x: forwardDir.x * tractionForce * throttleInput * dt,
        y: 0,
        z: forwardDir.z * tractionForce * throttleInput * dt,
      }, true);
    }

    // Space acts as a hard brake, and opposite throttle acts like braking before reversing.
    const brakingInput = brake || (throttleInput !== 0 && Math.sign(throttleInput) !== Math.sign(forwardSpeed) && Math.abs(forwardSpeed) > 0.4)
      ? 1
      : 0;
    if (brakingInput && speed > 0.05) {
      const brakeStrength = CAR_BRAKE_FORCE * mass;
      const velocityDir = currentVel.clone().normalize();
      body.applyImpulse({
        x: -velocityDir.x * brakeStrength * dt,
        y: 0,
        z: -velocityDir.z * brakeStrength * dt,
      }, true);
    }

    // Natural slowing so the car does not coast forever.
    // Rolling resistance is mostly constant, while aero drag rises with speed^2.
    if (speed > 0.01) {
      const dragDirection = currentVel.clone().normalize();
      const rollingImpulse = dragDirection.clone().multiplyScalar(-CAR_ROLLING_RESISTANCE * mass * dt);
      const aeroImpulse = currentVel.clone().multiplyScalar(-speed * CAR_DRAG * mass * dt);
      const dragImpulse = rollingImpulse.add(aeroImpulse);
      body.applyImpulse({
        x: dragImpulse.x,
        y: 0,
        z: dragImpulse.z,
      }, true);
    }

    // Steering uses signed forward speed so W+D / S+D both combine instantly.
    const targetSteer = steerInput * CAR_STEER_ANGLE;
    const steerLerp = clamp((steerInput === 0 ? CAR_STEER_RETURN : CAR_STEER_RESPONSE) * dt, 0, 1);
    const newSteer = lerp(currentSteer, targetSteer, steerLerp);
    setCurrentSteer(newSteer);
    setSteerAngle(newSteer);

    const absForwardSpeed = Math.abs(forwardSpeed);
    if (absForwardSpeed > 0.15 && Math.abs(newSteer) > 0.001) {
      const steerDirection = Math.sign(forwardSpeed) || 1;
      const targetYawRate = clamp(
        (newSteer / CAR_STEER_ANGLE) * (absForwardSpeed / speedLimit) * CAR_MAX_YAW_RATE * steerDirection,
        -CAR_MAX_YAW_RATE,
        CAR_MAX_YAW_RATE
      );
      const yawRateDelta = targetYawRate - body.angvel().y;
      body.applyTorqueImpulse({
        x: 0,
        y: yawRateDelta * mass * CAR_TURN_GRIP * dt,
        z: 0,
      }, true);
    }

    // Lateral grip keeps the body planted but still allows smooth turning arcs.
    if (Math.abs(lateralSpeed) > 0.001) {
      const lateralImpulse = -lateralSpeed * mass * CAR_LATERAL_GRIP * dt;
      body.applyImpulse({
        x: rightDir.x * lateralImpulse,
        y: 0,
        z: rightDir.z * lateralImpulse,
      }, true);
    }

    // Clamp horizontal speed after forces are applied so strong acceleration cannot overshoot.
    const nextVel = body.linvel();
    const horizontalVel = new THREE.Vector3(nextVel.x, 0, nextVel.z);
    if (horizontalVel.length() > speedLimit) {
      horizontalVel.normalize().multiplyScalar(speedLimit);
      body.setLinvel({ x: horizontalVel.x, y: nextVel.y, z: horizontalVel.z }, true);
    }

    // Update store
    const pos = body.translation();
    const rot = body.rotation();
    const finalVel = body.linvel();
    const finalHorizontalSpeed = Math.hypot(finalVel.x, finalVel.z);
    setSpeed(finalHorizontalSpeed);
    setPosition([pos.x, pos.y, pos.z]);
    setRotation([rot.x, rot.y, rot.z, rot.w]);
  });

  const carScale = ASSET_SCALE * 0.9;

  return (
    <RigidBody
      ref={bodyRef}
      type="dynamic"
      mass={CAR_MASS}
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
