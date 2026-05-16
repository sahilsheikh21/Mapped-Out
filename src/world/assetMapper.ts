/**
 * Asset Mapper: Maps OSM building types to specific Kenney GLB model paths.
 * 
 * ─── SIZING STRATEGY ─────────────────────────────────────────
 * 
 * Kenney models have these native dimensions (measured from GLB bounding boxes):
 * 
 * SUBURBAN BUILDINGS (building-type-a through u):
 *   Footprint: ~1.0 × 1.0 Kenney units (some are 1.0 × 0.7 for narrower houses)
 *   Height: ~0.6 to ~1.2 Kenney units
 *   Real-world equivalent at ASSET_SCALE=4: ~4m × 4m footprint, ~2.4-4.8m height
 *   These represent single-story suburban houses.
 * 
 * COMMERCIAL BUILDINGS (building-a through n):
 *   Footprint: ~1.0 × 1.0 to ~2.0 × 1.5 Kenney units
 *   Height: ~0.8 to ~2.5 Kenney units
 *   Real-world equivalent: ~4-8m × 4-6m footprint, ~3.2-10m tall (1-3 stories)
 * 
 * COMMERCIAL SKYSCRAPERS (building-skyscraper-a through e):
 *   Footprint: ~1.0 × 1.0 Kenney units
 *   Height: ~2.5 to ~4.5 Kenney units
 *   Real-world equivalent: ~4m × 4m footprint, ~10-18m tall (3-6 stories)
 * 
 * LOW-DETAIL BUILDINGS (for LOD / distant view):
 *   Footprint: ~0.5 × 0.5 to ~1.0 × 1.0
 *   Height: ~0.3 to ~1.5
 *   Very low vertex count (84-476 verts vs 1800-8500 for detailed)
 * 
 * ─── HOW WE SCALE TO REAL BUILDINGS ──────────────────────────
 * 
 * 1. OSM gives us the REAL building footprint polygon (in meters, after projection)
 * 2. OSM gives us the REAL height (from tags or levels × 3m)
 * 3. We pick a Kenney model based on building type (residential → suburban, etc.)
 * 4. We scale the model:
 *    - scaleXZ = max(realWidth, realDepth) / (kenneyBaseSize × ASSET_SCALE)
 *      This stretches the model to fill the real footprint
 *    - scaleY = realHeight / (kenneyModelHeight × ASSET_SCALE)
 *      This stretches vertically to match real height
 * 5. Minimum scale clamp of 0.5 prevents tiny buildings
 * 6. Maximum scale clamp of 8.0 prevents absurdly stretched models
 */

import { seededPick } from '../utils/math';
import { ASSET_SCALE } from '../utils/constants';

// ─── Asset Catalog ────────────────────────────────────────────

export const SUBURBAN_BUILDINGS = [
  'building-type-a', 'building-type-b', 'building-type-c', 'building-type-d',
  'building-type-e', 'building-type-f', 'building-type-g', 'building-type-h',
  'building-type-i', 'building-type-j', 'building-type-k', 'building-type-l',
  'building-type-m', 'building-type-n', 'building-type-o', 'building-type-p',
  'building-type-q', 'building-type-r', 'building-type-s', 'building-type-t',
  'building-type-u',
];

export const COMMERCIAL_BUILDINGS = [
  'building-a', 'building-b', 'building-c', 'building-d',
  'building-e', 'building-f', 'building-g', 'building-h',
  'building-i', 'building-j', 'building-k', 'building-l',
  'building-m', 'building-n',
];

export const SKYSCRAPER_BUILDINGS = [
  'building-skyscraper-a', 'building-skyscraper-b', 'building-skyscraper-c',
  'building-skyscraper-d', 'building-skyscraper-e',
];

export const LOW_DETAIL_BUILDINGS = [
  'low-detail-building-a', 'low-detail-building-b', 'low-detail-building-c',
  'low-detail-building-d', 'low-detail-building-e', 'low-detail-building-f',
  'low-detail-building-g', 'low-detail-building-h', 'low-detail-building-i',
  'low-detail-building-j', 'low-detail-building-k', 'low-detail-building-l',
  'low-detail-building-m', 'low-detail-building-n',
];

export const LOW_DETAIL_WIDE = [
  'low-detail-building-wide-a', 'low-detail-building-wide-b',
];

export const ROAD_PIECES = {
  straight: 'road-straight',
  straightHalf: 'road-straight-half',
  bend: 'road-bend',
  bendSidewalk: 'road-bend-sidewalk',
  curve: 'road-curve',
  curveIntersection: 'road-curve-intersection',
  crossing: 'road-crossing',
  crossroad: 'road-crossroad',
  crossroadPath: 'road-crossroad-path',
  intersection: 'road-intersection',
  intersectionPath: 'road-intersection-path',
  roundabout: 'road-roundabout',
  end: 'road-end',
  endRound: 'road-end-round',
  bridge: 'road-bridge',
  side: 'road-side',
  square: 'road-square',
};

export const PROP_ASSETS = {
  treeLarge: 'tree-large',
  treeSmall: 'tree-small',
  fence: 'fence',
  fenceLow: 'fence-low',
  planter: 'planter',
  drivewayLong: 'driveway-long',
  drivewayShort: 'driveway-short',
  pathLong: 'path-long',
  pathShort: 'path-short',
  lightCurved: 'light-curved',
  lightSquare: 'light-square',
  constructionCone: 'construction-cone',
  constructionBarrier: 'construction-barrier',
};

