/**
 * LoadingScreen: Animated loading UI shown while fetching OSM data.
 */

import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useGameStore } from '../stores/gameStore';
import { useWorldStore } from '../stores/worldStore';
import { fetchOSMData } from '../api/overpass';
import { parseOSMResponse } from '../api/osmParser';
import { getBBox, projectToLocal } from '../utils/geo';
import type { OSMBuilding, OSMRoad, WorldData } from '../stores/worldStore';

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
  refLon: number
): [number, number, number] {
  const candidateRoads = worldData.roads
    .filter((road) => road.geometry && road.geometry.length >= 2 && !NON_DRIVABLE_ROADS.has(road.roadType))
    .sort((a, b) => {
      const priorityDelta = roadPriority(a) - roadPriority(b);
      if (priorityDelta !== 0) return priorityDelta;
      return b.widthMeters - a.widthMeters;
    });

  for (const road of candidateRoads) {
    const samples = [
      Math.floor(road.geometry.length * 0.25),
      Math.floor(road.geometry.length * 0.5),
      Math.floor(road.geometry.length * 0.75),
    ]
      .map((index) => road.geometry[Math.min(index, road.geometry.length - 1)])
      .filter(Boolean);

    for (const sample of samples) {
      const point = projectToLocal(sample.lat, sample.lon, refLat, refLon);
      if (!isBlockedByBuilding(point, worldData.buildings, refLat, refLon)) {
        return [point.x, 2.2, point.z];
      }
    }
  }

  for (const road of worldData.roads) {
    if (!road.geometry || road.geometry.length === 0) continue;
    const midpoint = road.geometry[Math.floor(road.geometry.length / 2)];
    const point = projectToLocal(midpoint.lat, midpoint.lon, refLat, refLon);
    return [point.x, 2.2, point.z];
  }

  return [0, 2.2, 0];
}

export default function LoadingScreen() {
  const location = useGameStore((s) => s.location);
  const loadingProgress = useGameStore((s) => s.loadingProgress);
  const loadingMessage = useGameStore((s) => s.loadingMessage);
  const setPhase = useGameStore((s) => s.setPhase);
  const setLoadingProgress = useGameStore((s) => s.setLoadingProgress);
  const locationName = useGameStore((s) => s.locationName);

  const setRefPoint = useWorldStore((s) => s.setRefPoint);
  const setWorldData = useWorldStore((s) => s.setWorldData);

  useEffect(() => {
    if (!location) return;

    let cancelled = false;

    async function loadWorld() {
      try {
        setLoadingProgress(5, 'Calculating area bounds...');
        const bbox = getBBox(location!.lat, location!.lon, 400);

        setLoadingProgress(10, 'Setting reference point...');
        setRefPoint(location!.lat, location!.lon);

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

        setLoadingProgress(80, `Found ${worldData.buildings.length} buildings, ${worldData.roads.length} roads, ${worldData.trees.length} trees`);

        await new Promise((r) => setTimeout(r, 500));

        setLoadingProgress(95, 'Building 3D world...');
        const spawnPos = findSpawnPosition(worldData, location!.lat, location!.lon);
        setWorldData(worldData, spawnPos);

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
    <div className="loading-screen">
      <div className="loading-content">
        <div className="loading-car-anim">🏎️</div>
        <h2>Building Your City</h2>
        <p className="loading-location">{locationName || 'Loading...'}</p>

        <div className="loading-bar-container">
          <div
            className="loading-bar-fill"
            style={{ width: `${loadingProgress}%` }}
          />
        </div>

        <p className="loading-message">
          <Loader2 size={14} className="lp-spinner" />
          {loadingMessage}
        </p>

        <div className="loading-tips">
          <p><strong>Controls:</strong> WASD to drive • Space to brake • C to change camera • T for time of day</p>
        </div>
      </div>
    </div>
  );
}
