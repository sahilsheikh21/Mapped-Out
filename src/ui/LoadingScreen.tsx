/**
 * LoadingScreen: Animated loading UI shown while fetching OSM data.
 */

import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useGameStore } from '../stores/gameStore';
import { useWorldStore } from '../stores/worldStore';
import { fetchOSMData } from '../api/overpass';
import { fetchTerrainData } from '../api/elevation';
import { parseOSMResponse } from '../api/osmParser';
import { getBBox, projectToLocal } from '../utils/geo';
import { sampleTerrainHeight } from '../utils/terrain';
import type { OSMBuilding, OSMRoad, TerrainData, WorldData } from '../stores/worldStore';

const NON_DRIVABLE_ROADS = new Set(['footway', 'path', 'pedestrian', 'cycleway', 'steps', 'bridleway']);

function pointInPolygon(
  point: { x: number; z: number },
  polygon: { x: number; z: number }[]
): boolean {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const zi = polygon[i].z;
    const xj = polygon[j].x;
    const zj = polygon[j].z;

    const intersects = ((zi > point.z) !== (zj > point.z))
      && (point.x < ((xj - xi) * (point.z - zi)) / ((zj - zi) || 1e-6) + xi);

    if (intersects) inside = !inside;
  }

  return inside;
}

function isBlockedByBuilding(
  point: { x: number; z: number },
  buildings: OSMBuilding[],
  refLat: number,
  refLon: number
): boolean {
  for (const building of buildings) {
    if (!building.geometry || building.geometry.length < 3) continue;

    const projected = building.geometry.map((vertex) => projectToLocal(vertex.lat, vertex.lon, refLat, refLon));
    if (pointInPolygon(point, projected)) return true;
  }

  return false;
}

function roadPriority(road: OSMRoad): number {
  if (road.roadType === 'motorway' || road.roadType === 'trunk') return 0;
  if (road.roadType === 'primary' || road.roadType === 'secondary') return 1;
  if (road.roadType === 'tertiary') return 2;
  if (road.roadType === 'residential' || road.roadType === 'living_street' || road.roadType === 'service') return 3;
  return 4;
}

function findSpawnPosition(
  worldData: WorldData,
  refLat: number,
  refLon: number,
  terrainData: TerrainData | null
): { pos: [number, number, number], rot: number } {
  const candidateRoads = worldData.roads
    .filter((road) => road.geometry && road.geometry.length >= 2 && !NON_DRIVABLE_ROADS.has(road.roadType))
    .sort((a, b) => {
      const priorityDelta = roadPriority(a) - roadPriority(b);
      if (priorityDelta !== 0) return priorityDelta;
      return b.widthMeters - a.widthMeters;
    });

  for (const road of candidateRoads) {
    const indices = [
      Math.floor(road.geometry.length * 0.25),
      Math.floor(road.geometry.length * 0.5),
      Math.floor(road.geometry.length * 0.75),
    ].map(idx => Math.min(idx, road.geometry.length - 2)).filter(idx => idx >= 0);

    for (const index of indices) {
      const sample = road.geometry[index];
      const nextSample = road.geometry[index + 1];
      const point = projectToLocal(sample.lat, sample.lon, refLat, refLon);
      const nextPoint = projectToLocal(nextSample.lat, nextSample.lon, refLat, refLon);
      
      if (!isBlockedByBuilding(point, worldData.buildings, refLat, refLon)) {
        // Calculate angle. ThreeJS -Z is forward. Math.atan2(x, z) gives rotation around Y.
        const rot = Math.atan2(nextPoint.x - point.x, nextPoint.z - point.z);
        const groundY = sampleTerrainHeight(point.x, point.z, terrainData);
        return { pos: [point.x, groundY + 0.8, point.z], rot };
      }
    }
  }

  for (const road of worldData.roads) {
    if (!road.geometry || road.geometry.length < 2) continue;
    const index = Math.min(Math.floor(road.geometry.length / 2), road.geometry.length - 2);
    const sample = road.geometry[index];
    const nextSample = road.geometry[index + 1];
    const point = projectToLocal(sample.lat, sample.lon, refLat, refLon);
    const nextPoint = projectToLocal(nextSample.lat, nextSample.lon, refLat, refLon);
    const rot = Math.atan2(nextPoint.x - point.x, nextPoint.z - point.z);
    const groundY = sampleTerrainHeight(point.x, point.z, terrainData);
    return { pos: [point.x, groundY + 0.8, point.z], rot };
  }

  const fallbackGround = sampleTerrainHeight(0, 0, terrainData);
  return { pos: [0, fallbackGround + 0.8, 0], rot: 0 };
}

