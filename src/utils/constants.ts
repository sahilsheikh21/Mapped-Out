// ─── Projection ───────────────────────────────────────────────
// Map3d uses scale=51000 for its Mercator projection.
// We use the same approach: 1 projected unit ≈ 1 meter at the reference latitude.
export const PROJECTION_SCALE = 111320; // meters per degree of latitude

// ─── Imported Asset Scale ─────────────────────────────────────
// Remaining Kenney props and vehicles share a common size grid, so we keep a
// single conversion factor for those imported models.
export const ASSET_SCALE = 4.0; // 1 Kenney unit = 4 real-world meters

// ─── Building Defaults ────────────────────────────────────────
// Building meshes are now extruded directly from OSM footprints, but we still
// rely on sensible fallback heights when tags are incomplete.
export const METERS_PER_LEVEL = 3.0; // average floor height in meters
export const DEFAULT_BUILDING_HEIGHT = 10; // meters, when no data available
export const DEFAULT_BUILDING_LEVELS = 3;

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
