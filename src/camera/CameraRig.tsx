/**
 * CameraRig: Smooth chase camera that follows the vehicle.
 * Supports chase, orbit, and bird's eye modes.
 */

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useVehicleStore } from '../stores/vehicleStore';
import { useGameStore } from '../stores/gameStore';
import { CHASE_CAM_DISTANCE, CHASE_CAM_HEIGHT, CHASE_CAM_LERP } from '../utils/constants';

export default function CameraRig() {
  const cameraMode = useGameStore((s) => s.cameraMode);
  const idealPos = useRef(new THREE.Vector3(0, CHASE_CAM_HEIGHT, CHASE_CAM_DISTANCE));
  const idealTarget = useRef(new THREE.Vector3(0, 0, 0));

  useFrame(({ camera }) => {
    const position = useVehicleStore.getState().position;
    const rotation = useVehicleStore.getState().rotation;

    const carPos = new THREE.Vector3(...position);
    const carQuat = new THREE.Quaternion(...rotation);

    if (cameraMode === 'chase') {
      // Chase camera: behind and above the car
      const offset = new THREE.Vector3(0, CHASE_CAM_HEIGHT, CHASE_CAM_DISTANCE);
      offset.applyQuaternion(carQuat);
      const targetPos = carPos.clone().add(offset);

      idealPos.current.lerp(targetPos, CHASE_CAM_LERP);
      idealTarget.current.lerp(carPos.clone().add(new THREE.Vector3(0, 1, 0)), CHASE_CAM_LERP);

      camera.position.copy(idealPos.current);
      camera.lookAt(idealTarget.current);
    } else if (cameraMode === 'birdsEye') {
      // Bird's eye: directly above
      const targetPos = new THREE.Vector3(carPos.x, carPos.y + 80, carPos.z + 10);
      idealPos.current.lerp(targetPos, 0.05);
      camera.position.copy(idealPos.current);
      camera.lookAt(carPos);
    }
    // orbit mode uses OrbitControls (handled below)
  });

  if (cameraMode === 'orbit') {
    const position = useVehicleStore.getState().position;
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
