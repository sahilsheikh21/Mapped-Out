import { useCallback, useEffect, useMemo, useRef } from 'react';
import { projectToLocal } from '../utils/geo';
import { useVehicleStore } from '../stores/vehicleStore';
import { useWorldStore, type OSMBuilding, type OSMRoad, type WorldData } from '../stores/worldStore';

const MAP_PADDING = 14;
const MAX_ROAD_LABELS = 64;
const MAX_BUILDING_LABELS = 48;

interface MapPoint {
  x: number;
  z: number;
}

interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface MapTransform {
  minX: number;
  minZ: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}

interface MiniRoad {
  points: MapPoint[];
  name: string | null;
  widthMeters: number;
  roadType: string;
  labelPoint: MapPoint;
  labelAngle: number;
  lengthMeters: number;
}

interface MiniBuilding {
  points: MapPoint[];
  name: string | null;
  centroid: MapPoint;
  areaMeters: number;
}

interface PreparedMap {
  roads: MiniRoad[];
  buildings: MiniBuilding[];
  bounds: Bounds;
}

function normalizeName(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function sanitizePolygon(points: MapPoint[]): MapPoint[] {
  if (points.length < 3) return [];

  const cleaned = [...points];
  const first = cleaned[0];
  const last = cleaned[cleaned.length - 1];

  if (Math.hypot(first.x - last.x, first.z - last.z) < 0.01) {
    cleaned.pop();
  }

  return cleaned;
}

function polygonArea(points: MapPoint[]): number {
  let signedArea = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    signedArea += current.x * next.z - next.x * current.z;
  }
  return Math.abs(signedArea) * 0.5;
}

function polygonCentroid(points: MapPoint[]): MapPoint {
  let signedDoubleArea = 0;
  let cx = 0;
  let cz = 0;

  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const cross = current.x * next.z - next.x * current.z;
    signedDoubleArea += cross;
    cx += (current.x + next.x) * cross;
    cz += (current.z + next.z) * cross;
  }

  if (Math.abs(signedDoubleArea) < 0.001) {
    const averageX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const averageZ = points.reduce((sum, point) => sum + point.z, 0) / points.length;
    return { x: averageX, z: averageZ };
  }

  return {
    x: cx / (3 * signedDoubleArea),
    z: cz / (3 * signedDoubleArea),
  };
}

function appendPointToBounds(point: MapPoint, bounds: Bounds): Bounds {
  return {
    minX: Math.min(bounds.minX, point.x),
    maxX: Math.max(bounds.maxX, point.x),
    minZ: Math.min(bounds.minZ, point.z),
    maxZ: Math.max(bounds.maxZ, point.z),
  };
}

function buildRoad(road: OSMRoad, refLat: number, refLon: number): MiniRoad | null {
  if (!road.geometry || road.geometry.length < 2) return null;

  const points = road.geometry.map((pt) => projectToLocal(pt.lat, pt.lon, refLat, refLon));
  if (points.length < 2) return null;

  let lengthMeters = 0;
  for (let i = 1; i < points.length; i += 1) {
    lengthMeters += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  }

  const middleIndex = Math.floor(points.length / 2);
  const prev = points[Math.max(0, middleIndex - 1)];
  const next = points[Math.min(points.length - 1, middleIndex + 1)];
  const labelPoint = points[middleIndex];
  const labelAngle = Math.atan2(next.z - prev.z, next.x - prev.x);

  return {
    points,
    name: normalizeName(road.tags?.name),
    widthMeters: road.widthMeters,
    roadType: road.roadType,
    labelPoint,
    labelAngle,
    lengthMeters,
  };
}

function buildBuilding(building: OSMBuilding, refLat: number, refLon: number): MiniBuilding | null {
  if (!building.geometry || building.geometry.length < 3) return null;

  const points = sanitizePolygon(
    building.geometry.map((pt) => projectToLocal(pt.lat, pt.lon, refLat, refLon))
  );
  if (points.length < 3) return null;

  return {
    points,
    name: normalizeName(building.tags?.name),
    centroid: polygonCentroid(points),
    areaMeters: polygonArea(points),
  };
}

function prepareMapData(worldData: WorldData, refLat: number, refLon: number): PreparedMap {
  const roads: MiniRoad[] = [];
  const buildings: MiniBuilding[] = [];
  let bounds: Bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };

  for (const road of worldData.roads) {
    const builtRoad = buildRoad(road, refLat, refLon);
    if (!builtRoad) continue;
    roads.push(builtRoad);
    for (const point of builtRoad.points) {
      bounds = appendPointToBounds(point, bounds);
    }
  }

  for (const building of worldData.buildings) {
    const builtBuilding = buildBuilding(building, refLat, refLon);
    if (!builtBuilding) continue;
    buildings.push(builtBuilding);
    for (const point of builtBuilding.points) {
      bounds = appendPointToBounds(point, bounds);
    }
  }

  if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.minZ)) {
    bounds = { minX: -80, maxX: 80, minZ: -80, maxZ: 80 };
  }

  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  const minimumSpan = 140;
  const halfWidth = Math.max((bounds.maxX - bounds.minX) / 2, minimumSpan / 2);
  const halfDepth = Math.max((bounds.maxZ - bounds.minZ) / 2, minimumSpan / 2);
  const worldPadding = 24;

  return {
    roads,
    buildings,
    bounds: {
      minX: centerX - halfWidth - worldPadding,
      maxX: centerX + halfWidth + worldPadding,
      minZ: centerZ - halfDepth - worldPadding,
      maxZ: centerZ + halfDepth + worldPadding,
    },
  };
}

