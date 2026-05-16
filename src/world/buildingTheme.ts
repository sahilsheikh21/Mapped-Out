import * as THREE from 'three';
import type { TimeOfDay } from '../stores/gameStore';
import { seededRandom } from '../utils/math';

export type FacadeVariant =
  | 'house'
  | 'garage'
  | 'apartment'
  | 'commercial'
  | 'office'
  | 'tower'
  | 'industrial'
  | 'civic';

export interface BuildingFootprintMetrics {
  width: number;
  depth: number;
  area: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface RooftopDetail {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
}

export interface BuildingVisualStyle {
  facadeVariant: FacadeVariant;
  wallColor: string;
  roofColor: string;
  wallRoughness: number;
  wallMetalness: number;
  roofRoughness: number;
  roofMetalness: number;
  roofHeight: number;
  windowGlowColor: string;
  rooftopDetails: RooftopDetail[];
}

interface FacadeTextureSet {
  albedo: THREE.CanvasTexture;
  emissive: THREE.CanvasTexture;
}

interface FacadeConfig {
  repeatX: number;
  repeatY: number;
  paint: (albedo: CanvasRenderingContext2D, emissive: CanvasRenderingContext2D, size: number) => void;
}

const facadeTextureCache = new Map<FacadeVariant, FacadeTextureSet>();

const WALL_PALETTES: Record<FacadeVariant, string[]> = {
  house: ['#d8c2ab', '#d6d0c6', '#c5d0bb', '#d8d7d2', '#cdb6a4'],
  garage: ['#d6d2c9', '#c3c0b8', '#cdc6bb'],
  apartment: ['#cdbfaa', '#c6cbd1', '#d3c8b9', '#bfc4bf'],
  commercial: ['#d8d4cf', '#c8d0d7', '#cfc8c2', '#d8d3c5'],
  office: ['#bcc6cf', '#c8d0d8', '#d7dce2'],
  tower: ['#c0cad3', '#c9d3dc', '#d7dde5'],
  industrial: ['#bcc0bf', '#c9c5bb', '#b7bab7'],
  civic: ['#d7cfbf', '#d8d5cd', '#cac6bd'],
};

const ROOF_PALETTES: Record<FacadeVariant, string[]> = {
  house: ['#684f43', '#5a5f69', '#7a5c45'],
  garage: ['#6f7278', '#6e6358'],
  apartment: ['#636870', '#7a6f67'],
  commercial: ['#5d646d', '#6b7076'],
  office: ['#56606a', '#67727c'],
  tower: ['#55616b', '#626f79'],
  industrial: ['#707066', '#5f6663'],
  civic: ['#6a6058', '#5f636c'],
};

const WINDOW_GLOW_COLORS: Record<FacadeVariant, string> = {
  house: '#ffd9a8',
  garage: '#ffe3b8',
  apartment: '#ffe0b1',
  commercial: '#d7f0ff',
  office: '#c4ebff',
  tower: '#b9e3ff',
  industrial: '#ffd7a4',
  civic: '#ffe4ba',
};

const ROOFTOP_COLORS = ['#747b84', '#5f666f', '#8b8176'];

const FACADE_CONFIGS: Record<FacadeVariant, FacadeConfig> = {
  house: {
    repeatX: 0.16,
    repeatY: 0.18,
    paint: (albedo, emissive, size) => {
      drawSiding(albedo, size, 22, 'rgba(0,0,0,0.05)');
      drawWindowGrid(albedo, emissive, {
        cols: 2,
        rows: 3,
        marginX: 28,
        marginTop: 24,
        windowWidth: 28,
        windowHeight: 38,
        gapX: 38,
        gapY: 28,
        frameColor: '#f4f1ea',
        windowColor: '#56657d',
      });
    },
  },
  garage: {
    repeatX: 0.14,
    repeatY: 0.14,
    paint: (albedo, emissive, size) => {
      drawSiding(albedo, size, 20, 'rgba(0,0,0,0.04)');
      albedo.fillStyle = '#c1c3c8';
      albedo.fillRect(44, 116, 168, 92);
      albedo.strokeStyle = 'rgba(0,0,0,0.1)';
      for (let y = 130; y < 200; y += 14) {
        albedo.beginPath();
        albedo.moveTo(50, y);
        albedo.lineTo(206, y);
        albedo.stroke();
      }
      drawSingleWindow(albedo, emissive, 96, 48, 64, 32);
    },
  },
  apartment: {
    repeatX: 0.18,
    repeatY: 0.22,
    paint: (albedo, emissive, size) => {
      drawHorizontalBands(albedo, size, 56, 'rgba(0,0,0,0.05)');
      drawWindowGrid(albedo, emissive, {
        cols: 4,
        rows: 4,
        marginX: 18,
        marginTop: 18,
        windowWidth: 24,
        windowHeight: 34,
        gapX: 18,
        gapY: 18,
        frameColor: '#f3efe7',
        windowColor: '#58647a',
      });
    },
  },
  commercial: {
    repeatX: 0.12,
    repeatY: 0.16,
    paint: (albedo, emissive, size) => {
      drawHorizontalBands(albedo, size, 48, 'rgba(0,0,0,0.07)');
      drawWindowGrid(albedo, emissive, {
        cols: 3,
        rows: 4,
        marginX: 20,
        marginTop: 18,
        windowWidth: 46,
        windowHeight: 32,
        gapX: 18,
        gapY: 18,
        frameColor: '#dbe6ee',
        windowColor: '#53708a',
      });
    },
  },
  office: {
    repeatX: 0.1,
    repeatY: 0.18,
    paint: (albedo, emissive, size) => {
      drawVerticalBands(albedo, size, 42, 'rgba(0,0,0,0.05)');
      drawWindowGrid(albedo, emissive, {
        cols: 4,
        rows: 5,
        marginX: 16,
        marginTop: 14,
        windowWidth: 32,
        windowHeight: 30,
        gapX: 12,
        gapY: 14,
        frameColor: '#d8e5ef',
        windowColor: '#4f6982',
      });
    },
  },
  tower: {
    repeatX: 0.09,
    repeatY: 0.2,
    paint: (albedo, emissive, size) => {
      drawVerticalBands(albedo, size, 28, 'rgba(0,0,0,0.06)');
      drawWindowGrid(albedo, emissive, {
        cols: 5,
        rows: 6,
        marginX: 12,
        marginTop: 12,
        windowWidth: 26,
        windowHeight: 24,
        gapX: 10,
        gapY: 10,
        frameColor: '#d5e1eb',
        windowColor: '#4d6680',
      });
    },
  },
  industrial: {
    repeatX: 0.11,
    repeatY: 0.12,
    paint: (albedo, emissive, size) => {
      drawVerticalBands(albedo, size, 30, 'rgba(0,0,0,0.07)');
      drawHorizontalBands(albedo, size, 64, 'rgba(0,0,0,0.05)');
      drawWindowGrid(albedo, emissive, {
        cols: 3,
        rows: 2,
        marginX: 20,
        marginTop: 24,
        windowWidth: 54,
        windowHeight: 24,
        gapX: 16,
        gapY: 24,
        frameColor: '#e6e3da',
        windowColor: '#64737f',
      });
    },
  },
  civic: {
    repeatX: 0.13,
    repeatY: 0.18,
    paint: (albedo, emissive, size) => {
      drawHorizontalBands(albedo, size, 52, 'rgba(0,0,0,0.05)');
      drawWindowGrid(albedo, emissive, {
        cols: 3,
        rows: 4,
        marginX: 26,
        marginTop: 12,
        windowWidth: 30,
        windowHeight: 42,
        gapX: 22,
        gapY: 14,
        frameColor: '#f2ecdf',
        windowColor: '#677288',
      });
    },
  },
};

interface WindowGridOptions {
  cols: number;
  rows: number;
  marginX: number;
  marginTop: number;
  windowWidth: number;
  windowHeight: number;
  gapX: number;
  gapY: number;
  frameColor: string;
  windowColor: string;
}

function drawWindowGrid(
  albedo: CanvasRenderingContext2D,
  emissive: CanvasRenderingContext2D,
  options: WindowGridOptions
) {
  const {
    cols,
    rows,
    marginX,
    marginTop,
    windowWidth,
    windowHeight,
    gapX,
    gapY,
    frameColor,
    windowColor,
  } = options;

  emissive.fillStyle = '#000000';
  emissive.fillRect(0, 0, emissive.canvas.width, emissive.canvas.height);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = marginX + col * (windowWidth + gapX);
      const y = marginTop + row * (windowHeight + gapY);
      drawSingleWindow(albedo, emissive, x, y, windowWidth, windowHeight, frameColor, windowColor);
    }
  }
}

