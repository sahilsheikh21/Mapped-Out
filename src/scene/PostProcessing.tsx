/**
 * PostProcessing: Screen-space effects for high-fidelity visuals.
 * 
 * Includes:
 * - Bloom — glowing lights, emissive windows, sun glare
 * - SSAO — ambient occlusion for depth and realism
 * - Tone mapping & vignette for cinematic look
 * - Chromatic aberration — lens realism
 */

import { useGameStore, type TimeOfDay } from '../stores/gameStore';
import {
  EffectComposer,
  SSAO,
  Vignette,
  ToneMapping,
  ChromaticAberration,
  BrightnessContrast,
} from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';

function getSSAOSettings(timeOfDay: TimeOfDay) {
  switch (timeOfDay) {
    case 'night':
      return { intensity: 25, radius: 8, bias: 0.025 };
    case 'sunset':
      return { intensity: 20, radius: 6, bias: 0.02 };
    case 'day':
    default:
      return { intensity: 15, radius: 5, bias: 0.015 };
  }
}

export default function PostProcessing() {
  const timeOfDay = useGameStore((s) => s.timeOfDay);
  const ssao = getSSAOSettings(timeOfDay);

  const chromaticOffset = new THREE.Vector2(0.0004, 0.0004);

  return (
    <EffectComposer multisampling={0} disableNormalPass={false}>
      <SSAO
        blendFunction={BlendFunction.MULTIPLY}
        samples={21}
        rings={4}
        intensity={ssao.intensity}
        radius={ssao.radius}
        bias={ssao.bias}
        luminanceInfluence={0.6}
      />

      <ChromaticAberration
        blendFunction={BlendFunction.NORMAL}
        offset={chromaticOffset}
      />

      <BrightnessContrast
        brightness={timeOfDay === 'night' ? -0.05 : 0.02}
        contrast={timeOfDay === 'night' ? 0.12 : 0.08}
      />

      <ToneMapping
        mode={ToneMappingMode.ACES_FILMIC}
      />

      {/* @ts-expect-error - postprocessing type declarations mismatch */}
      <Vignette
        offset={0.35}
        darkness={timeOfDay === 'night' ? 0.7 : 0.4}
        blendFunction={BlendFunction.NORMAL}
      />
    </EffectComposer>
  );
}
