import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Loader } from 'lucide-react';

// Fix Leaflet's default icon path issues
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// A simple local cache for geocoding to avoid hitting Nominatim too much
const geocodeCache = {};

const CrmMapView = ({ items, onCardClick }) => {
  const [geocodedItems, setGeocodedItems] = useState([]);
  const [isGeocoding, setIsGeocoding] = useState(true);

  useEffect(() => {
    let mounted = true;
    
    const geocodeLocations = async () => {
      setIsGeocoding(true);
      const results = [];
      
      for (const item of items) {
        if (!item.location) continue;
        
        const addressStr = `${item.location}, Santa Fe, Argentina`; // Assuming mostly in Santa Fe, add context
        
        if (geocodeCache[item.location]) {
          results.push({ ...item, coords: geocodeCache[item.location] });
          continue;
        }

        try {
          // Simple Nominatim geocoding (OpenStreetMap)
          // Add 1s delay to respect Nominatim usage policy if querying many
          await new Promise(resolve => setTimeout(resolve, 500));
          const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressStr)}`);
          const data = await response.json();
          
          if (data && data.length > 0) {
            const coords = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
            geocodeCache[item.location] = coords;
            results.push({ ...item, coords });
          }
        } catch (err) {
          console.error("Geocoding error for", item.location, err);
        }
      }
      
      if (mounted) {
        setGeocodedItems(results);
        setIsGeocoding(false);
      }
    };

    geocodeLocations();

    return () => { mounted = false; };
  }, [items]);

  const defaultCenter = [-32.9468, -60.6393]; // Rosario center

  return (
    <div style={{ position: 'relative', height: '600px', width: '100%', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-light)' }}>
      {isGeocoding && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.7)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <Loader size={32} className="spin" color="var(--primary-600)" />
          <p style={{ marginTop: '1rem', fontWeight: '500', color: 'var(--text-secondary)' }}>Ubicando presupuestos en el mapa...</p>
        </div>
      )}
      
      <MapContainer center={defaultCenter} zoom={12} style={{ height: '100%', width: '100%', zIndex: 1 }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />
        
        {geocodedItems.map((item) => (
          <Marker key={item.id} position={item.coords}>
            <Popup>
              <div style={{ padding: '0.25rem' }}>
                <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '0.875rem', fontWeight: '600' }}>{item.name}</h3>
                <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.75rem', color: '#666' }}>{item.location}</p>
                <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--primary-700)', marginBottom: '0.5rem' }}>
                  {item.presupuestoNumber || 'S/N'}
                </div>
                <button 
                  onClick={() => onCardClick(item)}
                  style={{ width: '100%', padding: '0.4rem', border: 'none', backgroundColor: 'var(--primary-600)', color: 'white', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600' }}
                >
                  Ver Detalle
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default CrmMapView;
