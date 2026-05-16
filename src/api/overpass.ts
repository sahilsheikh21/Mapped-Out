/**
 * Overpass API client for fetching OpenStreetMap data.
 * Adapted from map3d's approach (Space.tsx lines 327-343).
 */

import { OVERPASS_API_URL } from '../utils/constants';

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
  lat?: number;
  lon?: number;
  bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number };
  members?: any[];
}

export interface OverpassResponse {
  elements: OverpassElement[];
}

/**
 * Fetch buildings, roads, trees, and amenities from the Overpass API
 * within a bounding box.
 */
export async function fetchOSMData(
  south: number,
  west: number,
  north: number,
  east: number,
  onProgress?: (msg: string) => void
): Promise<OverpassResponse> {
  const bbox = `${south},${west},${north},${east}`;
  
  onProgress?.('Fetching buildings and roads from OpenStreetMap...');

  // Single query for all data types
  const query = `
    [out:json][timeout:60];
    (
      way["building"](${bbox});
      relation["building"](${bbox});
      way["highway"](${bbox});
      node["natural"="tree"](${bbox});
      way["amenity"](${bbox});
      node["amenity"](${bbox});
      way["landuse"](${bbox});
      way["leisure"](${bbox});
    );
    out body geom;
  `;

  const response = await fetch(OVERPASS_API_URL, {
    method: 'POST',
    body: 'data=' + encodeURIComponent(query),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  if (!response.ok) {
    throw new Error(`Overpass API error: ${response.status} ${response.statusText}`);
  }

  onProgress?.('Parsing map data...');
  const data: OverpassResponse = await response.json();
  
  return data;
}
