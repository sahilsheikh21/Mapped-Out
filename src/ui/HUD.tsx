/**
 * HUD: In-game heads-up display with speedometer, controls, and pointer lock hints.
 */

import { useEffect, useState } from 'react';
import { useVehicleStore } from '../stores/vehicleStore';
import { useGameStore } from '../stores/gameStore';
import { msToKmh } from '../utils/math';
import { MapPin, Camera, Sun, ArrowLeft, Mouse } from 'lucide-react';

export default function HUD() {
  const speed = useVehicleStore((s) => s.speed);
  const cameraMode = useGameStore((s) => s.cameraMode);
  const timeOfDay = useGameStore((s) => s.timeOfDay);
  const locationName = useGameStore((s) => s.locationName);
  const cycleCameraMode = useGameStore((s) => s.cycleCameraMode);
  const cycleTimeOfDay = useGameStore((s) => s.cycleTimeOfDay);
  const resetToLocationPicker = useGameStore((s) => s.resetToLocationPicker);

  const [pointerLocked, setPointerLocked] = useState(false);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'KeyC') cycleCameraMode();
      if (e.code === 'KeyT') cycleTimeOfDay();
      // Only go back if pointer is NOT locked (Esc first releases lock, then goes back)
      if (e.code === 'Escape' && !document.pointerLockElement) {
        resetToLocationPicker();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cycleCameraMode, cycleTimeOfDay, resetToLocationPicker]);

  // Track pointer lock state for HUD hints
  useEffect(() => {
    const onChange = () => {
      setPointerLocked(!!document.pointerLockElement);
    };
    document.addEventListener('pointerlockchange', onChange);
    return () => document.removeEventListener('pointerlockchange', onChange);
  }, []);

  const speedKmh = Math.round(msToKmh(speed));

  return (
    <div className="hud">
      {/* Top Bar */}
      <div className="hud-top">
        <button className="hud-btn" onClick={resetToLocationPicker} title="Back to map">
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>

        <div className="hud-location">
          <MapPin size={12} />
          <span>{locationName}</span>
        </div>

        <div className="hud-actions">
          <button className="hud-btn" onClick={cycleCameraMode} title="Camera mode (C)">
            <Camera size={14} />
            <span>{cameraMode}</span>
          </button>
          <button className="hud-btn" onClick={cycleTimeOfDay} title="Time of day (T)">
            <Sun size={14} />
            <span>{timeOfDay}</span>
          </button>
        </div>
      </div>

      {/* Pointer Lock Hint */}
      {cameraMode === 'chase' && !pointerLocked && (
        <div className="hud-pointer-hint">
          <Mouse size={18} />
          <span>Click to look around</span>
        </div>
      )}

      {/* Speedometer */}
      <div className="hud-speedo">
        <div className="hud-speedo-value">{speedKmh}</div>
        <div className="hud-speedo-unit">KM/H</div>
      </div>

      {/* Controls Hint */}
      <div className="hud-controls-hint">
        <span>WASD</span> Drive &nbsp;•&nbsp;
        <span>Space</span> Brake &nbsp;•&nbsp;
        <span>Mouse</span> Look &nbsp;•&nbsp;
        <span>R</span> Reset &nbsp;•&nbsp;
        <span>C</span> Camera &nbsp;•&nbsp;
        <span>T</span> Time
      </div>
    </div>
  );
}
