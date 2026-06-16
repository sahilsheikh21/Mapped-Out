# Mapped-Out

Mapped-Out is a browser-based driving prototype that turns real OpenStreetMap data into a playable 3D scene. You choose any address, city, or landmark, the app fetches nearby map data, converts it into local world coordinates, builds roads and buildings on the fly, and drops a physics-driven car into the scene so you can explore it immediately.

This repository is not just a static map viewer. It mixes geospatial data, procedural world generation, real-time 3D rendering, and arcade-style vehicle physics in a single React application.

## What The Project Does

- Lets you search for a place or click directly on a map.
- Geocodes locations with Nominatim.
- Fetches nearby OpenStreetMap data from Overpass.
- Parses buildings, roads, trees, amenities, and transit stops into typed world data.
- Projects latitude/longitude into a local 3D coordinate system.
- Extrudes real building footprints into procedural meshes with generated facade textures.
- Renders roads as custom mesh ribbons based on OSM road geometry.
- Spawns a driveable car using Rapier raycast vehicle physics.
- Includes multiple camera modes and time-of-day presets.

## What This Repo Is

At its core, this is a real-world-to-gameplay experiment:

- Frontend app: React + TypeScript + Vite
- 3D engine: React Three Fiber + Three.js
- Physics: Rapier via `@react-three/rapier`
- State management: Zustand
- Map UI: Leaflet + React Leaflet
- Data sources: OpenStreetMap, Nominatim, Overpass API

The playable app lives in [`src/`](./src) and [`public/assets/`](./public/assets). The [`Refrerance/`](./Refrerance) folder contains upstream examples, asset source packs, and research material used during development. It is helpful for understanding where ideas came from, but it is not the runtime app.

## Main Flow

1. The app starts in the location picker UI.
2. A user searches for a location or clicks on the map.
3. The selected point is stored in Zustand and the app enters the loading phase.
4. A 400-meter bounding box is calculated around that point.
5. Overpass returns raw OSM features for that area.
6. The parser classifies buildings, roads, trees, amenities, and transit stations.
7. Geographic coordinates are projected into local `x/z` world coordinates.
8. The world builder renders:
   - a single large physical ground plane
   - visual roads
   - footprint-based procedural buildings
   - tree props
   - station markers
9. The vehicle spawn logic picks a suitable road segment and places the car there.
10. The player drives around with Rapier-based vehicle physics.

## Tech Stack

| Area | Used Here |
| --- | --- |
| Build tool | Vite |
| Language | TypeScript |
| UI | React |
| 3D rendering | Three.js, `@react-three/fiber`, `@react-three/drei` |
| Physics | `@dimforge/rapier3d-compat`, `@react-three/rapier` |
| App state | Zustand |
| Map picker | Leaflet, React Leaflet |
| Icons | Lucide React |
| Local/browser storage dependency | `idb` is installed, though not currently used in the checked-in app flow |

## Runtime Features

### Location Picker

[`src/ui/LocationPicker.tsx`](./src/ui/LocationPicker.tsx) provides the landing experience:

- dark map-based picker
- debounced search
- click-to-select
- browser geolocation support
- start button that transitions into loading and world generation

### Loading Pipeline

[`src/ui/LoadingScreen.tsx`](./src/ui/LoadingScreen.tsx) handles the world bootstrap:

- bounding-box calculation
- Overpass fetch
- OSM parsing
- spawn point selection
- progress and status messaging

### World Generation

[`src/world/`](./src/world) contains the procedural scene logic:

- `WorldBuilder.tsx`: top-level orchestration
- `GroundPlane.tsx`: one large physics surface for driving
- `RoadGenerator.tsx`: visual road ribbons built from OSM line data
- `BuildingPlacer.tsx`: procedural buildings extruded from real footprints
- `PropPlacer.tsx`: tree placement using bundled GLB assets
- `StationPlacer.tsx`: transit stop markers and labels
- `buildingTheme.ts`: generated facade textures, palettes, rooftop detail logic

### Vehicle And Camera

- [`src/vehicle/Vehicle.tsx`](./src/vehicle/Vehicle.tsx) uses Rapier's vehicle controller to handle acceleration, braking, steering, wheel suspension, downforce, and auto-reset behavior.
- [`src/camera/CameraRig.tsx`](./src/camera/CameraRig.tsx) supports:
  - chase camera with pointer lock
  - orbit camera
  - bird's-eye follow camera
  - bird's-eye free camera

### State Stores

[`src/stores/`](./src/stores) keeps the app flow simple:

- `gameStore.ts`: phase, location, camera mode, time of day
- `worldStore.ts`: parsed world data, reference point, spawn point
- `vehicleStore.ts`: speed, transform, and player input state

## Controls

- `WASD` or arrow keys: drive and steer
- `Space`: brake
- `R`: reset the vehicle to its spawn point
- `C`: cycle camera mode
- `T`: cycle time of day
- `F`: toggle free camera in bird's-eye mode
- `Click`: lock pointer in chase camera mode
- `Esc`: release pointer lock, then return to the location picker if pressed again

## Project Structure

```text
Mapped-Out/
├─ src/
│  ├─ api/           # Nominatim + Overpass clients and OSM parsing
│  ├─ camera/        # Camera behavior and controls
│  ├─ scene/         # Canvas scene setup
│  ├─ stores/        # Zustand stores
│  ├─ ui/            # Location picker, loading UI, HUD
│  ├─ utils/         # Math, geo projection, shared constants
│  ├─ vehicle/       # Car physics and model integration
│  └─ world/         # Procedural world generation and asset mapping
├─ public/assets/    # Runtime GLB/FBX assets used by the app
├─ Refrerance/       # Source packs, upstream examples, and research material
├─ index.html
├─ package.json
├─ vite.config.ts
├─ test-logs.js
└─ test-logs.mjs
```

## External Services And Network Dependencies

This app depends on live network services:

- Overpass API for raw OpenStreetMap feature queries
- Nominatim for text search and geocoding
- Carto dark basemap tiles in the map picker
- Google Fonts for typography
- Tailwind CDN in `index.html`
- a remote background image used by the loading screen

That means the app needs internet access, and it can be affected by third-party downtime, throttling, or rate limits.

## Assets, Credits, And References

### Runtime Asset Sources

- Kenney city/road/suburban/vehicle packs in [`public/assets/`](./public/assets)
- Quaternius realistic car FBX at [`public/assets/vehicles/realistic-sports-car.fbx`](./public/assets/vehicles/realistic-sports-car.fbx)

### Reference Material Included In The Repo

- [`Refrerance/map3d-main/map3d-main`](./Refrerance/map3d-main/map3d-main): reference for map-to-3D conversion and OSM handling
- [`Refrerance/car-physics-main/car-physics-main`](./Refrerance/car-physics-main/car-physics-main): reference for raycast vehicle ideas
- Kenney asset pack source folders and license files
- Quaternius source pack and license

### License Notes From Bundled References

- Kenney asset packs bundled here include CC0 license files.
- The bundled Quaternius car pack includes a CC0 license file.
- The included `map3d` reference project is MIT licensed.

If you plan to redistribute or heavily extend the project, keep those bundled license files with the asset sources and review them directly.

## Current Design Decisions

- Roads are visual meshes only.
- Driving physics happens on one large flat ground collider.
- Buildings use real footprint outlines, but their facades are generated in-app rather than imported from OSM.
- The world is centered around a local reference latitude/longitude to keep coordinates manageable in Three.js.
- Spawn logic prefers larger, more drivable road types and avoids placing the car inside buildings when possible.

## Current Limitations

- Terrain elevation is not modeled; the world is flat.
- Road colliders are not generated per road, so you are effectively driving over a flat plane textured by road meshes.
- OSM data quality depends on the selected area.
- Transit stations are markers only, not interactive systems.
- There is no traffic, pedestrians, missions, saving, or backend.
- The testing scripts in `test-logs.js` and `test-logs.mjs` are standalone diagnostics and are not wired into `package.json` scripts.

## Local Development

### Prerequisites

- A recent Node.js LTS release
- npm

### Install

```bash
npm install
```

### Run The Dev Server

```bash
npm run dev
```

The Vite config is set to:

- host: `127.0.0.1`
- port: `3000`
- open browser automatically on start

### Create A Production Build

```bash
npm run build
```

### Preview The Production Build

```bash
npm run preview
```

## Best Way To Understand The Codebase


1. [`src/App.tsx`](./src/App.tsx)
2. [`src/ui/LocationPicker.tsx`](./src/ui/LocationPicker.tsx)
3. [`src/ui/LoadingScreen.tsx`](./src/ui/LoadingScreen.tsx)
4. [`src/api/overpass.ts`](./src/api/overpass.ts) and [`src/api/osmParser.ts`](./src/api/osmParser.ts)
5. [`src/world/WorldBuilder.tsx`](./src/world/WorldBuilder.tsx)