export default function LoadingScreen() {
  const location = useGameStore((s) => s.location);
  const loadingProgress = useGameStore((s) => s.loadingProgress);
  const loadingMessage = useGameStore((s) => s.loadingMessage);
  const setPhase = useGameStore((s) => s.setPhase);
  const setLoadingProgress = useGameStore((s) => s.setLoadingProgress);

  const setRefPoint = useWorldStore((s) => s.setRefPoint);
  const setWorldData = useWorldStore((s) => s.setWorldData);
  const setTerrainData = useWorldStore((s) => s.setTerrainData);

  useEffect(() => {
    if (!location) return;

    let cancelled = false;

    async function loadWorld() {
      try {
        setLoadingProgress(5, 'Calculating area bounds...');
        const bbox = getBBox(location!.lat, location!.lon, 400);

        setLoadingProgress(10, 'Setting reference point...');
        setRefPoint(location!.lat, location!.lon);
        setTerrainData(null);

        setLoadingProgress(15, 'Fetching map data from OpenStreetMap...');
        const osmResponse = await fetchOSMData(
          bbox[0], bbox[1], bbox[2], bbox[3],
          (msg) => {
            if (!cancelled) setLoadingProgress(30, msg);
          }
        );

        if (cancelled) return;

        setLoadingProgress(60, `Parsing ${osmResponse.elements.length} map elements...`);
        const worldData = parseOSMResponse(osmResponse, bbox);

        if (cancelled) return;

        setLoadingProgress(70, 'Fetching terrain elevation...');
        let terrainData: TerrainData | null = null;
        try {
          terrainData = await fetchTerrainData(
            bbox,
            location!.lat,
            location!.lon,
            undefined,
            undefined,
            (msg) => {
              if (!cancelled) setLoadingProgress(76, msg);
            }
          );
          if (!cancelled) setTerrainData(terrainData);
        } catch (terrainError) {
          console.warn('Failed to fetch terrain elevation, falling back to flat ground:', terrainError);
          if (!cancelled) setTerrainData(null);
        }

        if (cancelled) return;

        setLoadingProgress(82, `Found ${worldData.buildings.length} buildings, ${worldData.roads.length} roads, ${worldData.trees.length} trees`);

        await new Promise((r) => setTimeout(r, 500));

        setLoadingProgress(95, 'Building 3D world...');
        const spawn = findSpawnPosition(worldData, location!.lat, location!.lon, terrainData);
        setWorldData(worldData, spawn.pos, spawn.rot);

        await new Promise((r) => setTimeout(r, 300));

        if (!cancelled) {
          setLoadingProgress(100, 'Ready!');
          setTimeout(() => setPhase('playing'), 400);
        }
      } catch (error) {
        console.error('Failed to load world:', error);
        if (!cancelled) {
          setLoadingProgress(0, `Error: ${(error as Error).message}. Click to retry.`);
        }
      }
    }

    loadWorld();
    return () => { cancelled = true; };
  }, [location]);

  return (
    <div className="m-0 p-0 overflow-hidden text-white flex items-center justify-center min-h-screen relative select-none bg-[#0c0e12]" style={{ fontFamily: "'Montserrat', sans-serif", width: '100vw', height: '100vh', position: 'absolute', top: 0, left: 0, zIndex: 50 }}>
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,400;0,600;0,700;1,700&display=swap');
          .glow-red { box-shadow: 0 0 10px 2px rgba(255, 51, 51, 0.5); }
          .text-glow-red { text-shadow: 0 0 5px rgba(255, 51, 51, 0.5); }
          @keyframes pulse-glow {
            0%, 100% { box-shadow: 0 0 10px 2px rgba(255, 51, 51, 0.4); }
            50% { box-shadow: 0 0 15px 4px rgba(255, 51, 51, 0.7); }
          }
          .loading-fill-animated { animation: pulse-glow 2s infinite; }
        `}
      </style>
      
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <img alt="Minimalist dark street map background" className="w-full h-full object-cover opacity-90" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCkBZw4Muk6EjnkI0mB-y3RKmkfqiEXcb5Ao61ZPYQxhZRX8tWBwvuJuY7cjuNs1SxJpd4FMkI6PmGX58VClpJO3QpiEBsse2CjMQXQTGCxUgQdosCTkbZSq9XaVQsvN0SLLzQ_k5V06UW5JA6p4ACM0nmS2GAA5xXa5FriwnPWIdZg_LGYi-opFojVtDB2WKBZpkakhxNWYmMpwJgB5OS_Ppt75PA8z7LHdSvwsxBvIbU6hH-yv2PivwdxkMaes1kWgPUyHV2a7Fa_"/>
        <div className="absolute inset-0 bg-black/40"></div>
      </div>
      
      {/* Main Content */}
      <main className="relative z-10 w-full max-w-4xl px-6 flex flex-col items-center mt-[-10vh]">
        <div className="flex flex-col items-center mb-48">
          <div className="flex items-center justify-center mb-4 space-x-1">
            <div className="w-12 h-6 bg-[#e0e0e0] transform -skew-x-[35deg]"></div>
            <div className="w-2 h-6 bg-transparent"></div>
            <div className="w-12 h-6 bg-[#e33535] transform -skew-x-[35deg]"></div>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold italic tracking-[0.2em] mb-3 text-gray-100 uppercase">
            Mapped-Out
          </h1>
          <p className="text-[#e33535] text-sm md:text-base tracking-[0.4em] font-semibold">
            RACE YOUR LINE
          </p>
        </div>
        
        <div className="w-full max-w-lg absolute bottom-24 left-1/2 transform -translate-x-1/2 flex flex-col items-center">
          <div className="w-full flex items-center gap-4 mb-4">
            <div className="flex-grow h-[4px] bg-[#222] rounded-full overflow-hidden relative">
              <div 
                className="absolute top-0 left-0 h-full bg-[#e33535] loading-fill-animated rounded-full transition-all duration-300"
                style={{ width: `${loadingProgress}%` }}
              ></div>
            </div>
            <div className="text-[#e33535] font-semibold text-sm w-12 text-right text-glow-red">
              {Math.round(loadingProgress)}%
            </div>
          </div>

          <div className="text-gray-300 text-sm tracking-[0.3em] uppercase font-medium text-center h-4">
            {loadingMessage || 'Loading...'}
          </div>
          
          <div className="mt-8 text-gray-500 text-xs tracking-widest uppercase">
            WASD: Drive | Space: Brake | C: Camera | T: Time
          </div>
        </div>
      </main>
    </div>
  );
}
