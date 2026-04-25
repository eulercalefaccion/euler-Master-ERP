/**
 * MapView — Mapa Leaflet con marcadores de obras y empleados activos
 * Adaptado de la webapp Euler Jornadas para el Master ERP
 */
import React, { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

export default function MapView({ 
  obras = [], jornadas = [], empleados = [], appConfig = {}, 
  customMarkers = [], height = '300px', onMapClick = null, marker = null 
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef([]);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current).setView([-32.9468, -60.6393], 13); // Rosario default

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    if (onMapClick) {
      let clickMarker = null;
      map.on('click', (e) => {
        const { lat, lng } = e.latlng;
        if (clickMarker) {
          clickMarker.setLatLng([lat, lng]);
        } else {
          clickMarker = L.marker([lat, lng], {
            icon: L.divIcon({
              className: '',
              html: `<div style="background:#C41E3A;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>`,
              iconSize: [16, 16], iconAnchor: [8, 8],
            })
          }).addTo(map);
        }
        onMapClick({ lat: parseFloat(lat.toFixed(7)), lng: parseFloat(lng.toFixed(7)) });
      });
    }

    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Update markers when data changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove old layers
    layersRef.current.forEach(l => l.remove());
    layersRef.current = [];

    // Obras markers + circles
    obras.filter(o => o.activa && o.lat && o.lng).forEach(obra => {
      const tipos = { oficina: '🏢', deposito: '🏭', obra: '🔨' };
      const emoji = tipos[obra.tipo] || '📍';
      const color = obra.color || '#f59e0b';

      const circle = L.circle([obra.lat, obra.lng], {
        color, fillColor: color, fillOpacity: 0.12,
        radius: obra.radio || 200, weight: 2,
      }).addTo(map);

      const tolerancia = appConfig?.radioTolerancia !== undefined ? parseInt(appConfig.radioTolerancia) : 50;
      const toleranceCircle = L.circle([obra.lat, obra.lng], {
        color: '#f59e0b', fillOpacity: 0,
        radius: (obra.radio || 200) + tolerancia, weight: 1, dashArray: '5, 5'
      }).addTo(map);

      const obraMarker = L.marker([obra.lat, obra.lng], {
        icon: L.divIcon({
          className: '',
          html: `<div style="background:${color};color:white;padding:4px 8px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.4);border:2px solid rgba(255,255,255,0.3);">${emoji} ${obra.nombre}</div>`,
          iconSize: [null, null], iconAnchor: [0, 0],
        })
      }).addTo(map)
        .bindPopup(`<b>${obra.nombre}</b><br>${obra.direccion || ''}<br>Radio: ${obra.radio}m`);

      layersRef.current.push(circle, toleranceCircle, obraMarker);
    });

    // Empleados activos (con jornada abierta)
    const jornadasAbiertas = jornadas.filter(j => j.estado === 'abierta' && j.latIngreso);
    jornadasAbiertas.forEach(jornada => {
      const emp = empleados.find(e => e.id === jornada.empleadoId);
      const nombre = emp ? `${emp.nombre} ${emp.apellido?.[0] || ''}.` : 'Empleado';
      const semColors = { verde: '#10b981', amarillo: '#f59e0b', rojo: '#ef4444' };
      const color = semColors[jornada.semaforo] || '#3b82f6';

      const empMarker = L.marker([jornada.latIngreso, jornada.lngIngreso], {
        icon: L.divIcon({
          className: '',
          html: `<div style="background:${color};width:32px;height:32px;border-radius:50%;border:3px solid white;box-shadow:0 2px 12px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;font-size:14px;color:white;font-weight:800;">👤</div>`,
          iconSize: [32, 32], iconAnchor: [16, 16],
        })
      }).addTo(map)
        .bindPopup(`<b>${nombre}</b><br>Ingresó: ${jornada.horaIngreso}<br>${jornada.obraDetectada}`);

      layersRef.current.push(empMarker);
    });

    // Custom markers
    customMarkers.forEach(cm => {
      if (!cm.lat || !cm.lng) return;
      const bg = cm.color || '#3b82f6';
      const html = cm.icon
        ? `<div style="background:${bg};width:32px;height:32px;border-radius:50%;border:3px solid white;box-shadow:0 2px 12px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;font-size:14px;color:white;font-weight:800;">${cm.icon}</div>`
        : `<div style="background:${bg};width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>`;

      const m = L.marker([cm.lat, cm.lng], {
        icon: L.divIcon({ className: '', html, iconSize: cm.icon ? [32, 32] : [16, 16], iconAnchor: cm.icon ? [16, 16] : [8, 8] })
      }).addTo(map);
      if (cm.label) m.bindPopup(cm.label);
      layersRef.current.push(m);
    });

    // Fit bounds
    const allPoints = [];
    obras.filter(o => o.activa && o.lat).forEach(o => allPoints.push([o.lat, o.lng]));
    customMarkers.filter(c => c.lat).forEach(c => allPoints.push([c.lat, c.lng]));
    jornadasAbiertas.forEach(j => allPoints.push([j.latIngreso, j.lngIngreso]));

    if (allPoints.length > 0) {
      try {
        const bounds = L.latLngBounds(allPoints);
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      } catch(e) { /* ignore */ }
    }
  }, [obras, jornadas, empleados, marker, customMarkers, appConfig]);

  return (
    <div
      ref={containerRef}
      style={{ height, width: '100%', borderRadius: '12px', overflow: 'hidden' }}
    />
  );
}
