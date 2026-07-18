import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Loader } from 'lucide-react';

// Fix Leaflet's default icon issue with webpack/vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Cache in memory for geocoded addresses during the session
const geocodeCache = {};

const geocodeAddress = async (address) => {
  if (!address || address === 'S/D' || address.length < 5) return null;
  if (geocodeCache[address]) return geocodeCache[address];
  
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`);
    const data = await res.json();
    if (data && data.length > 0) {
      const coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      geocodeCache[address] = coords;
      return coords;
    }
  } catch (err) {
    console.error("Error geocoding:", err);
  }
  
  geocodeCache[address] = null; // cache the null to avoid retrying
  return null;
};

const ObrasMapView = ({ obras, onOpenDetail, getStatusBadge }) => {
  const [markers, setMarkers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    
    const loadMarkers = async () => {
      setIsLoading(true);
      const newMarkers = [];
      
      // We process sequentially with a small delay to avoid hitting Nominatim rate limits (1 req/sec)
      for (const obra of obras) {
        if (!isMounted) break;
        if (obra.location) {
          const coords = await geocodeAddress(obra.location);
          if (coords) {
            newMarkers.push({ ...obra, coords });
          }
          // sleep 100ms
          await new Promise(r => setTimeout(r, 150));
        }
      }
      
      if (isMounted) {
        setMarkers(newMarkers);
        setIsLoading(false);
      }
    };
    
    loadMarkers();
    
    return () => { isMounted = false; };
  }, [obras]);

  // Default center: Rosario
  const defaultCenter = [-32.9468, -60.6393];

  return (
    <div style={{ position: 'relative', height: '600px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-light)' }}>
      {isLoading && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, background: 'rgba(255,255,255,0.8)', padding: '1rem', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: '500', color: 'var(--primary-600)' }}>
          <Loader size={18} className="spin" /> Localizando obras en el mapa (esto puede tardar unos segundos)...
        </div>
      )}
      
      <MapContainer center={defaultCenter} zoom={11} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {markers.map(m => (
          <Marker key={m.id} position={[m.coords.lat, m.coords.lng]}>
            <Popup>
              <div style={{ minWidth: '200px' }}>
                <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1rem', color: 'var(--primary-700)' }}>{m.name}</h3>
                <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: '#666' }}>{m.location}</p>
                <div style={{ transform: 'scale(0.85)', transformOrigin: 'left top', marginBottom: '0.5rem' }}>
                  {getStatusBadge(m.estado, m.phase)}
                </div>
                <button 
                  onClick={() => onOpenDetail(m)}
                  style={{ width: '100%', padding: '0.4rem', background: 'var(--primary-600)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '500' }}
                >
                  Ver Detalles
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default ObrasMapView;
