/**
 * CameraRig: Mouse-controlled chase camera with pointer lock.
 * 
 * - Chase mode: Mouse delta orbits around the car (yaw + pitch).
 *   Click to engage pointer lock, Esc to release.
 * - Bird's eye: Top-down overview following the car.
 * - Orbit: Free OrbitControls around the car (no pointer lock).
 */

import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, MapControls } from '@react-three/drei';
import * as THREE from 'three';
import { useVehicleStore } from '../stores/vehicleStore';
import { useGameStore } from '../stores/gameStore';
import { CHASE_CAM_DISTANCE, CHASE_CAM_HEIGHT } from '../utils/constants';
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
  const carPos = useRef(new THREE.Vector3());
  const carQuat = useRef(new THREE.Quaternion());
  const carForward = useRef(new THREE.Vector3());
  const targetCamPos = useRef(new THREE.Vector3());
  const targetLook = useRef(new THREE.Vector3());
  const birdsEyeTarget = useRef(new THREE.Vector3());

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

    carPos.current.set(position[0], position[1], position[2]);
    carQuat.current.set(rotation[0], rotation[1], rotation[2], rotation[3]);

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
      carForward.current.set(0, 0, 1).applyQuaternion(carQuat.current);
      const carYaw = Math.atan2(carForward.current.x, carForward.current.z);

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

      targetCamPos.current.set(
        carPos.current.x + offsetX,
        carPos.current.y + offsetY,
        carPos.current.z + offsetZ
      );

      // Smooth follow (frame-rate independent)
      const dampFactor = 5.0; // Higher = tighter follow
      idealPos.current.x = THREE.MathUtils.damp(idealPos.current.x, targetCamPos.current.x, dampFactor, delta);
      idealPos.current.y = THREE.MathUtils.damp(idealPos.current.y, targetCamPos.current.y, dampFactor, delta);
      idealPos.current.z = THREE.MathUtils.damp(idealPos.current.z, targetCamPos.current.z, dampFactor, delta);
      
      targetLook.current.set(
        carPos.current.x,
        carPos.current.y + 1.2,
        carPos.current.z
      );
      idealTarget.current.x = THREE.MathUtils.damp(idealTarget.current.x, targetLook.current.x, dampFactor * 1.5, delta);
      idealTarget.current.y = THREE.MathUtils.damp(idealTarget.current.y, targetLook.current.y, dampFactor * 1.5, delta);
      idealTarget.current.z = THREE.MathUtils.damp(idealTarget.current.z, targetLook.current.z, dampFactor * 1.5, delta);

      camera.position.copy(idealPos.current);
      camera.lookAt(idealTarget.current);

    } else if (cameraMode === 'birdsEye' && !freeCam) {
      // Bird's eye: directly above
      birdsEyeTarget.current.set(carPos.current.x, carPos.current.y + 80, carPos.current.z + 10);
      idealPos.current.lerp(birdsEyeTarget.current, 0.05);
      camera.position.copy(idealPos.current);
      camera.lookAt(carPos.current);
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
