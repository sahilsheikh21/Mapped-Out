import { create } from 'zustand';

export type GamePhase = 'location-picker' | 'loading' | 'playing';
export type CameraMode = 'chase' | 'orbit' | 'birdsEye';
export type TimeOfDay = 'day' | 'sunset' | 'night';
export type AreaSelectionMode = 'radius' | 'box';

interface GameState {
  // ─── Location ───────────────────────────────
  location: { lat: number; lon: number } | null;
  locationName: string;
  queryRadiusMeters: number;
  selectionMode: AreaSelectionMode;
  customBBox: [number, number, number, number] | null; // [south, west, north, east]
  
  // ─── Game Phase ─────────────────────────────
  phase: GamePhase;
  loadingProgress: number;
  loadingMessage: string;

  // ─── Camera ─────────────────────────────────
  cameraMode: CameraMode;
  freeCam: boolean;
  
  // ─── Time of Day ────────────────────────────
  timeOfDay: TimeOfDay;

  // ─── Actions ────────────────────────────────
  setLocation: (lat: number, lon: number, name?: string) => void;
  setQueryRadiusMeters: (radius: number) => void;
  setSelectionMode: (mode: AreaSelectionMode) => void;
  setCustomBBox: (bbox: [number, number, number, number] | null) => void;
  setPhase: (phase: GamePhase) => void;
  setLoadingProgress: (progress: number, message?: string) => void;
  cycleCameraMode: () => void;
  toggleFreeCam: () => void;
  cycleTimeOfDay: () => void;
  resetToLocationPicker: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  location: null,
  locationName: '',
  queryRadiusMeters: 400,
  selectionMode: 'radius',
  customBBox: null,
  phase: 'location-picker',
  loadingProgress: 0,
  loadingMessage: 'Initializing...',
  cameraMode: 'chase',
  freeCam: false,
  timeOfDay: 'day',

  setLocation: (lat, lon, name = '') =>
    set({ location: { lat, lon }, locationName: name }),

  setQueryRadiusMeters: (radius) =>
    set({ queryRadiusMeters: Math.max(400, Math.min(10000, Math.round(radius))) }),

  setSelectionMode: (mode) =>
    set({ selectionMode: mode }),

  setCustomBBox: (bbox) =>
    set({ customBBox: bbox }),

  setPhase: (phase) => set({ phase }),

  setLoadingProgress: (progress, message) =>
    set((state) => ({
      loadingProgress: progress,
      loadingMessage: message ?? state.loadingMessage,
    })),

  cycleCameraMode: () =>
    set((state) => {
      const modes: CameraMode[] = ['chase', 'orbit', 'birdsEye'];
      const idx = modes.indexOf(state.cameraMode);
      return { cameraMode: modes[(idx + 1) % modes.length] };
    }),

  toggleFreeCam: () => set((state) => ({ freeCam: !state.freeCam })),

  cycleTimeOfDay: () =>
    set((state) => {
      const times: TimeOfDay[] = ['day', 'sunset', 'night'];
      const idx = times.indexOf(state.timeOfDay);
      return { timeOfDay: times[(idx + 1) % times.length] };
    }),

  resetToLocationPicker: () =>
    set({
      phase: 'location-picker',
      location: null,
      locationName: '',
      queryRadiusMeters: 400,
      selectionMode: 'radius',
      customBBox: null,
      loadingProgress: 0,
      loadingMessage: 'Initializing...',
      freeCam: false,
    }),
}));
