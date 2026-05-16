import { create } from 'zustand';

interface VehicleState {
  // ─── Physics State ──────────────────────────
  speed: number; // m/s
  steerAngle: number; // radians
  
  // ─── Position (updated each frame from physics) ─
  position: [number, number, number];
  rotation: [number, number, number, number]; // quaternion

  // ─── Input State ────────────────────────────
  throttle: number; // 0 to 1
  brake: number; // 0 to 1
  steering: number; // -1 (left) to 1 (right)
  handbrake: boolean;

  // ─── Actions ────────────────────────────────
  setSpeed: (speed: number) => void;
  setSteerAngle: (angle: number) => void;
  setPosition: (pos: [number, number, number]) => void;
  setRotation: (rot: [number, number, number, number]) => void;
  setInput: (input: Partial<{ throttle: number; brake: number; steering: number; handbrake: boolean }>) => void;
  resetVehicle: () => void;
}

export const useVehicleStore = create<VehicleState>((set) => ({
  speed: 0,
  steerAngle: 0,
  position: [0, 1, 0],
  rotation: [0, 0, 0, 1],
  throttle: 0,
  brake: 0,
  steering: 0,
  handbrake: false,

  setSpeed: (speed) => set({ speed }),
  setSteerAngle: (angle) => set({ steerAngle: angle }),
  setPosition: (position) => set({ position }),
  setRotation: (rotation) => set({ rotation }),
  setInput: (input) => set((state) => ({ ...state, ...input })),
  resetVehicle: () =>
    set({
      speed: 0,
      steerAngle: 0,
      position: [0, 1, 0],
      rotation: [0, 0, 0, 1],
      throttle: 0,
      brake: 0,
      steering: 0,
      handbrake: false,
    }),
}));
