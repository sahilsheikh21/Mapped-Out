/**
 * App: Root component routing between LocationPicker, Loading, and Game phases.
 */

import { useGameStore } from './stores/gameStore';
import LocationPicker from './ui/LocationPicker';
import LoadingScreen from './ui/LoadingScreen';
import GameScene from './scene/GameScene';
import HUD from './ui/HUD';

export default function App() {
  const phase = useGameStore((s) => s.phase);

  return (
    <div className="app">
      {phase === 'location-picker' && <LocationPicker />}
      {phase === 'loading' && <LoadingScreen />}
      {phase === 'playing' && (
        <>
          <GameScene />
          <HUD />
        </>
      )}
    </div>
  );
}
