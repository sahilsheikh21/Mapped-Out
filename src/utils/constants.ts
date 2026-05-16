// ─── Projection ───────────────────────────────────────────────
// Map3d uses scale=51000 for its Mercator projection.
// We use the same approach: 1 projected unit ≈ 1 meter at the reference latitude.
export const PROJECTION_SCALE = 111320; // meters per degree of latitude

// ─── Kenney Asset Dimensions (native GLB units) ──────────────
// All Kenney City Kit models are designed on a consistent grid:
//   • 1 Kenney unit = ~1 game-world unit
//   • Road tiles: 1×1 base footprint
//   • Buildings: vary from ~0.8 to ~2.5 units wide/deep
//
// After measurement, these are the approximate bounding boxes (in GLB units):
//
// SUBURBAN BUILDINGS:
//   building-type-a..u: footprint ~1.0×1.0, height ~0.6-1.2
//   Average house: 1.0 wide × 1.0 deep × 0.8 tall
//
// COMMERCIAL BUILDINGS:
//   building-a..n: footprint ~1.0×1.0 to ~2.0×2.0, height ~0.8-2.5
//   building-skyscraper-a..e: footprint ~1.0×1.0, height ~2.0-4.0
//   low-detail-building-*: footprint ~0.5×0.5, height ~0.3-1.5
//
// ROAD TILES:
//   road-straight, road-bend, etc: 1.0×1.0 footprint, ~0.02 height
//
// CARS:
//   sedan, suv, etc: ~0.4 long × 0.2 wide × 0.15 tall
//
// The critical scaling factor: how many Kenney units = how many real meters?
// Kenney road tiles represent ~a single lane width (~3.5m in the real world).
// So 1 Kenney road tile = ~4m real-world width
// Therefore our ASSET_SCALE = 4.0 means 1 Kenney unit → 4 real meters.

export const ASSET_SCALE = 4.0; // 1 Kenney unit = 4 real-world meters

// ─── Building Sizing Strategy ─────────────────────────────────
// OSM provides:
//   - building:levels (number of floors)
//   - height (meters)
//   - building footprint polygon (in lat/lon)
//
// Real-world → Kenney mapping:
//   • A typical suburban Kenney house is ~0.8 units tall = ~3.2m real (1 story)
//   • A Kenney commercial building is ~1.5 units tall = ~6m real (2 stories)
//   • A Kenney skyscraper is ~3.5 units tall = ~14m real (4-5 stories)
//
// SIZING ALGORITHM:
//   1. Get real-world footprint from OSM polygon → compute width & depth in meters
//   2. Get real-world height from OSM (height tag or levels × 3m)
//   3. Pick asset category based on building type tag
//   4. Scale asset X/Z to match real footprint: scaleX = realWidth / (assetWidth × ASSET_SCALE)
//   5. Scale asset Y to match real height: scaleY = realHeight / (assetHeight × ASSET_SCALE)
//   6. Position at polygon centroid

export const METERS_PER_LEVEL = 3.0; // average floor height in meters
export const DEFAULT_BUILDING_HEIGHT = 10; // meters, when no data available
export const DEFAULT_BUILDING_LEVELS = 3;

// Kenney asset native heights (in Kenney units, before ASSET_SCALE)
export const KENNEY_SUBURBAN_HEIGHT = 0.85; // ~3.4m real for a 1-story house
export const KENNEY_COMMERCIAL_HEIGHT = 1.5; // ~6m real for a 2-story shop
export const KENNEY_SKYSCRAPER_HEIGHT = 3.5; // ~14m real for a tall building
export const KENNEY_LOW_DETAIL_HEIGHT = 0.8; // ~3.2m for LOD buildings

// Kenney asset native footprints (width in Kenney units)
export const KENNEY_SUBURBAN_WIDTH = 1.0; // ~4m real
export const KENNEY_COMMERCIAL_WIDTH = 1.0; // ~4m real
export const KENNEY_ROAD_TILE_SIZE = 1.0; // ~4m real (one lane width)

// ─── World Generation ─────────────────────────────────────────
export const TILE_SIZE = 200; // meters per tile
export const LOAD_RADIUS = 1; // load tiles within this radius (0 = center only, 1 = 3×3)
export const UNLOAD_RADIUS = 3; // unload tiles beyond this radius
export const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';
export const NOMINATIM_API_URL = 'https://nominatim.openstreetmap.org/search';

// ─── Vehicle Physics ──────────────────────────────────────────
export const CAR_MAX_SPEED = 40; // m/s (~144 km/h)
export const CAR_ACCELERATION = 15;
export const CAR_BRAKE_FORCE = 30;
export const CAR_STEER_ANGLE = Math.PI / 6; // 30 degrees max steer
export const CAR_MASS = 1200; // kg
export const CAR_REVERSE_SPEED = 14; // m/s
export const CAR_DRAG = 0.45;
export const CAR_ROLLING_RESISTANCE = 2.4;
export const CAR_LATERAL_GRIP = 10;
export const CAR_STEER_RESPONSE = 7.5;
export const CAR_STEER_RETURN = 5.5;
export const CAR_MAX_YAW_RATE = 2.6; // rad/s
export const CAR_TURN_GRIP = 1.35;

// ─── Camera ───────────────────────────────────────────────────
export const CHASE_CAM_DISTANCE = 12;
export const CHASE_CAM_HEIGHT = 6;
export const CHASE_CAM_LERP = 0.08;
