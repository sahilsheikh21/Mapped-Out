/**
 * GameScene: Main 3D scene with physics, lighting, and all game objects.
 */

import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Sky, Environment, Stats } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import WorldBuilder from '../world/WorldBuilder';
import Vehicle from '../vehicle/Vehicle';
import CameraRig from '../camera/CameraRig';
import { useGameStore } from '../stores/gameStore';

function SceneLighting() {
  const timeOfDay = useGameStore((s) => s.timeOfDay);

  const lightSettings = {
    day: { intensity: 1.5, color: '#ffffff', ambient: 0.6, sunPos: [100, 80, 50] as [number, number, number] },
    sunset: { intensity: 1.2, color: '#ff9955', ambient: 0.4, sunPos: [200, 15, 50] as [number, number, number] },
    night: { intensity: 0.3, color: '#6688cc', ambient: 0.15, sunPos: [-100, -10, 50] as [number, number, number] },
  };

  const s = lightSettings[timeOfDay];

  return (
    <>
      <ambientLight intensity={s.ambient} />
      <directionalLight
        position={s.sunPos}
        intensity={s.intensity}
        color={s.color}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={500}
        shadow-camera-left={-100}
        shadow-camera-right={100}
        shadow-camera-top={100}
        shadow-camera-bottom={-100}
      />
      <hemisphereLight
        args={[timeOfDay === 'night' ? '#112244' : '#87ceeb', '#5a8a3c', 0.3]}
      />
    </>
  );
}

function SceneSky() {
  const timeOfDay = useGameStore((s) => s.timeOfDay);

  if (timeOfDay === 'night') {
    return (
      <>
        <color attach="background" args={['#0a0a1a']} />
        <fog attach="fog" args={['#0a0a1a', 100, 600]} />
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
      shadows
      style={{ width: '100vw', height: '100vh' }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <SceneLighting />
      <SceneSky />

      <Physics gravity={[0, -20, 0]} debug={false}>
        <Suspense fallback={null}>
          <WorldBuilder />
          <Vehicle />
        </Suspense>
      </Physics>

      <CameraRig />
      <Environment preset="city" />
    </Canvas>
  );
}
