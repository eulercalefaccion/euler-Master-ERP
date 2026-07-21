import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore'
import { db } from '../../services/firebaseConfig'
import { ChevronRight, AlertCircle, BookOpen, List } from 'lucide-react'
import PinLock from '../components/PinLock'
import ManualesSoluciones from '../components/ManualesSoluciones'

function formatFecha(ts) {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

const ESTADO_COLOR = {
  'pendiente': '#E65100',
  'coordinado': '#0288D1',
  'en-curso': '#1565C0',
  'visitado-incompleto': '#1565C0',
  'solucionado-cliente': '#7B1FA2',
  'resuelto': '#27AE60',
}

function getEstadoLabel(estado) {
  if (estado === 'en-curso' || estado === 'visitado-incompleto') {
    return 'En curso/Incompleto'
  }
  if (estado === 'solucionado-cliente') {
    return 'Solucionado por el cliente'
  }
  if (estado === 'pendiente') return 'Pendiente'
  if (estado === 'coordinado') return 'Coordinado'
  if (estado === 'resuelto') return 'Resuelto'
  return estado ? estado.charAt(0).toUpperCase() + estado.slice(1).replace('-', ' ') : ''
}

const EQUIPO_LABELS = {
  caldera: 'Caldera', radiador: 'Radiador', piso_radiante: 'Piso Radiante',
  termostato: 'Termostato', climatizador_piscina: 'Climatizador Piscina',
  mantenimiento: 'Mantenimiento Preventivo', otro: 'Otro',
}

export default function Tecnico() {
  const navigate = useNavigate()
  const [usuario, setUsuario] = useState(() => {
    const u = sessionStorage.getItem('euler_tecnico')
    return u ? JSON.parse(u) : null
  })
  const [servicios, setServicios] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroTexto, setFiltroTexto] = useState('')
  const [vistaActual, setVistaActual] = useState('servicios') // 'servicios' | 'manuales'

  useEffect(() => {
    if (!usuario) return
    const q = query(collection(db, 'servicios'), orderBy('creadoEn', 'desc'))
    const unsub = onSnapshot(q, snap => {
      const todos = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      // Mostrar solo pendientes y en-curso, y filtrar por asignación
      const filtradosYOrdenados = todos.filter(s => {
        if (s.estado === 'resuelto' || s.estado === 'solucionado-cliente') return false
        // Si no está asignado a nadie, lo ven todos
        if (!s.tecnico || s.tecnico.trim() === '' || s.tecnico === 'Sin asignar') return true
        // Si está asignado a ESTE técnico, lo ve
        if (s.tecnico === usuario.nombre) return true
        // Si está asignado a otro técnico, NO lo ve
        return false
      }).sort((a, b) => {
        const aEsMio = a.tecnico === usuario.nombre ? 1 : 0
        const bEsMio = b.tecnico === usuario.nombre ? 1 : 0
        if (aEsMio !== bEsMio) {
          return bEsMio - aEsMio // Asignados a mí primero
        }
        const tA = a.creadoEn?.toMillis ? a.creadoEn.toMillis() : new Date(a.creadoEn || 0).getTime()
        const tB = b.creadoEn?.toMillis ? b.creadoEn.toMillis() : new Date(b.creadoEn || 0).getTime()
        return tB - tA
      })
      setServicios(filtradosYOrdenados)
      setLoading(false)
    })
    return unsub
  }, [usuario])

  if (!usuario) {
    return <PinLock modo="tecnico" titulo="Vista Técnico" onUnlock={(u) => {
      sessionStorage.setItem('euler_tecnico', JSON.stringify(u))
      setUsuario(u)
    }} />
  }

  const cerrarSesion = () => {
    sessionStorage.removeItem('euler_tecnico')
    setUsuario(null)
  }

  const serviciosFiltrados = servicios.filter(s => {
    if (filtroTexto) {
      const q = filtroTexto.toLowerCase()
      const n = (s.nombre || '').toLowerCase()
      const a = (s.apellido || '').toLowerCase()
      const d = (s.direccion || '').toLowerCase()
      const l = (s.localidad || '').toLowerCase()
      const full = `${n} ${a} ${d} ${l}`
      if (!full.includes(q)) return false
    }
    return true
  })

  return (
    <div className="container" style={{ maxWidth: 700 }}>
      <div className="admin-header">
        <div>
          <div className="admin-title">Mis Servicios</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--gris-texto)' }}>Hola, {usuario.nombre}</div>
        </div>
        <button className="btn-secondary" onClick={cerrarSesion}>Salir</button>
      </div>

      {/* Pestañas de Navegación del Técnico */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => setVistaActual('servicios')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 16px',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font)',
            fontSize: '0.85rem',
            fontWeight: 600,
            background: vistaActual === 'servicios' ? 'var(--azul)' : '#EEF4FF',
            color: vistaActual === 'servicios' ? 'white' : 'var(--azul)'
          }}
        >
          <List size={15} /> Mis Servicios
        </button>
        <button
          onClick={() => setVistaActual('manuales')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 16px',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font)',
            fontSize: '0.85rem',
            fontWeight: 600,
            background: vistaActual === 'manuales' ? 'var(--naranja)' : '#FFF3E0',
            color: vistaActual === 'manuales' ? 'white' : 'var(--naranja)'
          }}
        >
          <BookOpen size={15} /> Manuales y Soluciones
        </button>
      </div>

      {vistaActual === 'servicios' && (
        <>
          {/* Stats rápidos */}
          <div className="stats-row" style={{ marginBottom: 20 }}>
            <div className="stat-card">
              <div className="stat-number" style={{ color: '#E65100' }}>
                {servicios.filter(s => s.estado === 'pendiente').length}
              </div>
              <div className="stat-label">Pendientes</div>
            </div>
            <div className="stat-card">
              <div className="stat-number" style={{ color: '#1565C0' }}>
                {servicios.filter(s => s.estado === 'en-curso' || s.estado === 'visitado-incompleto').length}
              </div>
              <div className="stat-label">En curso/Incomp.</div>
            </div>
            <div className="stat-card">
              <div className="stat-number" style={{ color: 'var(--azul)' }}>
                {servicios.length}
              </div>
              <div className="stat-label">Total activos</div>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <input 
              type="text" 
              placeholder="Buscar por nombre, apellido, dirección..." 
              value={filtroTexto} 
              onChange={e => setFiltroTexto(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #D8E2EE', fontFamily: 'var(--font)', fontSize: '0.9rem', color: 'var(--azul)', background: '#FAFBFD', outline: 'none', boxShadow: 'var(--sombra)' }} 
            />
          </div>

          {loading ? (
            <div className="loading"><div className="spinner" /></div>
          ) : serviciosFiltrados.length === 0 ? (
            <div className="empty-state">
              <AlertCircle size={48} />
              <p>No hay servicios que coincidan</p>
            </div>
          ) : (
            serviciosFiltrados.map(s => (
              <div key={s.id}
                onClick={() => navigate(`/tecnico/servicio/${s.id}`)}
                style={{
                  background: s.tecnico === usuario.nombre ? '#F4F9FF' : 'white', borderRadius: 12, padding: '16px 18px',
                  marginBottom: 10, boxShadow: 'var(--sombra)', cursor: 'pointer',
                  borderLeft: `4px solid ${s.tecnico === usuario.nombre ? 'var(--azul)' : (ESTADO_COLOR[s.estado] || 'var(--azul)')}`,
                  border: s.tecnico === usuario.nombre ? '1px solid #BEE3F8' : 'none',
                  borderLeftWidth: '4px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    {s.numeroST && <span style={{ fontSize: '0.72rem', color: 'var(--naranja)', fontWeight: 700 }}>{s.numeroST}</span>}
                    <span className={`tag tag-estado tag-${s.estado === 'visitado-incompleto' ? 'en-curso' : s.estado}`}>{getEstadoLabel(s.estado)}</span>
                    {s.tecnico === usuario.nombre && (
                      <span className="tag" style={{ background: '#E3F2FD', color: '#1565C0', border: '1px solid #90CAF9', fontWeight: 'bold', fontSize: '0.68rem' }}>
                        📌 SERVICIO ASIGNADO
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--azul)', fontSize: '1rem', textTransform: 'uppercase' }}>
                    {s.nombre}
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--gris-texto)', marginTop: 4, display: 'grid', gap: 2 }}>
                    <div>📍 <strong>Dirección:</strong> {s.direccion}{s.pisoDpto ? ` (${s.pisoDpto})` : ''}{s.localidad ? `, ${s.localidad}` : ''}</div>
                    {(s.barrio || s.lote) && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--azul-medio)', fontWeight: 500 }}>
                        {s.barrio ? `🏡 Barrio: ${s.barrio} ` : ''}{s.lote ? ` · 📦 Lote: ${s.lote}` : ''}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--gris-texto)', marginTop: 2 }}>
                    {(s.equipos || []).map(e => EQUIPO_LABELS[e] || e).join(', ')}
                    {s.tecnico && ` · 👷 ${s.tecnico}`}
                  </div>
                  {s.fechaAsignada && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--azul-medio)', fontWeight: 600, marginTop: 4 }}>
                      📅 {s.fechaAsignada}
                    </div>
                  )}
                </div>
                <ChevronRight size={20} color="var(--gris-texto)" />
              </div>
            ))
          )}
        </>
      )}

      {vistaActual === 'manuales' && (
        <ManualesSoluciones usuarioRol="tecnico" usuarioNombre={usuario.nombre} />
      )}

      {/* Configuración PWA Dispositivo */}
      {!window.matchMedia('(display-mode: standalone)').matches && (
        <div style={{ marginTop: 40, padding: 16, background: '#EEF4FF', borderRadius: 12, border: '1.5px dashed #C0D0E4', textAlign: 'center' }}>
          <div style={{ fontSize: '0.9rem', color: 'var(--azul)', fontWeight: 700, marginBottom: 8 }}>Instalación en Celular</div>
          <p style={{ fontSize: '0.8rem', color: 'var(--gris-texto)', marginBottom: 12 }}>
            Si querés instalar la aplicación en este celular y que se abra siempre en modo Técnico, tocá el botón de abajo y luego elegí "Agregar a la pantalla de inicio" en el menú de tu navegador.
          </p>
          <button
            onClick={() => {
              localStorage.setItem('euler_device_role', '/tecnico')
              alert('✅ Rol de Técnico asignado a este dispositivo. Ahora podés "Agregar a la pantalla de inicio".')
            }}
            style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--azul)', color: 'white', border: 'none', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
          >
            Fijar Modo Técnico
          </button>
        </div>
      )}
    </div>
  )
}
