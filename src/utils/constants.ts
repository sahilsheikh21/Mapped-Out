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

// ─── Vehicle Physics (Rapier DynamicRayCastVehicleController) ─
// Ported from car-physics-main reference (CarPhysics.ts + CarWheel.ts).

/** Chassis */
export const CAR_MASS = 500;               // kg (reference default: 500)
export const CAR_MAX_SPEED = 25;           // m/s (~90 km/h) (reference: 25)
export const CAR_REVERSE_SPEED = 10;       // m/s

/** Engine / Brakes */
export const CAR_ACCELERATION_FORCE = 48;  // N — tuned for arcade-snappy response
export const CAR_BRAKE_FORCE = 30;         // N — strong braking

/** Steering */
export const CAR_MAX_STEER_DEG = 40;                        // degrees (reference: 40)
export const CAR_MAX_STEER_RAD = CAR_MAX_STEER_DEG * (Math.PI / 180);
export const CAR_STEER_SMOOTHING = 0.1;                     // seconds (reference: 0.1)
export const CAR_HIGH_SPEED_STEER_FACTOR = 0.5;             // steer reduces to 50% at topSpeed

/** Suspension — tuned for reliable ground contact on OSM-generated roads */
export const CAR_SUSPENSION_REST_LENGTH = 0.25;  // meters (increased for better ground reach)
export const CAR_SUSPENSION_MAX_TRAVEL = 0.2;    // meters (increased for uneven terrain)
export const CAR_SUSPENSION_STIFFNESS = 50;      // (reference default: 50)
export const CAR_SUSPENSION_COMPRESSION = 3.0;   // (reference: 3)
export const CAR_SUSPENSION_RELAXATION = 5.0;    // (reference: 5)

/** Wheel */
export const CAR_WHEEL_RADIUS = 0.29;            // meters

/** Friction */
export const CAR_SIDE_FRICTION_STIFFNESS = 0.7;  // (reference: 0.7)
export const CAR_FRICTION_SLIP_LOW = 1;           // when grip is low (reference: 1)
export const CAR_FRICTION_SLIP_HIGH = 20;         // when grip is high (reference: 20)

/** Down-force — reference: dt * mass * speed01 * 20 */
export const CAR_DOWN_FORCE_FACTOR = 20;          // (reference: 20)

/** Auto-reset */
export const CAR_ROLLED_OVER_THRESHOLD = 0.65;   // worldUp.dot(Y) below this = rolled over
export const CAR_AIRTIME_RESET_THRESHOLD = 5.0;  // seconds airborne before reset

// ─── Camera ───────────────────────────────────────────────────
export const CHASE_CAM_DISTANCE = 12;
export const CHASE_CAM_HEIGHT = 6;
export const CHASE_CAM_LERP = 0.08;