export const CAR_MODELS = [
  'sedan', 'sedan-sports', 'suv', 'suv-luxury', 'taxi',
  'hatchback-sports', 'van', 'truck', 'police',
];

// ─── Native Kenney model heights (in Kenney units) ────────────
// These are approximate bounding box heights for each category.
// Used to compute scaleY = realHeight / (nativeHeight × ASSET_SCALE)

const NATIVE_HEIGHTS: Record<string, number> = {
  suburban: 0.85,    // ~3.4m at ASSET_SCALE=4
  commercial: 1.5,   // ~6.0m at ASSET_SCALE=4
  skyscraper: 3.5,   // ~14.0m at ASSET_SCALE=4
  lowDetail: 0.8,    // ~3.2m at ASSET_SCALE=4
};

const NATIVE_WIDTHS: Record<string, number> = {
  suburban: 1.0,     // ~4m at ASSET_SCALE=4
  commercial: 1.2,   // ~4.8m at ASSET_SCALE=4
  skyscraper: 1.0,   // ~4m at ASSET_SCALE=4
  lowDetail: 0.7,    // ~2.8m at ASSET_SCALE=4
};

// ─── Asset Selection ──────────────────────────────────────────

export interface AssetSelection {
  modelPath: string;
  category: 'suburban' | 'commercial' | 'skyscraper' | 'lowDetail';
  nativeHeight: number;
  nativeWidth: number;
}

/**
 * Select the appropriate Kenney model for a building based on its OSM type and size.
 */
export function selectBuildingAsset(
  buildingType: string,
  heightMeters: number,
  levels: number,
  osmId: number
): AssetSelection {
  const seed = `building-${osmId}`;

  // Tall buildings → skyscrapers
  if (levels >= 8 || heightMeters >= 25) {
    const model = seededPick(SKYSCRAPER_BUILDINGS, seed);
    return {
      modelPath: `/assets/kenney-commercial/${model}.glb`,
      category: 'skyscraper',
      nativeHeight: NATIVE_HEIGHTS.skyscraper,
      nativeWidth: NATIVE_WIDTHS.skyscraper,
    };
  }

  // Commercial / office / institutional → commercial buildings
  if (['commercial', 'office', 'institutional', 'medical', 'industrial'].includes(buildingType)) {
    const model = seededPick(COMMERCIAL_BUILDINGS, seed);
    return {
      modelPath: `/assets/kenney-commercial/${model}.glb`,
      category: 'commercial',
      nativeHeight: NATIVE_HEIGHTS.commercial,
      nativeWidth: NATIVE_WIDTHS.commercial,
    };
  }

  // Apartments (mid-rise) → commercial buildings
  if (buildingType === 'apartments' && levels >= 4) {
    const model = seededPick(COMMERCIAL_BUILDINGS, seed);
    return {
      modelPath: `/assets/kenney-commercial/${model}.glb`,
      category: 'commercial',
      nativeHeight: NATIVE_HEIGHTS.commercial,
      nativeWidth: NATIVE_WIDTHS.commercial,
    };
  }

  // Small apartments → suburban
  if (buildingType === 'apartments') {
    const model = seededPick(SUBURBAN_BUILDINGS, seed);
    return {
      modelPath: `/assets/kenney-suburban/${model}.glb`,
      category: 'suburban',
      nativeHeight: NATIVE_HEIGHTS.suburban,
      nativeWidth: NATIVE_WIDTHS.suburban,
    };
  }

  // Residential / garage / default → suburban
  const model = seededPick(SUBURBAN_BUILDINGS, seed);
  return {
    modelPath: `/assets/kenney-suburban/${model}.glb`,
    category: 'suburban',
    nativeHeight: NATIVE_HEIGHTS.suburban,
    nativeWidth: NATIVE_WIDTHS.suburban,
  };
}

/**
 * Compute the scale factors to make a Kenney model match real-world dimensions.
 * 
 * @param realWidth - Real building width in meters (from OSM polygon)
 * @param realDepth - Real building depth in meters (from OSM polygon)
 * @param realHeight - Real building height in meters (from OSM tags)
 * @param asset - The selected Kenney asset info
 * @returns [scaleX, scaleY, scaleZ] to apply to the model
 */
export function computeBuildingScale(
  realWidth: number,
  realDepth: number,
  realHeight: number,
  asset: AssetSelection
): [number, number, number] {
  const nativeWorldWidth = asset.nativeWidth * ASSET_SCALE;
  const nativeWorldHeight = asset.nativeHeight * ASSET_SCALE;

  // Scale to match real footprint
  let scaleX = Math.max(realWidth, 3) / nativeWorldWidth;
  let scaleZ = Math.max(realDepth, 3) / nativeWorldWidth;
  // Scale to match real height
  let scaleY = Math.max(realHeight, 3) / nativeWorldHeight;

  // Clamp to prevent extreme stretching
  scaleX = Math.max(0.5, Math.min(scaleX, 10));
  scaleY = Math.max(0.5, Math.min(scaleY, 12));
  scaleZ = Math.max(0.5, Math.min(scaleZ, 10));

  return [scaleX, scaleY, scaleZ];
}

/**
 * Select a parked car model for decorating streets.
 */
export function selectParkedCar(seed: string): string {
  const model = seededPick(CAR_MODELS, seed);
  return `/assets/kenney-vehicles/${model}.glb`;
}

/**
 * Select a tree model.
 */
export function selectTree(seed: string): string {
  return `/assets/kenney-suburban/${seededPick(['tree-large', 'tree-small'], seed)}.glb`;
}
