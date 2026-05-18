/**
 * LoadingScreen: Animated loading UI shown while fetching OSM data.
 */

import { useEffect } from 'react';
import { useGameStore } from '../stores/gameStore';
import { useWorldStore } from '../stores/worldStore';
import { fetchOSMData } from '../api/overpass';
import { fetchTerrainData } from '../api/elevation';
import { parseOSMResponse } from '../api/osmParser';
import { getBBox, projectToLocal } from '../utils/geo';
import { sampleTerrainHeight } from '../utils/terrain';
import { getCachedWorldForBBox, setCachedWorldForBBox } from '../utils/worldCache';
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
  const locationName = useGameStore((s) => s.locationName);
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

        setLoadingProgress(12, 'Checking local world cache...');
        const cachedWorld = await getCachedWorldForBBox(bbox);
        if (cachedWorld) {
          if (cancelled) return;
          setLoadingProgress(35, 'Loading cached map data...');

          setTerrainData(cachedWorld.terrainData);
          const spawnFromCache = findSpawnPosition(
            cachedWorld.worldData,
            location!.lat,
            location!.lon,
            cachedWorld.terrainData
          );
          setWorldData(cachedWorld.worldData, spawnFromCache.pos, spawnFromCache.rot);

          if (!cancelled) {
            setLoadingProgress(100, 'Loaded from cache');
            setTimeout(() => setPhase('playing'), 250);
          }
          return;
        }

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

        // Persist world+terrain for faster revisits in the same area.
        await setCachedWorldForBBox(bbox, worldData, terrainData);

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
      <div className="loading-screen-noise" aria-hidden="true" />
      <main className="loading-shell">
        <div className="loading-mark" aria-hidden="true">
          <span className="loading-mark-block" />
          <span className="loading-mark-gap" />
          <span className="loading-mark-block loading-mark-block-muted" />
        </div>

        <h1 className="loading-brand">MappedOut</h1>
        <p className="loading-location">
          {locationName ? `Loading ${locationName}` : 'Loading map data'}
        </p>

        <div className="loading-progress-row">
          <div className="loading-progress-track">
            <div
              className="loading-progress-fill"
              style={{ width: `${loadingProgress}%` }}
            />
          </div>
          <span className="loading-progress-value">{Math.round(loadingProgress)}%</span>
        </div>

        <p className="loading-status">{loadingMessage || 'Preparing world...'}</p>
        <p className="loading-controls">WASD Drive  |  Space Brake  |  C Camera  |  T Time</p>
      </main>
    </div>
  );
}
