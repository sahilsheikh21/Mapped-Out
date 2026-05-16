/**
 * StationPlacer: Renders transit stations (metro, bus, etc.) as visual markers.
 */

import { useMemo } from 'react';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { useWorldStore } from '../stores/worldStore';
import { projectToLocal } from '../utils/geo';
import { Train, Bus } from 'lucide-react';

function StationMarker({ station }: { station: any }) {
  const isBus = station.tags.highway === 'bus_stop' || station.tags.amenity === 'bus_station';
  const name = station.tags.name || (isBus ? 'Bus Stop' : 'Station');
  
  // Icon placeholder character (or just text)
  const icon = isBus ? '🚌' : '🚇';

  return (
    <group position={station.position}>
      {/* Visual Marker (Translucent Pillar) */}
      <mesh position={[0, 1.5, 0]}>
        <cylinderGeometry args={[0.5, 0.5, 3, 8]} />
        <meshStandardMaterial 
          color={isBus ? "#3b82f6" : "#ef4444"} 
          transparent 
          opacity={0.6} 
          emissive={isBus ? "#3b82f6" : "#ef4444"}
          emissiveIntensity={0.5}
        />
      </mesh>
      
      {/* Label */}
      <Billboard position={[0, 4, 0]}>
        <group>
           <Text
            fontSize={1.2}
            color="#ffffff"
            anchorX="center"
            anchorY="bottom"
            outlineWidth={0.1}
            outlineColor="#000000"
          >
            {icon}
          </Text>
          <Text
            position={[0, -0.8, 0]}
            fontSize={0.8}
            color="#ffffff"
            anchorX="center"
            anchorY="top"
            outlineWidth={0.08}
            outlineColor="#000000"
            maxWidth={5}
            textAlign="center"
          >
            {name}
          </Text>
        </group>
      </Billboard>
    </group>
  );
}

export default function StationPlacer() {
  const worldData = useWorldStore((s) => s.worldData);
  const refLat = useWorldStore((s) => s.refLat);
  const refLon = useWorldStore((s) => s.refLon);

  const stations = useMemo(() => {
    if (!worldData || !worldData.transitStations) return [];

    return worldData.transitStations.map((station) => {
      let lat = station.lat;
      let lon = station.lon;

      if (lat === undefined && station.geometry && station.geometry.length > 0) {
        lat = station.geometry[0].lat;
        lon = station.geometry[0].lon;
      }

      if (lat === undefined || lon === undefined) return null;

      const { x, z } = projectToLocal(lat, lon, refLat, refLon);
      return {
        ...station,
        position: [x, 0, z] as [number, number, number],
      };
    }).filter(Boolean);
  }, [worldData, refLat, refLon]);

  return (
    <group name="stations">
      {stations.map((station: any) => (
        <StationMarker key={`station-${station.id}`} station={station} />
      ))}
    </group>
  );
}