function drawSingleWindow(
  albedo: CanvasRenderingContext2D,
  emissive: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  frameColor = '#f2f1ee',
  windowColor = '#5b6a7a'
) {
  albedo.fillStyle = frameColor;
  albedo.fillRect(x - 4, y - 4, width + 8, height + 8);
  albedo.fillStyle = windowColor;
  albedo.fillRect(x, y, width, height);
  albedo.strokeStyle = 'rgba(255,255,255,0.18)';
  albedo.lineWidth = 2;
  albedo.beginPath();
  albedo.moveTo(x + width / 2, y + 2);
  albedo.lineTo(x + width / 2, y + height - 2);
  albedo.moveTo(x + 2, y + height / 2);
  albedo.lineTo(x + width - 2, y + height / 2);
  albedo.stroke();

  emissive.fillStyle = '#ffffff';
  emissive.fillRect(x + 2, y + 2, width - 4, height - 4);
}

function drawSiding(context: CanvasRenderingContext2D, size: number, spacing: number, color: string) {
  context.strokeStyle = color;
  context.lineWidth = 2;
  for (let y = 0; y < size; y += spacing) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(size, y);
    context.stroke();
  }
}

function drawHorizontalBands(context: CanvasRenderingContext2D, size: number, spacing: number, color: string) {
  context.strokeStyle = color;
  context.lineWidth = 8;
  for (let y = spacing / 2; y < size; y += spacing) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(size, y);
    context.stroke();
  }
}

