import * as THREE from 'three';
import type { TerrainData } from '../stores/worldStore';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function sampleTerrainHeight(
  x: number,
  z: number,
  terrain: TerrainData | null
): number {
  if (!terrain) return 0;

  const width = terrain.maxX - terrain.minX;
  const depth = terrain.maxZ - terrain.minZ;
  if (width <= 0 || depth <= 0) return 0;

  const u = clamp01((x - terrain.minX) / width);
  const v = clamp01((z - terrain.minZ) / depth);

  const gridX = u * (terrain.cols - 1);
  const gridZ = v * (terrain.rows - 1);

  const x0 = Math.floor(gridX);
  const z0 = Math.floor(gridZ);
  const x1 = Math.min(x0 + 1, terrain.cols - 1);
  const z1 = Math.min(z0 + 1, terrain.rows - 1);

  const tx = gridX - x0;
  const tz = gridZ - z0;

  const h00 = terrain.heights[z0 * terrain.cols + x0] ?? 0;
  const h10 = terrain.heights[z0 * terrain.cols + x1] ?? 0;
  const h01 = terrain.heights[z1 * terrain.cols + x0] ?? 0;
  const h11 = terrain.heights[z1 * terrain.cols + x1] ?? 0;

  const hx0 = h00 + (h10 - h00) * tx;
  const hx1 = h01 + (h11 - h01) * tx;
  return hx0 + (hx1 - hx0) * tz;
}

export function createTerrainGeometry(terrain: TerrainData): THREE.BufferGeometry {
  const { rows, cols, heights, minX, maxX, minZ, maxZ } = terrain;

  const vertexCount = rows * cols;
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array((rows - 1) * (cols - 1) * 6);

  const width = maxX - minX;
  const depth = maxZ - minZ;

  let vertexIndex = 0;
  for (let row = 0; row < rows; row++) {
    const v = row / (rows - 1);
    const z = minZ + depth * v;

    for (let col = 0; col < cols; col++) {
      const u = col / (cols - 1);
      const x = minX + width * u;
      const y = heights[row * cols + col] ?? 0;

      positions[vertexIndex * 3] = x;
      positions[vertexIndex * 3 + 1] = y;
      positions[vertexIndex * 3 + 2] = z;

      uvs[vertexIndex * 2] = u;
      uvs[vertexIndex * 2 + 1] = v;

      vertexIndex++;
    }
  }

  let index = 0;
  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols - 1; col++) {
      const a = row * cols + col;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;

      // Counter-clockwise winding looking from above.
      indices[index++] = a;
      indices[index++] = c;
      indices[index++] = b;
      indices[index++] = b;
      indices[index++] = c;
      indices[index++] = d;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}
