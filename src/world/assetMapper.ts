/**
 * Asset Mapper: Small helpers for non-building Kenney assets that are still in use.
 */

import { seededPick } from '../utils/math';

export const CAR_MODELS = [
  'sedan', 'sedan-sports', 'suv', 'suv-luxury', 'taxi',
  'hatchback-sports', 'van', 'truck', 'police',
];

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
