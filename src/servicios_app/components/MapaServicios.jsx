import { useEffect, useRef, useState } from 'react'

const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || 'AIzaSyBOZfhsaioYQE0cUhzL-L6tI3-MvJMTP3s'

const EQUIPO_LABELS = {
  caldera: 'Caldera', radiador: 'Radiador', piso_radiante: 'Piso Radiante',
  termostato: 'Termostato', climatizador_piscina: 'Climatizador', mantenimiento: 'Mantenimiento', otro: 'Otro',
}

const ESTADO_COLORES = {
  pendiente: '#E65100',
  coordinado: '#0288D1',
  'en-curso': '#1565C0',
  'visitado-incompleto': '#1565C0',
  'solucionado-cliente': '#7B1FA2',
  resuelto: '#27AE60',
}

// Geocodifica una dirección
async function geocodificar(direccion, localidad) {
  const address = encodeURIComponent(`${direccion}, ${localidad}, Argentina`)
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${address}&key=${GOOGLE_MAPS_KEY}`
  try {
    const res = await fetch(url)
    const data = await res.json()
    if (data.results && data.results.length > 0) {
      return data.results[0].geometry.location
    }
  } catch (e) { console.error('Geocoding error:', e) }
  return null
}

export default function MapaServicios({ servicios }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersRef = useRef([])
  const [cargando, setCargando] = useState(true)
  const [geocodificados, setGeocodificados] = useState([])

  // Cargar Google Maps script
  useEffect(() => {
    if (window.google) { setCargando(false); return }
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&libraries=places`
    script.async = true
    script.onload = () => setCargando(false)
    document.head.appendChild(script)
  }, [])

  // Geocodificar servicios que no tienen coords
  useEffect(() => {
    const geocodificarTodos = async () => {
      const pendientes = servicios.filter(s => s.estado !== 'resuelto' && s.estado !== 'solucionado-cliente')
      const resultados = await Promise.all(
        pendientes.map(async s => {
          if (s.lat && s.lng) return { ...s, lat: s.lat, lng: s.lng }
          if (!s.direccion) return null
          const coords = await geocodificar(s.direccion, s.localidad || '')
          if (coords) return { ...s, lat: coords.lat, lng: coords.lng }
          return null
        })
      )
      setGeocodificados(resultados.filter(Boolean))
    }
    if (servicios.length > 0) geocodificarTodos()
  }, [servicios])

  // Inicializar mapa
  useEffect(() => {
    if (cargando || !mapRef.current || !window.google) return

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
        center: { lat: -32.9468, lng: -60.6393 }, // Rosario
        zoom: 12,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
      })
    }

    // Limpiar markers anteriores
    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = []

    // Agregar markers
    geocodificados.forEach(s => {
      const color = ESTADO_COLORES[s.estado] || '#27AE60'
      const equipos = (s.equipos || []).map(e => EQUIPO_LABELS[e] || e).join(', ')

      const marker = new window.google.maps.Marker({
        position: { lat: s.lat, lng: s.lng },
        map: mapInstanceRef.current,
        title: s.nombre,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: color,
          fillOpacity: 0.95,
          strokeColor: 'white',
          strokeWeight: 2,
        }
      })

      const infoWindow = new window.google.maps.InfoWindow({
        content: `
          <div style="font-family:Arial,sans-serif;min-width:180px;padding:4px;">
            <div style="font-size:11px;color:#F5A623;font-weight:700;margin-bottom:2px;">${s.numeroST || ''}</div>
            <div style="font-size:13px;font-weight:700;color:#1E3A5F;margin-bottom:4px;">${s.nombre}</div>
            <div style="font-size:11px;color:#666;margin-bottom:2px;">📍 ${s.direccion}${s.localidad ? ', ' + s.localidad : ''}</div>
            ${equipos ? `<div style="font-size:11px;color:#666;margin-bottom:2px;">🔧 ${equipos}</div>` : ''}
            ${s.tecnico ? `<div style="font-size:11px;color:#666;margin-bottom:2px;">👷 ${s.tecnico}</div>` : ''}
            ${s.fechaAsignada ? `<div style="font-size:11px;color:#1565C0;font-weight:600;">📅 ${s.fechaAsignada}</div>` : ''}
            <div style="margin-top:6px;padding:3px 8px;background:${color};color:white;border-radius:10px;font-size:10px;font-weight:700;display:inline-block;">${(s.estado || '').replace('-', ' ').toUpperCase()}</div>
          </div>
        `
      })

      marker.addListener('click', () => {
        infoWindow.open(mapInstanceRef.current, marker)
      })

      markersRef.current.push(marker)
    })

    // Ajustar zoom para mostrar todos los markers
    if (geocodificados.length > 0) {
      const bounds = new window.google.maps.LatLngBounds()
      geocodificados.forEach(s => bounds.extend({ lat: s.lat, lng: s.lng }))
      mapInstanceRef.current.fitBounds(bounds)
      if (geocodificados.length === 1) mapInstanceRef.current.setZoom(14)
    }
  }, [cargando, geocodificados])

  return (
    <div style={{ position: 'relative' }}>
      {/* Leyenda */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        {[
          { color: '#E65100', label: 'Pendiente' },
          { color: '#0288D1', label: 'Coordinado' },
          { color: '#1565C0', label: 'En curso/Incompleto' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--gris-texto)' }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: color, border: '2px solid white', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
            {label}
          </div>
        ))}
        <div style={{ fontSize: '0.8rem', color: 'var(--gris-texto)', marginLeft: 'auto' }}>
          {geocodificados.length} servicio{geocodificados.length !== 1 ? 's' : ''} en el mapa
        </div>
      </div>

      {/* Mapa */}
      <div
        ref={mapRef}
        style={{ width: '100%', height: 420, borderRadius: 12, overflow: 'hidden', border: '1.5px solid #D8E2EE' }}
      />

      {cargando && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(244,246,249,0.8)', borderRadius: 12 }}>
          <div className="spinner" />
        </div>
      )}
    </div>
  )
}
