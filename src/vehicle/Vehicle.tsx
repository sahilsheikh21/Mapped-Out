/**
 * Vehicle: Rapier DynamicRayCastVehicleController physics.
 * Ported from car-physics-main reference.
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

// ─── Model ────────────────────────────────────────────────────────────────────
const MODEL_PATH  = '/assets/vehicles/realistic-sports-car.fbx';
const MODEL_SCALE = 0.0108;
const MODEL_OFFSET: [number, number, number] = [0, 0.02, 0];
const MODEL_ROT:   [number, number, number]  = [-Math.PI / 2, 0, 0];

// ─── Collider ─────────────────────────────────────────────────────────────────
const COL_HALF_X = 1.0 * 0.85;
const COL_HALF_Y = 0.45 * 0.70;
const COL_HALF_Z = 2.15 * 0.85;
const COL_Y      = 0.45;

// ─── Wheel layout (chassis-local) ─────────────────────────────────────────────
// Car forward = -Z, right = +X, up = +Y
// Wheel connection points taken from the sports-car FBX footprint so the
// suspension lines up with the visible axles instead of guessed dimensions.
const WHEEL_POS: [number, number, number][] = [
  [-0.78, 0.46, -1.28],
  [0.77, 0.46, -1.28],
  [-0.85, 0.46, 1.35],
  [0.84, 0.46, 1.35],
];
const IS_FRONT = [true, true, false, false];
const NUM_WHEELS = 4;
const PHYSICS_STEP = 1 / 60;

const SUSP_DIR = { x: 0, y: -1, z: 0 };
const AXLE_DIR = { x: -1, y: 0, z: 0 };

// ─── Keyboard ─────────────────────────────────────────────────────────────────
const keys: Record<string, boolean> = {};

// ─── Component ────────────────────────────────────────────────────────────────
export default function Vehicle() {
  const bodyRef    = useRef<RapierRigidBody>(null);
  const { world }  = useRapier();

  const vcRef       = useRef<ReturnType<typeof world.createVehicleController> | null>(null);
  const vcReadyRef  = useRef(false);
  const steerRef    = useRef(0);          // smoothed steer (-1..1)
  const airtimeRef  = useRef(0);
  const resetTimeRef = useRef(-999);
  const controlStateRef = useRef({
    engineForce: 0,
    brakeForce: 0,
    steerRad: 0,
    frictionSlip: CAR_FRICTION_SLIP_HIGH,
    downForce: 0,
  });

  // ─── FBX ──────────────────────────────────────────────────────────────────
  const fbx      = useLoader(FBXLoader, MODEL_PATH);
  const carModel = useMemo(() => fbx.clone(true), [fbx]);

  useEffect(() => {
    carModel.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [carModel]);

  // ─── Store ────────────────────────────────────────────────────────────────
  const setSpeed      = useVehicleStore(s => s.setSpeed);
  const setSteerAngle = useVehicleStore(s => s.setSteerAngle);
  const setInput      = useVehicleStore(s => s.setInput);
  const setPosition   = useVehicleStore(s => s.setPosition);
  const setRotation   = useVehicleStore(s => s.setRotation);
  const spawnPosition = useWorldStore(s => s.spawnPosition);
  const spawnRef      = useRef(spawnPosition);
  useEffect(() => { spawnRef.current = spawnPosition; }, [spawnPosition]);

  // ─── Keyboard listeners ───────────────────────────────────────────────────
  useEffect(() => {
    const dn = (e: KeyboardEvent) => { keys[e.code] = true; };
    const up = (e: KeyboardEvent) => { keys[e.code] = false; };
    const bl = () => Object.keys(keys).forEach(k => { keys[k] = false; });
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup',   up);
    window.addEventListener('blur',    bl);
    return () => {
      window.removeEventListener('keydown', dn);
      window.removeEventListener('keyup',   up);
      window.removeEventListener('blur',    bl);
    };
  }, []);

  // ─── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (vcRef.current) {
        try { world.removeVehicleController(vcRef.current); } catch (_) {}
        vcRef.current = null;
        vcReadyRef.current = false;
      }
    };
  }, [world]);

  // ─── Physics step: init + updateVehicle ───────────────────────────────────
  // useBeforePhysicsStep runs before each Rapier world.step() — correct place
  // to call updateVehicle() so forces are integrated in the same step.
  useBeforePhysicsStep(() => {
    // Lazy init on first step once body is mounted
    if (!vcReadyRef.current && bodyRef.current) {
      const vc = world.createVehicleController(bodyRef.current);
      vc.indexUpAxis = 1;
      // Setter is named setIndexForwardAxis per Rapier's d.ts convention
      vc.setIndexForwardAxis = 2;

      WHEEL_POS.forEach((pos, i) => {
        vc.addWheel(
          { x: pos[0], y: pos[1], z: pos[2] },
          SUSP_DIR, AXLE_DIR,
          CAR_SUSPENSION_REST_LENGTH,
          CAR_WHEEL_RADIUS,
        );
        vc.setWheelMaxSuspensionTravel(i, CAR_SUSPENSION_MAX_TRAVEL);
        vc.setWheelSuspensionStiffness(i, CAR_SUSPENSION_STIFFNESS);
        vc.setWheelSuspensionCompression(i, CAR_SUSPENSION_COMPRESSION);
        vc.setWheelSuspensionRelaxation(i, CAR_SUSPENSION_RELAXATION);
        vc.setWheelMaxSuspensionForce(i, 1e8);
        vc.setWheelSideFrictionStiffness(i, CAR_SIDE_FRICTION_STIFFNESS);
        vc.setWheelFrictionSlip(i, CAR_FRICTION_SLIP_HIGH);
      });

      vcRef.current   = vc;
      vcReadyRef.current = true;
    }

    if (vcRef.current) {
      const control = controlStateRef.current;

      for (let i = 0; i < NUM_WHEELS; i++) {
        vcRef.current.setWheelEngineForce(i, control.engineForce);
        vcRef.current.setWheelBrake(i, control.brakeForce);
        vcRef.current.setWheelSteering(i, IS_FRONT[i] ? -control.steerRad : 0);
        vcRef.current.setWheelFrictionSlip(i, control.frictionSlip);
      }

      if (control.downForce > 0 && bodyRef.current) {
        bodyRef.current.applyImpulse({ x: 0, y: -control.downForce, z: 0 }, true);
      }

      vcRef.current.updateVehicle(PHYSICS_STEP);
    }
  });

  // ─── Frame: input → forces → store ───────────────────────────────────────
  useFrame((_, delta) => {
    const dt   = Math.min(delta, 0.05);

    const vc   = vcRef.current;
    const body = bodyRef.current;
    if (!vc || !body) return;

    // ── Input ──────────────────────────────────────────────────────────────
    const fwd  = (keys['KeyW'] || keys['ArrowUp'])    ? 1 : 0;
    const bwd  = (keys['KeyS'] || keys['ArrowDown'])  ? 1 : 0;
    const lft  = (keys['KeyA'] || keys['ArrowLeft'])  ? 1 : 0;
    const rgt  = (keys['KeyD'] || keys['ArrowRight']) ? 1 : 0;
    const brk  =  keys['Space']                        ? 1 : 0;

    const throttleInput = fwd - bwd;   // -1..1
    const steerInput    = rgt - lft;   // -1..1

    setInput({ throttle: Math.max(throttleInput, 0), brake: brk, steering: steerInput, handbrake: false });

    // ── Chassis state ──────────────────────────────────────────────────────
    const lv   = body.linvel();
    const vel  = new THREE.Vector3(lv.x, lv.y, lv.z);
    const rot  = body.rotation();
    const quat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);

    const fwdDir   = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
    const rightDir = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);
    const upDir    = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);

    const vehicleSpeed = vc.currentVehicleSpeed();
    const speed01      = clamp(Math.abs(vehicleSpeed) / CAR_MAX_SPEED, 0, 1);

    // ── Reset ──────────────────────────────────────────────────────────────
    const now = performance.now() / 1000;
    const doReset = () => {
      const sp = spawnRef.current;
      body.setTranslation({ x: sp[0], y: sp[1] + 1, z: sp[2] }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      const q = new THREE.Quaternion();
      body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
      steerRef.current  = 0;
      airtimeRef.current = 0;
      resetTimeRef.current = now;
      controlStateRef.current = {
        engineForce: 0,
        brakeForce: 0,
        steerRad: 0,
        frictionSlip: CAR_FRICTION_SLIP_HIGH,
        downForce: 0,
      };
    };

    if (keys['KeyR']) { doReset(); return; }

    // Rolled over
    const rolledOver = upDir.dot(new THREE.Vector3(0, 1, 0)) < CAR_ROLLED_OVER_THRESHOLD;
    if (rolledOver && vel.length() < 0.1 && (now - resetTimeRef.current) > 2) {
      doReset(); return;
    }

    // Airtime
    let anyContact = false;
    for (let i = 0; i < NUM_WHEELS; i++) {
      if (vc.wheelIsInContact(i)) { anyContact = true; break; }
    }
    airtimeRef.current = anyContact ? 0 : airtimeRef.current + dt;
    if (airtimeRef.current > CAR_AIRTIME_RESET_THRESHOLD && (now - resetTimeRef.current) > CAR_AIRTIME_RESET_THRESHOLD) {
      doReset(); return;
    }

    // ── Steering smoothing (ref: dt / smoothingFactor) ─────────────────────
    const steerT   = clamp(dt / Math.max(0.001, CAR_STEER_SMOOTHING), 0, 1);
    const newSteer = lerp(steerRef.current, steerInput, steerT);
    steerRef.current = newSteer;

    // Speed-scaled max steer (ref: lerp(maxSteer, maxSteer*0.5, speed01))
    const maxSteer = lerp(CAR_MAX_STEER_RAD, CAR_MAX_STEER_RAD * CAR_HIGH_SPEED_STEER_FACTOR, speed01);
    const steerRad = newSteer * maxSteer;
    setSteerAngle(steerRad);

    // ── Engine / brake (ref: CarPhysics.applyPhysics) ──────────────────────
    const velDotFwd    = vel.dot(fwdDir);
    const reachedTop   = vehicleSpeed > CAR_MAX_SPEED;

    // Idle micro-brake keeps car from coasting indefinitely
    let brakeForce = throttleInput === 0 ? 0.2 : 0;

    // True braking: negative throttle while moving forward
    if (throttleInput < 0 && vehicleSpeed > 0.05 && velDotFwd > 0) {
      brakeForce = CAR_BRAKE_FORCE * Math.abs(throttleInput);
    }
    brakeForce += brk * CAR_BRAKE_FORCE;

    // Acceleration
    let accelForce = 0;
    const isAccel = throttleInput !== 0 && !reachedTop;
    if (isAccel) accelForce = (CAR_ACCELERATION_FORCE / PHYSICS_STEP) * throttleInput;
    if (throttleInput < 0 && Math.abs(vehicleSpeed) > CAR_REVERSE_SPEED) accelForce = 0;

    const downForce = PHYSICS_STEP * CAR_MASS * speed01 * CAR_DOWN_FORCE_FACTOR;

    // ── Friction slip (ref: grip-based lateral friction model) ─────────────
    const velLen     = vel.length();
    const lateralSpd = vel.dot(rightDir);
    const gripAmount = velLen > 0.001 ? 1 - Math.abs(lateralSpd / velLen) : 1;
    const frictionSlip = lerp(CAR_FRICTION_SLIP_LOW, CAR_FRICTION_SLIP_HIGH, gripAmount);

    controlStateRef.current = {
      engineForce: accelForce,
      brakeForce,
      steerRad,
      frictionSlip,
      downForce,
    };

    // ── Store updates ───────────────────────────────────────────────────────
    const pos  = body.translation();
    const fv   = body.linvel();
    setSpeed(Math.hypot(fv.x, fv.z));
    setPosition([pos.x, pos.y, pos.z]);
    setRotation([rot.x, rot.y, rot.z, rot.w]);
  });

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <RigidBody
      ref={bodyRef}
      type="dynamic"
      mass={CAR_MASS}
      position={spawnPosition}
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
      <primitive
        object={carModel}
        scale={[MODEL_SCALE, MODEL_SCALE, MODEL_SCALE]}
        position={MODEL_OFFSET}
        rotation={MODEL_ROT}
      />
    </RigidBody>
  );
}
