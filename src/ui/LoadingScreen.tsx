/**
 * LoadingScreen: Animated loading UI shown while fetching OSM data.
 */

import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useGameStore } from '../stores/gameStore';
import { useWorldStore } from '../stores/worldStore';
import { fetchOSMData } from '../api/overpass';
import { parseOSMResponse } from '../api/osmParser';
import { getBBox } from '../utils/geo';

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
        setWorldData(worldData);

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
