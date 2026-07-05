import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet's default icon path issues in React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Component to handle map clicks and moving the marker
const MapEvents = ({ setPosition }) => {
  useMapEvents({
    click(e) {
      setPosition(e.latlng);
    },
  });
  return null;
};

// Component to recenter the map dynamically
const ChangeView = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
};

const MapPicker = ({ 
  address, // string address from the form
  onLocationSelect, 
  height = '300px'
}) => {
  // Default center: Rosario, Santa Fe
  const defaultCenter = { lat: -32.9442, lng: -60.6505 };
  const [position, setPosition] = useState(null);
  const [mapCenter, setMapCenter] = useState(defaultCenter);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef(null);

  // Expose the selected position back to parent
  useEffect(() => {
    if (position) {
      onLocationSelect(position);
    }
  }, [position, onLocationSelect]);

  // Geocode address when it changes (with debounce)
  useEffect(() => {
    if (!address || address.length < 5) return;

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        // Geocoding using Nominatim (OpenStreetMap)
        // Adding Santa Fe context to improve results
        const searchQuery = encodeURIComponent(`${address}, Santa Fe, Argentina`);
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${searchQuery}&limit=1`, {
          headers: {
            'Accept-Language': 'es'
          }
        });
        const data = await response.json();
        
        if (data && data.length > 0) {
          const lat = parseFloat(data[0].lat);
          const lon = parseFloat(data[0].lon);
          const newPos = { lat, lng: lon };
          setMapCenter(newPos);
          setPosition(newPos);
        }
      } catch (error) {
        console.error("Geocoding error:", error);
      } finally {
        setIsSearching(false);
      }
    }, 1000); // 1s debounce

    return () => clearTimeout(searchTimeoutRef.current);
  }, [address]);

  return (
    <div style={{ position: 'relative', width: '100%', height, borderRadius: '8px', overflow: 'hidden', border: '1px solid #d1d5db', zIndex: 1 }}>
      <MapContainer 
        center={mapCenter} 
        zoom={position ? 15 : 12} 
        style={{ width: '100%', height: '100%' }}
      >
        <ChangeView center={mapCenter} zoom={position ? 15 : 12} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapEvents setPosition={setPosition} />
        {position && <Marker position={position} />}
      </MapContainer>
      
      {/* Overlay hint */}
      <div style={{
        position: 'absolute',
        top: '10px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(13, 42, 78, 0.85)',
        color: 'white',
        padding: '6px 12px',
        borderRadius: '20px',
        fontSize: '0.8rem',
        fontWeight: '600',
        zIndex: 1000,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
      }}>
        {isSearching ? 'Buscando dirección...' : 'Tocá para marcar tu ubicación 📍'}
      </div>
    </div>
  );
};

export default MapPicker;