function drawVerticalBands(context: CanvasRenderingContext2D, size: number, spacing: number, color: string) {
  context.strokeStyle = color;
  context.lineWidth = 5;
  for (let x = spacing / 2; x < size; x += spacing) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, size);
    context.stroke();
  }
}

function pickFromPalette(seed: string, palette: string[]): string {
  const index = Math.floor(seededRandom(seed) * palette.length) % palette.length;
  return palette[index];
}

function getFacadeVariant(buildingType: string, levels: number, heightMeters: number): FacadeVariant {
  if (buildingType === 'garage') return 'garage';
  if (buildingType === 'industrial') return 'industrial';
  if (buildingType === 'office') return levels >= 10 || heightMeters >= 34 ? 'tower' : 'office';
  if (buildingType === 'commercial') return levels >= 7 || heightMeters >= 28 ? 'office' : 'commercial';
  if (buildingType === 'apartments') return levels >= 10 || heightMeters >= 32 ? 'tower' : 'apartment';
  if (['institutional', 'medical', 'religious'].includes(buildingType)) return 'civic';
  if (buildingType === 'residential') return levels >= 4 || heightMeters >= 14 ? 'apartment' : 'house';
  return levels >= 6 ? 'commercial' : 'house';
}

function getRoofHeight(variant: FacadeVariant, totalHeight: number): number {
  const baseHeight = {
    house: 0.85,
    garage: 0.35,
    apartment: 0.55,
    commercial: 0.5,
    office: 0.6,
    tower: 0.75,
    industrial: 0.45,
    civic: 0.7,
  }[variant];

  return Math.min(baseHeight, Math.max(0.25, totalHeight * 0.12));
}

