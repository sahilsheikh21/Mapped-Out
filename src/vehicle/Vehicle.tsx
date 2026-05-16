/**
 * Vehicle: Rapier DynamicRayCastVehicleController physics.
 * 
 * CLEAN ARCHITECTURE:
 * - Rapier's forward axis is +Z (indexForwardAxis = 2).
 * - Visual model natively faced -Z, so it is wrapped in a 180-deg Y-rotation group to face +Z.
 * - This means ALL physics (wheels, forces, steering) perfectly align with +Z without negation hacks.
 */

import { useRef, useEffect, useMemo } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { RigidBody, CuboidCollider, useRapier, useBeforePhysicsStep } from '@react-three/rapier';
import type { RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { useVehicleStore } from '../stores/vehicleStore';
import { useWorldStore } from '../stores/worldStore';
import { clamp, lerp } from '../utils/math';
import {
  CAR_MASS, CAR_MAX_SPEED, CAR_REVERSE_SPEED,
  CAR_ACCELERATION_FORCE, CAR_BRAKE_FORCE,
  CAR_MAX_STEER_RAD, CAR_STEER_SMOOTHING, CAR_HIGH_SPEED_STEER_FACTOR,
  CAR_SUSPENSION_REST_LENGTH, CAR_SUSPENSION_MAX_TRAVEL,
  CAR_SUSPENSION_STIFFNESS, CAR_SUSPENSION_COMPRESSION, CAR_SUSPENSION_RELAXATION,
  CAR_WHEEL_RADIUS, CAR_SIDE_FRICTION_STIFFNESS,
  CAR_FRICTION_SLIP_LOW, CAR_FRICTION_SLIP_HIGH,
  CAR_DOWN_FORCE_FACTOR,
  CAR_ROLLED_OVER_THRESHOLD, CAR_AIRTIME_RESET_THRESHOLD,
} from '../utils/constants';

const MODEL_PATH  = '/assets/vehicles/realistic-sports-car.fbx';
const MODEL_SCALE = 0.0108;
const MODEL_OFFSET: [number, number, number] = [0, 0.02, 0];
const MODEL_ROT: [number, number, number] = [-Math.PI / 2, 0, 0];

const COL_HALF_X = 1.0 * 0.85;
const COL_HALF_Y = 0.45 * 0.70;
const COL_HALF_Z = 2.15 * 0.85;
const COL_Y      = 0.45;

// Wheel positions (Rapier space, +Z = forward)
const WHEEL_POS: [number, number, number][] = [
  [-0.78, 0.46,  1.28], // front-left  (+Z)
  [ 0.77, 0.46,  1.28], // front-right (+Z)
  [-0.85, 0.46, -1.35], // rear-left   (-Z)
  [ 0.84, 0.46, -1.35], // rear-right  (-Z)
];
// Indices 0,1 are front wheels (they do the steering)
const IS_FRONT = [true, true, false, false];
const NUM_WHEELS = 4;
const PHYSICS_STEP = 1 / 60;
const SUSP_DIR = { x: 0, y: -1, z: 0 };
const AXLE_DIR = { x: -1, y: 0, z: 0 };

const keys: Record<string, boolean> = {};
const _vel = new THREE.Vector3();
const _up = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);

