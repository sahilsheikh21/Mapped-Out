import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useWorldStore } from '../stores/worldStore';
import { selectParkedCar } from './assetMapper';
import { projectToLocal } from '../utils/geo';
import { ASSET_SCALE } from '../utils/constants';
import { seededRandom } from '../utils/math';
import { sampleTerrainHeight } from '../utils/terrain';

const PARKING_ROADS = new Set(['residential', 'living_street', 'tertiary', 'secondary']);
const CAR_SPACING = 20; // Check for a parking spot every 20 meters
const PARKING_CHANCE = 0.25; // 25% chance to spawn a car at a valid spot

function ParkedCarMesh({ position, rotation, modelPath, scale }: { position: [number, number, number]; rotation: [number, number, number]; modelPath: string; scale: number }) {
  const { scene } = useGLTF(modelPath);
  const cloned = useMemo(() => scene.clone(true), [scene]);

  return (
    <primitive
      object={cloned}
      position={position}
      rotation={rotation}
      scale={[scale, scale, scale]}
    />
  );
}

export default function ParkedCarPlacer() {
  const worldData = useWorldStore((s) => s.worldData);
  const refLat = useWorldStore((s) => s.refLat);
  const refLon = useWorldStore((s) => s.refLon);
  const terrainData = useWorldStore((s) => s.terrainData);

  const parkedCars = useMemo(() => {
    if (!worldData) return [];

    const cars: any[] = [];
    let carId = 0;

    for (const road of worldData.roads) {
      if (!road.geometry || road.geometry.length < 2) continue;
      if (!PARKING_ROADS.has(road.roadType)) continue;

      const points = road.geometry.map(pt => projectToLocal(pt.lat, pt.lon, refLat, refLon));

      for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];

        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const segmentLength = Math.hypot(dx, dz);
        
        if (segmentLength < 5) continue; // Too short to park

        const dirX = dx / segmentLength;
        const dirZ = dz / segmentLength;
        
        // Normals for left and right sides of the road
        const normalRightX = -dirZ;
        const normalRightZ = dirX;
        
        const normalLeftX = dirZ;
        const normalLeftZ = -dirX;

        // Offset from center to edge of the road
        const offsetDist = (road.widthMeters / 2) * 0.85;

        // Step along the segment
        for (let dist = 5; dist < segmentLength - 5; dist += CAR_SPACING) {
          const basePathX = p1.x + dirX * dist;
          const basePathZ = p1.z + dirZ * dist;

          // Try right side
          const seedRight = `car-r-${road.id}-${carId}`;
          if (seededRandom(seedRight) < PARKING_CHANCE) {
            const x = basePathX + normalRightX * offsetDist;
            const z = basePathZ + normalRightZ * offsetDist;
            const y = sampleTerrainHeight(x, z, terrainData);
            
            // Vehicles face -Z natively, so atan2 + PI aligns them with the road direction
            const rotY = Math.atan2(dirX, dirZ) + Math.PI; 

            cars.push({
              key: seedRight,
              position: [x, y, z],
              rotation: [0, rotY, 0],
              modelPath: selectParkedCar(seedRight),
              scale: ASSET_SCALE * 0.012, // Match vehicle scale
            });
            carId++;
          }

          // Try left side
          const seedLeft = `car-l-${road.id}-${carId}`;
          if (seededRandom(seedLeft) < PARKING_CHANCE) {
            const x = basePathX + normalLeftX * offsetDist;
            const z = basePathZ + normalLeftZ * offsetDist;
            const y = sampleTerrainHeight(x, z, terrainData);
            
            // Face opposite direction on the left side
            const rotY = Math.atan2(-dirX, -dirZ) + Math.PI; 

            cars.push({
              key: seedLeft,
              position: [x, y, z],
              rotation: [0, rotY, 0],
              modelPath: selectParkedCar(seedLeft),
              scale: ASSET_SCALE * 0.012, 
            });
            carId++;
          }
        }
      }
    }

    return cars;
  }, [worldData, refLat, refLon, terrainData]);

  return (
    <group name="parked-cars">
      {parkedCars.map((car) => (
        <ParkedCarMesh
          key={car.key}
          position={car.position}
          rotation={car.rotation}
          modelPath={car.modelPath}
          scale={car.scale}
        />
      ))}
    </group>
  );
}
