/**
 * LocationPicker: map-based location selection with optional custom box mode.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Rectangle, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { geocodeAddress } from '../api/nominatim';
import { useGameStore } from '../stores/gameStore';
import { Search, MapPin, Navigation, Loader2, ChevronRight, Square } from 'lucide-react';
import { haversineDistance } from '../utils/geo';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

function MapInteractionHandler({
  onMapClick,
  onMapMove,
}: {
  onMapClick: (lat: number, lon: number) => void;
  onMapMove: (lat: number, lon: number) => void;
}) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
    mousemove(e) {
      onMapMove(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FlyToLocation({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lon], 16, { duration: 1.5 });
  }, [lat, lon, map]);
  return null;
}

export default function LocationPicker() {
  const setLocation = useGameStore((s) => s.setLocation);
  const setPhase = useGameStore((s) => s.setPhase);
  const selectionMode = useGameStore((s) => s.selectionMode);
  const setSelectionMode = useGameStore((s) => s.setSelectionMode);
  const customBBox = useGameStore((s) => s.customBBox);
  const setCustomBBox = useGameStore((s) => s.setCustomBBox);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedPos, setSelectedPos] = useState<{ lat: number; lon: number } | null>(null);
  const [locationName, setLocationName] = useState('');
  const [isLocating, setIsLocating] = useState(false);

  const [boxStart, setBoxStart] = useState<{ lat: number; lon: number } | null>(null);
  const [boxEnd, setBoxEnd] = useState<{ lat: number; lon: number } | null>(null);
  const [boxPreview, setBoxPreview] = useState<{ lat: number; lon: number } | null>(null);

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resolveBBox = (a: { lat: number; lon: number }, b: { lat: number; lon: number }): [number, number, number, number] => {
    const south = Math.min(a.lat, b.lat);
    const north = Math.max(a.lat, b.lat);
    const west = Math.min(a.lon, b.lon);
    const east = Math.max(a.lon, b.lon);
    return [south, west, north, east];
  };

  const currentBoxBounds = (() => {
    const end = boxEnd ?? boxPreview;
    if (!boxStart || !end) return null;
    const [south, west, north, east] = resolveBBox(boxStart, end);
    return [[south, west], [north, east]] as [[number, number], [number, number]];
  })();

  const handleSearch = useCallback(async (query: string) => {
    if (query.length < 3) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const results = await geocodeAddress(query);
      setSearchResults(results);
    } catch (err) {
      console.error('Search failed:', err);
    }
    setIsSearching(false);
  }, []);

  const handleSearchInput = (value: string) => {
    setSearchQuery(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => handleSearch(value), 500);
  };

  const clearBoxDraft = () => {
    setBoxStart(null);
    setBoxEnd(null);
    setBoxPreview(null);
    setCustomBBox(null);
  };

  const handleSelectResult = (result: any) => {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    clearBoxDraft();
    setSelectedPos({ lat, lon });
    setLocationName(result.display_name.split(',').slice(0, 3).join(', '));
    setSearchResults([]);
    setSearchQuery(result.display_name.split(',')[0]);
  };

  const handleMapClick = (lat: number, lon: number) => {
    if (selectionMode === 'box') {
      if (!boxStart || boxEnd) {
        setBoxStart({ lat, lon });
        setBoxEnd(null);
        setBoxPreview(null);
        setCustomBBox(null);
        setSelectedPos({ lat, lon });
        setLocationName('Box start selected. Click opposite corner.');
        return;
      }

      const end = { lat, lon };
      const bbox = resolveBBox(boxStart, end);
      const centerLat = (bbox[0] + bbox[2]) / 2;
      const centerLon = (bbox[1] + bbox[3]) / 2;

      const widthKm = haversineDistance(bbox[0], bbox[1], bbox[0], bbox[3]) / 1000;
      const heightKm = haversineDistance(bbox[0], bbox[1], bbox[2], bbox[1]) / 1000;

      setBoxEnd(end);
      setBoxPreview(null);
      setCustomBBox(bbox);
      setSelectedPos({ lat: centerLat, lon: centerLon });
      setLocationName(`Custom Box ${widthKm.toFixed(2)} × ${heightKm.toFixed(2)} km`);
      return;
    }

    clearBoxDraft();
    setSelectedPos({ lat, lon });
    setLocationName(`${lat.toFixed(4)}°, ${lon.toFixed(4)}°`);
  };

  const handleMapMove = (lat: number, lon: number) => {
    if (selectionMode !== 'box') return;
    if (!boxStart || boxEnd) return;
    setBoxPreview({ lat, lon });
  };

  const handleUseMyLocation = () => {
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        clearBoxDraft();
        setSelectedPos({ lat: latitude, lon: longitude });
        setLocationName('My Location');
        setIsLocating(false);
      },
      (err) => {
        console.error('Geolocation failed:', err);
        setIsLocating(false);
        alert('Could not get your location. Please enable location access or search for an address.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const toggleSelectionMode = () => {
    if (selectionMode === 'radius') {
      setSelectionMode('box');
      clearBoxDraft();
      setLocationName('Box mode: click first corner, then opposite corner.');
      return;
    }

    setSelectionMode('radius');
    clearBoxDraft();
    if (selectedPos) {
      setLocationName(`${selectedPos.lat.toFixed(4)}°, ${selectedPos.lon.toFixed(4)}°`);
    }
  };

  const handleStartDriving = () => {
    if (!selectedPos) return;
    if (selectionMode === 'box' && !customBBox) return;
    setLocation(selectedPos.lat, selectedPos.lon, locationName);
    setPhase('loading');
  };

  const hasValidSelection = selectionMode === 'box' ? !!(selectedPos && customBBox) : !!selectedPos;

  return (
    <div className="location-picker">
      <div className="lp-header">
        <div className="lp-logo">
          <h1>Mapped<span className="accent">Out</span></h1>
        </div>
        <p className="lp-subtitle">Drive anywhere in the world. Pick a location and explore.</p>
      </div>

      <div className="lp-search-container">
        <div className="lp-search-bar">
          <Search size={18} className="lp-search-icon" />
          <input
            type="text"
            placeholder="Search any address, city, or landmark..."
            value={searchQuery}
            onChange={(e) => handleSearchInput(e.target.value)}
            className="lp-search-input"
          />
          {isSearching && <Loader2 size={18} className="lp-spinner" />}
        </div>

        {searchResults.length > 0 && (
          <div className="lp-search-results">
            {searchResults.map((result) => (
              <button
                key={result.place_id}
                className="lp-result-item"
                onClick={() => handleSelectResult(result)}
              >
                <MapPin size={14} />
                <span>{result.display_name}</span>
              </button>
            ))}
          </div>
        )}

      </div>

      <div className="lp-map-wrapper">
        <MapContainer
          center={[40.7128, -74.006]}
          zoom={12}
          style={{ width: '100%', height: '100%' }}
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/">OSM</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          <MapInteractionHandler onMapClick={handleMapClick} onMapMove={handleMapMove} />
          {currentBoxBounds && selectionMode === 'box' && (
            <Rectangle
              bounds={currentBoxBounds}
              pathOptions={{ color: '#ffffff', weight: 2, dashArray: '6 6', fillOpacity: 0.08 }}
            />
          )}
          {selectedPos && (
            <>
              <Marker position={[selectedPos.lat, selectedPos.lon]} />
              <FlyToLocation lat={selectedPos.lat} lon={selectedPos.lon} />
            </>
          )}
        </MapContainer>

        <button
          className={`lp-map-toggle ${selectionMode === 'box' ? 'active' : ''}`}
          onClick={toggleSelectionMode}
          type="button"
          aria-pressed={selectionMode === 'box'}
          title={selectionMode === 'box' ? 'Box mode: click 2 corners' : 'Radius mode: 400m'}
        >
          <Square size={14} />
          <span>{selectionMode === 'box' ? 'Box' : 'Radius'}</span>
        </button>

        <button
          className="lp-my-location-btn"
          onClick={handleUseMyLocation}
          disabled={isLocating}
        >
          {isLocating ? <Loader2 size={16} className="lp-spinner" /> : <Navigation size={16} />}
          <span>Use My Location</span>
        </button>
      </div>

      <div className="lp-footer">
        {selectedPos && (
          <div className="lp-selected-info">
            <MapPin size={14} />
            <span>{locationName || `${selectedPos.lat.toFixed(4)}, ${selectedPos.lon.toFixed(4)}`}</span>
          </div>
        )}
        <button
          className="lp-start-btn"
          onClick={handleStartDriving}
          disabled={!hasValidSelection}
        >
          <span>Start Driving</span>
          <ChevronRight size={20} />
        </button>
      </div>

      <a
        className="lp-github-link"
        href="https://github.com/sahilsheikh21/Mapped-Out"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="View project on GitHub"
        title="View on GitHub"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="lp-github-icon">
          <path
            fill="currentColor"
            d="M12 .5C5.65.5.5 5.65.5 12.1c0 5.16 3.33 9.54 7.95 11.09.58.11.79-.25.79-.56 0-.28-.01-1.02-.01-2-3.24.72-3.92-1.58-3.92-1.58-.52-1.36-1.29-1.72-1.29-1.72-1.06-.74.08-.72.08-.72 1.17.08 1.79 1.22 1.79 1.22 1.04 1.81 2.72 1.29 3.38.98.1-.77.41-1.29.74-1.58-2.58-.3-5.3-1.31-5.3-5.83 0-1.29.46-2.34 1.21-3.17-.12-.3-.53-1.52.12-3.16 0 0 .99-.32 3.24 1.21.94-.26 1.95-.39 2.95-.4 1 0 2.01.14 2.95.4 2.25-1.53 3.23-1.21 3.23-1.21.65 1.64.24 2.86.12 3.16.75.83 1.21 1.88 1.21 3.17 0 4.53-2.72 5.52-5.31 5.82.42.37.79 1.08.79 2.19 0 1.58-.01 2.85-.01 3.24 0 .31.21.68.8.56 4.62-1.56 7.94-5.93 7.94-11.09C23.5 5.65 18.35.5 12 .5Z"
          />
        </svg>
      </a>
    </div>
  );
}