function createTransform(width: number, height: number, bounds: Bounds): MapTransform {
  const drawWidth = Math.max(1, width - MAP_PADDING * 2);
  const drawHeight = Math.max(1, height - MAP_PADDING * 2);
  const worldWidth = Math.max(1, bounds.maxX - bounds.minX);
  const worldHeight = Math.max(1, bounds.maxZ - bounds.minZ);

  const scale = Math.min(drawWidth / worldWidth, drawHeight / worldHeight);
  const fittedWidth = worldWidth * scale;
  const fittedHeight = worldHeight * scale;

  return {
    minX: bounds.minX,
    minZ: bounds.minZ,
    scale,
    offsetX: (width - fittedWidth) / 2,
    offsetY: (height - fittedHeight) / 2,
  };
}

function toCanvas(point: MapPoint, transform: MapTransform): { x: number; y: number } {
  return {
    x: transform.offsetX + (point.x - transform.minX) * transform.scale,
    y: transform.offsetY + (point.z - transform.minZ) * transform.scale,
  };
}

function roadColor(roadType: string): string {
  switch (roadType) {
    case 'motorway':
    case 'trunk':
      return '#7d8691';
    case 'primary':
    case 'secondary':
      return '#8d96a1';
    case 'tertiary':
    case 'residential':
    case 'living_street':
      return '#a3acb8';
    case 'service':
      return '#7a838f';
    case 'footway':
    case 'path':
    case 'pedestrian':
    case 'cycleway':
      return '#697482';
    default:
      return '#8f98a5';
  }
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.arcTo(x + width, y, x + width, y + r, r);
  ctx.lineTo(x + width, y + height - r);
  ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
  ctx.lineTo(x + r, y + height);
  ctx.arcTo(x, y + height, x, y + height - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function intersectsBox(
  candidate: { x: number; y: number; w: number; h: number },
  occupied: { x: number; y: number; w: number; h: number }[]
): boolean {
  for (const box of occupied) {
    const overlapX = candidate.x < box.x + box.w && candidate.x + candidate.w > box.x;
    const overlapY = candidate.y < box.y + box.h && candidate.y + candidate.h > box.y;
    if (overlapX && overlapY) return true;
  }
  return false;
}

function drawStaticLayer(
  ctx: CanvasRenderingContext2D,
  prepared: PreparedMap,
  transform: MapTransform,
  width: number,
  height: number
) {
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = '#0e141d';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(182, 197, 214, 0.08)';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i += 1) {
    const x = (width * i) / 4;
    const y = (height * i) / 4;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.fillStyle = '#2e3742';
  ctx.strokeStyle = '#556272';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1;

  for (const building of prepared.buildings) {
    if (building.points.length < 3) continue;
    ctx.beginPath();
    for (let i = 0; i < building.points.length; i += 1) {
      const p = toCanvas(building.points[i], transform);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const road of prepared.roads) {
    if (road.points.length < 2) continue;
    ctx.beginPath();
    for (let i = 0; i < road.points.length; i += 1) {
      const p = toCanvas(road.points[i], transform);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = roadColor(road.roadType);
    ctx.lineWidth = Math.max(1.1, Math.min(4.2, road.widthMeters * transform.scale * 0.12));
    ctx.stroke();
  }

  const occupiedLabels: { x: number; y: number; w: number; h: number }[] = [];

  const roadLabels = prepared.roads
    .filter((road) => road.name)
    .sort((a, b) => b.lengthMeters - a.lengthMeters)
    .slice(0, MAX_ROAD_LABELS);

  ctx.font = '600 9px Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const road of roadLabels) {
    const label = road.name;
    if (!label) continue;
    const pivot = toCanvas(road.labelPoint, transform);
    const textWidth = ctx.measureText(label).width;
    const box = { x: pivot.x - (textWidth + 8) / 2, y: pivot.y - 6, w: textWidth + 8, h: 12 };
    if (intersectsBox(box, occupiedLabels)) continue;

    occupiedLabels.push(box);

    let angle = road.labelAngle;
    if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI;

    ctx.save();
    ctx.translate(pivot.x, pivot.y);
    ctx.rotate(angle);
    drawRoundedRect(ctx, -(textWidth + 8) / 2, -6, textWidth + 8, 12, 4);
    ctx.fillStyle = 'rgba(9, 15, 22, 0.72)';
    ctx.fill();
    ctx.fillStyle = '#f3f7fb';
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }

  const buildingLabels = prepared.buildings
    .filter((building) => building.name)
    .sort((a, b) => b.areaMeters - a.areaMeters)
    .slice(0, MAX_BUILDING_LABELS);

  ctx.font = '600 10px Outfit, sans-serif';
  ctx.fillStyle = '#d2d9e2';

  for (const building of buildingLabels) {
    const label = building.name;
    if (!label) continue;

    const p = toCanvas(building.centroid, transform);
    const textWidth = ctx.measureText(label).width;
    const box = { x: p.x - (textWidth + 8) / 2, y: p.y - 7, w: textWidth + 8, h: 14 };
    if (intersectsBox(box, occupiedLabels)) continue;

    occupiedLabels.push(box);
    drawRoundedRect(ctx, box.x, box.y, box.w, box.h, 4);
    ctx.fillStyle = 'rgba(15, 24, 34, 0.82)';
    ctx.fill();
    ctx.fillStyle = '#d2d9e2';
    ctx.fillText(label, p.x, p.y + 0.5);
  }

  ctx.font = '700 10px Outfit, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.textAlign = 'right';
  ctx.fillText('N', width - 10, 12);
}

function drawVehicleMarker(
  ctx: CanvasRenderingContext2D,
  transform: MapTransform,
  position: [number, number, number],
  rotation: [number, number, number, number],
  width: number,
  height: number
) {
  const projected = toCanvas({ x: position[0], z: position[2] }, transform);
  const margin = 8;

  const markerX = Math.min(width - margin, Math.max(margin, projected.x));
  const markerY = Math.min(height - margin, Math.max(margin, projected.y));

  const [qx, qy, qz, qw] = rotation;
  const yaw = Math.atan2(2 * (qw * qy + qx * qz), 1 - 2 * (qy * qy + qz * qz));
  const headingX = Math.sin(yaw);
  const headingY = -Math.cos(yaw);

  ctx.beginPath();
  ctx.arc(markerX, markerY, 4.2, 0, Math.PI * 2);
  ctx.fillStyle = '#00d68f';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#07130f';
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(markerX, markerY);
  ctx.lineTo(markerX + headingX * 11, markerY + headingY * 11);
  ctx.strokeStyle = '#7ef9c8';
  ctx.lineWidth = 2;
  ctx.stroke();
}

export default function MiniMap() {
  const worldData = useWorldStore((s) => s.worldData);
  const refLat = useWorldStore((s) => s.refLat);
  const refLon = useWorldStore((s) => s.refLon);
  const vehiclePosition = useVehicleStore((s) => s.position);
  const vehicleRotation = useVehicleStore((s) => s.rotation);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const staticLayerRef = useRef<HTMLCanvasElement | null>(null);
  const transformRef = useRef<MapTransform | null>(null);
  const livePositionRef = useRef(vehiclePosition);
  const liveRotationRef = useRef(vehicleRotation);

  const prepared = useMemo(() => {
    if (!worldData) return null;
    return prepareMapData(worldData, refLat, refLon);
  }, [worldData, refLat, refLon]);

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const staticLayer = staticLayerRef.current;
    const transform = transformRef.current;
    if (!canvas || !transform) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (staticLayer) {
      ctx.drawImage(staticLayer, 0, 0);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#0e141d';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    drawVehicleMarker(
      ctx,
      transform,
      livePositionRef.current,
      liveRotationRef.current,
      canvas.width,
      canvas.height
    );
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !prepared) return;

    const rebuildMap = () => {
      const width = Math.max(120, Math.floor(canvas.clientWidth || 220));
      const height = Math.max(120, Math.floor(canvas.clientHeight || 220));
      canvas.width = width;
      canvas.height = height;

      const staticCanvas = document.createElement('canvas');
      staticCanvas.width = width;
      staticCanvas.height = height;

      const staticCtx = staticCanvas.getContext('2d');
      if (!staticCtx) return;

      const transform = createTransform(width, height, prepared.bounds);
      drawStaticLayer(staticCtx, prepared, transform, width, height);
      staticLayerRef.current = staticCanvas;
      transformRef.current = transform;
      drawFrame();
    };

    rebuildMap();
    window.addEventListener('resize', rebuildMap);
    return () => window.removeEventListener('resize', rebuildMap);
  }, [drawFrame, prepared]);

  useEffect(() => {
    livePositionRef.current = vehiclePosition;
    liveRotationRef.current = vehicleRotation;
    drawFrame();
  }, [drawFrame, vehiclePosition, vehicleRotation]);

  if (!prepared) return null;

  return (
    <div className="hud-minimap" aria-label="Minimap">
      <canvas ref={canvasRef} className="hud-minimap-canvas" />
    </div>
  );
}
