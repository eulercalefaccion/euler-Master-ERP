import { useState, useEffect, useRef } from 'react'
import { collection, addDoc, serverTimestamp, getCountFromServer, getDocs, query, where, doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from '../../services/firebaseConfig'
import { User, MapPin, Wrench, Camera, Info, CheckCircle } from 'lucide-react'
import AutocompleteLocalidad from '../components/AutocompleteLocalidad'

const EQUIPOS = [
  { id: 'caldera', label: 'Caldera' },
  { id: 'mantenimiento', label: 'Mantenimiento Preventivo / Puesta en Marcha de Temporada' },
  { id: 'radiador', label: 'Radiador' },
  { id: 'piso_radiante', label: 'Piso Radiante' },
  { id: 'termostato', label: 'Termostato de Ambiente' },
  { id: 'climatizador_piscina', label: 'Climatizador de Piscina' },
  { id: 'otro', label: 'Otro' },
]

const MARCAS_CALDERA = ['BAXI', 'CALDAIA', 'PEISA', 'FERROLI', 'DEMIR DOKUM', 'FLOWING', 'OTRA']

const MODELOS_CALDERA = {
  'BAXI': ['ECO NOVA', 'LUNA 3', 'ECO COMPACT', 'MAIN 5', 'SLIM', 'OTRO'],
  'PEISA': ['DIVA UNICA', 'DIVA DUO', 'PRIMA TEC', 'OTRO'],
  'CALDAIA': ['DIGITAL', 'DIGITAL TOP', 'X30/X35', 'OTRO'],
  'FERROLI': ['FORTUNA', 'ARENA', 'OTRO'],
  'DEMIR DOKUM': ['NEPTO', 'ATRON', 'OTRO'],
  'FLOWING': ['OTRO'],
  'OTRA': ['OTRO'],
}

// Busca cliente por teléfono normalizado
async function buscarOCrearCliente(codigoArea, numero, nombre, apellido, email, direccion, pisoDpto, localidad, barrio, lote, lat, lng) {
  const telefonoNormalizado = `${codigoArea.trim()}${numero.trim()}`
  const nombreBusqueda = `${nombre.trim()} ${apellido.trim()}`.toLowerCase()

  // 1. Buscar por nombre completo exacto (para no duplicar clientes)
  const qNombre = query(collection(db, 'clientes'), where('nombreBusqueda', '==', nombreBusqueda))
  const snapNombre = await getDocs(qNombre)

  if (!snapNombre.empty) {
    return { id: snapNombre.docs[0].id, ...snapNombre.docs[0].data(), esNuevo: false }
  }

  // 2. Buscar por teléfono exacto
  const q = query(collection(db, 'clientes'), where('telefonoNormalizado', '==', telefonoNormalizado))
  const snap = await getDocs(q)

  if (!snap.empty) {
    // Cliente existente encontrado
    return { id: snap.docs[0].id, ...snap.docs[0].data(), esNuevo: false }
  }

  // Crear cliente nuevo con número correlativo
  const totalSnap = await getCountFromServer(collection(db, 'clientes'))
  const total = totalSnap.data().count + 1
  const numeroCliente = `C-${String(total).padStart(3, '0')}`

  const nuevoCliente = {
    nombre: nombre.trim(),
    apellido: apellido.trim(),
    nombreCompleto: `${nombre.trim()} ${apellido.trim()}`,
    nombreBusqueda: `${nombre.trim()} ${apellido.trim()}`.toLowerCase(),
    codigoArea: codigoArea.trim(),
    numero: numero.trim(),
    telefonoNormalizado,
    telefono: `${codigoArea.trim()} ${numero.trim()}`,
    email: email.trim(),
    direccion: direccion.trim(),
    pisoDpto: pisoDpto?.trim() || '',
    barrio: barrio?.trim() || '',
    lote: lote?.trim() || '',
    direccionCompleta: [direccion.trim(), pisoDpto?.trim(), barrio?.trim(), lote?.trim()].filter(Boolean).join(', '),
    localidad: localidad.trim(),
    lat: lat || null,
    lng: lng || null,
    numeroCliente,
    creadoEn: serverTimestamp(),
    fotos: [],
  }

  const ref = await addDoc(collection(db, 'clientes'), nuevoCliente)
  return { id: ref.id, ...nuevoCliente, esNuevo: true }
}

export default function FormularioCliente() {
  const [form, setForm] = useState({
    nombre: '',
    apellido: '',
    codigoArea: '',
    numero: '',
    email: '',
    direccion: '',
    pisoDpto: '',
    localidad: '',
    barrio: '',
    lote: '',
    equipos: [],
    otroEquipo: '',
    marca: '',
    modelo: '',
    descripcion: '',
  })
  const [fotos, setFotos] = useState([])
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState('')
  const [mapaCoords, setMapaCoords] = useState(null)
  const [geocodificando, setGeocodificando] = useState(false)
  const [pinInfo, setPinInfo] = useState(null) // { direccion, lat, lng } cuando el pin viene del mapa
  const geocodeTimer = useRef(null)
  const [precios, setPrecios] = useState({ base: 160000, visita: 90000 })

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'precios'), (docSnap) => {
      if (docSnap.exists()) {
        setPrecios(docSnap.data())
      }
    })
    return unsub
  }, [])

  // Escuchar coordenadas enviadas desde el mapa interactivo (iframe → postMessage)
  useEffect(() => {
    const handler = async (e) => {
      if (e.data && typeof e.data.lat === 'number' && typeof e.data.lng === 'number') {
        const { lat, lng } = e.data
        setMapaCoords({ lat, lng })
        // Geocodificación inversa para mostrar la dirección del pin
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
            { headers: { 'Accept-Language': 'es', 'User-Agent': 'EulerServicios/1.0' } }
          )
          const data = await res.json()
          setPinInfo({
            direccion: data.display_name || null,
            lat: lat.toFixed(6),
            lng: lng.toFixed(6),
          })
          if (data && data.address) {
            const calle = data.address.road || ''
            const num = data.address.house_number || ''
            const loc = data.address.city || data.address.town || data.address.village || data.address.suburb || ''
            setForm(prev => ({
              ...prev,
              direccion: `${calle} ${num}`.trim(),
              localidad: loc
            }))
          }
        } catch {
          setPinInfo({ direccion: null, lat: lat.toFixed(6), lng: lng.toFixed(6) })
        }
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  // Geocodificar mientras el usuario tipea (con debounce) usando Nominatim (OpenStreetMap - gratuito)
  useEffect(() => {
    if (!form.direccion.trim() || !form.localidad.trim()) { setMapaCoords(null); setPinInfo(null); return }
    clearTimeout(geocodeTimer.current)
    geocodeTimer.current = setTimeout(async () => {
      setGeocodificando(true)
      try {
        const query = encodeURIComponent(`${form.direccion.trim()}, ${form.localidad.trim()}, Argentina`)
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1&countrycodes=ar`,
          { headers: { 'Accept-Language': 'es', 'User-Agent': 'EulerServicios/1.0' } }
        )
        const data = await res.json()
        if (data && data.length > 0) {
          setMapaCoords({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) })
          setPinInfo(null) // geocoding automático: no mostrar info de pin manual
        } else {
          setMapaCoords(null)
        }
      } catch (e) { console.error(e); setMapaCoords(null) }
      setGeocodificando(false)
    }, 1000)
    return () => clearTimeout(geocodeTimer.current)
  }, [form.direccion, form.localidad])

  const toggleEquipo = (id) => {
    setForm(prev => ({
      ...prev,
      equipos: prev.equipos.includes(id)
        ? prev.equipos.filter(e => e !== id)
        : [...prev.equipos, id]
    }))
  }

  const handleFoto = (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    if (fotos.length + files.length > 7) {
      setError('Podés subir hasta 7 fotos o videos como máximo.')
      return
    }
    setError('')
    const nuevasFotos = files.map(file => ({
      file,
      preview: URL.createObjectURL(file)
    }))
    setFotos(prev => [...prev, ...nuevasFotos])
    e.target.value = '' // Reset input
  }

  const removeFoto = (index) => {
    setFotos(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async () => {
    setError('')
    if (!form.nombre.trim()) return setError('Por favor ingresá tu nombre.')
    if (!form.apellido.trim()) return setError('Por favor ingresá tu apellido.')
    if (!form.codigoArea.trim()) return setError('Por favor ingresá el código de área.')
    if (!form.numero.trim()) return setError('Por favor ingresá tu número de WhatsApp.')
    if (!form.direccion.trim()) return setError('Por favor ingresá la dirección.')
    if (!form.localidad.trim()) return setError('Por favor ingresá la localidad.')
    if (form.equipos.length === 0) return setError('Seleccioná al menos un equipo con problema.')
    if (!form.descripcion.trim()) return setError('Por favor describí el problema.')

    setEnviando(true)
    try {
      let fotosURLs = []
      if (fotos.length > 0) {
        const uploadPromises = fotos.map(f => {
          const formData = new FormData()
          formData.append('file', f.file)
          formData.append('upload_preset', 'euler_servicios')
          const isVideo = f.file.type.startsWith('video/')
          const resourceType = isVideo ? 'video' : 'image'
          return fetch(`https://api.cloudinary.com/v1_1/djehdlthw/${resourceType}/upload`, {
            method: 'POST',
            body: formData,
          }).then(res => res.json()).then(data => data.secure_url)
        })
        fotosURLs = await Promise.all(uploadPromises)
      }

      // Buscar o crear cliente automáticamente
      const cliente = await buscarOCrearCliente(
        form.codigoArea, form.numero,
        form.nombre, form.apellido,
        form.email, form.direccion, form.pisoDpto, form.localidad, form.barrio, form.lote,
        mapaCoords?.lat, mapaCoords?.lng
      )

      // Verificar si este cliente ya tiene un servicio activo (pendiente, coordinado, en-curso, etc.)
      const qServicios = query(collection(db, 'servicios'), where('clienteId', '==', cliente.id))
      const snapServicios = await getDocs(qServicios)
      const servicioActivoDoc = snapServicios.docs.find(doc => {
        const s = doc.data()
        return s.estado !== 'resuelto' && s.estado !== 'solucionado-cliente'
      })

      if (servicioActivoDoc) {
        const activeData = servicioActivoDoc.data()
        const nuevaDescripcion = `${activeData.descripcion || ''}\n\n[Actualización Solicitud]: ${form.descripcion.trim()}`
        
        // Combinar fotos del cliente
        const fotosActuales = activeData.fotosCliente || []
        const nuevasFotos = [...fotosActuales, ...fotosURLs]

        await updateDoc(doc(db, 'servicios', servicioActivoDoc.id), {
          descripcion: nuevaDescripcion,
          fotosCliente: nuevasFotos,
          fotoURL: nuevasFotos.length > 0 ? nuevasFotos[0] : (activeData.fotoURL || null),
        })
      } else {
        // Generar número ST automático para nuevo servicio
        const snap = await getCountFromServer(collection(db, 'servicios'))
        const total = snap.data().count + 1
        const anio = new Date().getFullYear()
        const numeroST = `ST-${anio}-${String(total).padStart(3, '0')}`

        await addDoc(collection(db, 'servicios'), {
          nombre: `${form.nombre.trim()} ${form.apellido.trim()}`,
          apellido: form.apellido.trim(),
          telefono: `${form.codigoArea.trim()} ${form.numero.trim()}`,
          telefonoNormalizado: `${form.codigoArea.trim()}${form.numero.trim()}`,
          email: form.email.trim(),
          direccion: form.direccion.trim(),
          pisoDpto: form.pisoDpto?.trim() || '',
          barrio: form.barrio?.trim() || '',
          lote: form.lote?.trim() || '',
          direccionCompleta: [form.direccion.trim(), form.pisoDpto?.trim(), form.barrio?.trim(), form.lote?.trim()].filter(Boolean).join(', '),
          localidad: form.localidad.trim(),
          lat: mapaCoords?.lat || null,
          lng: mapaCoords?.lng || null,
          equipos: form.equipos,
          otroEquipo: form.otroEquipo,
          marca: form.marca,
          modelo: form.modelo,
          descripcion: form.descripcion.trim(),
          clienteId: cliente.id,
          clienteNumero: cliente.numeroCliente,
          numeroST,
          fotosCliente: fotosURLs,
          fotoURL: fotosURLs.length > 0 ? fotosURLs[0] : null,
          estado: 'pendiente',
          tecnico: '',
          fechaAsignada: null,
          notasInternas: '',
          creadoEn: serverTimestamp(),
          origen: 'cliente',
        })
      }

      setEnviado(true)
    } catch (err) {
      console.error(err)
      setError('Hubo un error al enviar. Intentá nuevamente.')
    } finally {
      setEnviando(false)
    }
  }

  if (enviado) {
    return (
      <div className="container">
        <div className="card">
          <div className="success-screen">
            <div className="success-icon">
              <CheckCircle size={36} />
            </div>
            <h2>¡Solicitud enviada!</h2>
            <p>
              Recibimos tu solicitud correctamente.<br />
              A la brevedad nos comunicaremos con vos para coordinar la visita.
            </p>
            <p style={{ marginTop: 16, fontSize: '0.85rem', color: '#888' }}>
              Ante cualquier consulta podés escribirnos al WhatsApp.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <div style={{ marginBottom: 16, textAlign: 'center' }}>
        <img src={import.meta.env.VITE_APP_BANNER_URL || import.meta.env.VITE_APP_LOGO_URL || "/membrete.jpeg"} alt={import.meta.env.VITE_APP_NAME || "Euler Calefacción"} style={{ width: '100%', maxWidth: 600, maxHeight: 250, objectFit: 'contain', borderRadius: 8, boxShadow: '0 2px 10px rgba(0,0,0,0.08)', background: 'white' }} />
      </div>

      {/* Datos personales */}
      <div className="card">
        <div className="card-title">
          <User size={18} />
          Tus datos
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label>Nombre <span className="req">*</span></label>
            <input
              type="text"
              placeholder="Juan"
              value={form.nombre}
              onChange={e => setForm({ ...form, nombre: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Apellido <span className="req">*</span></label>
            <input
              type="text"
              placeholder="García"
              value={form.apellido}
              onChange={e => setForm({ ...form, apellido: e.target.value })}
            />
          </div>
        </div>

        {/* WhatsApp */}
        <div className="form-group">
          <label>WhatsApp <span className="req">*</span></label>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10 }}>
            <div>
              <input
                type="tel"
                placeholder="341"
                value={form.codigoArea}
                onChange={e => setForm({ ...form, codigoArea: e.target.value.replace(/\D/g, '') })}
                maxLength={5}
              />
              <div style={{ fontSize: '0.72rem', color: '#888', marginTop: 4 }}>
                Cód. de área sin el 0<br />
                <em>Ej: Rosario → 341</em>
              </div>
            </div>
            <div>
              <input
                type="tel"
                placeholder="5551234"
                value={form.numero}
                onChange={e => setForm({ ...form, numero: e.target.value.replace(/\D/g, '') })}
                maxLength={8}
              />
              <div style={{ fontSize: '0.72rem', color: '#888', marginTop: 4 }}>
                Número sin el 15<br />
                <em>Ej: 5551234</em>
              </div>
            </div>
          </div>
        </div>

        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            placeholder="ejemplo@gmail.com"
            value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })}
          />
        </div>
      </div>

      {/* Dirección */}
      <div className="card">
        <div className="card-title">
          <MapPin size={18} />
          Dirección del servicio
        </div>

        <div className="form-group">
          <label>Calle y número <span className="req">*</span></label>
          <input
            type="text"
            placeholder="Ej: Rioja 1961"
            value={form.direccion}
            onChange={e => setForm({ ...form, direccion: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label>Piso / Departamento <span style={{ fontSize: '0.75rem', color: '#aaa', fontWeight: 400 }}>(opcional)</span></label>
          <input
            type="text"
            placeholder="Ej: Piso 5 Depto B"
            value={form.pisoDpto}
            onChange={e => setForm({ ...form, pisoDpto: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label>Localidad <span className="req">*</span></label>
          <AutocompleteLocalidad
            value={form.localidad}
            onChange={val => setForm({ ...form, localidad: val })}
            placeholder="Ej: Rosario, Roldán, Funes..."
          />
        </div>

        <div className="form-group">
          <label>Barrio <span style={{ fontSize: '0.75rem', color: '#aaa', fontWeight: 400 }}>(opcional)</span></label>
          <input
            type="text"
            placeholder="Ej: Tierra de Sueños 2"
            value={form.barrio}
            onChange={e => setForm({ ...form, barrio: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label>Lote <span style={{ fontSize: '0.75rem', color: '#aaa', fontWeight: 400 }}>(opcional)</span></label>
          <input
            type="text"
            placeholder="Ej: Lote 45 Manzana 3"
            value={form.lote}
            onChange={e => setForm({ ...form, lote: e.target.value })}
          />
        </div>

        {/* Mapa — siempre visible */}
        <div style={{ marginTop: 12 }}>

          {/* Estado */}
          <div style={{ fontSize: '0.78rem', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            {geocodificando ? (
              <><div style={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid #D8E2EE', borderTopColor: 'var(--azul)', animation: 'spin 0.7s linear infinite' }} /> Buscando dirección...</>
            ) : mapaCoords && !pinInfo ? (
              <><span style={{ color: '#27AE60', fontWeight: 600 }}>✅ Dirección encontrada</span><span style={{ color: 'var(--gris-texto)' }}> — tocá el mapa si querés mover el pin</span></>
            ) : pinInfo ? (
              <span style={{ color: '#27AE60', fontWeight: 600 }}>✅ Ubicación marcada — podés tocarlo de nuevo para ajustarlo</span>
            ) : form.direccion.trim().length > 3 && form.localidad.trim().length > 2 ? (
              <span style={{ color: '#C0392B' }}>⚠️ Dirección no encontrada — tocá el mapa para marcar tu ubicación</span>
            ) : (
              <span style={{ color: 'var(--gris-texto)' }}>📍 Tocá el mapa para marcar tu ubicación</span>
            )}
          </div>

          {/* Mapa interactivo único */}
          <iframe
            key={mapaCoords ? `${mapaCoords.lat.toFixed(5)},${mapaCoords.lng.toFixed(5)}` : 'base'}
            title="mapa"
            width="100%"
            height="280"
            style={{ border: `1.5px solid ${mapaCoords ? '#27AE60' : '#D8E2EE'}`, borderRadius: 8, display: 'block' }}
            srcDoc={`<!DOCTYPE html><html><head>
              <meta charset="utf-8"/>
              <meta name="viewport" content="width=device-width,initial-scale=1"/>
              <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
              <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
              <style>
                body{margin:0;padding:0;}
                #map{height:100vh;width:100vw;}
                #tip{
                  position:absolute;top:10px;left:50%;transform:translateX(-50%);
                  background:rgba(30,58,95,0.88);color:#fff;
                  padding:7px 14px;border-radius:20px;font-size:12px;
                  font-family:sans-serif;z-index:1000;white-space:nowrap;pointer-events:none;
                }
              </style>
            </head><body>
              <div id="tip">${mapaCoords ? 'Tocá para mover el pin' : 'Tocá para marcar tu ubicación 📍'}</div>
              <div id="map"></div>
              <script>
                var lat = ${mapaCoords ? mapaCoords.lat : -32.9468};
                var lng = ${mapaCoords ? mapaCoords.lng : -60.6393};
                var zoom = ${mapaCoords ? 16 : 13};
                var map = L.map('map').setView([lat, lng], zoom);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
                  attribution:'© OpenStreetMap contributors'
                }).addTo(map);
                var marker = ${mapaCoords ? `L.marker([lat, lng]).addTo(map)` : 'null'};
                map.on('click', function(e) {
                  if (marker) map.removeLayer(marker);
                  marker = L.marker([e.latlng.lat, e.latlng.lng]).addTo(map);
                  document.getElementById('tip').textContent = '✅ Ubicación marcada';
                  window.parent.postMessage({lat: e.latlng.lat, lng: e.latlng.lng}, '*');
                });
              </script>
            </body></html>`}
          />

          {/* Info de dirección y coordenadas cuando el pin viene del mapa */}
          {pinInfo && (
            <div style={{
              marginTop: 8, background: '#F0F6FF', border: '1.5px solid #D8E2EE',
              borderRadius: 8, padding: '10px 14px', fontSize: '0.78rem', color: '#333'
            }}>
              {pinInfo.direccion && (
                <div style={{ marginBottom: 5 }}>
                  <span style={{ fontWeight: 600, color: 'var(--azul)' }}>📍 Dirección:</span>{' '}
                  {pinInfo.direccion}
                </div>
              )}
              <div style={{ color: '#888', fontFamily: 'monospace', fontSize: '0.73rem' }}>
                Lat: {pinInfo.lat} &nbsp;|&nbsp; Lng: {pinInfo.lng}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Equipo y problema */}
      <div className="card">
        <div className="card-title">
          <Wrench size={18} />
          Equipo y problema
        </div>

        <div className="form-group">
          <label>¿Qué equipo tiene el problema? <span className="req">*</span></label>
          <div className="checkbox-group">
            {EQUIPOS.map(eq => (
              <label
                key={eq.id}
                htmlFor={`eq-${eq.id}`}
                className={`checkbox-item ${form.equipos.includes(eq.id) ? 'checked' : ''}`}
              >
                <input
                  id={`eq-${eq.id}`}
                  type="checkbox"
                  checked={form.equipos.includes(eq.id)}
                  onChange={() => toggleEquipo(eq.id)}
                />
                <span>{eq.label}</span>
              </label>
            ))}
          </div>
        </div>

        {form.equipos.includes('otro') && (
          <div className="form-group">
            <label>Describí el equipo</label>
            <input
              type="text"
              placeholder="Ej: Panel solar, bomba de calor..."
              value={form.otroEquipo}
              onChange={e => setForm({ ...form, otroEquipo: e.target.value })}
            />
          </div>
        )}

        <div className="form-group">
          <label>Marca {form.equipos.includes('caldera') || form.equipos.includes('mantenimiento') ? 'de la caldera' : 'del equipo principal'}</label>
          {form.equipos.includes('caldera') || form.equipos.includes('mantenimiento') ? (
            <select
              value={form.marca}
              onChange={e => setForm({ ...form, marca: e.target.value, modelo: '' })}
            >
              <option value="">Seleccioná la marca...</option>
              {MARCAS_CALDERA.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <input
              type="text"
              placeholder="Ej: Baxi, Ferroli..."
              value={form.marca}
              onChange={e => setForm({ ...form, marca: e.target.value })}
            />
          )}
        </div>

        <div className="form-group">
          <label>Modelo</label>
          {(form.equipos.includes('caldera') || form.equipos.includes('mantenimiento')) && form.marca && form.marca !== 'OTRA' && form.marca !== 'FLOWING' ? (
            <select
              value={form.modelo}
              onChange={e => setForm({ ...form, modelo: e.target.value })}
            >
              <option value="">Seleccioná el modelo...</option>
              {(MODELOS_CALDERA[form.marca] || []).map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <input
              type="text"
              placeholder="Ej: Luna 3 240 Fi"
              value={form.modelo}
              onChange={e => setForm({ ...form, modelo: e.target.value })}
            />
          )}
        </div>

        <div className="form-group">
          <label>Describí el problema <span className="req">*</span></label>
          <textarea
            placeholder="Ej: La caldera no enciende desde ayer, hace un ruido y apaga sola..."
            value={form.descripcion}
            onChange={e => setForm({ ...form, descripcion: e.target.value })}
          />
        </div>
      </div>

      {/* Foto o Video */}
      <div className="card">
        <div className="card-title">
          <Camera size={18} />
          Foto o video del equipo
        </div>

        <div className="form-group">
          <label>Cargue aquí la foto o video del equipo (hasta 7) (opcional)</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: fotos.length > 0 ? 12 : 0 }}>
            {fotos.map((f, i) => (
              <div key={i} style={{ position: 'relative' }}>
                {f.file.type.startsWith('video/') ? (
                  <div style={{ width: '100%', height: 75, position: 'relative' }}>
                    <video src={f.preview} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8, border: '1px solid #D8E2EE' }} muted />
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)', borderRadius: 8 }}>
                      <span style={{ color: 'white', fontSize: '0.75rem', fontWeight: 'bold' }}>▶</span>
                    </div>
                  </div>
                ) : (
                  <img src={f.preview} alt="Preview" style={{ width: '100%', height: 75, objectFit: 'cover', borderRadius: 8, border: '1px solid #D8E2EE' }} />
                )}
                <button
                  onClick={() => removeFoto(i)}
                  style={{ position: 'absolute', top: -6, right: -6, background: 'var(--rojo)', color: 'white', border: 'none', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', zIndex: 10 }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          {fotos.length < 7 && (
            <div style={{ display: 'flex', gap: 8 }}>
              {/* Foto con cámara — accept solo image/* para forzar apertura de cámara en Android */}
              <label className="file-upload" style={{ flex: 1, padding: '12px 8px' }}>
                <input type="file" accept="image/*" capture="environment" onChange={handleFoto} />
                <div className="file-upload-text">
                  <strong>📷 Foto</strong>
                  Usá la cámara
                </div>
              </label>
              {/* Video con cámara — accept solo video/* para forzar apertura de cámara en Android */}
              <label className="file-upload" style={{ flex: 1, padding: '12px 8px' }}>
                <input type="file" accept="video/*" capture="environment" onChange={handleFoto} />
                <div className="file-upload-text">
                  <strong>🎥 Video</strong>
                  Filmá el equipo
                </div>
              </label>
              {/* Galería — sin capture, abre selector libre */}
              <label className="file-upload" style={{ flex: 1, padding: '12px 8px' }}>
                <input type="file" accept="image/*,video/*" multiple onChange={handleFoto} />
                <div className="file-upload-text">
                  <strong>🖼️ Galería</strong>
                  Elegir archivos
                </div>
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Aviso de precios */}
      <div className="precio-aviso">
        <h3>
          <Info size={18} />
          Información importante sobre precios
        </h3>

        <div className="precio-item">
          <div className="precio-bullet" />
          <p>
            <strong>Reparaciones y mantenimiento preventivo:</strong> los trabajos básicos, incluido el servicio de mantenimiento preventivo, tienen un valor de partida de <strong>${precios.base.toLocaleString('es-AR')} + IVA</strong>.
          </p>
        </div>

        <div className="precio-item">
          <div className="precio-bullet" />
          <p>
            <strong>Problemas más complejos:</strong> si el diagnóstico en el momento revela una falla que requiere mayor intervención, te cotizamos en el lugar antes de hacer cualquier trabajo.
          </p>
        </div>

        <div className="precio-item">
          <div className="precio-bullet" style={{ background: '#E04E2B' }} />
          <p>
            Si la cotización no es aceptada, se abona únicamente <strong>${precios.visita.toLocaleString('es-AR')}</strong> en concepto de visita y diagnóstico.
          </p>
        </div>

        <p className="precio-nota">
          Todos los precios son orientativos y pueden variar según el diagnóstico final. Los valores incluyen mano de obra; los repuestos se cotizan por separado si fuera necesario.
        </p>
      </div>

      {error && (
        <div style={{ background: '#FFF0EE', border: '1.5px solid #E04E2B', borderRadius: 8, padding: '12px 16px', margin: '12px 0', color: '#C0392B', fontSize: '0.9rem' }}>
          {error}
        </div>
      )}

      <button
        className="btn-primary"
        onClick={handleSubmit}
        disabled={enviando}
        style={{ marginTop: 16 }}
      >
        {enviando ? 'Enviando...' : 'Enviar solicitud'}
      </button>

    </div>
  )
}
