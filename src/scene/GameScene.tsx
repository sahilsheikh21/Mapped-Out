/**
 * GameScene: Main 3D scene with physics, lighting, post-processing, and all game objects.
 * 
 * High-fidelity rendering pipeline:
 * - Cascaded shadow maps (4K resolution)
 * - HDR environment maps for realistic reflections
 * - Screen-space post-processing (bloom, SSAO, tone mapping)
 * - Physically-based lighting with multiple light sources
 */

import { Suspense, useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sky, Environment, Stars, ContactShadows, SpotLight } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import * as THREE from 'three';
import WorldBuilder from '../world/WorldBuilder';
import Vehicle from '../vehicle/Vehicle';
import CameraRig from '../camera/CameraRig';
import PostProcessing from './PostProcessing';
import { useGameStore } from '../stores/gameStore';

/* ─── Animated Point Lights for Night Scene ─── */
function NightLights() {
  const timeOfDay = useGameStore((s) => s.timeOfDay);
  if (timeOfDay !== 'night') return null;

  return (
    <group>
      {/* Simulated street light glow around origin */}
      <pointLight position={[0, 12, 0]} intensity={8} color="#ffd699" distance={60} decay={2} castShadow />
      <pointLight position={[30, 12, 30]} intensity={5} color="#ffe0b2" distance={50} decay={2} />
      <pointLight position={[-30, 12, -30]} intensity={5} color="#ffe0b2" distance={50} decay={2} />
      <pointLight position={[60, 12, -20]} intensity={4} color="#ffcc80" distance={40} decay={2} />
      <pointLight position={[-50, 12, 40]} intensity={4} color="#ffcc80" distance={40} decay={2} />
    </group>
  );
}

/* ─── Scene Lighting — PBR-quality multi-source setup ─── */
function SceneLighting() {
  const timeOfDay = useGameStore((s) => s.timeOfDay);
  const sunRef = useRef<THREE.DirectionalLight>(null);

  const lightSettings = {
    day: {
      intensity: 2.0,
      color: '#fff5e6',
      ambient: 0.5,
      sunPos: [100, 80, 50] as [number, number, number],
      fillIntensity: 0.4,
      fillColor: '#87ceeb',
    },
    sunset: {
      intensity: 1.6,
      color: '#ff8844',
      ambient: 0.35,
      sunPos: [200, 15, 50] as [number, number, number],
      fillIntensity: 0.3,
      fillColor: '#ff6633',
    },
    night: {
      intensity: 0.25,
      color: '#4466aa',
      ambient: 0.1,
      sunPos: [-100, -10, 50] as [number, number, number],
      fillIntensity: 0.08,
      fillColor: '#223355',
    },
  };

  const s = lightSettings[timeOfDay];

  return (
    <>
      {/* Ambient base — keeps shadows from going pure black */}
      <ambientLight intensity={s.ambient} color={s.color} />

      {/* Primary directional sun — high-res shadow map */}
      <directionalLight
        ref={sunRef}
        position={s.sunPos}
        intensity={s.intensity}
        color={s.color}
        castShadow
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-camera-far={600}
        shadow-camera-left={-150}
        shadow-camera-right={150}
        shadow-camera-top={150}
        shadow-camera-bottom={-150}
        shadow-bias={-0.0003}
        shadow-normalBias={0.02}
      />

      {/* Fill light — opposing direction for softer shadows */}
      <directionalLight
        position={[-s.sunPos[0] * 0.5, s.sunPos[1] * 0.3, -s.sunPos[2] * 0.5]}
        intensity={s.fillIntensity}
        color={s.fillColor}
      />

      {/* Hemisphere sky/ground light — natural outdoor color gradient */}
      <hemisphereLight
        args={[
          timeOfDay === 'night' ? '#112244' : timeOfDay === 'sunset' ? '#ff8855' : '#87ceeb',
          '#3a5a2c',
          timeOfDay === 'night' ? 0.15 : 0.35,
        ]}
      />

      {/* Night-specific point lights */}
      <NightLights />
    </>
  );
}

/* ─── Sky / Atmosphere ─── */
function SceneSky() {
  const timeOfDay = useGameStore((s) => s.timeOfDay);

  if (timeOfDay === 'night') {
    return (
      <>
        <color attach="background" args={['#060612']} />
        <fog attach="fog" args={['#060612', 80, 500]} />
        <Stars
          radius={300}
          depth={60}
          count={4000}
          factor={4}
          saturation={0.3}
          fade
          speed={0.5}
        />
      </>
    );
  }

  return (
    <>
      <Sky
        distance={450000}
        sunPosition={timeOfDay === 'sunset' ? [200, 15, 50] : [100, 80, 50]}
        inclination={timeOfDay === 'sunset' ? 0.49 : 0}
        azimuth={0.25}
        turbidity={timeOfDay === 'sunset' ? 10 : 2}
        rayleigh={timeOfDay === 'sunset' ? 3 : 1}
        mieCoefficient={timeOfDay === 'sunset' ? 0.01 : 0.005}
        mieDirectionalG={timeOfDay === 'sunset' ? 0.99 : 0.8}
      />
      <fog
        attach="fog"
        args={[timeOfDay === 'sunset' ? '#ff7733' : '#c9e8ff', 200, 800]}
      />
    </>
  );
}

export default function GameScene() {
  return (
    <Canvas
      camera={{ fov: 65, near: 0.1, far: 2000, position: [0, 10, 20] }}
      shadows="soft"
      style={{ width: '100vw', height: '100vh' }}
      gl={{
        antialias: true,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.1,
        outputColorSpace: THREE.SRGBColorSpace,
      }}
      dpr={[1, 2]}
    >
      <SceneLighting />
      <SceneSky />

      <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60} debug={false}>
        <Suspense fallback={null}>
          <WorldBuilder />
          <Vehicle />
        </Suspense>
      </Physics>

      <CameraRig />

      {/* HDR environment map for PBR reflections on all metallic/glossy surfaces */}
      <Environment
        preset="city"
        environmentIntensity={0.8}
        backgroundBlurriness={0.05}
      />

      {/* Contact shadows under vehicle — soft penumbra ground shadow */}
      <ContactShadows
        position={[0, 0.01, 0]}
        opacity={0.35}
        scale={40}
        blur={2.5}
        far={6}
        resolution={512}
        frames={1}
      />

      {/* Post-processing pipeline */}
      <PostProcessing />
    </Canvas>
  );
}