export default function Vehicle() {
  const bodyRef = useRef<RapierRigidBody>(null);
  const { world } = useRapier();
  const vcRef = useRef<ReturnType<typeof world.createVehicleController> | null>(null);
  const vcReadyRef = useRef(false);
  const steerRef = useRef(0);
  const airtimeRef = useRef(0);
  const resetTimeRef = useRef(-999);

  const fbx = useLoader(FBXLoader, MODEL_PATH);
  const carModel = useMemo(() => fbx.clone(true), [fbx]);
  useEffect(() => {
    carModel.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [carModel]);

  const setSpeed = useVehicleStore(s => s.setSpeed);
  const setSteerAngle = useVehicleStore(s => s.setSteerAngle);
  const setInput = useVehicleStore(s => s.setInput);
  const setPosition = useVehicleStore(s => s.setPosition);
  const setRotation = useVehicleStore(s => s.setRotation);
  const spawnPosition = useWorldStore(s => s.spawnPosition);
  const spawnRotation = useWorldStore(s => s.spawnRotation);
  const spawnRef = useRef(spawnPosition);
  const spawnRotRef = useRef(spawnRotation);
  
  useEffect(() => { 
    spawnRef.current = spawnPosition; 
    spawnRotRef.current = spawnRotation;
  }, [spawnPosition, spawnRotation]);

  useEffect(() => {
    const dn = (e: KeyboardEvent) => { keys[e.code] = true; };
    const up = (e: KeyboardEvent) => { keys[e.code] = false; };
    const bl = () => Object.keys(keys).forEach(k => { keys[k] = false; });
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', bl);
    return () => {
      window.removeEventListener('keydown', dn);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', bl);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (vcRef.current) {
        try { world.removeVehicleController(vcRef.current); } catch (_) {}
        vcRef.current = null;
        vcReadyRef.current = false;
      }
    };
  }, [world]);

  useBeforePhysicsStep(() => {
    if (!vcReadyRef.current && bodyRef.current) {
      const vc = world.createVehicleController(bodyRef.current);
      vc.indexUpAxis = 1;
      vc.setIndexForwardAxis = 2; // +Z is forward
      WHEEL_POS.forEach((pos, i) => {
        vc.addWheel(
          { x: pos[0], y: pos[1], z: pos[2] },
          SUSP_DIR, AXLE_DIR,
          CAR_SUSPENSION_REST_LENGTH, CAR_WHEEL_RADIUS,
        );
        vc.setWheelMaxSuspensionTravel(i, CAR_SUSPENSION_MAX_TRAVEL);
        vc.setWheelSuspensionStiffness(i, CAR_SUSPENSION_STIFFNESS);
        vc.setWheelSuspensionCompression(i, CAR_SUSPENSION_COMPRESSION);
        vc.setWheelSuspensionRelaxation(i, CAR_SUSPENSION_RELAXATION);
        vc.setWheelMaxSuspensionForce(i, 1e8);
        vc.setWheelSideFrictionStiffness(i, CAR_SIDE_FRICTION_STIFFNESS);
        vc.setWheelFrictionSlip(i, CAR_FRICTION_SLIP_HIGH);
      });
      vcRef.current = vc;
      vcReadyRef.current = true;
    }

    const vc = vcRef.current;
    const body = bodyRef.current;
    if (!vc || !body) return;

    const now = performance.now() / 1000;

    // Inputs
    const fwd = (keys['KeyW'] || keys['ArrowUp']) ? 1 : 0;
    const bwd = (keys['KeyS'] || keys['ArrowDown']) ? 1 : 0;
    const lft = (keys['KeyA'] || keys['ArrowLeft']) ? 1 : 0;
    const rgt = (keys['KeyD'] || keys['ArrowRight']) ? 1 : 0;
    const brk = keys['Space'] ? 1 : 0;

    // Standard input mapping: +1 = forward, +1 = turn right
    const accelInput = clamp(fwd - bwd, -1, 1);
    const steerInput = clamp(rgt - lft, -1, 1);

    // Actual physics velocity for accurate speed checks (avoids raycast bugs)
    const lv = body.linvel();
    _vel.set(lv.x, lv.y, lv.z);
    const actualSpeed = Math.hypot(lv.x, lv.z);
    
    // Determine if car is moving physically forward (+Z)
    const rot = body.rotation();
    const q = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
    const zForward = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const forwardSpeed = _vel.dot(zForward);
    const speed01 = clamp(actualSpeed / CAR_MAX_SPEED, 0, 1);

    _up.set(0, 1, 0).applyQuaternion(q);

    // Reset logic
    const doReset = () => {
      const sp = spawnRef.current;
      const sr = spawnRotRef.current;
      body.setTranslation({ x: sp[0], y: sp[1] + 0.5, z: sp[2] }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      const rq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, sr, 0));
      body.setRotation({ x: rq.x, y: rq.y, z: rq.z, w: rq.w }, true);
      steerRef.current = 0;
      airtimeRef.current = 0;
      resetTimeRef.current = now;
    };
    if (keys['KeyR']) { doReset(); return; }
    if (_up.dot(_worldUp) < CAR_ROLLED_OVER_THRESHOLD && _vel.length() < 0.1 && (now - resetTimeRef.current) > 2) {
      doReset(); return;
    }
    let anyContact = false;
    for (let i = 0; i < NUM_WHEELS; i++) {
      if (vc.wheelIsInContact(i)) { anyContact = true; break; }
    }
    airtimeRef.current = anyContact ? 0 : airtimeRef.current + PHYSICS_STEP;
    if (airtimeRef.current > CAR_AIRTIME_RESET_THRESHOLD && (now - resetTimeRef.current) > CAR_AIRTIME_RESET_THRESHOLD) {
      doReset(); return;
    }

    // Steering smoothing
    const steerT = clamp(PHYSICS_STEP / Math.max(0.001, CAR_STEER_SMOOTHING), 0, 1);
    steerRef.current = lerp(steerRef.current, steerInput, steerT);
    const maxAngle = lerp(CAR_MAX_STEER_RAD, CAR_MAX_STEER_RAD * CAR_HIGH_SPEED_STEER_FACTOR, speed01);
    const steerRad = steerRef.current * maxAngle;

    // Top speed / Braking
    const reachedTopSpeed = actualSpeed > CAR_MAX_SPEED;
    const isBreaking = accelInput < 0 && forwardSpeed > 0.5;

    let breakForce = accelInput === 0 ? 0.3 : 0;
    if (isBreaking) breakForce = CAR_BRAKE_FORCE * Math.abs(accelInput);
    breakForce += brk * CAR_BRAKE_FORCE;

    // Engine Force
    let accelForce = 0;
    if (accelInput !== 0 && !reachedTopSpeed && !isBreaking) {
      // Standard Rapier engine force scaling: force / dt
      accelForce = (CAR_ACCELERATION_FORCE / PHYSICS_STEP) * accelInput;
    }
    
    // Reverse cap
    if (accelInput < 0 && forwardSpeed < 0 && actualSpeed > CAR_REVERSE_SPEED) {
      accelForce = 0;
    }

    // Downforce
    const downForce = PHYSICS_STEP * CAR_MASS * speed01 * CAR_DOWN_FORCE_FACTOR;
    if (downForce > 0) body.applyImpulse({ x: 0, y: -downForce, z: 0 }, true);

    // Apply to wheels via standard Vehicle Controller
    for (let i = 0; i < NUM_WHEELS; i++) {
      vc.setWheelEngineForce(i, accelForce);
      vc.setWheelBrake(i, breakForce);
      // Only front wheels steer (negated to match standard convention where -angle = turn right)
      vc.setWheelSteering(i, IS_FRONT[i] ? -steerRad : 0);
      vc.setWheelFrictionSlip(i, CAR_FRICTION_SLIP_HIGH);
    }

    vc.updateVehicle(PHYSICS_STEP, 4); // EXCLUDE_DYNAMIC
  });

  const frameCounter = useRef(0);
  useFrame(() => {
    const body = bodyRef.current;
    if (!body) return;
    frameCounter.current++;
    if (frameCounter.current % 3 !== 0) return;
    const pos = body.translation();
    const rot = body.rotation();
    const lv = body.linvel();
    setSpeed(Math.hypot(lv.x, lv.z));
    setPosition([pos.x, pos.y, pos.z]);
    setRotation([rot.x, rot.y, rot.z, rot.w]);
    setSteerAngle(steerRef.current * CAR_MAX_STEER_RAD);
    setInput({
      throttle: (keys['KeyW'] || keys['ArrowUp']) ? 1 : 0,
      brake: keys['Space'] ? 1 : 0,
      steering: ((keys['KeyD'] || keys['ArrowRight']) ? 1 : 0) - ((keys['KeyA'] || keys['ArrowLeft']) ? 1 : 0),
      handbrake: !!keys['Space'],
    });
  });

  return (
    <RigidBody
      ref={bodyRef}
      type="dynamic"
      mass={CAR_MASS}
      position={spawnPosition}
      rotation={[0, spawnRotation, 0]}
      linearDamping={0.05}
      angularDamping={1.0}
      canSleep={false}
      ccd
      colliders={false}
    >
      <CuboidCollider
        args={[COL_HALF_X, COL_HALF_Y, COL_HALF_Z]}
        position={[0, COL_Y, 0]}
        friction={0}
        restitution={0.1}
      />
      {/* 
        Wrap model in a 180-deg Y-rotation group. 
        This flips the visual model so its nose points to +Z, perfectly aligning 
        it with the vehicle controller's indexForwardAxis. 
      */}
      <group rotation={[0, Math.PI, 0]}>
        <primitive
          object={carModel}
          scale={[MODEL_SCALE, MODEL_SCALE, MODEL_SCALE]}
          position={MODEL_OFFSET}
          rotation={MODEL_ROT}
        />
      </group>
    </RigidBody>
  );
}