function createRooftopDetails(
  variant: FacadeVariant,
  footprint: BuildingFootprintMetrics,
  wallHeight: number,
  roofHeight: number,
  seed: string
): RooftopDetail[] {
  const details: RooftopDetail[] = [];
  const roofTop = wallHeight + roofHeight;

  if (['commercial', 'office', 'tower', 'industrial'].includes(variant) && footprint.area > 160) {
    const count = 1 + Math.floor(seededRandom(`${seed}-units`) * 3);
    for (let index = 0; index < count; index += 1) {
      const sizeX = Math.max(1.6, footprint.width * (0.12 + seededRandom(`${seed}-sx-${index}`) * 0.1));
      const sizeZ = Math.max(1.4, footprint.depth * (0.1 + seededRandom(`${seed}-sz-${index}`) * 0.09));
      const sizeY = 0.6 + seededRandom(`${seed}-sy-${index}`) * 1.2;
      const offsetX = (seededRandom(`${seed}-ox-${index}`) - 0.5) * footprint.width * 0.35;
      const offsetZ = (seededRandom(`${seed}-oz-${index}`) - 0.5) * footprint.depth * 0.35;

      details.push({
        position: [offsetX, roofTop + sizeY / 2, offsetZ],
        size: [sizeX, sizeY, sizeZ],
        color: pickFromPalette(`${seed}-roof-${index}`, ROOFTOP_COLORS),
      });
    }
  } else if (variant === 'house' && footprint.area > 35) {
    details.push({
      position: [footprint.width * 0.18, roofTop + 0.45, -footprint.depth * 0.14],
      size: [0.55, 0.9, 0.55],
      color: '#8f7667',
    });
  }

  return details;
}

export function getFacadeTextures(variant: FacadeVariant): FacadeTextureSet {
  const cached = facadeTextureCache.get(variant);
  if (cached) return cached;

  const size = 256;
  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const albedoContext = albedoCanvas.getContext('2d');

  const emissiveCanvas = document.createElement('canvas');
  emissiveCanvas.width = size;
  emissiveCanvas.height = size;
  const emissiveContext = emissiveCanvas.getContext('2d');

  if (!albedoContext || !emissiveContext) {
    throw new Error('Unable to create building facade textures.');
  }

  albedoContext.fillStyle = '#ffffff';
  albedoContext.fillRect(0, 0, size, size);
  emissiveContext.fillStyle = '#000000';
  emissiveContext.fillRect(0, 0, size, size);

  FACADE_CONFIGS[variant].paint(albedoContext, emissiveContext, size);

  const albedo = new THREE.CanvasTexture(albedoCanvas);
  const emissive = new THREE.CanvasTexture(emissiveCanvas);

  for (const texture of [albedo, emissive]) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(FACADE_CONFIGS[variant].repeatX, FACADE_CONFIGS[variant].repeatY);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
  }

  const textures = { albedo, emissive };
  facadeTextureCache.set(variant, textures);
  return textures;
}

export function getWindowGlowIntensity(timeOfDay: TimeOfDay, variant: FacadeVariant): number {
  if (timeOfDay === 'night') {
    if (variant === 'garage') return 0.4;
    if (variant === 'industrial') return 0.55;
    if (variant === 'tower' || variant === 'office') return 0.75;
    return 0.68;
  }

  if (timeOfDay === 'sunset') {
    if (variant === 'tower' || variant === 'office') return 0.3;
    return 0.2;
  }

  return 0.05;
}

export function getBuildingStyle(
  buildingType: string,
  levels: number,
  heightMeters: number,
  footprint: BuildingFootprintMetrics,
  seed: string
): BuildingVisualStyle {
  const facadeVariant = getFacadeVariant(buildingType, levels, heightMeters);
  const roofHeight = getRoofHeight(facadeVariant, heightMeters);
  const wallHeight = Math.max(1.4, heightMeters - roofHeight);

  return {
    facadeVariant,
    wallColor: pickFromPalette(`${seed}-wall`, WALL_PALETTES[facadeVariant]),
    roofColor: pickFromPalette(`${seed}-roof`, ROOF_PALETTES[facadeVariant]),
    wallRoughness: facadeVariant === 'office' || facadeVariant === 'tower' ? 0.48 : 0.68,
    wallMetalness: facadeVariant === 'office' || facadeVariant === 'tower' ? 0.14 : 0.04,
    roofRoughness: 0.82,
    roofMetalness: facadeVariant === 'industrial' ? 0.18 : 0.06,
    roofHeight,
    windowGlowColor: WINDOW_GLOW_COLORS[facadeVariant],
    rooftopDetails: createRooftopDetails(facadeVariant, footprint, wallHeight, roofHeight, seed),
  };
}
