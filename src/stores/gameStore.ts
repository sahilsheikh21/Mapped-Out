import { create } from 'zustand';

export type GamePhase = 'location-picker' | 'loading' | 'playing';
export type CameraMode = 'chase' | 'orbit' | 'birdsEye';
export type TimeOfDay = 'day' | 'sunset' | 'night';

interface GameState {
  // ─── Location ───────────────────────────────
  location: { lat: number; lon: number } | null;
  locationName: string;
  
  // ─── Game Phase ─────────────────────────────
  phase: GamePhase;
  loadingProgress: number;
  loadingMessage: string;

  // ─── Camera ─────────────────────────────────
  cameraMode: CameraMode;
  
  // ─── Time of Day ────────────────────────────
  timeOfDay: TimeOfDay;

  // ─── Actions ────────────────────────────────
  setLocation: (lat: number, lon: number, name?: string) => void;
  setPhase: (phase: GamePhase) => void;
  setLoadingProgress: (progress: number, message?: string) => void;
  cycleCameraMode: () => void;
  cycleTimeOfDay: () => void;
  resetToLocationPicker: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  location: null,
  locationName: '',
  phase: 'location-picker',
  loadingProgress: 0,
  loadingMessage: 'Initializing...',
  cameraMode: 'chase',
  timeOfDay: 'day',

  setLocation: (lat, lon, name = '') =>
    set({ location: { lat, lon }, locationName: name }),

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
      loadingProgress: 0,
      loadingMessage: 'Initializing...',
    }),
}));
