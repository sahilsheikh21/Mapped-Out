/**
 * Geographic utilities for converting lat/lon to local 3D coordinates.
 * Uses the same Mercator projection approach as map3d (Space.tsx line 449-453).
 */

/** Convert degrees to radians */
export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Project a geographic point (lat, lon) to local 3D coordinates (x, z)
 * relative to a reference center point.
 * 
 * Based on map3d's projection:
 *   x = (lng - refLng) * scale * cos(refLat)
 *   z = -(lat - refLat) * scale
 * 
 * We use meters_per_degree constants for accuracy:
 *   1 degree latitude ≈ 111,320 meters
 *   1 degree longitude ≈ 111,320 * cos(latitude) meters
 */
export function projectToLocal(
  lat: number,
  lon: number,
  refLat: number,
  refLon: number
): { x: number; z: number } {
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLon = 111320 * Math.cos(degToRad(refLat));

  const x = (lon - refLon) * metersPerDegreeLon;
  const z = -(lat - refLat) * metersPerDegreeLat;

  return { x, z };
}

/**
 * Compute bounding box from center point and radius in meters.
 * Returns [south, west, north, east] for Overpass API.
 */
export function getBBox(
  lat: number,
  lon: number,
  radiusMeters: number
): [number, number, number, number] {
  const latDelta = radiusMeters / 111320;
  const lonDelta = radiusMeters / (111320 * Math.cos(degToRad(lat)));

  return [
    lat - latDelta, // south
    lon - lonDelta, // west
    lat + latDelta, // north
    lon + lonDelta, // east
  ];
}

/**
 * Compute the centroid of a polygon defined by lat/lon points.
 */
export function polygonCentroid(
  points: { lat: number; lon: number }[]
): { lat: number; lon: number } {
  let latSum = 0;
  let lonSum = 0;
  const n = points.length;
  for (const p of points) {
    latSum += p.lat;
    lonSum += p.lon;
  }
  return { lat: latSum / n, lon: lonSum / n };
}

/**
 * Compute the bounding dimensions of a polygon in meters
 * (projected to local coordinates).
 */
export function polygonDimensions(
  points: { lat: number; lon: number }[],
  refLat: number,
  refLon: number
): { width: number; depth: number; minX: number; maxX: number; minZ: number; maxZ: number } {
  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (const p of points) {
    const { x, z } = projectToLocal(p.lat, p.lon, refLat, refLon);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }

  return {
    width: maxX - minX,
    depth: maxZ - minZ,
    minX, maxX, minZ, maxZ,
  };
}

/**
 * Compute the rotation angle of a building polygon based on its longest edge.
 * This helps orient Kenney building blocks to match real-world footprints.
 */
export function polygonRotation(
  points: { lat: number; lon: number }[],
  refLat: number,
  refLon: number
): number {
  if (points.length < 2) return 0;

  let longestLen = 0;
  let longestAngle = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const a = projectToLocal(points[i].lat, points[i].lon, refLat, refLon);
    const b = projectToLocal(points[i + 1].lat, points[i + 1].lon, refLat, refLon);
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len > longestLen) {
      longestLen = len;
      longestAngle = Math.atan2(dx, dz);
    }
  }

  return longestAngle;
}

/**
 * Distance between two geographic points in meters (Haversine formula).
 */
export function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371000;
  const dLat = degToRad(lat2 - lat1);
  const dLon = degToRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(degToRad(lat1)) * Math.cos(degToRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
