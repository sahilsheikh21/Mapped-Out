/**
 * Parse raw Overpass API responses into typed game objects.
 * Adapts map3d's approach (Space.tsx lines 455-478) with
 * additional classification for our procedural world renderer.
 */

import type { OverpassElement, OverpassResponse } from './overpass';
import type { OSMBuilding, OSMRoad, OSMTree, OSMAmenity, WorldData } from '../stores/worldStore';
import { METERS_PER_LEVEL, DEFAULT_BUILDING_HEIGHT } from '../utils/constants';

/**
 * Classify building type from OSM tags.
 */
function classifyBuilding(tags: Record<string, string>): string {
  const buildingTag = tags.building || 'yes';
  const amenity = tags.amenity || '';

  // Specific building types
  if (['house', 'detached', 'semidetached_house', 'terrace', 'bungalow', 'cabin', 'farm', 'hut'].includes(buildingTag)) {
    return 'residential';
  }
  if (['apartments', 'dormitory', 'hotel'].includes(buildingTag)) {
    return 'apartments';
  }
  if (['commercial', 'retail', 'kiosk', 'supermarket'].includes(buildingTag) || amenity === 'marketplace') {
    return 'commercial';
  }
  if (['office'].includes(buildingTag)) {
    return 'office';
  }
  if (['industrial', 'warehouse', 'hangar', 'storage_tank'].includes(buildingTag)) {
    return 'industrial';
  }
  if (['church', 'cathedral', 'chapel', 'mosque', 'temple', 'synagogue', 'shrine'].includes(buildingTag) || tags.amenity === 'place_of_worship') {
    return 'religious';
  }
  if (['school', 'university', 'college', 'kindergarten'].includes(buildingTag) || ['school', 'university', 'college'].includes(amenity)) {
    return 'institutional';
  }
  if (['hospital', 'clinic'].includes(buildingTag) || ['hospital', 'clinic'].includes(amenity)) {
    return 'medical';
  }
  if (['garage', 'garages', 'carport', 'shed'].includes(buildingTag)) {
    return 'garage';
  }
  if (buildingTag === 'yes' || buildingTag === 'residential') {
    return 'residential';
  }

  return 'commercial'; // default fallback for unknown types
}

/**
 * Compute building height in meters from OSM tags.
 * Uses the same logic as map3d (Space.tsx lines 467-470):
 *   1. Use explicit height tag if available
 *   2. Use building:levels × METERS_PER_LEVEL
 *   3. Fall back to DEFAULT_BUILDING_HEIGHT
 */
function computeBuildingHeight(tags: Record<string, string>): { height: number; levels: number } {
  const explicitHeight = parseFloat(tags.height || '');
  const explicitLevels = parseFloat(tags['building:levels'] || '');

  if (!isNaN(explicitHeight) && explicitHeight > 0) {
    return {
      height: explicitHeight,
      levels: !isNaN(explicitLevels) ? explicitLevels : Math.round(explicitHeight / METERS_PER_LEVEL),
    };
  }

  if (!isNaN(explicitLevels) && explicitLevels > 0) {
    return {
      height: explicitLevels * METERS_PER_LEVEL,
      levels: explicitLevels,
    };
  }

  // Default height based on building type
  const type = classifyBuilding(tags);
  switch (type) {
    case 'residential':
    case 'garage':
      return { height: 6, levels: 2 };
    case 'apartments':
      return { height: 15, levels: 5 };
    case 'commercial':
      return { height: 9, levels: 3 };
    case 'office':
      return { height: 18, levels: 6 };
    case 'industrial':
      return { height: 8, levels: 2 };
    default:
      return { height: DEFAULT_BUILDING_HEIGHT, levels: 3 };
  }
}

/**
 * Classify road type and compute width from OSM tags.
 */
function classifyRoad(tags: Record<string, string>): { roadType: string; lanes: number; widthMeters: number } {
  const highway = tags.highway || 'unclassified';
  const explicitLanes = parseInt(tags.lanes || '', 10);
  const explicitWidth = parseFloat(tags.width || '');

  let lanes: number;
  let widthMeters: number;

  switch (highway) {
    case 'motorway':
    case 'trunk':
      lanes = explicitLanes || 4;
      widthMeters = explicitWidth || lanes * 3.7;
      break;
    case 'primary':
      lanes = explicitLanes || 2;
      widthMeters = explicitWidth || lanes * 3.5;
      break;
    case 'secondary':
    case 'tertiary':
      lanes = explicitLanes || 2;
      widthMeters = explicitWidth || lanes * 3.2;
      break;
    case 'residential':
    case 'living_street':
      lanes = explicitLanes || 2;
      widthMeters = explicitWidth || 6;
      break;
    case 'service':
      lanes = explicitLanes || 1;
      widthMeters = explicitWidth || 4;
      break;
    case 'footway':
    case 'path':
    case 'pedestrian':
    case 'cycleway':
      lanes = 1;
      widthMeters = explicitWidth || 2;
      break;
    default:
      lanes = explicitLanes || 2;
      widthMeters = explicitWidth || 6;
  }

  return { roadType: highway, lanes, widthMeters };
}

/**
 * Parse the raw Overpass response into structured WorldData.
 */
export function parseOSMResponse(
  response: OverpassResponse,
  bbox: [number, number, number, number]
): WorldData {
  const buildings: OSMBuilding[] = [];
  const roads: OSMRoad[] = [];
  const trees: OSMTree[] = [];
  const amenities: OSMAmenity[] = [];

  for (const element of response.elements) {
    const tags = element.tags || {};

    // ── Buildings ────────────────────────────
    if (tags.building && element.geometry && element.geometry.length >= 3) {
      const { height, levels } = computeBuildingHeight(tags);
      const buildingType = classifyBuilding(tags);

      buildings.push({
        id: element.id,
        tags,
        geometry: element.geometry,
        heightMeters: height,
        levels,
        buildingType,
      });
    }
    // ── Roads ────────────────────────────────
    else if (tags.highway && element.geometry && element.geometry.length >= 2) {
      const { roadType, lanes, widthMeters } = classifyRoad(tags);

      roads.push({
        id: element.id,
        tags,
        geometry: element.geometry,
        roadType,
        lanes,
        widthMeters,
      });
    }
    // ── Trees ────────────────────────────────
    else if (tags.natural === 'tree' && element.lat != null && element.lon != null) {
      trees.push({
        id: element.id,
        lat: element.lat,
        lon: element.lon,
        tags,
      });
    }
    // ── Amenities ────────────────────────────
    else if (tags.amenity) {
      amenities.push({
        id: element.id,
        tags,
        lat: element.lat,
        lon: element.lon,
        geometry: element.geometry,
      });
    }
  }

  return { buildings, roads, trees, amenities, bbox };
}
