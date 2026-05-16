import { create } from 'zustand';

// ─── OSM Parsed Types ─────────────────────────────────────────

export interface OSMBuilding {
  id: number;
  tags: Record<string, string>;
  geometry: { lat: number; lon: number }[];
  // Computed fields
  heightMeters: number;
  levels: number;
  buildingType: string; // 'residential' | 'commercial' | 'apartments' | etc.
}

export interface OSMRoad {
  id: number;
  tags: Record<string, string>;
  geometry: { lat: number; lon: number }[];
  // Computed fields
  roadType: string; // 'residential' | 'primary' | 'secondary' | etc.
  lanes: number;
  widthMeters: number;
}

export interface OSMTree {
  id: number;
  lat: number;
  lon: number;
  tags: Record<string, string>;
}

export interface OSMAmenity {
  id: number;
  tags: Record<string, string>;
  lat?: number;
  lon?: number;
  geometry?: { lat: number; lon: number }[];
}

export interface WorldData {
  buildings: OSMBuilding[];
  roads: OSMRoad[];
  trees: OSMTree[];
  amenities: OSMAmenity[];
  bbox: [number, number, number, number]; // [south, west, north, east]
}

interface WorldState {
  // ─── Reference Point (center of the world) ─
  refLat: number;
  refLon: number;

  // ─── World Data ─────────────────────────────
  worldData: WorldData | null;
  isLoading: boolean;
  spawnPosition: [number, number, number];

  // ─── Actions ────────────────────────────────
  setRefPoint: (lat: number, lon: number) => void;
  setWorldData: (data: WorldData, spawnPos?: [number, number, number]) => void;
  setLoading: (loading: boolean) => void;
  clearWorld: () => void;
}

export const useWorldStore = create<WorldState>((set) => ({
  refLat: 0,
  refLon: 0,
  worldData: null,
  isLoading: false,
  spawnPosition: [0, 1.5, 0],

  setRefPoint: (lat, lon) => set({ refLat: lat, refLon: lon }),
  setWorldData: (data, spawnPos = [0, 1.5, 0]) => set({ worldData: data, isLoading: false, spawnPosition: spawnPos }),
  setLoading: (loading) => set({ isLoading: loading }),
  clearWorld: () => set({ worldData: null, isLoading: false, spawnPosition: [0, 1.5, 0] }),
}));
