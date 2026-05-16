/**
 * WorldBuilder: Orchestrates all world generation components.
 */

import { Suspense } from 'react';
import BuildingPlacer from './BuildingPlacer';
import RoadGenerator from './RoadGenerator';
import PropPlacer from './PropPlacer';
import StationPlacer from './StationPlacer';
import GroundPlane from './GroundPlane';

export default function WorldBuilder() {
  return (
    <group name="world">
      <GroundPlane />
      <Suspense fallback={null}>
        <RoadGenerator />
      </Suspense>
      <BuildingPlacer />
      <Suspense fallback={null}>
        <PropPlacer />
        <StationPlacer />
      </Suspense>
    </group>
  );
}
