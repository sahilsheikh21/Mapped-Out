/**
 * CameraRig: Mouse-controlled chase camera with pointer lock.
 * 
 * - Chase mode: Mouse delta orbits around the car (yaw + pitch).
 *   Click to engage pointer lock, Esc to release.
 * - Bird's eye: Top-down overview following the car.
 * - Orbit: Free OrbitControls around the car (no pointer lock).
 */

import { useRef, useEffect, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, MapControls } from '@react-three/drei';
import * as THREE from 'three';
import { useVehicleStore } from '../stores/vehicleStore';
import { useGameStore } from '../stores/gameStore';
import { CHASE_CAM_DISTANCE, CHASE_CAM_HEIGHT, CHASE_CAM_LERP } from '../utils/constants';
import { clamp } from '../utils/math';

// Mouse delta accumulator (persists across frames, updated via events)
const mouseDelta = { x: 0, y: 0 };
let isPointerLocked = false;

// Camera orbit angles (yaw = horizontal, pitch = vertical)
const cameraOrbit = {
  yaw: Math.PI,     // start behind car (180°)
  pitch: 0.3,       // slight downward angle
};

const MOUSE_SENSITIVITY = 0.002;
const PITCH_MIN = -0.2;   // can look slightly up
const PITCH_MAX = 1.2;    // limit looking down
const ORBIT_RADIUS_BASE = CHASE_CAM_DISTANCE;
const ORBIT_HEIGHT_BASE = CHASE_CAM_HEIGHT;

export default function CameraRig() {
  const cameraMode = useGameStore((s) => s.cameraMode);
  const freeCam = useGameStore((s) => s.freeCam);
  const { gl } = useThree();
  const idealPos = useRef(new THREE.Vector3(0, CHASE_CAM_HEIGHT, CHASE_CAM_DISTANCE));
  const idealTarget = useRef(new THREE.Vector3(0, 0, 0));

  // ─── Pointer Lock ─────────────────────────────────
  const requestPointerLock = useCallback(() => {
    if (cameraMode === 'chase' && !isPointerLocked) {
      gl.domElement.requestPointerLock();
    }
  }, [gl, cameraMode]);

  useEffect(() => {
    const canvas = gl.domElement;

    const onMouseMove = (e: MouseEvent) => {
      if (!isPointerLocked) return;
      mouseDelta.x += e.movementX;
      mouseDelta.y += e.movementY;
    };

    const onPointerLockChange = () => {
      isPointerLocked = document.pointerLockElement === canvas;
    };

    const onClick = () => {
      if (cameraMode === 'chase' && !isPointerLocked) {
        canvas.requestPointerLock();
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    canvas.addEventListener('click', onClick);

    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      canvas.removeEventListener('click', onClick);
      // Release pointer lock on cleanup
      if (isPointerLocked) {
        document.exitPointerLock();
      }
    };
  }, [gl, cameraMode]);

  // Release pointer lock when switching away from chase mode
  useEffect(() => {
    if (cameraMode !== 'chase' && isPointerLocked) {
      document.exitPointerLock();
    }
  }, [cameraMode]);

  // ─── Frame Update ─────────────────────────────────
  useFrame(({ camera }, delta) => {
    const position = useVehicleStore.getState().position;
    const rotation = useVehicleStore.getState().rotation;

    const carPos = new THREE.Vector3(...position);
    const carQuat = new THREE.Quaternion(...rotation);

    if (cameraMode === 'chase') {
      // Apply mouse delta to orbit angles
      if (isPointerLocked) {
        cameraOrbit.yaw -= mouseDelta.x * MOUSE_SENSITIVITY;
        cameraOrbit.pitch = clamp(
          cameraOrbit.pitch + mouseDelta.y * MOUSE_SENSITIVITY,
          PITCH_MIN,
          PITCH_MAX
        );
      }
      // Reset deltas after consuming
      mouseDelta.x = 0;
      mouseDelta.y = 0;

      // Auto-return yaw behind the car when not moving the mouse
      // Get car's facing direction as a yaw angle
      const carForward = new THREE.Vector3(0, 0, 1).applyQuaternion(carQuat);
      const carYaw = Math.atan2(carForward.x, carForward.z);

      // If pointer is NOT locked, smoothly return behind the car
      if (!isPointerLocked) {
        // Lerp yaw toward car's back
        const targetYaw = carYaw + Math.PI;
        // Normalize angle difference
        let diff = targetYaw - cameraOrbit.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        cameraOrbit.yaw += diff * 0.03;
        // Lerp pitch back to default
        cameraOrbit.pitch += (0.3 - cameraOrbit.pitch) * 0.03;
      }

      // Compute camera position from spherical coordinates around car
      const radius = ORBIT_RADIUS_BASE;
      const height = ORBIT_HEIGHT_BASE * (1 + cameraOrbit.pitch);
      const offsetX = Math.sin(cameraOrbit.yaw) * radius * Math.cos(cameraOrbit.pitch);
      const offsetZ = Math.cos(cameraOrbit.yaw) * radius * Math.cos(cameraOrbit.pitch);
      const offsetY = height;

      const targetCamPos = new THREE.Vector3(
        carPos.x + offsetX,
        carPos.y + offsetY,
        carPos.z + offsetZ
      );

      // Smooth follow (frame-rate independent)
      const dampFactor = 5.0; // Higher = tighter follow
      idealPos.current.x = THREE.MathUtils.damp(idealPos.current.x, targetCamPos.x, dampFactor, delta);
      idealPos.current.y = THREE.MathUtils.damp(idealPos.current.y, targetCamPos.y, dampFactor, delta);
      idealPos.current.z = THREE.MathUtils.damp(idealPos.current.z, targetCamPos.z, dampFactor, delta);
      
      const targetLook = carPos.clone().add(new THREE.Vector3(0, 1.2, 0));
      idealTarget.current.x = THREE.MathUtils.damp(idealTarget.current.x, targetLook.x, dampFactor * 1.5, delta);
      idealTarget.current.y = THREE.MathUtils.damp(idealTarget.current.y, targetLook.y, dampFactor * 1.5, delta);
      idealTarget.current.z = THREE.MathUtils.damp(idealTarget.current.z, targetLook.z, dampFactor * 1.5, delta);

      camera.position.copy(idealPos.current);
      camera.lookAt(idealTarget.current);

    } else if (cameraMode === 'birdsEye' && !freeCam) {
      // Bird's eye: directly above
      const targetPos = new THREE.Vector3(carPos.x, carPos.y + 80, carPos.z + 10);
      idealPos.current.lerp(targetPos, 0.05);
      camera.position.copy(idealPos.current);
      camera.lookAt(carPos);
    }
    // orbit and freeCam modes use controls below
  });

  const position = useVehicleStore.getState().position;

  if (cameraMode === 'birdsEye' && freeCam) {
    return (
      <MapControls
        target={[position[0], 0, position[2]]}
        minDistance={10}
        maxDistance={200}
        maxPolarAngle={Math.PI / 2.5}
        enableDamping
        dampingFactor={0.05}
      />
    );
  }

  if (cameraMode === 'orbit') {
    return (
      <OrbitControls
        target={position}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={5}
        maxDistance={100}
        enableDamping
        dampingFactor={0.05}
      />
    );
  }

  return null;
}
