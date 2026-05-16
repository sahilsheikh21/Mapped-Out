/**
 * WorldBuilder: Orchestrates all world generation components.
 */

import { Suspense } from 'react';
import BuildingPlacer from './BuildingPlacer';
import RoadGenerator from './RoadGenerator';
import PropPlacer from './PropPlacer';
import GroundPlane from './GroundPlane';

export default function WorldBuilder() {
  return (
    <group name="world">
      <GroundPlane />
      <Suspense fallback={null}>
        <RoadGenerator />
      </Suspense>
      <Suspense fallback={null}>
        <BuildingPlacer />
      </Suspense>
      <Suspense fallback={null}>
        <PropPlacer />
      </Suspense>
    </group>
  );
}
