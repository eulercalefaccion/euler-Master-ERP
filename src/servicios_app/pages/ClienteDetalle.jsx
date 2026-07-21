import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  doc, getDoc, onSnapshot, updateDoc, collection, query, where, orderBy, getDocs
} from 'firebase/firestore'
import { db } from '../../services/firebaseConfig'
import { FileText, Camera, Edit2, Save, ChevronRight } from 'lucide-react'
import MediaLightbox from '../components/MediaLightbox'
import AutocompleteLocalidad from '../components/AutocompleteLocalidad'

function formatFecha(ts) {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatMoney(val) {
  const n = parseFloat(val) || 0
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const IVA = 0.21
function calcTotal(materiales, manoObra) {
  const mat = (materiales || []).reduce((a, m) => a + (parseFloat(m.precio) || 0) * (parseFloat(m.cant) || 1), 0)
  const mo = (manoObra || []).reduce((a, m) => a + (parseFloat(m.precio) || 0), 0)
  const neto = mat + mo
  return { neto, conIVA: neto * (1 + IVA) }
}

export default function ClienteDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [cliente, setCliente] = useState(null)
  const [servicios, setServicios] = useState([])
  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState({})
  const [mediaActivo, setMediaActivo] = useState(null) // { lista: [...], index: 0 }
  const [guardando, setGuardando] = useState(false)

  const abrirMedia = (lista, index = 0) => {
    if (typeof lista === 'string') {
      const esVideo = lista.toLowerCase().includes('/video/upload/') || lista.match(/\.(mp4|webm|ogg|mov|avi)($|\?)/i)
      setMediaActivo({
        lista: [{ url: lista, tipo: esVideo ? 'video' : 'foto', info: 'Archivo' }],
        index: 0
      })
    } else if (Array.isArray(lista)) {
      setMediaActivo({ lista, index })
    }
  }

  const obtenerMediosTimeline = () => {
    const eventosFoto = timelineEvents.filter(e => e.tipo === 'foto')
    const detectarTipo = (url) => {
      const esVideo = url.toLowerCase().includes('/video/upload/') || url.match(/\.(mp4|webm|ogg|mov|avi)($|\?)/i)
      return esVideo ? 'video' : 'foto'
    }
    return eventosFoto.map(e => ({
      url: e.data.url,
      tipo: detectarTipo(e.data.url),
      info: `${e.titulo} · ST-${e.servicio.numeroST || 'S/N'}`
    }))
  }

  const abrirVisor = (url) => {
    const lista = obtenerMediosTimeline()
    const idx = lista.findIndex(m => m.url === url)
    if (idx !== -1) {
      abrirMedia(lista, idx)
    }
  }

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'clientes', id), snap => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() }
        setCliente(data)
        setForm(data)
      }
    })
    return unsub
  }, [id])

  useEffect(() => {
    const q = query(collection(db, 'servicios'), where('clienteId', '==', id))
    const unsub = onSnapshot(q, snap => {
      const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      // Ordenamiento local descendente (más recientes primero)
      lista.sort((a, b) => {
        const tA = a.creadoEn?.toMillis ? a.creadoEn.toMillis() : new Date(a.creadoEn || 0).getTime()
        const tB = b.creadoEn?.toMillis ? b.creadoEn.toMillis() : new Date(b.creadoEn || 0).getTime()
        return tB - tA
      })
      setServicios(lista)
    }, err => console.error("Error al traer historial:", err))
    return unsub
  }, [id])

  const guardar = async () => {
    setGuardando(true)
    await updateDoc(doc(db, 'clientes', id), {
      nombre: form.nombre,
      telefono: form.telefono,
      email: form.email,
      direccion: form.direccion,
      localidad: form.localidad,
    })
    setEditando(false)
    setGuardando(false)
  }

  const generarPDF = () => {
    if (!cliente) return
    const fecha = new Date().toLocaleDateString('es-AR')

    const historialHTML = servicios.map(s => {
      const { neto, conIVA } = calcTotal(s.materiales, s.manoObra)
      const equipos = (s.equipos || []).join(', ')
      return `
        <div style="margin-bottom:20px;padding:16px;border:1px solid #D8E2EE;border-radius:8px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
            <strong style="color:#1E3A5F">${s.numeroST || '—'} — ${s.descripcion || 'Sin descripción'}</strong>
            <span style="font-size:11px;color:#888">${formatFecha(s.creadoEn)}</span>
          </div>
          ${equipos ? `<div style="font-size:12px;margin-bottom:4px;"><strong>Equipo:</strong> ${equipos}</div>` : ''}
          ${s.marca ? `<div style="font-size:12px;margin-bottom:4px;"><strong>Marca/Modelo:</strong> ${s.marca} ${s.modelo || ''}</div>` : ''}
          ${s.tecnico ? `<div style="font-size:12px;margin-bottom:4px;"><strong>Técnico:</strong> ${s.tecnico}</div>` : ''}
          ${s.diagnostico ? `<div style="font-size:12px;margin-bottom:4px;"><strong>Diagnóstico:</strong> ${s.diagnostico}</div>` : ''}
          ${s.recomendaciones ? `<div style="font-size:12px;margin-bottom:4px;"><strong>Recomendaciones:</strong> ${s.recomendaciones}</div>` : ''}
          ${s.tareasPendientes ? `<div style="font-size:12px;margin-bottom:4px;"><strong>Tareas pendientes:</strong> ${s.tareasPendientes}</div>` : ''}
          ${conIVA > 0 ? `<div style="font-size:12px;margin-top:8px;font-weight:700;color:#1E3A5F;">Total: $${formatMoney(conIVA)} (c/IVA)</div>` : ''}
          <div style="font-size:11px;color:#27AE60;margin-top:4px;font-weight:600;">Estado: ${(s.estado || '').replace('-', ' ').toUpperCase()}</div>
        </div>`
    }).join('')

    // Collect all photos from services
    const todasFotos = servicios.flatMap(s => {
      const fotos = []
      if (s.fotoURL) fotos.push({ url: s.fotoURL, fecha: formatFecha(s.creadoEn), st: s.numeroST || '', tipo: 'Cliente' })
      ;(s.fotosHecnico || []).forEach(f => fotos.push({ url: f.url, fecha: f.fecha || formatFecha(s.creadoEn), st: s.numeroST || '', tipo: 'Técnico' }))
      return fotos
    })

    const fotosHTML = todasFotos.length > 0 ? `
      <h2 style="font-size:13px;font-weight:700;text-transform:uppercase;color:#1E3A5F;margin:24px 0 12px;border-bottom:1px solid #D8E2EE;padding-bottom:4px;">Registro fotográfico</h2>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
        ${todasFotos.map(f => `
          <div style="text-align:center;">
            <img src="${f.url}" style="width:100%;height:100px;object-fit:cover;border-radius:6px;border:1px solid #D8E2EE;" />
            <div style="font-size:10px;color:#888;margin-top:4px;">${f.tipo} · ${f.st} · ${f.fecha}</div>
          </div>`).join('')}
      </div>` : ''

    const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:Arial,sans-serif; color:#1E3A5F; padding:40px; font-size:13px; }
  .header { display:flex; justify-content:space-between; margin-bottom:24px; padding-bottom:16px; border-bottom:3px solid #1E3A5F; }
  .empresa h1 { font-size:26px; font-weight:900; }
  .acento { width:100%; height:3px; background:linear-gradient(90deg,#F5A623,#E04E2B); margin-bottom:24px; }
  h2 { font-size:13px; font-weight:700; text-transform:uppercase; color:#1E3A5F; margin:20px 0 10px; border-bottom:1px solid #D8E2EE; padding-bottom:4px; }
</style>
</head>
<body>
  <div class="header">
    <div class="empresa">
      <h1>EULER</h1>
      <p style="font-size:11px;color:#666">calefacción por agua · www.euler.com.ar</p>
    </div>
    <div style="text-align:right">
      <div style="font-size:11px;color:#888">Historial del cliente</div>
      <div style="font-size:11px;color:#888">Emitido: ${fecha}</div>
    </div>
  </div>
  <div class="acento"></div>

  <h2>Datos del cliente</h2>
  <div style="margin-bottom:20px;">
    <div style="margin-bottom:5px;"><strong>Nombre:</strong> ${cliente.nombre}</div>
    ${cliente.telefono ? `<div style="margin-bottom:5px;"><strong>Teléfono:</strong> ${cliente.telefono}</div>` : ''}
    ${cliente.email ? `<div style="margin-bottom:5px;"><strong>Email:</strong> ${cliente.email}</div>` : ''}
    ${cliente.direccion ? `<div style="margin-bottom:5px;"><strong>Dirección:</strong> ${cliente.direccion}${cliente.localidad ? ', ' + cliente.localidad : ''}</div>` : ''}
  </div>

  <h2>Historial de servicios (${servicios.length})</h2>
  ${historialHTML || '<p style="color:#888;font-size:12px;">Sin servicios registrados</p>'}

  ${fotosHTML}

  <div style="margin-top:40px;padding-top:12px;border-top:1px solid #D8E2EE;font-size:10px;color:#999;text-align:center;">
    <strong>Euler Calefacción</strong> — www.euler.com.ar — Ing. Nicolás F. Ayala
  </div>
</body>
</html>`

    const v = window.open('', '_blank')
    v.document.write(html)
    v.document.close()
    v.focus()
    setTimeout(() => v.print(), 500)
  }

  if (!cliente) return <div className="loading"><div className="spinner" /></div>

  const inp = {
    width: '100%', padding: '9px 12px', border: '1.5px solid #D8E2EE',
    borderRadius: 8, fontFamily: 'var(--font)', fontSize: '0.9rem',
    color: 'var(--azul)', background: '#FAFBFD', outline: 'none', marginBottom: 8,
  }

  // Generar eventos para el historial cronológico (Timeline)
  const timelineEvents = []
  servicios.forEach(s => {
    // 1. Creación del servicio
    const tCreado = s.creadoEn?.toDate ? s.creadoEn.toDate() : new Date(s.creadoEn || 0)
    timelineEvents.push({
      id: `${s.id}-creado`,
      tipo: 'servicio_creado',
      fecha: tCreado,
      servicio: s,
      titulo: 'Servicio Registrado',
      descripcion: s.descripcion || 'Sin descripción',
      color: '#E65100',
      icono: '📝'
    })

    // 2. Visita asignada / llegada
    if (s.horaLlegada || s.fechaAsignada) {
      const tVisita = s.horaLlegada ? new Date(s.horaLlegada) : new Date(s.fechaAsignada + 'T10:00:00')
      timelineEvents.push({
        id: `${s.id}-visita`,
        tipo: 'visita',
        fecha: tVisita,
        servicio: s,
        titulo: 'Visita Técnica',
        descripcion: s.tecnico ? `Técnico: ${s.tecnico}` : 'Visita agendada',
        color: '#1565C0',
        icono: '👷'
      })
    }

    // 3. Notas de Voz
    ;(s.notasVoz || []).forEach((n, i) => {
      const tNota = n.fecha ? new Date(n.fecha) : tCreado
      timelineEvents.push({
        id: `${s.id}-voz-${i}`,
        tipo: 'nota_voz',
        fecha: tNota,
        servicio: s,
        data: n,
        titulo: `Nota de Voz - ${n.tecnico || s.tecnico || 'Técnico'}`,
        color: '#8E44AD',
        icono: '🎙'
      })
    })

    // 4. Fotos
    ;(s.fotosHecnico || []).forEach((f, i) => {
      const tFoto = f.fecha ? new Date(f.fecha) : tCreado
      timelineEvents.push({
        id: `${s.id}-foto-tec-${i}`,
        tipo: 'foto',
        fecha: tFoto,
        servicio: s,
        data: f,
        titulo: `Evidencia Fotográfica (${f.tipo || 'Técnico'})`,
        color: '#2980B9',
        icono: '📷'
      })
    })
    if (s.fotoURL) {
      timelineEvents.push({
        id: `${s.id}-foto-cli`,
        tipo: 'foto',
        fecha: tCreado,
        servicio: s,
        data: { url: s.fotoURL, tipo: 'Cliente' },
        titulo: 'Foto adjuntada por el cliente',
        color: '#2980B9',
        icono: '📷'
      })
    }

    // 5. Resolución / Diagnóstico / Notas
    if (s.diagnostico || s.notasInternas || s.notasTecnico || (s.materiales && s.materiales.length > 0)) {
      const tResolucion = s.fechaCierre ? new Date(s.fechaCierre) : (s.horaSalida ? new Date(s.horaSalida) : new Date(tCreado.getTime() + 1000))
      timelineEvents.push({
        id: `${s.id}-resolucion`,
        tipo: 'resolucion',
        fecha: tResolucion,
        servicio: s,
        titulo: 'Diagnóstico y Avances',
        color: s.estado === 'resuelto' ? '#27AE60' : '#F39C12',
        icono: '📋'
      })
    }
  })

  // Ordenar de más nuevo a más viejo
  timelineEvents.sort((a, b) => b.fecha.getTime() - a.fecha.getTime())

  // Mantenemos todasFotos solo para el PDF, si hiciera falta.
  const todasFotos = timelineEvents.filter(e => e.tipo === 'foto').map(e => ({ ...e.data, st: e.servicio.numeroST }))


  return (
    <div className="container" style={{ maxWidth: 700 }}>

      {/* Header cliente */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            {cliente.numeroCliente && (
              <div style={{ fontSize: '0.78rem', color: 'var(--naranja)', fontWeight: 700, marginBottom: 4 }}>{cliente.numeroCliente}</div>
            )}
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 800, color: 'var(--azul)', textTransform: 'uppercase' }}>
              {cliente.nombreCompleto || `${cliente.nombre} ${cliente.apellido || ''}`.trim()}
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--gris-texto)', marginTop: 4 }}>
              Cliente desde {formatFecha(cliente.creadoEn)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setEditando(!editando)} className="btn-secondary" style={{ padding: '7px 12px' }}>
              <Edit2 size={14} />
            </button>
            <button onClick={generarPDF} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--azul)', color: 'white', border: 'none', borderRadius: 8, fontFamily: 'var(--font)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
              <FileText size={14} /> PDF
            </button>
          </div>
        </div>

        {editando ? (
          <>
            <input style={inp} placeholder="Nombre" value={form.nombre || ''} onChange={e => setForm({ ...form, nombre: e.target.value })} />
            <input style={inp} placeholder="Teléfono" value={form.telefono || ''} onChange={e => setForm({ ...form, telefono: e.target.value })} />
            <input style={inp} placeholder="Email" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} />
            <input style={inp} placeholder="Dirección" value={form.direccion || ''} onChange={e => setForm({ ...form, direccion: e.target.value })} />
            <AutocompleteLocalidad
              value={form.localidad || ''}
              onChange={val => setForm({ ...form, localidad: val })}
              placeholder="Localidad"
              inputStyle={inp}
              style={{ marginBottom: 8 }}
            />
            <button className="btn-primary" onClick={guardar} disabled={guardando}>
              <Save size={14} style={{ marginRight: 6 }} />
              {guardando ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {cliente.telefono && (
              <a href={`https://wa.me/54${cliente.telefono.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', background: '#25D366', color: 'white', borderRadius: 8, textDecoration: 'none', fontSize: '0.85rem', fontWeight: 600 }}>
                💬 WhatsApp
              </a>
            )}
            {cliente.direccion && (
              <a href={`https://maps.google.com/?q=${encodeURIComponent((cliente.direccion || '') + ' ' + (cliente.localidad || ''))}`} target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', background: '#4285F4', color: 'white', borderRadius: 8, textDecoration: 'none', fontSize: '0.85rem', fontWeight: 600 }}>
                📍 Ver en mapa
              </a>
            )}
            {cliente.email && <div style={{ fontSize: '0.85rem', color: 'var(--gris-texto)', gridColumn: '1/-1' }}>✉️ {cliente.email}</div>}
            {cliente.direccion && <div style={{ fontSize: '0.85rem', color: 'var(--gris-texto)', gridColumn: '1/-1' }}>📍 {cliente.direccion}{cliente.localidad ? `, ${cliente.localidad}` : ''}</div>}
          </div>
        )}
      </div>

      {/* Historial de Línea de Tiempo */}
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, color: 'var(--azul)', textTransform: 'uppercase', marginBottom: 12 }}>
        Línea de tiempo del cliente
      </div>

      {timelineEvents.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--gris-texto)', padding: 32 }}>
          Sin historial registrado todavía
        </div>
      ) : (
        <div style={{ position: 'relative', paddingLeft: 20, marginTop: 16 }}>
          {/* Línea vertical */}
          <div style={{ position: 'absolute', left: 4, top: 10, bottom: 0, width: 2, background: '#D8E2EE' }} />

          {timelineEvents.map(evento => {
            const conIVA = evento.tipo === 'resolucion' ? calcTotal(evento.servicio.materiales, evento.servicio.manoObra).conIVA : 0
            
            return (
            <div key={evento.id} style={{ position: 'relative', marginBottom: 24 }}>
              {/* Punto en la línea de tiempo */}
              <div style={{ position: 'absolute', left: -22, top: 16, width: 12, height: 12, borderRadius: '50%', background: evento.color, border: '3px solid #FAFBFD', boxShadow: '0 0 0 1.5px #D8E2EE', zIndex: 1 }} />
              
              <div style={{ background: 'white', borderRadius: 12, padding: 16, boxShadow: 'var(--sombra)', border: '1px solid #EAECEF', borderTop: `4px solid ${evento.color}` }}>
                {/* Cabecera del evento */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>{evento.icono}</span>
                    <span style={{ fontWeight: 800, color: 'var(--azul)', textTransform: 'uppercase', fontSize: '0.85rem' }}>{evento.titulo}</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gris-texto)', textAlign: 'right', lineHeight: 1.3 }}>
                    {evento.fecha.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}<br/>
                    <strong style={{ color: 'var(--azul)' }}>{evento.fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</strong>
                  </div>
                </div>

                {/* Contenido del evento */}
                {evento.tipo === 'servicio_creado' && (
                  <div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--azul)', marginBottom: 8 }}><strong>Problema reportado:</strong> {evento.descripcion}</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {evento.servicio.numeroST && <span className="tag" style={{ background: '#FFF3E0', color: '#E65100', border: '1px solid #FFCC80' }}>ST: {evento.servicio.numeroST}</span>}
                      <span className={`tag tag-estado tag-${evento.servicio.estado}`}>{evento.servicio.estado.replace('-', ' ')}</span>
                      {evento.servicio.equipos?.length > 0 && <span className="tag" style={{ background: '#EEF4FF', color: 'var(--azul)' }}>🔧 {evento.servicio.equipos.join(', ')}</span>}
                    </div>
                  </div>
                )}

                {evento.tipo === 'visita' && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--azul)' }}>{evento.descripcion}</div>
                )}

                {evento.tipo === 'nota_voz' && (
                  <div style={{ background: '#F4F6F9', borderRadius: 8, padding: 10, border: '1px solid #D8E2EE' }}>
                    <audio src={evento.data.audioURL} controls style={{ width: '100%', height: 36, marginBottom: 6 }} />
                    <div style={{ fontSize: '0.85rem', color: 'var(--azul)', fontStyle: 'italic' }}>
                      "{evento.data.transcripcion || 'Sin transcripción (Solo audio)'}"
                    </div>
                  </div>
                )}

                {evento.tipo === 'foto' && (
                  <div onClick={() => abrirVisor(evento.data.url)} style={{ cursor: 'pointer', display: 'inline-block', width: 120, height: 120, position: 'relative' }}>
                    {(() => {
                      const esVideo = evento.data.url.toLowerCase().includes('/video/upload/') || evento.data.url.match(/\.(mp4|webm|ogg|mov|avi)($|\?)/i)
                      return esVideo ? (
                        <div className="video-thumbnail-container" style={{ borderRadius: 8 }}>
                          <video src={evento.data.url} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} muted />
                          <div className="video-play-overlay" style={{ borderRadius: 8 }}>
                            <div className="play-icon-circle">▶</div>
                          </div>
                        </div>
                      ) : (
                        <img src={evento.data.url} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8, border: '1px solid #D8E2EE' }} />
                      )
                    })()}
                  </div>
                )}

                {evento.tipo === 'resolucion' && (
                  <div>
                    {evento.servicio.diagnostico && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--naranja)', textTransform: 'uppercase', marginBottom: 4 }}>Diagnóstico / Trabajo Realizado</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--azul)', whiteSpace: 'pre-wrap' }}>{evento.servicio.diagnostico}</div>
                      </div>
                    )}
                    {((evento.servicio.notasInternasHistorial && evento.servicio.notasInternasHistorial.length > 0) || evento.servicio.notasInternas) && (
                      <div style={{ marginBottom: 12, borderLeft: '3px solid var(--azul)', paddingLeft: 8, display: 'grid', gap: 6 }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--gris-texto)', textTransform: 'uppercase', marginBottom: 2 }}>Notas Internas (Admin)</div>
                        {evento.servicio.notasInternasHistorial?.map((nota, idx) => (
                          <div key={idx} style={{ fontSize: '0.82rem', borderBottom: idx < evento.servicio.notasInternasHistorial.length - 1 ? '1px solid #EAECEF' : 'none', paddingBottom: idx < evento.servicio.notasInternasHistorial.length - 1 ? 4 : 0 }}>
                            <span style={{ fontSize: '0.68rem', color: 'var(--gris-suave)', fontWeight: 600 }}>
                              {new Date(nota.fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <div style={{ color: 'var(--azul)', whiteSpace: 'pre-wrap', marginTop: 1 }}>{nota.texto}</div>
                          </div>
                        ))}
                        {evento.servicio.notasInternas && (!evento.servicio.notasInternasHistorial || evento.servicio.notasInternasHistorial.length === 0) && (
                          <div style={{ fontSize: '0.85rem', color: 'var(--azul)', whiteSpace: 'pre-wrap' }}>{evento.servicio.notasInternas}</div>
                        )}
                      </div>
                    )}
                    {evento.servicio.notasTecnico && (
                      <div style={{ marginBottom: 12, borderLeft: '3px solid #27AE60', paddingLeft: 8 }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--gris-texto)', textTransform: 'uppercase', marginBottom: 4 }}>Notas del Técnico</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--azul)', fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>"{evento.servicio.notasTecnico}"</div>
                      </div>
                    )}
                    {((evento.servicio.materiales || []).length > 0) && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--naranja)', textTransform: 'uppercase', marginBottom: 6 }}>Materiales y Repuestos</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 4 }}>
                          {(evento.servicio.materiales || []).map((m, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', borderBottom: '1px solid #EAECEF', paddingBottom: 4 }}>
                              <span>{m.cant}x {m.desc}</span>
                              <span style={{ color: 'var(--gris-texto)' }}>${formatMoney(m.precio * m.cant)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {conIVA > 0 && (
                      <div style={{ textAlign: 'right', fontSize: '0.85rem', fontWeight: 700, color: 'var(--azul)', paddingTop: 8, borderTop: '1px solid #EAECEF' }}>
                        Total cobrado (c/IVA): ${formatMoney(conIVA)}
                      </div>
                    )}
                  </div>
                )}

                {/* Footer del evento: Link al servicio */}
                <div style={{ marginTop: 12, textAlign: 'right', paddingTop: 8, borderTop: '1px dashed #EAECEF' }}>
                  <button onClick={() => navigate(`/admin?servicio=${evento.servicio.id}`)} style={{ background: 'none', border: 'none', fontSize: '0.7rem', color: 'var(--azul-medio)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', cursor: 'pointer', textTransform: 'uppercase' }}>
                    Ver ST-{evento.servicio.numeroST || 'S/N'} <ChevronRight size={14} style={{ marginLeft: 2 }} />
                  </button>
                </div>
              </div>
            </div>
            )
          })}
        </div>
      )}

      {mediaActivo && (
        <MediaLightbox
          media={mediaActivo.lista}
          index={mediaActivo.index}
          onClose={() => setMediaActivo(null)}
          onChangeIndex={(idx) => setMediaActivo({ ...mediaActivo, index: idx })}
        />
      )}
    </div>
  )
}
