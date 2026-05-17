import { ELEVATION_API_URL, TERRAIN_GRID_COLS, TERRAIN_GRID_ROWS } from '../utils/constants';
import { projectToLocal } from '../utils/geo';
import type { TerrainData } from '../stores/worldStore';

const MAX_POINTS_PER_REQUEST = 100;

interface ElevationResponse {
  elevation?: number[];
  error?: boolean;
  reason?: string;
}

function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

export async function fetchTerrainData(
  bbox: [number, number, number, number],
  refLat: number,
  refLon: number,
  rows = TERRAIN_GRID_ROWS,
  cols = TERRAIN_GRID_COLS,
  onProgress?: (msg: string) => void
): Promise<TerrainData> {
  const [south, west, north, east] = bbox;

  const latitudes: number[] = [];
  const longitudes: number[] = [];

  for (let row = 0; row < rows; row++) {
    const v = row / (rows - 1);
    const lat = north + (south - north) * v;
    for (let col = 0; col < cols; col++) {
      const u = col / (cols - 1);
      const lon = west + (east - west) * u;
      latitudes.push(lat);
      longitudes.push(lon);
    }
  }

  const latChunks = chunkArray(latitudes, MAX_POINTS_PER_REQUEST);
  const lonChunks = chunkArray(longitudes, MAX_POINTS_PER_REQUEST);

  const absoluteHeights: number[] = [];

  for (let i = 0; i < latChunks.length; i++) {
    onProgress?.(`Fetching terrain elevations (${i + 1}/${latChunks.length})...`);

    const params = new URLSearchParams({
      latitude: latChunks[i].map((value) => value.toFixed(6)).join(','),
      longitude: lonChunks[i].map((value) => value.toFixed(6)).join(','),
    });

    const response = await fetch(`${ELEVATION_API_URL}?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Elevation API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as ElevationResponse;
    if (data.error) {
      throw new Error(data.reason || 'Elevation API returned an error');
    }
    if (!Array.isArray(data.elevation)) {
      throw new Error('Elevation API returned no elevation array');
    }

    absoluteHeights.push(...data.elevation.map((value) => Number.isFinite(value) ? value : NaN));
  }

  if (absoluteHeights.length !== rows * cols) {
    throw new Error(`Elevation sample mismatch: expected ${rows * cols}, got ${absoluteHeights.length}`);
  }

  const centerRow = Math.floor(rows / 2);
  const centerCol = Math.floor(cols / 2);
  const centerIndex = centerRow * cols + centerCol;

  const validHeights = absoluteHeights.filter((value) => Number.isFinite(value));
  if (validHeights.length === 0) {
    throw new Error('Elevation API returned no valid heights');
  }

  const meanElevation = validHeights.reduce((sum, value) => sum + value, 0) / validHeights.length;
  const centerElevation = Number.isFinite(absoluteHeights[centerIndex]) ? absoluteHeights[centerIndex] : meanElevation;
  const baselineElevation = centerElevation;

  const heights = absoluteHeights.map((value) => {
    const safeValue = Number.isFinite(value) ? value : baselineElevation;
    return safeValue - baselineElevation;
  });

  let minRelativeHeight = Infinity;
  let maxRelativeHeight = -Infinity;
  for (const value of heights) {
    minRelativeHeight = Math.min(minRelativeHeight, value);
    maxRelativeHeight = Math.max(maxRelativeHeight, value);
  }

  // Terrain spans the same local XY footprint as the OSM bounding box.
  const minX = projectToLocal(refLat, west, refLat, refLon).x;
  const maxX = projectToLocal(refLat, east, refLat, refLon).x;
  const minZ = projectToLocal(north, refLon, refLat, refLon).z;
  const maxZ = projectToLocal(south, refLon, refLat, refLon).z;

  return {
    rows,
    cols,
    heights,
    minX: Math.min(minX, maxX),
    maxX: Math.max(minX, maxX),
    minZ: Math.min(minZ, maxZ),
    maxZ: Math.max(minZ, maxZ),
    baselineElevation,
    minRelativeHeight,
    maxRelativeHeight,
  };
}
