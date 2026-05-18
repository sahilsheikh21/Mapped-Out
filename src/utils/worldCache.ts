import { openDB } from 'idb';
import type { TerrainData, WorldData } from '../stores/worldStore';

const DB_NAME = 'mapped-out-cache';
const DB_VERSION = 1;
const STORE_NAME = 'world-areas';
const CACHE_SCHEMA_VERSION = 1;
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

interface CachedWorldRecord {
  key: string;
  schemaVersion: number;
  createdAt: number;
  expiresAt: number;
  worldData: WorldData;
  terrainData: TerrainData | null;
}

function roundCoord(value: number): string {
  return value.toFixed(5);
}

function buildBBoxKey(bbox: [number, number, number, number]): string {
  const [south, west, north, east] = bbox;
  return `${roundCoord(south)}|${roundCoord(west)}|${roundCoord(north)}|${roundCoord(east)}`;
}

async function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    },
  });
}

export async function getCachedWorldForBBox(
  bbox: [number, number, number, number]
): Promise<{ worldData: WorldData; terrainData: TerrainData | null } | null> {
  try {
    const db = await getDb();
    const key = buildBBoxKey(bbox);
    const record = (await db.get(STORE_NAME, key)) as CachedWorldRecord | undefined;
    if (!record) return null;

    if (record.schemaVersion !== CACHE_SCHEMA_VERSION || Date.now() > record.expiresAt) {
      await db.delete(STORE_NAME, key);
      return null;
    }

    return {
      worldData: record.worldData,
      terrainData: record.terrainData ?? null,
    };
  } catch (error) {
    console.warn('Cache read failed:', error);
    return null;
  }
}

export async function setCachedWorldForBBox(
  bbox: [number, number, number, number],
  worldData: WorldData,
  terrainData: TerrainData | null
): Promise<void> {
  try {
    const db = await getDb();
    const key = buildBBoxKey(bbox);
    const now = Date.now();

    const record: CachedWorldRecord = {
      key,
      schemaVersion: CACHE_SCHEMA_VERSION,
      createdAt: now,
      expiresAt: now + CACHE_TTL_MS,
      worldData,
      terrainData,
    };

    await db.put(STORE_NAME, record);
  } catch (error) {
    console.warn('Cache write failed:', error);
  }
}
