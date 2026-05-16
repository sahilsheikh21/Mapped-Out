/**
 * LocationPicker: Premium dark-mode UI for selecting a location to drive in.
 * Features a Leaflet map + search bar + "Use My Location" button.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { geocodeAddress } from '../api/nominatim';
import { useGameStore } from '../stores/gameStore';
import { Search, MapPin, Navigation, Loader2, ChevronRight } from 'lucide-react';

// Fix Leaflet default icon issue
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// @ts-ignore
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
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

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedPos, setSelectedPos] = useState<{ lat: number; lon: number } | null>(null);
  const [locationName, setLocationName] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();

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

  const handleSelectResult = (result: any) => {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    setSelectedPos({ lat, lon });
    setLocationName(result.display_name.split(',').slice(0, 3).join(', '));
    setSearchResults([]);
    setSearchQuery(result.display_name.split(',')[0]);
  };

  const handleMapClick = (lat: number, lon: number) => {
    setSelectedPos({ lat, lon });
    setLocationName(`${lat.toFixed(4)}°, ${lon.toFixed(4)}°`);
  };

  const handleUseMyLocation = () => {
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
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

  const handleStartDriving = () => {
    if (!selectedPos) return;
    setLocation(selectedPos.lat, selectedPos.lon, locationName);
    setPhase('loading');
  };

  return (
    <div className="location-picker">
      {/* Hero Header */}
      <div className="lp-header">
        <div className="lp-logo">
          <span className="lp-logo-icon">🏎️</span>
          <h1>Mapped<span className="accent">Out</span></h1>
        </div>
        <p className="lp-subtitle">Drive anywhere in the world. Pick a location and explore.</p>
      </div>

      {/* Search Bar */}
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

        {/* Search Results Dropdown */}
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

      {/* Map */}
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
          <MapClickHandler onMapClick={handleMapClick} />
          {selectedPos && (
            <>
              <Marker position={[selectedPos.lat, selectedPos.lon]} />
              <FlyToLocation lat={selectedPos.lat} lon={selectedPos.lon} />
            </>
          )}
        </MapContainer>

        {/* Map overlay buttons */}
        <button
          className="lp-my-location-btn"
          onClick={handleUseMyLocation}
          disabled={isLocating}
        >
          {isLocating ? <Loader2 size={16} className="lp-spinner" /> : <Navigation size={16} />}
          <span>Use My Location</span>
        </button>
      </div>

      {/* Start Button */}
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
          disabled={!selectedPos}
        >
          <span>Start Driving</span>
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
}
