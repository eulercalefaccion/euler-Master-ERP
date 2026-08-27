import { useState, useEffect, useMemo, Component, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection, onSnapshot, doc, updateDoc, deleteDoc, query, orderBy, getDocs, addDoc, serverTimestamp, setDoc, writeBatch, arrayUnion
} from 'firebase/firestore'
import { db, app } from '../../services/firebaseConfig'
import { Plus, Clipboard, AlertCircle, ChevronDown, ChevronUp, FileText, Trash2, PlusCircle, XCircle, Link, Clock, Map, List, Download, Settings, Users, Edit3, Eye, EyeOff, Check, X, Shield, Wrench, MessageCircle, MapPin, Calendar, BookOpen, DollarSign, TrendingUp, Package, Banknote, CreditCard } from 'lucide-react'
import { useTecnicos } from '../components/PinLock'
import MapaServicios from '../components/MapaServicios'
import MediaLightbox from '../components/MediaLightbox'
import ManualesSoluciones from '../components/ManualesSoluciones'
import AutocompleteLocalidad from '../components/AutocompleteLocalidad'
import * as XLSX from 'xlsx'
// useAuth provided by ERP auth shim
const useAuth = () => ({ user: { uid: 'erp-admin', nombre: 'Administrador', role: 'admin' }, logout: () => {} })
import TranscriberWorker from '../worker?worker'

// ── Error Boundary ─────────────────────────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, background: '#FFF3E0', border: '1.5px solid var(--naranja)', borderRadius: 12, color: 'var(--azul)' }}>
          <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 8 }}>⚠️ Error al cargar Configuración</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--gris-texto)', marginBottom: 16 }}>
            {this.state.error?.message || 'Ocurrió un error inesperado.'}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ padding: '8px 16px', background: 'var(--azul)', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 600 }}
          >
            Reintentar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}


const ESTADOS = ['pendiente', 'coordinado', 'en-curso', 'solucionado-cliente', 'resuelto']
const IVA = 0.21

export function getEstadoLabel(estado) {
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
  caldera: 'Caldera',
  radiador: 'Radiador',
  piso_radiante: 'Piso Radiante',
  termostato: 'Termostato',
  climatizador_piscina: 'Climatizador Piscina',
  mantenimiento: 'Mantenimiento Preventivo / Puesta en Marcha',
  otro: 'Otro',
}

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

const MAT_VACIO = () => ({ desc: '', cant: 1, precio: '' })
const MO_VACIO = () => ({ desc: '', precio: '' })

function formatFecha(ts) {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function formatMoney(val) {
  const n = parseFloat(val) || 0
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function calcTotalesItems(materiales, manoObra) {
  const totalMatNeto = (materiales || []).reduce((acc, m) => acc + (parseFloat(m.precio) || 0) * (parseFloat(m.cant) || 1), 0)
  const totalMoNeto = (manoObra || []).reduce((acc, m) => acc + (parseFloat(m.precio) || 0), 0)
  const sinIVA = totalMatNeto + totalMoNeto
  const ivaTotal = sinIVA * IVA
  const conIVA = sinIVA + ivaTotal
  return { totalMatNeto, totalMoNeto, sinIVA, ivaTotal, conIVA }
}

// ── PDF Generator ─────────────────────────────────────────────────────────────
function generarPDF(s, esRecibo = false) {
  const materiales = s.materiales || []
  const manoObra = s.manoObra || []
  const { totalMatNeto, totalMoNeto, sinIVA, ivaTotal, conIVA } = calcTotalesItems(materiales, manoObra)
  const equipos = (s.equipos || []).map(e => EQUIPO_LABELS[e] || e).join(', ')
  const fecha = new Date().toLocaleDateString('es-AR')

  const fechaCierreStr = s.fechaCierre ? new Date(s.fechaCierre).toLocaleDateString('es-AR').replace(/\//g, '-') : fecha.replace(/\//g, '-')
  const fileName = `SSTT_${s.nombre ? s.nombre.toUpperCase() : 'CLIENTE'}_${fechaCierreStr}`

  const filasMat = materiales.map(m => {
    const subtotal = (parseFloat(m.precio) || 0) * (parseFloat(m.cant) || 1)
    return `<tr>
      <td>${m.desc || '—'}</td>
      <td class="td-right">${m.cant || 1}</td>
      <td class="td-right">$${formatMoney(m.precio)}</td>
      <td class="td-right">$${formatMoney(subtotal)}</td>
    </tr>`
  }).join('')

  const filasMO = manoObra.map(m => `<tr>
    <td>${m.desc || '—'}</td>
    <td class="td-right" colspan="3">$${formatMoney(m.precio)}</td>
  </tr>`).join('')

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>${fileName}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; color: #1E3A5F; padding: 20px 40px 30px; font-size: 13px; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px; padding-bottom:16px; border-bottom:3px solid #1E3A5F; }
  .empresa h1 { font-size:28px; font-weight:900; letter-spacing:1px; color:#1E3A5F; }
  .empresa p { font-size:11px; color:#666; margin-top:2px; }
  .numero { text-align:right; }
  .numero .st { font-size:22px; font-weight:800; color:#1E3A5F; }
  .numero .fecha { font-size:11px; color:#888; margin-top:4px; }
  .acento { width:100%; height:3px; background:linear-gradient(90deg,#F5A623,#E04E2B); margin-bottom:24px; }
  h2 { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:#1E3A5F; margin-bottom:8px; padding-bottom:4px; border-bottom:1px solid #D8E2EE; }
  .seccion { margin-bottom:20px; }
  .fila { display:flex; gap:8px; margin-bottom:5px; }
  .fila .label { font-weight:600; min-width:120px; color:#1E3A5F; }
  .fila .valor { color:#333; }
  table { width:100%; border-collapse:collapse; margin-top:8px; margin-bottom:16px; }
  th { background:#1E3A5F; color:white; padding:8px 12px; text-align:left; font-size:12px; }
  td { padding:7px 12px; border-bottom:1px solid #EEF4FF; font-size:12px; }
  .td-right { text-align:right; }
  .subtotal-row td { font-weight:700; background:#EEF4FF; }
  .total-final td { font-weight:800; font-size:14px; background:#1E3A5F; color:white; }
  .footer { margin-top:32px; padding-top:12px; border-top:1px solid #D8E2EE; font-size:10px; color:#999; text-align:center; }
  .footer strong { color:#1E3A5F; }
</style>
</head>
<body>
  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
    <div style="width: 55%; max-width: 350px;">
      <img src="${import.meta.env.VITE_PDF_LOGO || window.location.origin + '/membrete.jpeg'}" style="width: 100%; height: auto; display: block;" />
    </div>
    <div class="numero" style="text-align: right;">
      <div class="st" style="font-size:22px; font-weight:800; color:#1E3A5F;">${s.numeroST || 'ST-PENDIENTE'}</div>
      <div class="fecha" style="font-size:11px; color:#888; margin-top:4px;">Fecha: ${fecha}</div>
      <div class="fecha" style="margin-top:4px;font-weight:700;color:#E04E2B;font-size:13px;">${esRecibo ? 'COMPROBANTE DE PAGO' : 'PRESUPUESTO'}</div>
    </div>
  </div>
  <div class="acento"></div>

  <div class="seccion">
    <h2>Datos del cliente</h2>
    <div class="fila"><span class="label">Cliente:</span><span class="valor">${s.nombre || '—'}</span></div>
    <div class="fila"><span class="label">Teléfono:</span><span class="valor">${s.telefono || '—'}</span></div>
    ${s.email ? `<div class="fila"><span class="label">Email:</span><span class="valor">${s.email}</span></div>` : ''}
    <div class="fila"><span class="label">Dirección:</span><span class="valor">${s.direccion || '—'}${s.localidad ? ', ' + s.localidad : ''}</span></div>
  </div>

  <div class="seccion">
    <h2>Detalle del servicio</h2>
    <div class="fila"><span class="label">Equipo:</span><span class="valor">${equipos || '—'}</span></div>
    ${s.marca ? `<div class="fila"><span class="label">Marca / Modelo:</span><span class="valor">${s.marca} ${s.modelo || ''}</span></div>` : ''}
    <div class="fila"><span class="label">Descripción:</span><span class="valor">${s.descripcion || '—'}</span></div>
    ${s.tecnico ? `<div class="fila"><span class="label">Técnico:</span><span class="valor">${s.tecnico}</span></div>` : ''}
    ${s.fechaAsignada ? `<div class="fila"><span class="label">Fecha visita:</span><span class="valor">${s.fechaAsignada}</span></div>` : ''}
  </div>

  ${materiales.length > 0 ? `
  <div class="seccion">
    <h2>Materiales</h2>
    <table>
      <thead><tr><th>Descripción</th><th class="td-right">Cant.</th><th class="td-right">Precio unit.</th><th class="td-right">Subtotal</th></tr></thead>
      <tbody>
        ${filasMat}
        <tr class="subtotal-row">
          <td colspan="3">Subtotal materiales (sin IVA)</td>
          <td class="td-right">$${formatMoney(totalMatNeto)}</td>
        </tr>
      </tbody>
    </table>
  </div>` : ''}

  ${manoObra.length > 0 ? `
  <div class="seccion">
    <h2>Mano de obra</h2>
    <table>
      <thead><tr><th>Descripción</th><th class="td-right" colspan="3">Importe (sin IVA)</th></tr></thead>
      <tbody>
        ${filasMO}
        <tr class="subtotal-row">
          <td colspan="3">Subtotal mano de obra (sin IVA)</td>
          <td class="td-right">$${formatMoney(totalMoNeto)}</td>
        </tr>
      </tbody>
    </table>
  </div>` : ''}

  <div class="seccion">
    <h2>Resumen económico</h2>
    <table>
      <tbody>
        ${(esRecibo && s.cobroSinIva) ? `
        <tr class="total-final"><td>TOTAL ABONADO (sin IVA)</td><td class="td-right">$${formatMoney(sinIVA)}</td></tr>
        ` : `
        <tr><td>Subtotal neto (sin IVA)</td><td class="td-right">$${formatMoney(sinIVA)}</td></tr>
        <tr><td>IVA 21%</td><td class="td-right">$${formatMoney(ivaTotal)}</td></tr>
        <tr class="total-final"><td>${esRecibo ? 'TOTAL ABONADO' : 'TOTAL A ABONAR'} (IVA incluido)</td><td class="td-right">$${formatMoney(conIVA)}</td></tr>
        `}
      </tbody>
    </table>
  </div>
  ${esRecibo ? `
  <div class="seccion" style="margin-top:20px; background:#EEF4FF; padding:12px; border-radius:6px; border:1px solid #D8E2EE;">
    <h2 style="border:none; margin-bottom:4px; font-size:13px; padding-bottom:0;">Información de Pago</h2>
    <div class="fila" style="margin-top:8px;"><span class="label" style="width:120px;">Método utilizado:</span><span class="valor" style="font-weight:700;">${s.metodoPago || 'No especificado'}</span></div>
  </div>
  ` : ''}

  ${s.diagnostico ? `
  <div class="seccion" style="margin-top:20px;">
    <h2>Diagnóstico / Notas técnicas</h2>
    <p style="font-size:12px;color:#333;line-height:1.6;">${s.diagnostico}</p>
  </div>` : ''}

  ${s.recomendaciones ? `
  <div class="seccion">
    <h2>Recomendaciones</h2>
    <p style="font-size:12px;color:#333;line-height:1.6;">${s.recomendaciones}</p>
  </div>` : ''}

  ${s.tareasPendientes ? `
  <div class="seccion">
    <h2>Tareas pendientes</h2>
    <p style="font-size:12px;color:#333;line-height:1.6;">${s.tareasPendientes}</p>
  </div>` : ''}

  <div class="footer">
    ${import.meta.env.VITE_PDF_FOOTER || '<strong>Euler Calefacción</strong> — www.euler.com.ar — Ing. Nicolás F. Ayala'}
  </div>
  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 300);
    };
  </script>
</body>
</html>`

  const ventana = window.open('', '_blank')
  ventana.document.write(html)
  ventana.document.title = fileName
  ventana.document.close()
  ventana.focus()
}

// ── Servicio Card ──────────────────────────────────────────────────────────────
const SyncInput = ({ value, onChange, ...props }) => {
  const ref = useRef(null);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused && ref.current && ref.current.value !== (value || '')) ref.current.value = value || ''; }, [value, focused]);
  return <input {...props} ref={ref} defaultValue={value || ''} onFocus={() => setFocused(true)} onBlur={e => { setFocused(false); if (e.target.value !== (value || '')) onChange(e.target.value); }} />
}

const SyncTextarea = ({ value, onChange, ...props }) => {
  const ref = useRef(null);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused && ref.current && ref.current.value !== (value || '')) ref.current.value = value || ''; }, [value, focused]);
  return <textarea {...props} ref={ref} defaultValue={value || ''} onFocus={() => setFocused(true)} onBlur={e => { setFocused(false); if (e.target.value !== (value || '')) onChange(e.target.value); }} />
}

function ServicioCard({ s, onUpdate, onEliminar, onFoto, clientes, navigate }) {
  const { nombre: nombreUsuario } = useAuth()
  const [expandido, setExpandido] = useState(false)
  const [materiales, setMateriales] = useState(s.materiales || [])
  const [manoObra, setManoObra] = useState(s.manoObra || [])
  const [transcribiendoIdx, setTranscribiendoIdx] = useState(null)
  const [mostrarModalFecha, setMostrarModalFecha] = useState(false)
  const [fechaResolucion, setFechaResolucion] = useState(() => new Date().toISOString().slice(0, 10))
  const [nuevaNotaTexto, setNuevaNotaTexto] = useState('')
  const [subiendoFotoAdmin, setSubiendoFotoAdmin] = useState(false)

  const subirFotoAdmin = async (file, tipo) => {
    setSubiendoFotoAdmin(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('upload_preset', 'euler_servicios')
      const resourceType = file.type.startsWith('video/') ? 'video' : 'image'
      const res = await fetch(`https://api.cloudinary.com/v1_1/djehdlthw/${resourceType}/upload`, { method: 'POST', body: fd })
      const data = await res.json()
      const foto = { url: data.secure_url, fecha: new Date().toISOString(), tipo, subidoPor: nombreUsuario || 'Admin' }
      await updateDoc(doc(db, 'servicios', s.id), { fotosAdmin: arrayUnion(foto) })
    } catch (e) { console.error(e) }
    setSubiendoFotoAdmin(false)
  }

  const handleGuardarNota = async () => {
    const texto = nuevaNotaTexto.trim()
    if (!texto) return
    const nuevaNotaObj = {
      fecha: new Date().toISOString(),
      texto
    }
    const historial = [...(s.notasInternasHistorial || []), nuevaNotaObj]
    const legacyText = s.notasInternas ? `${s.notasInternas}\n\n[${new Date().toLocaleString('es-AR')}] ${texto}` : texto
    await upd({
      notasInternasHistorial: historial,
      notasInternas: legacyText
    })
    setNuevaNotaTexto('')
  }

  const detectarTipo = (url) => {
    const esVideo = url.toLowerCase().includes('/video/upload/') || url.match(/\.(mp4|webm|ogg|mov|avi)($|\?)/i)
    return esVideo ? 'video' : 'foto'
  }

  const obtenerMedios = () => {
    const lista = []
    if (s.fotoURL) {
      lista.push({ url: s.fotoURL, tipo: detectarTipo(s.fotoURL), info: 'Foto inicial' })
    }
    if (s.fotosCliente && Array.isArray(s.fotosCliente)) {
      s.fotosCliente.forEach((url, i) => {
        lista.push({ url: url, tipo: detectarTipo(url), info: `Cliente - Archivo ${i + 1}` })
      })
    }
    if (s.fotosHecnico && Array.isArray(s.fotosHecnico)) {
      s.fotosHecnico.forEach((f) => {
        if (f && f.url) {
          lista.push({ url: f.url, tipo: detectarTipo(f.url), info: `Técnico - ${f.tipo || 'Galería'}` })
        }
      })
    }
    if (s.fotosAdmin && Array.isArray(s.fotosAdmin)) {
      s.fotosAdmin.forEach((f) => {
        if (f && f.url) {
          lista.push({ url: f.url, tipo: detectarTipo(f.url), info: `Admin - ${f.tipo || 'Galería'}` })
        }
      })
    }
    return lista
  }

  const abrirVisor = (url) => {
    const lista = obtenerMedios()
    const idx = lista.findIndex(m => m.url === url)
    if (idx !== -1) {
      onFoto(lista, idx)
    }
  }

  const transcribirVieja = async (nota, idx) => {
    setTranscribiendoIdx(idx)
    try {
      const res = await fetch(nota.audioURL)
      const arrayBuffer = await res.arrayBuffer()
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 })
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
      const audioData = audioBuffer.getChannelData(0)
      
      const worker = new TranscriberWorker()
      worker.onmessage = async (e) => {
        const { status, text, error } = e.data
        if (status === 'ready') {
          worker.postMessage({ type: 'transcribe', audio: audioData })
        } else if (status === 'complete') {
          const docSnap = await getDoc(doc(db, 'servicios', s.id))
          const currentNotas = docSnap.data().notasVoz || []
          currentNotas[idx].transcripcion = text || ''
          await onUpdate(s.id, { notasVoz: currentNotas })
          setTranscribiendoIdx(null)
          worker.terminate()
        } else if (status === 'error') {
          alert('Error al transcribir: ' + (error || 'desconocido'))
          setTranscribiendoIdx(null)
          worker.terminate()
        }
      }
      worker.postMessage({ type: 'load' })
    } catch (e) {
      console.error(e)
      setTranscribiendoIdx(null)
      alert('Error al procesar el audio')
    }
  }

  const { totalMatNeto, totalMoNeto, sinIVA, ivaTotal, conIVA } = calcTotalesItems(materiales, manoObra)
  const upd = (data) => onUpdate(s.id, data)

  // Sync items to Firebase on change
  const updMat = (items) => { setMateriales(items); onUpdate(s.id, { materiales: items }) }
  const updMO = (items) => { setManoObra(items); onUpdate(s.id, { manoObra: items }) }

  const addMat = () => updMat([...materiales, MAT_VACIO()])
  const removeMat = (i) => updMat(materiales.filter((_, idx) => idx !== i))
  const editMat = (i, field, val) => {
    const nuevo = materiales.map((m, idx) => idx === i ? { ...m, [field]: val } : m)
    updMat(nuevo)
  }

  const addMO = () => updMO([...manoObra, MO_VACIO()])
  const removeMO = (i) => updMO(manoObra.filter((_, idx) => idx !== i))
  const editMO = (i, field, val) => {
    const nuevo = manoObra.map((m, idx) => idx === i ? { ...m, [field]: val } : m)
    updMO(nuevo)
  }

  const inputStyle = {
    width: '100%',
    padding: '7px 10px',
    border: '1.5px solid #D8E2EE',
    borderRadius: 7,
    fontFamily: 'var(--font)',
    fontSize: '0.83rem',
    color: 'var(--azul)',
    background: '#FAFBFD',
    outline: 'none',
  }

  const sectionLabel = (txt) => (
    <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--naranja)', marginBottom: 8 }}>{txt}</div>
  )

  return (
    <div className={`servicio-card ${s.estado}`}>

      {/* Cabecera siempre visible */}
      <div className="servicio-top">
        <div>
          <div className="servicio-cliente">
            {s.numeroST && <span style={{ fontSize: '0.72rem', color: 'var(--naranja)', fontWeight: 700, marginRight: 8 }}>{s.numeroST}</span>}
            {s.nombre}
          </div>
          <div className="servicio-fecha">Ingresó: {formatFecha(s.creadoEn)}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {s.estadoPago === 'pagado' && <span className="tag" style={{ background: '#E8F5E9', color: '#2E7D32', border: '1px solid #A5D6A7' }}>PAGADO</span>}
          {s.estadoPago === 'en-garantia' && <span className="tag" style={{ background: '#FFF3E0', color: '#E65100', border: '1px solid #FFCC80' }}>GARANTÍA</span>}
          {s.estadoPago === 'no-corresponde' && <span className="tag" style={{ background: '#ECEFF1', color: '#455A64', border: '1px solid #CFD8DC' }}>NO CORRESPONDE</span>}
          {(!s.estadoPago || s.estadoPago === 'a-cobrar') && s.estadoPago !== 'no-corresponde' && (s.estado === 'resuelto' || conIVA > 0) && <span className="tag" style={{ background: '#FFEBEE', color: '#C62828', border: '1px solid #EF9A9A' }}>A COBRAR</span>}

          {s.tieneActualizacionCliente && <span className="tag" style={{ background: '#FFF3E0', color: '#E65100', border: '1.5px solid #FF9800', fontWeight: 700, animation: 'pulse 2s infinite' }}>🔔 ACTUALIZACIÓN</span>}

          <span className={`tag tag-estado tag-${s.estado === 'visitado-incompleto' ? 'en-curso' : s.estado}`}>{getEstadoLabel(s.estado)}</span>
          <button onClick={() => setExpandido(!expandido)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--azul)', display: 'flex', padding: 4 }}>
            {expandido ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        </div>
      </div>

      {/* Info rápida */}
      <div className="servicio-equipo">
        {(s.equipos || []).map(eq => (
          <span key={eq} className="tag tag-equipo">
            {EQUIPO_LABELS[eq] || eq}{eq === 'otro' && s.otroEquipo ? ` (${s.otroEquipo})` : ''}
          </span>
        ))}
      </div>
      <div className="servicio-info"><strong>📍</strong> {s.direccionCompleta || s.direccion || '—'}{s.localidad ? `, ${s.localidad}` : ''}</div>
      {s.telefono && <div className="servicio-info"><strong>📱</strong> {s.telefono}</div>}
      
      {/* Botones de Acción Rápida */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, marginBottom: 8 }}>
        {s.telefono && (
          <a href={`https://wa.me/54${s.telefono.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#25D366', color: 'white', borderRadius: 6, textDecoration: 'none', fontSize: '0.75rem', fontWeight: 600 }}>
            <MessageCircle size={14} /> WhatsApp
          </a>
        )}
        {(s.direccionCompleta || s.direccion) && (
          <a href={`https://maps.google.com/?q=${encodeURIComponent((s.direccionCompleta || s.direccion || '') + ' ' + (s.localidad || ''))}`} target="_blank" rel="noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#4285F4', color: 'white', borderRadius: 6, textDecoration: 'none', fontSize: '0.75rem', fontWeight: 600 }}>
            <MapPin size={14} /> Google Maps
          </a>
        )}
      </div>

      {s.tecnico && <div className="servicio-info"><strong>👷</strong> {s.tecnico}{s.fechaAsignada ? ` — ${s.fechaAsignada}` : ''}</div>}
      {(s.notasVoz || []).length > 0 && <div className="servicio-info"><strong>🎙</strong> {s.notasVoz.length} nota{s.notasVoz.length !== 1 ? 's' : ''} de voz</div>}
      {(materiales.length > 0 || manoObra.length > 0) && (
        <div className="servicio-info"><strong>💰</strong> Total: <strong>${formatMoney(conIVA)}</strong> c/IVA</div>
      )}

      {/* Panel expandible */}
      {expandido && (
        <div style={{ marginTop: 16, borderTop: '2px solid var(--gris-claro)', paddingTop: 16 }}>

          {/* Alerta de actualización del cliente */}
          {s.tieneActualizacionCliente && (
            <div style={{
              background: '#FFF3E0', border: '1.5px solid #FF9800', borderRadius: 10,
              padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', gap: 12, flexWrap: 'wrap'
            }}>
              <div style={{ fontSize: '0.85rem', color: '#E65100' }}>
                <strong>🔔 El cliente envió una actualización</strong>
                {s.ultimaActualizacionCliente && (
                  <span style={{ marginLeft: 8, fontSize: '0.78rem', color: '#BF360C' }}>
                    — {formatFecha(s.ultimaActualizacionCliente)}
                  </span>
                )}
                <div style={{ fontSize: '0.78rem', color: '#795548', marginTop: 4 }}>
                  Revisá la descripción y fotos del servicio. Puede haber información nueva.
                </div>
              </div>
              <button
                onClick={() => upd({ tieneActualizacionCliente: false })}
                style={{
                  padding: '6px 14px', background: '#FF9800', color: 'white', border: 'none',
                  borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 600,
                  fontSize: '0.78rem', whiteSpace: 'nowrap'
                }}
              >
                <Check size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                Marcar como vista
              </button>
            </div>
          )}

          {/* Datos del cliente */}
          <div style={{ marginBottom: 16 }}>
            {sectionLabel('Datos del cliente')}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <SyncInput style={inputStyle} placeholder="Nombre" value={s.nombre || ''} onChange={val => upd({ nombre: val })} />
              <SyncInput style={inputStyle} placeholder="Teléfono" value={s.telefono || ''} onChange={val => upd({ telefono: val })} />
              <SyncInput style={{ ...inputStyle, gridColumn: '1/-1' }} placeholder="Email" type="email" value={s.email || ''} onChange={val => upd({ email: val })} />
              <SyncInput style={inputStyle} placeholder="Dirección" value={s.direccion || ''} onChange={val => upd({ direccion: val })} />
              <AutocompleteLocalidad
                value={s.localidad || ''}
                onChange={val => upd({ localidad: val })}
                placeholder="Localidad"
                inputStyle={inputStyle}
                localidades={(clientes || []).map(c => c ? c.localidad : '')}
              />
            </div>
          </div>

          {/* Equipo */}
          <div style={{ marginBottom: 16 }}>
            {sectionLabel('Equipo')}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {(s.equipos || []).includes('caldera') ? (
                <select style={inputStyle} value={s.marca || ''} onChange={e => upd({ marca: e.target.value, modelo: '' })}>
                  <option value="">Seleccioná marca...</option>
                  {MARCAS_CALDERA.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              ) : (
                <SyncInput style={inputStyle} placeholder="Marca" value={s.marca || ''} onChange={val => upd({ marca: val })} />
              )}
              {(s.equipos || []).includes('caldera') && s.marca && s.marca !== 'OTRA' && s.marca !== 'FLOWING' ? (
                <select style={inputStyle} value={s.modelo || ''} onChange={e => upd({ modelo: e.target.value })}>
                  <option value="">Seleccioná modelo...</option>
                  {(MODELOS_CALDERA[s.marca] || []).map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              ) : (
                <SyncInput style={inputStyle} placeholder="Modelo" value={s.modelo || ''} onChange={val => upd({ modelo: val })} />
              )}
            </div>
            <SyncTextarea style={{ ...inputStyle, marginTop: 8, resize: 'vertical', minHeight: 70 }} placeholder="Descripción del problema" value={s.descripcion || ''} onChange={val => upd({ descripcion: val })} />
          </div>

          {/* Gestión */}
          <div style={{ marginBottom: 16 }}>
            {sectionLabel('Gestión interna')}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <TecnicoSelect value={s.tecnico || ''} onChange={val => upd({ tecnico: val })} inputStyle={inputStyle} />
              <select style={inputStyle} value={(s.estado === 'visitado-incompleto' ? 'en-curso' : s.estado) || 'pendiente'} onChange={e => {
                const nuevoEstado = e.target.value
                if (nuevoEstado === 'resuelto' && !s.fechaCierre) {
                  setMostrarModalFecha(true)
                } else {
                  upd({ estado: nuevoEstado })
                }
              }}>
                {ESTADOS.map(e => <option key={e} value={e}>{getEstadoLabel(e)}</option>)}
              </select>
              <SyncInput style={{ ...inputStyle, gridColumn: '1/-1' }} type="date" value={s.fechaAsignada || ''} onChange={val => upd({ fechaAsignada: val })} />
            </div>
            {/* HISTORIAL DE NOTAS INTERNAS */}
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--naranja)', textTransform: 'uppercase', marginBottom: 6 }}>Historial de Notas Internas</div>
              
              {((s.notasInternasHistorial || []).length > 0 || s.notasInternas) ? (
                <div style={{ display: 'grid', gap: 8, background: '#F8F9FA', padding: 10, borderRadius: 8, border: '1px solid #EAECEF', maxHeight: 150, overflowY: 'auto', marginBottom: 8 }}>
                  {s.notasInternasHistorial?.map((nota, idx) => (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.78rem', borderBottom: idx < s.notasInternasHistorial.length - 1 ? '1px solid #EAECEF' : 'none', paddingBottom: idx < s.notasInternasHistorial.length - 1 ? 6 : 0 }}>
                      <span style={{ fontSize: '0.68rem', color: 'var(--gris-suave)', fontWeight: 600 }}>
                        📅 {new Date(nota.fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <div style={{ color: 'var(--azul)', whiteSpace: 'pre-wrap' }}>{nota.texto}</div>
                    </div>
                  ))}
                  {/* Fallback for legacy string notes */}
                  {s.notasInternas && (!s.notasInternasHistorial || s.notasInternasHistorial.length === 0) && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--azul)', whiteSpace: 'pre-wrap' }}>
                      <span style={{ fontSize: '0.68rem', color: 'var(--gris-suave)', fontWeight: 600 }}>📅 Nota Histórica</span>
                      <div style={{ color: 'var(--azul)', whiteSpace: 'pre-wrap', marginTop: 2 }}>{s.notasInternas}</div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: '0.78rem', color: 'var(--gris-suave)', fontStyle: 'italic', marginBottom: 8 }}>Sin notas registradas</div>
              )}

              {/* Input y botón para agregar */}
              <div style={{ display: 'flex', gap: 6 }}>
                <textarea 
                  style={{ ...inputStyle, flex: 1, resize: 'vertical', minHeight: 40, margin: 0 }} 
                  placeholder="Nueva nota interna (ej. WhatsApp)..." 
                  value={nuevaNotaTexto} 
                  onChange={e => setNuevaNotaTexto(e.target.value)}
                />
                <button 
                  onClick={handleGuardarNota}
                  style={{ padding: '0 16px', background: 'var(--azul)', color: 'white', border: 'none', borderRadius: 8, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>

          {/* VINCULACIÓN CLIENTE */}
          <div style={{ marginBottom: 16 }}>
            {sectionLabel('Vincular a cliente')}
            {s.clienteId ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ flex: 1, padding: '8px 12px', background: '#EEF4FF', borderRadius: 8, fontSize: '0.85rem', color: 'var(--azul)', fontWeight: 600 }}>
                  ✅ {clientes.find(c => c.id === s.clienteId)?.nombre || 'Cliente vinculado'}
                </div>
                <button onClick={() => navigate(`/admin/clientes/${s.clienteId}`)} style={{ padding: '8px 12px', background: 'var(--azul)', color: 'white', border: 'none', borderRadius: 8, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 600 }}>
                  Ver ficha
                </button>
                <button onClick={() => upd({ clienteId: '', clienteNombre: '' })} style={{ padding: '8px 12px', background: 'none', border: '1.5px solid #D8E2EE', borderRadius: 8, fontSize: '0.82rem', cursor: 'pointer', color: 'var(--rojo)' }}>
                  Desvincular
                </button>
              </div>
            ) : (
              <div>
                <select style={inputStyle} value={s.clienteId || ''} onChange={e => {
                  const cliente = clientes.find(c => c.id === e.target.value)
                  upd({ clienteId: e.target.value, clienteNombre: cliente?.nombre || '' })
                }}>
                  <option value="">Seleccioná un cliente existente...</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre} {c.localidad ? `— ${c.localidad}` : ''}</option>)}
                </select>
                <div style={{ fontSize: '0.75rem', color: 'var(--gris-texto)', marginTop: 6 }}>
                  ¿Cliente nuevo? Crealo en la sección <span style={{ color: 'var(--azul-medio)', cursor: 'pointer', fontWeight: 600 }} onClick={() => navigate('/admin/clientes')}>Clientes</span> y volvé a vincularlo.
                </div>
              </div>
            )}
          </div>

          {/* CIERRE DEL SERVICIO */}
          <div style={{ marginBottom: 16 }}>
            {sectionLabel('Cierre del servicio')}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--gris-texto)', fontWeight: 600 }}>Fecha de Cierre / Solución:</span>
                <input type="date" style={{ ...inputStyle, width: 'auto' }} value={s.fechaCierre ? new Date(s.fechaCierre).toISOString().slice(0, 10) : ''} onChange={e => {
                  const val = e.target.value
                  if (!val && s.estado === 'resuelto') {
                    alert("No se puede eliminar la fecha de cierre cuando el servicio está Resuelto.")
                    return
                  }
                  upd({ fechaCierre: val ? new Date(val + 'T12:00:00Z').toISOString() : '' })
                }} />
              </div>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--gris-texto)', marginBottom: 6 }}>Diagnostico tecnico/Solucion/recomendacion/notas</div>
            <SyncTextarea style={{ ...inputStyle, resize: 'vertical', minHeight: 120, marginBottom: 8 }} placeholder="¿Qué tenía el equipo? ¿Qué se hizo? Recomendaciones..." value={s.diagnostico || ''} onChange={val => upd({ diagnostico: val })} />
            {/* Fallback for legacy data */}
            {s.recomendaciones && (
              <>
                <div style={{ fontSize: '0.75rem', color: 'var(--gris-texto)', marginBottom: 6 }}>Recomendaciones para el cliente (Antiguo)</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--azul)', marginBottom: 8, fontStyle: 'italic', background: '#F4F6F9', padding: 8, borderRadius: 6 }}>{s.recomendaciones}</div>
              </>
            )}
            {s.tareasPendientes && (
              <>
                <div style={{ fontSize: '0.75rem', color: 'var(--gris-texto)', marginBottom: 6 }}>Tareas pendientes (Antiguo)</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--azul)', marginBottom: 8, fontStyle: 'italic', background: '#F4F6F9', padding: 8, borderRadius: 6 }}>{s.tareasPendientes}</div>
              </>
            )}
          </div>

          {/* INFO DEL TÉCNICO */}
          {(s.horaLlegada || s.notasTecnico || (s.fotosHecnico || []).length > 0 || (s.notasVoz || []).length > 0) && (
            <div style={{ marginBottom: 16, background: '#F4F6F9', borderRadius: 8, padding: 12 }}>
              {sectionLabel('Registro del técnico')}
              {s.horaLlegada && (
                <div style={{ fontSize: '0.83rem', color: 'var(--azul)', marginBottom: 6 }}>
                  <Clock size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                  Llegada: {new Date(s.horaLlegada).toLocaleString('es-AR')}
                  {s.horaSalida && ` · Salida: ${new Date(s.horaSalida).toLocaleString('es-AR')}`}
                  {s.horaLlegada && s.horaSalida && (() => {
                    const mins = Math.round((new Date(s.horaSalida) - new Date(s.horaLlegada)) / 60000)
                    const h = Math.floor(mins / 60), m = mins % 60
                    return ` · ⏱ ${h > 0 ? h + 'h ' : ''}${m}min`
                  })()}
                </div>
              )}
              {s.notasTecnico && <div style={{ fontSize: '0.83rem', color: 'var(--gris-texto)', fontStyle: 'italic' }}>"{s.notasTecnico}"</div>}
              {(s.fotosHecnico || []).length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 8 }}>
                  {(s.fotosHecnico || []).map((f, i) => {
                    const esVideo = f.url.toLowerCase().includes('/video/upload/') || f.url.match(/\.(mp4|webm|ogg|mov|avi)($|\?)/i)
                    return (
                      <div key={i} style={{ width: '100%', height: 60, position: 'relative' }}>
                        {esVideo ? (
                          <div className="video-thumbnail-container" onClick={() => abrirVisor(f.url)}>
                            <video src={f.url} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }} muted />
                            <div className="video-play-overlay" style={{ borderRadius: 6 }}>
                              <div className="play-icon-circle" style={{ width: 24, height: 24, fontSize: '0.65rem' }}>▶</div>
                            </div>
                          </div>
                        ) : (
                          <img src={f.url} alt="Técnico" onClick={() => abrirVisor(f.url)}
                            style={{ width: '100%', height: 60, objectFit: 'cover', borderRadius: 6, cursor: 'pointer', border: '1px solid #D8E2EE' }} />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
              {(s.notasVoz || []).length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gris-texto)', marginBottom: 6, fontWeight: 600 }}>🎙 Notas de Voz</div>
                  {(s.notasVoz || []).map((n, i) => (
                    <div key={i} style={{ background: 'white', borderRadius: 8, padding: 10, marginBottom: 8, border: '1px solid #D8E2EE' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--gris-texto)' }}>
                          🎙 {n.tecnico} · {new Date(n.fecha).toLocaleString('es-AR')}
                        </div>
                        <button onClick={() => {
                          if (confirm('¿Eliminar este audio permanentemente?')) {
                            const nuevasNotas = [...s.notasVoz];
                            nuevasNotas.splice(i, 1);
                            onUpdate(s.id, { notasVoz: nuevasNotas });
                          }
                        }} style={{ background: 'none', border: 'none', color: 'var(--rojo)', cursor: 'pointer', padding: 4 }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <audio src={n.audioURL} controls style={{ width: '100%', height: 36 }} />
                      <div style={{ fontSize: '0.83rem', color: 'var(--azul)', marginTop: 6, fontStyle: 'italic', background: '#F4F6F9', padding: 8, borderRadius: 6 }}>
                        "{n.transcripcion || 'Sin transcripción (Solo audio)'}"
                      </div>
                      {(!n.transcripcion || n.transcripcion.includes('Sin transcripción')) && (
                        <button onClick={() => transcribirVieja(n, i)} disabled={transcribiendoIdx === i}
                          style={{ marginTop: 6, background: '#E3F2FD', color: '#1565C0', border: 'none', padding: '4px 8px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600, cursor: transcribiendoIdx === i ? 'not-allowed' : 'pointer' }}>
                          {transcribiendoIdx === i ? 'Transcribiendo...' : 'Transcribir audio ahora'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div style={{ marginBottom: 16 }}>
            {sectionLabel('Materiales')}
            {materiales.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 100px 24px', gap: 4, marginBottom: 4 }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--gris-texto)', fontWeight: 600 }}>Descripción</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--gris-texto)', fontWeight: 600 }}>Cant.</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--gris-texto)', fontWeight: 600 }}>Precio s/IVA</div>
                  <div />
                </div>
                {materiales.map((m, i) => {
                  const subtotal = (parseFloat(m.precio) || 0) * (parseFloat(m.cant) || 1)
                  return (
                    <div key={i} style={{ marginBottom: 6 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 100px 24px', gap: 4, alignItems: 'center' }}>
                        <input style={inputStyle} placeholder="Ej: Vaso de expansión" value={m.desc} onChange={e => editMat(i, 'desc', e.target.value)} />
                        <input style={{ ...inputStyle, textAlign: 'center' }} type="number" min="1" value={m.cant} onChange={e => editMat(i, 'cant', e.target.value)} />
                        <input style={{ ...inputStyle, textAlign: 'right' }} type="number" placeholder="0" value={m.precio} onChange={e => editMat(i, 'precio', e.target.value)} />
                        <button onClick={() => removeMat(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rojo)', display: 'flex', alignItems: 'center' }}>
                          <XCircle size={18} />
                        </button>
                      </div>
                      {m.precio && <div style={{ textAlign: 'right', fontSize: '0.72rem', color: 'var(--gris-texto)', marginTop: 2 }}>Subtotal: ${formatMoney(subtotal)}</div>}
                    </div>
                  )
                })}
                <div style={{ textAlign: 'right', fontSize: '0.83rem', fontWeight: 700, color: 'var(--azul)', padding: '6px 0', borderTop: '1px solid #D8E2EE' }}>
                  Total materiales (s/IVA): ${formatMoney(totalMatNeto)}
                </div>
              </div>
            )}
            <button onClick={addMat} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--azul-medio)', background: 'none', border: '1.5px dashed #C0D0E4', borderRadius: 7, padding: '7px 14px', cursor: 'pointer', fontFamily: 'var(--font)', width: '100%', justifyContent: 'center' }}>
              <PlusCircle size={15} /> Agregar material
            </button>
          </div>

          {/* MANO DE OBRA */}
          <div style={{ marginBottom: 16 }}>
            {sectionLabel('Mano de obra')}
            {manoObra.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 24px', gap: 4, marginBottom: 4 }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--gris-texto)', fontWeight: 600 }}>Descripción</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--gris-texto)', fontWeight: 600 }}>Importe s/IVA</div>
                  <div />
                </div>
                {manoObra.map((m, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 24px', gap: 4, alignItems: 'center', marginBottom: 6 }}>
                    <input style={inputStyle} placeholder="Ej: Reemplazo de vaso de expansión" value={m.desc} onChange={e => editMO(i, 'desc', e.target.value)} />
                    <input style={{ ...inputStyle, textAlign: 'right' }} type="number" placeholder="0" value={m.precio} onChange={e => editMO(i, 'precio', e.target.value)} />
                    <button onClick={() => removeMO(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rojo)', display: 'flex', alignItems: 'center' }}>
                      <XCircle size={18} />
                    </button>
                  </div>
                ))}
                <div style={{ textAlign: 'right', fontSize: '0.83rem', fontWeight: 700, color: 'var(--azul)', padding: '6px 0', borderTop: '1px solid #D8E2EE' }}>
                  Total mano de obra (s/IVA): ${formatMoney(totalMoNeto)}
                </div>
              </div>
            )}
            <button onClick={addMO} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--azul-medio)', background: 'none', border: '1.5px dashed #C0D0E4', borderRadius: 7, padding: '7px 14px', cursor: 'pointer', fontFamily: 'var(--font)', width: '100%', justifyContent: 'center' }}>
              <PlusCircle size={15} /> Agregar ítem de mano de obra
            </button>
          </div>

          {/* TOTALES */}
          {(materiales.length > 0 || manoObra.length > 0) && (
            <div style={{ background: 'var(--gris-claro)', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
              {s.cobroSinIva ? (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 800, color: 'var(--azul)', fontSize: '1rem' }}>TOTAL ABONADO (Sin IVA)</span>
                  <span style={{ fontWeight: 800, color: 'var(--azul)', fontSize: '1rem' }}>${formatMoney(sinIVA)}</span>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 6 }}>
                    <span style={{ color: 'var(--gris-texto)' }}>Subtotal neto (sin IVA)</span>
                    <span style={{ fontWeight: 600 }}>${formatMoney(sinIVA)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #D8E2EE' }}>
                    <span style={{ color: 'var(--gris-texto)' }}>IVA 21%</span>
                    <span style={{ fontWeight: 600 }}>${formatMoney(ivaTotal)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 800, color: 'var(--azul)', fontSize: '1rem' }}>TOTAL con IVA</span>
                    <span style={{ fontWeight: 800, color: 'var(--azul)', fontSize: '1rem' }}>${formatMoney(conIVA)}</span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ESTADO DE COBRO */}
          <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, background: '#EEF4FF', padding: 12, borderRadius: 8 }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--azul)' }}>ESTADO:</span>
            <select style={{ ...inputStyle, width: '180px' }} value={s.estadoPago || 'a-cobrar'} onChange={e => upd({ estadoPago: e.target.value })}>
              <option value="a-cobrar">A Cobrar</option>
              <option value="pagado">Pagado</option>
              <option value="en-garantia">En Garantía</option>
              <option value="no-corresponde">No corresponde abonar</option>
            </select>

            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--azul)' }}>IVA:</span>
            <select style={{ ...inputStyle, width: '130px' }} value={s.cobroSinIva ? 'sin-iva' : 'con-iva'} onChange={e => upd({ cobroSinIva: e.target.value === 'sin-iva' })}>
              <option value="con-iva">Con IVA (21%)</option>
              <option value="sin-iva">Sin IVA</option>
            </select>

            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--azul)' }}>MÉTODO:</span>
            <select style={{ ...inputStyle, width: '180px' }} value={s.metodoPago || ''} onChange={e => upd({ metodoPago: e.target.value })}>
              <option value="">No especificado</option>
              <option value="Efectivo">Efectivo</option>
              <option value="Transferencia">Transferencia</option>
              <option value="Echeq">Echeq</option>
              <option value="Tarjeta Crédito/Débito">Tarjeta Crédito/Débito</option>
              <option value="Otro">Otro</option>
            </select>
          </div>

          {/* Foto */}
          {(s.fotosCliente || []).length > 0 ? (
            <div style={{ marginBottom: 16 }}>
              {sectionLabel('Fotos del equipo')}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {s.fotosCliente.map((url, i) => {
                  const esVideo = url.toLowerCase().includes('/video/upload/') || url.match(/\.(mp4|webm|ogg|mov|avi)($|\?)/i)
                  return (
                    <div key={i} style={{ width: '100%', height: 100, position: 'relative' }}>
                      {esVideo ? (
                        <div className="video-thumbnail-container" onClick={() => abrirVisor(url)}>
                          <video src={url} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} muted />
                          <div className="video-play-overlay" style={{ borderRadius: 8 }}>
                            <div className="play-icon-circle">▶</div>
                          </div>
                        </div>
                      ) : (
                        <img src={url} alt={`Equipo ${i+1}`} onClick={() => abrirVisor(url)} style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 8, border: '1px solid #D8E2EE', cursor: 'pointer' }} />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : s.fotoURL ? (
            <div style={{ marginBottom: 16 }}>
              {sectionLabel('Foto del equipo')}
              <div style={{ width: 100, height: 100, position: 'relative' }}>
                {(() => {
                  const esVideo = s.fotoURL.toLowerCase().includes('/video/upload/') || s.fotoURL.match(/\.(mp4|webm|ogg|mov|avi)($|\?)/i)
                  return esVideo ? (
                    <div className="video-thumbnail-container" onClick={() => abrirVisor(s.fotoURL)}>
                      <video src={s.fotoURL} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} muted />
                      <div className="video-play-overlay" style={{ borderRadius: 8 }}>
                        <div className="play-icon-circle">▶</div>
                      </div>
                    </div>
                  ) : (
                    <img src={s.fotoURL} alt="Equipo" onClick={() => abrirVisor(s.fotoURL)} style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 8, border: '2px solid #D8E2EE', cursor: 'pointer' }} />
                  )
                })()}
              </div>
            </div>
          ) : null}

          {/* Fotos/Videos del Admin */}
          <div style={{ marginBottom: 16 }}>
            {sectionLabel('Fotos / Videos — Admin')}
            
            {/* Galería de fotos ya subidas por admin */}
            {(s.fotosAdmin || []).length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
                {(s.fotosAdmin || []).map((f, i) => {
                  const esVideo = f.url.toLowerCase().includes('/video/upload/') || f.url.match(/\.(mp4|webm|ogg|mov|avi)($|\?)/i)
                  return (
                    <div key={i} style={{ position: 'relative' }}>
                      {esVideo ? (
                        <div className="video-thumbnail-container" onClick={() => abrirVisor(f.url)}>
                          <video src={f.url} style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 8 }} muted />
                          <div className="video-play-overlay" style={{ borderRadius: 8 }}>
                            <div className="play-icon-circle" style={{ width: 24, height: 24, fontSize: '0.65rem' }}>▶</div>
                          </div>
                        </div>
                      ) : (
                        <img src={f.url} alt={`Admin ${i+1}`} onClick={() => abrirVisor(f.url)}
                          style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid #D8E2EE', cursor: 'pointer' }} />
                      )}
                      <div style={{ fontSize: '0.65rem', color: '#888', marginTop: 2, textAlign: 'center' }}>
                        {f.tipo || ''} · {f.fecha ? new Date(f.fecha).toLocaleDateString('es-AR') : ''}
                      </div>
                      <button
                        onClick={() => {
                          if (confirm('¿Eliminar esta foto/video?')) {
                            const nuevas = [...(s.fotosAdmin || [])];
                            nuevas.splice(i, 1);
                            upd({ fotosAdmin: nuevas });
                          }
                        }}
                        style={{ position: 'absolute', top: -6, right: -6, background: 'var(--rojo)', color: 'white', border: 'none', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', zIndex: 10 }}
                      >✕</button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Botones de subir */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                background: '#E3F2FD', color: '#1565C0', borderRadius: 8,
                fontSize: '0.8rem', fontWeight: 600, cursor: subiendoFotoAdmin ? 'not-allowed' : 'pointer',
                border: '1.5px solid #90CAF9', opacity: subiendoFotoAdmin ? 0.6 : 1
              }}>
                <input type="file" accept="image/*" multiple style={{ display: 'none' }} disabled={subiendoFotoAdmin}
                  onChange={e => { Array.from(e.target.files).forEach(f => subirFotoAdmin(f, 'Foto')); e.target.value = '' }} />
                📷 Foto
              </label>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                background: '#E3F2FD', color: '#1565C0', borderRadius: 8,
                fontSize: '0.8rem', fontWeight: 600, cursor: subiendoFotoAdmin ? 'not-allowed' : 'pointer',
                border: '1.5px solid #90CAF9', opacity: subiendoFotoAdmin ? 0.6 : 1
              }}>
                <input type="file" accept="video/*" multiple style={{ display: 'none' }} disabled={subiendoFotoAdmin}
                  onChange={e => { Array.from(e.target.files).forEach(f => subirFotoAdmin(f, 'Video')); e.target.value = '' }} />
                🎥 Video
              </label>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                background: '#E3F2FD', color: '#1565C0', borderRadius: 8,
                fontSize: '0.8rem', fontWeight: 600, cursor: subiendoFotoAdmin ? 'not-allowed' : 'pointer',
                border: '1.5px solid #90CAF9', opacity: subiendoFotoAdmin ? 0.6 : 1
              }}>
                <input type="file" accept="image/*,video/*" multiple style={{ display: 'none' }} disabled={subiendoFotoAdmin}
                  onChange={e => { Array.from(e.target.files).forEach(f => subirFotoAdmin(f, f.type.startsWith('video/') ? 'Video' : 'Foto')); e.target.value = '' }} />
                🖼️ Galería
              </label>
              {subiendoFotoAdmin && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: '#1565C0', fontWeight: 600 }}>
                  <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #90CAF9', borderTopColor: '#1565C0', animation: 'spin 0.7s linear infinite' }} />
                  Subiendo...
                </span>
              )}
            </div>
          </div>

          {/* Botones */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 12, borderTop: '1px solid var(--gris-claro)' }}>
            <button onClick={() => generarPDF({ ...s, materiales, manoObra }, false)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: 'var(--azul)', color: 'white', border: 'none', borderRadius: 8, fontFamily: 'var(--font)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
              <FileText size={15} /> Presupuesto PDF
            </button>
            <button onClick={() => {
              const link = `${window.location.origin}/ver/${s.id}?tipo=presupuesto`
              const texto = `Hola! te adjunto la ficha del servicio con los valores: ${link}. A disposicón por cualquier duda o consulta`
              navigator.clipboard.writeText(texto)
              window.open(`https://wa.me/54${(s.telefono || '').replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`, '_blank')
            }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: '#25D366', color: 'white', border: 'none', borderRadius: 8, fontFamily: 'var(--font)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
              <MessageCircle size={15} /> Enviar Presupuesto por WhatsApp
            </button>
            <button onClick={() => generarPDF({ ...s, materiales, manoObra }, true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: '#2E7D32', color: 'white', border: 'none', borderRadius: 8, fontFamily: 'var(--font)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
              <FileText size={15} /> Recibo PDF
            </button>
            <button onClick={() => {
              const link = `${window.location.origin}/ver/${s.id}?tipo=recibo`
              const texto = `Aquí te adjunto el comprobante de pago, Muchas Gracias: ${link}`
              navigator.clipboard.writeText(texto)
              window.open(`https://wa.me/54${(s.telefono || '').replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`, '_blank')
            }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: '#128C7E', color: 'white', border: 'none', borderRadius: 8, fontFamily: 'var(--font)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
              <MessageCircle size={15} /> Enviar Recibo por WhatsApp
            </button>
            <button className="btn-danger" onClick={() => onEliminar(s.id)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Trash2 size={14} /> Eliminar
            </button>
          </div>

        </div>
      )}

      {mostrarModalFecha && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(10, 18, 30, 0.6)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1200,
          padding: 16
        }} onClick={() => setMostrarModalFecha(false)}>
          <div style={{
            background: 'white',
            borderRadius: 16,
            padding: 24,
            width: '100%',
            maxWidth: 380,
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            gap: 16
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--azul)' }}>
              <Calendar size={20} style={{ color: 'var(--naranja)' }} />
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Fecha de Resolución</h3>
            </div>
            
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--gris-texto)', lineHeight: 1.4 }}>
              Por favor, seleccioná la fecha en la que se resolvió el servicio:
            </p>

            <div style={{ position: 'relative' }}>
              <input
                type="date"
                value={fechaResolucion}
                onChange={e => setFechaResolucion(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  border: '1.8px solid #D8E2EE',
                  borderRadius: 10,
                  fontFamily: 'var(--font)',
                  fontSize: '0.95rem',
                  color: 'var(--azul)',
                  background: '#FAFBFD',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button
                onClick={() => setMostrarModalFecha(false)}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: 'none',
                  border: '1.5px solid #D8E2EE',
                  borderRadius: 8,
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: 'var(--gris-texto)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font)'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  if (!fechaResolucion) {
                    alert("Por favor, ingresá una fecha válida.")
                    return
                  }
                  const parsed = Date.parse(fechaResolucion)
                  if (isNaN(parsed)) {
                    alert("Fecha inválida.")
                    return
                  }
                  setMostrarModalFecha(false)
                  await upd({
                    estado: 'resuelto',
                    fechaCierre: new Date(fechaResolucion + 'T12:00:00Z').toISOString()
                  })
                }}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: 'var(--azul)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'var(--font)'
                }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Papelera ───────────────────────────────────────────────────────────────────
function Papelera() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(collection(db, 'papelera'), orderBy('eliminadoEn', 'desc'))
    const unsub = onSnapshot(q, snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return unsub
  }, [])

  const restaurar = async (item) => {
    const { id, ...data } = item
    await addDoc(collection(db, 'servicios'), { ...data, eliminadoEn: null })
    await deleteDoc(doc(db, 'papelera', id))
    alert('✅ Servicio restaurado')
  }

  const eliminarDefinitivo = async (id) => {
    if (confirm('¿Eliminar definitivamente? Esta acción NO se puede deshacer.')) {
      await deleteDoc(doc(db, 'papelera', id))
    }
  }

  function formatFechaPapelera(ts) {
    if (!ts) return '—'
    const d = ts.toDate ? ts.toDate() : new Date(ts)
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  if (loading) return <div className="loading"><div className="spinner" /></div>

  if (items.length === 0) return (
    <div className="empty-state">
      <Trash2 size={48} />
      <p>La papelera está vacía</p>
    </div>
  )

  return (
    <div>
      {items.map(s => (
        <div key={s.id} style={{ background: 'white', borderRadius: 12, padding: '16px 20px', marginBottom: 10, boxShadow: 'var(--sombra)', borderLeft: '4px solid #999', opacity: 0.85 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              {s.numeroST && <span style={{ fontSize: '0.72rem', color: 'var(--naranja)', fontWeight: 700, marginRight: 8 }}>{s.numeroST}</span>}
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--azul)', textTransform: 'uppercase' }}>{s.nombre}</span>
            </div>
            <span style={{ fontSize: '0.75rem', color: '#999' }}>Eliminado: {formatFechaPapelera(s.eliminadoEn)}</span>
          </div>
          <div style={{ fontSize: '0.83rem', color: 'var(--gris-texto)', marginBottom: 12 }}>
            📍 {s.direccion}{s.localidad ? `, ${s.localidad}` : ''}
            {s.descripcion && ` · ${s.descripcion.slice(0, 60)}...`}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => restaurar(s)}
              style={{ padding: '7px 14px', background: 'var(--azul)', color: 'white', border: 'none', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
              ↩ Restaurar
            </button>
            <button
              onClick={() => eliminarDefinitivo(s.id)}
              className="btn-danger">
              Eliminar definitivamente
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

const LOCALIDADES_MAP = {
  'rosario': 'Rosario',
  'funes': 'Funes',
  'roldan': 'Roldán',
  'roldán': 'Roldán',
  'ibarlucea': 'Ibarlucea',
  'perez': 'Pérez',
  'pérez': 'Pérez',
  'soldini': 'Soldini',
  'zavalla': 'Zavalla',
  'granadero baigorria': 'Granadero Baigorria',
  'baigorria': 'Granadero Baigorria',
  'capitan bermudez': 'Capitán Bermúdez',
  'capitán bermúdez': 'Capitán Bermúdez',
  'bermudez': 'Capitán Bermúdez',
  'fray luis beltran': 'Fray Luis Beltrán',
  'fray luis beltrán': 'Fray Luis Beltrán',
  'beltran': 'Fray Luis Beltrán',
  'san lorenzo': 'San Lorenzo',
  'puerto general san martin': 'Puerto General San Martín',
  'puerto general san martín': 'Puerto General San Martín',
  'puerto san martin': 'Puerto General San Martín',
  'puerto san martín': 'Puerto General San Martín',
  'ricardone': 'Ricardone',
  'luis palacios': 'Luis Palacios',
  'san jeronimo sud': 'San Jerónimo Sud',
  'san jerónimo sud': 'San Jerónimo Sud',
  'carcaraña': 'Carcarañá',
  'carcarañá': 'Carcarañá',
  'pueblo esther': 'Pueblo Esther',
  'general lagos': 'General Lagos',
  'arroyo seco': 'Arroyo Seco',
  'alvear': 'Alvear',
  'villa gobernador galvez': 'Villa Gobernador Gálvez',
  'villa gobernador gálvez': 'Villa Gobernador Gálvez',
  'vgg': 'Villa Gobernador Gálvez'
}

function normalizarNombreLocalidad(raw) {
  if (raw === undefined || raw === null) return ''
  const str = String(raw)
  if (str.trim() === '') return ''
  const trimmed = str.trim().replace(/\s+/g, ' ')
  const lower = trimmed.toLowerCase()
  
  if (LOCALIDADES_MAP[lower]) {
    return LOCALIDADES_MAP[lower]
  }
  
  return trimmed
    .split(' ')
    .map(word => {
      if (word.length === 0) return ''
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}

// ── Configuracion ─────────────────────────────────────────────────────────────
function Configuracion({ servicios = [], clientes = [] }) {
  const [precios, setPrecios] = useState({ base: 160000, visita: 90000 })
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let unsub = () => {}
    try {
      unsub = onSnapshot(
        doc(db, 'config', 'precios'),
        (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data()
            setPrecios({
              base: data.base ?? 160000,
              visita: data.visita ?? 90000,
              ...data
            })
          }
        },
        (err) => {
          console.error('Error al leer config/precios:', err)
        }
      )
    } catch (err) {
      console.error('Error al iniciar listener config/precios:', err)
    }
    return unsub
  }, [])

  const handleSave = async () => {
    setGuardando(true)
    try {
      await setDoc(doc(db, 'config', 'precios'), precios, { merge: true })
      alert('Precios actualizados correctamente')
    } catch (e) {
      console.error(e)
      alert('Error al actualizar: ' + e.message)
    }
    setGuardando(false)
  }

  // Analizar localidades inconsistentes dentro de useMemo para evitar crashes durante el render
  const analisis = useMemo(() => {
    const safeC = Array.isArray(clientes) ? clientes : []
    const safeS = Array.isArray(servicios) ? servicios : []
    const inconsistentes = []
    const vistos = new globalThis.Set()

    safeC.forEach(c => {
      if (!c || !c.localidad) return
      try {
        const norm = normalizarNombreLocalidad(c.localidad)
        if (c.localidad !== norm && !vistos.has(c.localidad)) {
          vistos.add(c.localidad)
          inconsistentes.push([c.localidad, norm])
        }
      } catch (_) {}
    })
    safeS.forEach(s => {
      if (!s || !s.localidad) return
      try {
        const norm = normalizarNombreLocalidad(s.localidad)
        if (s.localidad !== norm && !vistos.has(s.localidad)) {
          vistos.add(s.localidad)
          inconsistentes.push([s.localidad, norm])
        }
      } catch (_) {}
    })

    const clientesAfectados = safeC.filter(c => {
      if (!c || !c.localidad) return false
      try { return c.localidad !== normalizarNombreLocalidad(c.localidad) } catch (_) { return false }
    }).length
    const serviciosAfectados = safeS.filter(s => {
      if (!s || !s.localidad) return false
      try { return s.localidad !== normalizarNombreLocalidad(s.localidad) } catch (_) { return false }
    }).length

    return { inconsistentes, clientesAfectados, serviciosAfectados, safeC, safeS }
  }, [clientes, servicios])

  const { inconsistentes: listaInconsistentes, clientesAfectados, serviciosAfectados, safeC, safeS } = analisis
  const totalAfectados = clientesAfectados + serviciosAfectados

  const handleLimpiarLocalidades = async () => {
    if (totalAfectados === 0) return

    const confirmClean = window.confirm(
      `¿Estás seguro de que deseas normalizar las localidades de la base de datos?\n\n` +
      `Se actualizarán:\n` +
      `- ${clientesAfectados} clientes\n` +
      `- ${serviciosAfectados} servicios\n\n` +
      `Este proceso corregirá mayúsculas/minúsculas, espacios y acentos de manera segura y automática en todos los registros.`
    )
    if (!confirmClean) return

    setGuardando(true)
    try {
      const updatesClientes = []
      safeC.forEach(c => {
        if (!c || !c.localidad) return
        try {
          const normalizada = normalizarNombreLocalidad(c.localidad)
          if (c.localidad !== normalizada) {
            updatesClientes.push({ ref: doc(db, 'clientes', c.id), data: { localidad: normalizada } })
          }
        } catch (_) {}
      })

      const updatesServicios = []
      safeS.forEach(s => {
        if (!s || !s.localidad) return
        try {
          const normalizada = normalizarNombreLocalidad(s.localidad)
          if (s.localidad !== normalizada) {
            updatesServicios.push({ ref: doc(db, 'servicios', s.id), data: { localidad: normalizada } })
          }
        } catch (_) {}
      })

      const allUpdates = [...updatesClientes, ...updatesServicios]
      let count = 0

      for (let i = 0; i < allUpdates.length; i += 400) {
        const chunk = allUpdates.slice(i, i + 400)
        const b = writeBatch(db)
        chunk.forEach(item => { b.update(item.ref, item.data) })
        await b.commit()
        count += chunk.length
      }

      alert(`✅ ¡Base de datos normalizada con éxito!\n\nSe unificaron y corrigieron un total de ${count} registros:\n- ${updatesClientes.length} clientes\n- ${updatesServicios.length} servicios`)
    } catch (e) {
      console.error(e)
      alert('Error durante la normalización: ' + e.message)
    }
    setGuardando(false)
  }

  return (
    <div style={{ background: 'white', borderRadius: 12, padding: '24px', boxShadow: 'var(--sombra)', display: 'grid', gap: '32px' }}>
      
      {/* Configuración de Precios */}
      <div>
        <h2 style={{ fontSize: '1.2rem', color: 'var(--azul)', marginBottom: 16, borderBottom: '1px solid #D8E2EE', paddingBottom: 8 }}>
          <Settings size={18} style={{ verticalAlign: 'text-bottom', marginRight: 8 }} />
          Configuración de Precios
        </h2>
        
        <div style={{ display: 'grid', gap: 16, maxWidth: 400 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--gris-texto)', fontWeight: 600, marginBottom: 6 }}>
              Valor Base Reparación / Mantenimiento
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: 10, color: 'var(--gris-texto)', fontWeight: 600 }}>$</span>
              <input 
                type="number" 
                value={precios.base || 0} 
                onChange={e => setPrecios(p => ({ ...p, base: Number(e.target.value) }))}
                style={{ width: '100%', padding: '10px 10px 10px 28px', border: '1.5px solid #D8E2EE', borderRadius: 8, fontFamily: 'var(--font)', fontSize: '1rem', color: 'var(--azul)', outline: 'none' }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--gris-texto)', fontWeight: 600, marginBottom: 6 }}>
              Valor de Visita / Diagnóstico
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: 10, color: 'var(--gris-texto)', fontWeight: 600 }}>$</span>
              <input 
                type="number" 
                value={precios.visita || 0} 
                onChange={e => setPrecios(p => ({ ...p, visita: Number(e.target.value) }))}
                style={{ width: '100%', padding: '10px 10px 10px 28px', border: '1.5px solid #D8E2EE', borderRadius: 8, fontFamily: 'var(--font)', fontSize: '1rem', color: 'var(--azul)', outline: 'none' }}
              />
            </div>
          </div>

          <button 
            onClick={handleSave} 
            disabled={guardando}
            style={{ padding: '12px', background: 'var(--azul)', color: 'white', border: 'none', borderRadius: 8, fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer', marginTop: 8 }}>
            {guardando ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </div>
      </div>

      {/* Mantenimiento de Localidades */}
      <div>
        <h2 style={{ fontSize: '1.2rem', color: 'var(--azul)', marginBottom: 16, borderBottom: '1px solid #D8E2EE', paddingBottom: 8 }}>
          <Shield size={18} style={{ verticalAlign: 'text-bottom', marginRight: 8, color: 'var(--naranja)' }} />
          Mantenimiento de Localidades
        </h2>

        <p style={{ fontSize: '0.88rem', color: 'var(--gris-texto)', marginBottom: 16, lineHeight: 1.5 }}>
          Esta herramienta analiza todos los clientes y servicios cargados en el sistema para detectar diferencias de escritura (minúsculas, mayúsculas, acentos omitidos o espacios innecesarios) y los unifica de forma 100% segura.
        </p>

        {totalAfectados > 0 ? (
          <div style={{ background: '#FFF8EE', border: '1.5px solid var(--naranja)', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--azul)', marginBottom: 8 }}>
              ⚠️ ¡Se detectaron {totalAfectados} registros inconsistentes!
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--gris-texto)', marginBottom: 12 }}>
              - Clientes afectados: <strong>{clientesAfectados}</strong><br />
              - Servicios afectados: <strong>{serviciosAfectados}</strong>
            </div>
            
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--azul)', marginBottom: 6 }}>Correcciones sugeridas:</div>
            <div style={{ maxHeight: 150, overflowY: 'auto', background: 'white', border: '1px solid #D8E2EE', borderRadius: 6, padding: '8px 12px', fontSize: '0.8rem', display: 'grid', gap: 6, marginBottom: 16 }}>
              {listaInconsistentes.map(([orig, norm]) => (
                <div key={orig} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ textDecoration: 'line-through', color: 'var(--rojo)' }}>"{orig}"</span>
                  <span style={{ color: 'var(--gris-texto)' }}>➔</span>
                  <span style={{ color: '#27AE60', fontWeight: 'bold' }}>"{norm}"</span>
                </div>
              ))}
            </div>

            <button
              onClick={handleLimpiarLocalidades}
              disabled={guardando}
              style={{
                width: '100%',
                padding: '12px',
                background: 'linear-gradient(135deg, var(--naranja) 0%, var(--rojo) 100%)',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontSize: '0.95rem',
                fontWeight: 700,
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                transition: 'opacity 0.2s'
              }}
            >
              {guardando ? 'Normalizando...' : 'Normalizar y Unificar Base de Datos'}
            </button>
          </div>
        ) : (
          <div style={{ background: '#E8F5E9', border: '1.5px solid #2E7D32', borderRadius: 8, padding: 14, color: '#2E7D32', fontSize: '0.88rem', fontWeight: 600 }}>
            ✅ ¡Excelente! Todas las localidades en la base de datos están perfectamente unificadas y formateadas.
          </div>
        )}
      </div>

    </div>
  )
}

// ── TecnicoSelect (reutilizable) ───────────────────────────────────────────────
function TecnicoSelect({ value, onChange, inputStyle }) {
  const { tecnicosLista } = useTecnicos()
  return (
    <select style={inputStyle} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Sin asignar</option>
      {tecnicosLista.map(t => <option key={t} value={t}>{t}</option>)}
    </select>
  )
}

// ── Gestión de Técnicos ────────────────────────────────────────────────────────
function GestionTecnicos() {
  const { tecnicos, loading } = useTecnicos()
  const [editandoId, setEditandoId] = useState(null)
  const [editData, setEditData] = useState({})
  const [mostrarPass, setMostrarPass] = useState({})
  const [nuevoTecnico, setNuevoTecnico] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const apiKey = app.options.apiKey

  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    border: '1.5px solid #D8E2EE',
    borderRadius: 7,
    fontFamily: 'var(--font)',
    fontSize: '0.85rem',
    color: 'var(--azul)',
    background: '#FAFBFD',
    outline: 'none',
  }

  const validarEmail = (email) => {
    return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  }

  const handleEditar = (t) => {
    setEditandoId(t.id)
    setEditData({ nombre: t.nombre, email: t.email || '', password: t.password || '', oldPassword: t.password || '', rol: t.rol || t.role || 'tecnico', activo: t.activo !== false })
    setNuevoTecnico(null)
  }

  const getAuthToken = async (email, password) => {
    try {
      const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error.message)
      return data.idToken
    } catch (e) {
      throw new Error('No se pudo autenticar para realizar la acción. Verifica que la contraseña anterior sea correcta.')
    }
  }

  const handleGuardarEdit = async () => {
    if (!editData.nombre.trim()) return alert('El nombre no puede estar vacío')
    if (!validarEmail(editData.email)) return alert('El email no es válido')
    if (!editData.password.trim() || editData.password.length < 6) return alert('La contraseña debe tener al menos 6 caracteres')
    
    setGuardando(true)
    try {
      const t = tecnicos.find(x => x.id === editandoId)
      const needsAuthUpdate = (editData.email !== t.email) || (editData.password !== t.password)

      if (needsAuthUpdate && t.email && t.password) {
        // Obtenemos token con las credenciales viejas para poder actualizar
        const idToken = await getAuthToken(t.email, t.password)
        
        // Actualizamos en Firebase Auth
        const resUpdate = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:update?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken, email: editData.email, password: editData.password, returnSecureToken: true })
        })
        const dataUpdate = await resUpdate.json()
        if (dataUpdate.error) throw new Error('Error al actualizar en Auth: ' + dataUpdate.error.message)
      }

      // Actualizar Firestore
      await updateDoc(doc(db, 'usuarios', editandoId), {
        nombre: editData.nombre.trim(),
        email: editData.email.trim(),
        password: editData.password,
        role: editData.rol,
        activo: editData.activo,
      })
      
      setEditandoId(null)
    } catch (e) {
      alert('Error al guardar: ' + e.message)
    }
    setGuardando(false)
  }

  const handleEliminar = async (t) => {
    if (!confirm(`¿Eliminar al técnico "${t.nombre}"? Esta acción no se puede deshacer.`)) return
    setGuardando(true)
    try {
      // Intentar eliminar de Auth
      if (t.email && t.password) {
        try {
          const idToken = await getAuthToken(t.email, t.password)
          const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken })
          })
          const data = await res.json()
          if (data.error) console.error('No se pudo borrar de Auth', data.error)
        } catch (e) {
          console.error('Bypass borrar de Auth', e)
        }
      }

      // Borrar de Firestore
      await deleteDoc(doc(db, 'usuarios', t.id))
    } catch (e) {
      alert('Error al eliminar: ' + e.message)
    }
    setGuardando(false)
  }

  const handleNuevo = () => {
    setNuevoTecnico({ nombre: '', email: '', password: '', rol: 'tecnico', activo: true })
    setEditandoId(null)
  }

  const handleGuardarNuevo = async () => {
    if (!nuevoTecnico.nombre.trim()) return alert('El nombre no puede estar vacío')
    if (!validarEmail(nuevoTecnico.email)) return alert('El email no es válido')
    if (!nuevoTecnico.password.trim() || nuevoTecnico.password.length < 6) return alert('La contraseña debe tener al menos 6 caracteres')
    
    setGuardando(true)
    try {
      // Crear en Firebase Auth
      const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: nuevoTecnico.email, password: nuevoTecnico.password, returnSecureToken: true })
      })
      const data = await res.json()
      
      if (data.error) {
        throw new Error(data.error.message)
      }

      const uid = data.localId

      // Crear en Firestore
      await setDoc(doc(db, 'usuarios', uid), {
        nombre: nuevoTecnico.nombre.trim(),
        email: nuevoTecnico.email.trim(),
        password: nuevoTecnico.password,
        role: nuevoTecnico.rol,
        activo: true,
        creadoEn: serverTimestamp(),
      })
      
      setNuevoTecnico(null)
    } catch (e) {
      alert('Error al agregar: ' + e.message)
    }
    setGuardando(false)
  }

  const togglePass = (id) => setMostrarPass(prev => ({ ...prev, [id]: !prev[id] }))

  if (loading) return <div className="loading"><div className="spinner" /></div>

  const admins = tecnicos.filter(t => t.rol === 'admin' || t.role === 'admin')
  const tecnicosList = tecnicos.filter(t => t.rol !== 'admin' && t.role !== 'admin')

  const renderFila = (t) => {
    const isEditing = editandoId === t.id
    const passVisible = mostrarPass[t.id]

    if (isEditing) {
      return (
        <div key={t.id} className="tecnico-row" style={{
          background: '#EEF4FF', borderRadius: 8, marginBottom: 6,
          border: '1.5px solid var(--azul-medio)',
        }}>
          <input
            style={inputStyle}
            value={editData.nombre}
            onChange={e => setEditData({ ...editData, nombre: e.target.value })}
            placeholder="Nombre"
            autoFocus
          />
          <input
            style={inputStyle}
            value={editData.email}
            onChange={e => setEditData({ ...editData, email: e.target.value })}
            placeholder="Email"
            type="email"
          />
          <input
            style={inputStyle}
            value={editData.password}
            onChange={e => setEditData({ ...editData, password: e.target.value })}
            placeholder="Contraseña"
            type="text"
          />
          <select
            style={inputStyle}
            value={editData.rol}
            onChange={e => setEditData({ ...editData, rol: e.target.value })}
          >
            <option value="tecnico">Técnico</option>
            <option value="admin">Admin</option>
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: '0.78rem', color: 'var(--gris-texto)' }}>
            <input
              type="checkbox"
              checked={editData.activo}
              onChange={e => setEditData({ ...editData, activo: e.target.checked })}
              style={{ accentColor: 'var(--azul)' }}
            />
            Activo
          </label>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={handleGuardarEdit}
              disabled={guardando}
              style={{ background: '#2E7D32', color: 'white', border: 'none', borderRadius: 6, padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              title="Guardar"
            >
              <Check size={16} />
            </button>
            <button
              onClick={() => setEditandoId(null)}
              style={{ background: 'none', border: '1px solid #D8E2EE', borderRadius: 6, padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--gris-texto)' }}
              title="Cancelar"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )
    }

    return (
      <div key={t.id} className="tecnico-row" style={{
        background: t.activo === false ? '#F9F9F9' : 'white', borderRadius: 8, marginBottom: 6,
        border: '1px solid #D8E2EE',
        opacity: t.activo === false ? 0.6 : 1,
        transition: 'all 0.2s',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: (t.rol === 'admin' || t.role === 'admin')
              ? 'linear-gradient(135deg, var(--naranja), var(--rojo))'
              : 'linear-gradient(135deg, var(--azul), var(--azul-medio))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {(t.rol === 'admin' || t.role === 'admin') ? <Shield size={14} color="white" /> : <Wrench size={14} color="white" />}
          </div>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--azul)', fontSize: '0.9rem' }}>{t.nombre}</div>
            {t.activo === false && <span style={{ fontSize: '0.7rem', color: 'var(--rojo)' }}>Inactivo</span>}
          </div>
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--gris-texto)', wordBreak: 'break-all' }}>
          {t.email || '—'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            fontFamily: 'monospace', fontSize: '0.9rem', fontWeight: 600,
            color: 'var(--azul)', letterSpacing: passVisible ? 1 : 2,
          }}>
            {passVisible ? (t.password || '—') : '••••••'}
          </span>
          <button
            onClick={() => togglePass(t.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gris-texto)', display: 'flex', padding: 2 }}
            title={passVisible ? 'Ocultar Contraseña' : 'Mostrar Contraseña'}
          >
            {passVisible ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <div>
          <span style={{
            padding: '3px 8px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
            background: (t.rol === 'admin' || t.role === 'admin') ? '#FFF3E0' : '#E3F2FD',
            color: (t.rol === 'admin' || t.role === 'admin') ? '#E65100' : '#1565C0',
          }}>
            {(t.rol === 'admin' || t.role === 'admin') ? 'Admin' : 'Técnico'}
          </span>
        </div>
        <div className="tecnico-estado-col" style={{ textAlign: 'center' }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%', margin: '0 auto',
            background: t.activo !== false ? '#4CAF50' : '#E04E2B',
          }} />
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => handleEditar(t)}
            style={{ background: 'none', border: '1px solid #D8E2EE', borderRadius: 6, padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--azul)' }}
            title="Editar"
          >
            <Edit3 size={14} />
          </button>
          <button
            onClick={() => handleEliminar(t)}
            style={{ background: 'none', border: '1px solid #FFCDD2', borderRadius: 6, padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--rojo)' }}
            title="Eliminar"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: 'white', borderRadius: 12, padding: '24px', boxShadow: 'var(--sombra)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: '1.2rem', color: 'var(--azul)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Users size={20} style={{ color: 'var(--naranja)' }} />
          Gestión de Técnicos
        </h2>
        <button
          onClick={handleNuevo}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', background: 'linear-gradient(135deg, var(--azul), var(--azul-medio))',
            color: 'white', border: 'none', borderRadius: 8,
            fontFamily: 'var(--font)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
            transition: 'opacity 0.2s',
          }}
        >
          <PlusCircle size={16} /> Agregar Técnico
        </button>
      </div>

      {/* Cabecera de tabla */}
      <div className="tecnico-header">
        <div>Nombre</div>
        <div>Email</div>
        <div>Contraseña</div>
        <div>Rol</div>
        <div className="tecnico-estado-col" style={{ textAlign: 'center' }}>Estado</div>
        <div>Acciones</div>
      </div>

      {/* Nuevo técnico inline */}
      {nuevoTecnico && (
        <div className="tecnico-row" style={{
          background: '#E8F5E9', borderRadius: 8, marginBottom: 6,
          border: '1.5px solid #66BB6A',
        }}>
          <input
            style={inputStyle}
            value={nuevoTecnico.nombre}
            onChange={e => setNuevoTecnico({ ...nuevoTecnico, nombre: e.target.value })}
            placeholder="Nombre del técnico"
            autoFocus
          />
          <input
            style={inputStyle}
            value={nuevoTecnico.email}
            onChange={e => setNuevoTecnico({ ...nuevoTecnico, email: e.target.value })}
            placeholder="ejemplo@euler.com.ar"
            type="email"
          />
          <input
            style={inputStyle}
            value={nuevoTecnico.password}
            onChange={e => setNuevoTecnico({ ...nuevoTecnico, password: e.target.value })}
            placeholder="Contraseña"
            type="text"
          />
          <select
            style={inputStyle}
            value={nuevoTecnico.rol}
            onChange={e => setNuevoTecnico({ ...nuevoTecnico, rol: e.target.value })}
          >
            <option value="tecnico">Técnico</option>
            <option value="admin">Admin</option>
          </select>
          <div className="tecnico-estado-col" />
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={handleGuardarNuevo}
              disabled={guardando}
              style={{ background: '#2E7D32', color: 'white', border: 'none', borderRadius: 6, padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              title="Guardar"
            >
              <Check size={16} />
            </button>
            <button
              onClick={() => setNuevoTecnico(null)}
              style={{ background: 'none', border: '1px solid #D8E2EE', borderRadius: 6, padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--gris-texto)' }}
              title="Cancelar"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Admins */}
      {admins.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--naranja)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 8 }}>
            Administradores
          </div>
          {admins.map(renderFila)}
        </div>
      )}

      {/* Técnicos */}
      {tecnicosList.length > 0 && (
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--azul-medio)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 8 }}>
            Técnicos
          </div>
          {tecnicosList.map(renderFila)}
        </div>
      )}

      {tecnicos.length === 0 && (
        <div className="empty-state">
          <Users size={48} />
          <p>No hay técnicos registrados</p>
        </div>
      )}

      {/* Info helper */}
      <div style={{ marginTop: 20, padding: 14, background: '#FFF8E1', borderRadius: 8, border: '1px solid #FFE082', fontSize: '0.8rem', color: '#795548', lineHeight: 1.6 }}>
        <strong>💡 Nota:</strong> Los técnicos y administradores pueden iniciar sesión en <strong>/login</strong>. Los cambios de correo o contraseña se aplican inmediatamente.
      </div>
    </div>
  )
}


// ── Componente Reutilizable: Selector Múltiple con Checkboxes ──────────────────
const ESTADOS_INFO = [
  { value: 'pendiente', label: 'Pendiente', color: '#E65100' },
  { value: 'coordinado', label: 'Coordinado', color: '#0288D1' },
  { value: 'en-curso', label: 'En curso/Incompleto', color: '#1565C0' },
  { value: 'solucionado-cliente', label: 'Solucionado por el cliente', color: '#7B1FA2' },
  { value: 'resuelto', label: 'Resuelto', color: '#2E7D32' },
];

const COBROS_INFO = [
  { value: 'a-cobrar', label: 'A Cobrar', color: '#EF5350' },
  { value: 'pagado', label: 'Pagado', color: '#27AE60' },
  { value: 'en-garantia', label: 'En Garantía', color: '#FFA726' },
  { value: 'no-corresponde', label: 'No corresponde', color: '#78909C' },
];

function MultiSelectDropdown({
  placeholder = "Seleccionar",
  labelPrefix = "Seleccionados",
  options = [],
  selected = [],
  onChange,
  searchable = false,
  minWidth = 160
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setAbierto(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!abierto) setBusqueda('');
  }, [abierto]);

  const toggle = (val) => {
    if (selected.includes(val)) {
      onChange(selected.filter(v => v !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  const opcionesFiltradas = useMemo(() => {
    if (!busqueda.trim()) return options;
    const q = busqueda.toLowerCase();
    return options.filter(o => {
      const txt = (o.label || o.value || o || '').toLowerCase();
      return txt.includes(q);
    });
  }, [options, busqueda]);

  const seleccionarTodos = () => {
    const todosVisibles = opcionesFiltradas.map(o => (o.value !== undefined ? o.value : o));
    const nuevo = Array.from(new Set([...selected, ...todosVisibles]));
    onChange(nuevo);
  };

  const limpiar = () => {
    onChange([]);
  };

  const count = selected.length;
  const isActive = count > 0;

  let labelText = placeholder;
  if (count === 1) {
    const item = options.find(o => (o.value !== undefined ? o.value : o) === selected[0]);
    labelText = item ? (item.label || item.value) : selected[0];
  } else if (count > 1 && count < options.length) {
    labelText = `${labelPrefix} (${count})`;
  } else if (count > 0 && count === options.length) {
    labelText = `Todos (${count})`;
  }

  return (
    <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '8px 12px',
          borderRadius: 8,
          border: isActive ? '1.5px solid #1A5276' : '1px solid #D8E2EE',
          background: isActive ? '#EEF4FF' : '#FFFFFF',
          color: isActive ? '#0C3552' : '#5A6A7A',
          fontFamily: 'var(--font)',
          fontSize: '0.85rem',
          fontWeight: isActive ? 700 : 500,
          cursor: 'pointer',
          minWidth: minWidth,
          outline: 'none',
          boxShadow: isActive ? '0 0 0 2px rgba(26,82,118,0.15)' : 'none',
          transition: 'all 0.15s ease'
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 170 }}>
          {isActive && (
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#1A5276',
              flexShrink: 0
            }} />
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{labelText}</span>
        </span>
        <ChevronDown size={14} style={{ transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: isActive ? '#1A5276' : '#8899AA', flexShrink: 0 }} />
      </button>

      {abierto && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          zIndex: 1000,
          background: '#FFFFFF',
          borderRadius: 10,
          boxShadow: '0 8px 24px rgba(12,53,82,0.18)',
          border: '1px solid #D8E2EE',
          minWidth: Math.max(minWidth + 30, 240),
          maxWidth: 320,
          padding: '8px 0',
          animation: 'fadeInUp 0.15s ease'
        }}>
          {/* Header con acciones */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '4px 14px 8px',
            borderBottom: '1px solid #F0F3F7',
            fontSize: '0.75rem'
          }}>
            <button
              type="button"
              onClick={seleccionarTodos}
              style={{ background: 'none', border: 'none', color: '#1A5276', cursor: 'pointer', fontWeight: 700, padding: 0 }}
            >
              Seleccionar todos
            </button>
            {isActive && (
              <button
                type="button"
                onClick={limpiar}
                style={{ background: 'none', border: 'none', color: '#C44121', cursor: 'pointer', fontWeight: 700, padding: 0 }}
              >
                Limpiar ({count})
              </button>
            )}
          </div>

          {/* Buscador interno si tiene muchas opciones */}
          {(searchable || options.length > 6) && (
            <div style={{ padding: '6px 12px', borderBottom: '1px solid #F0F3F7' }}>
              <input
                type="text"
                placeholder="Buscar opción..."
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                autoFocus
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid #D8E2EE',
                  fontFamily: 'var(--font)',
                  fontSize: '0.8rem',
                  outline: 'none'
                }}
              />
            </div>
          )}

          {/* Lista de opciones con checkboxes */}
          <div style={{ maxHeight: 240, overflowY: 'auto', padding: '4px 0' }}>
            {opcionesFiltradas.length === 0 ? (
              <div style={{ padding: '12px 14px', fontSize: '0.8rem', color: '#8899AA', textAlign: 'center' }}>
                Sin resultados
              </div>
            ) : (
              opcionesFiltradas.map(opt => {
                const val = opt.value !== undefined ? opt.value : opt;
                const lbl = opt.label !== undefined ? opt.label : opt;
                const isChecked = selected.includes(val);
                const optColor = opt.color;

                return (
                  <label
                    key={String(val)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '7px 14px',
                      cursor: 'pointer',
                      background: isChecked ? '#F4F8FD' : 'transparent',
                      transition: 'background 0.1s',
                      fontSize: '0.84rem',
                      fontWeight: isChecked ? 700 : 500,
                      color: '#0C3552'
                    }}
                    onMouseEnter={(ev) => { if (!isChecked) ev.currentTarget.style.background = '#FAFBFD'; }}
                    onMouseLeave={(ev) => { if (!isChecked) ev.currentTarget.style.background = 'transparent'; }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggle(val)}
                      style={{
                        width: 16,
                        height: 16,
                        accentColor: '#1A5276',
                        cursor: 'pointer',
                        flexShrink: 0
                      }}
                    />
                    {optColor && (
                      <span style={{
                        width: 9,
                        height: 9,
                        borderRadius: '50%',
                        background: optColor,
                        flexShrink: 0
                      }} />
                    )}
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={String(lbl)}>
                      {lbl}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}


// ── Main Admin ─────────────────────────────────────────────────────────────────
export default function Admin() {
  const navigate = useNavigate()

  const [servicios, setServicios] = useState([])
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtrosEstados, setFiltrosEstados] = useState([])
  const [filtrosPagos, setFiltrosPagos] = useState([])
  const [filtrosTecnicos, setFiltrosTecnicos] = useState([])
  const [filtrosClientes, setFiltrosClientes] = useState([])
  const [filtrosLocalidades, setFiltrosLocalidades] = useState([])
  const [filtroIngreso, setFiltroIngreso] = useState('')
  const [filtroVisita, setFiltroVisita] = useState('')
  const [filtroCierre, setFiltroCierre] = useState('')
  const [filtroTexto, setFiltroTexto] = useState('')
  const { tecnicosLista: TECNICOS } = useTecnicos()
  const [vistaActual, setVistaActual] = useState('lista') // 'lista' | 'mapa' | 'papelera' | 'tecnicos'
  const [mediaActivo, setMediaActivo] = useState(null) // { lista: [...], index: 0 }
  const [filtroPeriodoModo, setFiltroPeriodoModo] = useState('mes')
  const [filtroSemana, setFiltroSemana] = useState(() => {
    const d = new Date()
    const startDate = new Date(d.getFullYear(), 0, 1)
    const days = Math.floor((d - startDate) / (24 * 60 * 60 * 1000))
    const weekNumber = Math.ceil((d.getDay() + 1 + days) / 7)
    return `${d.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`
  })
  const [filtroMes, setFiltroMes] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [filtroAnio, setFiltroAnio] = useState(() => new Date().getFullYear())
  const [filtroPersonalizadoDesde, setFiltroPersonalizadoDesde] = useState('')
  const [filtroPersonalizadoHasta, setFiltroPersonalizadoHasta] = useState('')
  const [filtroFinanzaCard, setFiltroFinanzaCard] = useState(null)
  const [graficoIngresoModo, setGraficoIngresoModo] = useState('anio')

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

  useEffect(() => {
    const q = query(collection(db, 'servicios'), orderBy('creadoEn', 'desc'))
    const unsub = onSnapshot(q, snap => {
      setServicios(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, err => {
      console.error(err)
      alert("Error de conexión con Firebase: " + err.message)
      setLoading(false)
    })
    
    const qc = query(collection(db, 'clientes'), orderBy('nombre'))
    const unsubC = onSnapshot(qc, snap => {
      setClientes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }, err => console.error(err))
    
    return () => { unsub(); unsubC() }
  }, [])

  const update = async (id, data) => {
    await updateDoc(doc(db, 'servicios', id), data)
  }

  const eliminar = async (id) => {
    if (confirm('¿Mover este servicio a la papelera?')) {
      const servicio = servicios.find(s => s.id === id)
      if (servicio) {
        await addDoc(collection(db, 'papelera'), {
          ...servicio,
          eliminadoEn: serverTimestamp(),
        })
      }
      await deleteDoc(doc(db, 'servicios', id))
    }
  }

    const limpiarFiltros = () => {
    setFiltroTexto('');
    setFiltrosEstados([]);
    setFiltrosPagos([]);
    setFiltrosTecnicos([]);
    setFiltrosClientes([]);
    setFiltrosLocalidades([]);
    setFiltroIngreso('');
    setFiltroVisita('');
    setFiltroCierre('');
  };

  const tieneFiltrosActivos = Boolean(
    filtroTexto.trim() ||
    filtrosEstados.length > 0 ||
    filtrosPagos.length > 0 ||
    filtrosTecnicos.length > 0 ||
    filtrosClientes.length > 0 ||
    filtrosLocalidades.length > 0 ||
    filtroIngreso ||
    filtroVisita ||
    filtroCierre
  );

  const cantidadFiltrosActivos = (filtroTexto.trim() ? 1 : 0) +
    (filtrosEstados.length > 0 ? 1 : 0) +
    (filtrosPagos.length > 0 ? 1 : 0) +
    (filtrosTecnicos.length > 0 ? 1 : 0) +
    (filtrosClientes.length > 0 ? 1 : 0) +
    (filtrosLocalidades.length > 0 ? 1 : 0) +
    (filtroIngreso ? 1 : 0) +
    (filtroVisita ? 1 : 0) +
    (filtroCierre ? 1 : 0);

  const filtrados = servicios.filter(s => {
    if (filtrosEstados.length > 0) {
      const match = filtrosEstados.some(est => {
        if (est === 'en-curso') return s.estado === 'en-curso' || s.estado === 'visitado-incompleto';
        return s.estado === est;
      });
      if (!match) return false;
    }

    if (filtrosPagos.length > 0) {
      const pagoActual = s.estadoPago || 'a-cobrar';
      if (!filtrosPagos.includes(pagoActual)) return false;
    }

    if (filtrosTecnicos.length > 0) {
      if (!filtrosTecnicos.includes(s.tecnico)) return false;
    }

    if (filtrosClientes.length > 0) {
      if (!filtrosClientes.includes(s.clienteId)) return false;
    }

    if (filtrosLocalidades.length > 0) {
      const loc = (s.localidad || '').toLowerCase();
      const match = filtrosLocalidades.some(l => (l || '').toLowerCase() === loc);
      if (!match) return false;
    }

    // Fecha de Ingreso
    if (filtroIngreso && s.creadoEn) {
      const d = s.creadoEn.toDate ? s.creadoEn.toDate() : new Date(s.creadoEn);
      if (d.toISOString().slice(0, 10) !== filtroIngreso) return false;
    }
    // Fecha de Visita (Asignación o real)
    if (filtroVisita && s.fechaAsignada !== filtroVisita && (!s.horaLlegada || new Date(s.horaLlegada).toISOString().slice(0, 10) !== filtroVisita)) return false;
    // Fecha de Cierre
    if (filtroCierre && s.fechaCierre) {
      if (new Date(s.fechaCierre).toISOString().slice(0, 10) !== filtroCierre) return false;
    }

    if (filtroTexto) {
      const q = filtroTexto.toLowerCase()
      const n = (s.nombre || '').toLowerCase()
      const a = (s.apellido || '').toLowerCase()
      const dir = (s.direccion || '').toLowerCase()
      const pisoDpto = (s.pisoDpto || '').toLowerCase()
      const localidad = (s.localidad || '').toLowerCase()
      const tel = (s.telefono || '').toLowerCase()
      const full = `${n} ${a} ${dir} ${pisoDpto} ${localidad} ${tel}`
      if (!full.includes(q)) return false
    }

    return true
  })

  const localidades = [...new Set(servicios.map(s => s.localidad).filter(Boolean))].sort()

  
  const opcionesTecnicos = useMemo(() => {
    return (TECNICOS || []).map(t => ({ value: t, label: t, color: '#1A5276' }));
  }, [TECNICOS]);

  const opcionesClientes = useMemo(() => {
    return clientes.map(c => ({
      value: c.id,
      label: `${c.nombreCompleto || c.nombre} ${c.numeroCliente ? `(${c.numeroCliente})` : ''}`.trim()
    })).sort((a, b) => a.label.localeCompare(b.label));
  }, [clientes]);

  const opcionesLocalidades = useMemo(() => {
    return localidades.map(l => ({ value: l, label: l }));
  }, [localidades]);

  const stats = {
    pendientes: servicios.filter(s => s.estado === 'pendiente').length,
    enCurso: servicios.filter(s => s.estado === 'en-curso' || s.estado === 'visitado-incompleto').length,
    solucionadoCliente: servicios.filter(s => s.estado === 'solucionado-cliente').length,
    resueltos: servicios.filter(s => s.estado === 'resuelto').length,
  }

  // ── Filtro de período temporal ──
  const getFechaServicio = (s) => {
    if (s.fechaCierre) return new Date(s.fechaCierre)
    if (s.creadoEn?.toDate) return s.creadoEn.toDate()
    if (s.creadoEn) return new Date(s.creadoEn)
    return null
  }

  const filtrarPorPeriodo = (lista) => {
    if (filtroPeriodoModo === 'todos') return lista
    let desde, hasta
    if (filtroPeriodoModo === 'semana') {
      if (!filtroSemana) return lista
      const [yearStr, weekStr] = filtroSemana.split('-W')
      const year = parseInt(yearStr, 10)
      const week = parseInt(weekStr, 10)
      desde = new Date(year, 0, 1 + (week - 1) * 7)
      const dayOffset = desde.getDay() <= 4 ? desde.getDay() - 1 : desde.getDay() - 8
      desde.setDate(desde.getDate() - dayOffset)
      desde.setHours(0,0,0,0)
      hasta = new Date(desde)
      hasta.setDate(hasta.getDate() + 7)
    } else if (filtroPeriodoModo === 'mes') {
      const [y, m] = filtroMes.split('-').map(Number)
      desde = new Date(y, m - 1, 1)
      hasta = new Date(y, m, 1)
    } else if (filtroPeriodoModo === 'anio') {
      desde = new Date(filtroAnio, 0, 1)
      hasta = new Date(filtroAnio + 1, 0, 1)
    } else if (filtroPeriodoModo === 'personalizado') {
      desde = filtroPersonalizadoDesde ? new Date(`${filtroPersonalizadoDesde}T00:00:00`) : new Date(0)
      hasta = filtroPersonalizadoHasta ? new Date(`${filtroPersonalizadoHasta}T23:59:59`) : new Date(8640000000000000)
    }
    return lista.filter(s => {
      const fecha = getFechaServicio(s)
      return fecha && fecha >= desde && fecha < hasta
    })
  }

  const calcMontoReal = (srv) => {
    const { sinIVA, conIVA } = calcTotalesItems(srv.materiales || [], srv.manoObra || [])
    return srv.cobroSinIva ? sinIVA : conIVA
  }

  const calcMontoTipo = (srv, usarIva) => {
    const { sinIVA, conIVA } = calcTotalesItems(srv.materiales || [], srv.manoObra || [])
    return usarIva ? conIVA : sinIVA
  }

  // ── Stats financieros calculados sobre filtrados + periodo ──
  const statsFinancieros = useMemo(() => {
    const base = filtrarPorPeriodo(filtrados)
    const pagados = base.filter(s => s.estadoPago === 'pagado')
    const pagadosSinIva = pagados.filter(s => s.cobroSinIva === true)
    const pagadosConIva = pagados.filter(s => s.cobroSinIva !== true)
    const enGarantia = base.filter(s => s.estadoPago === 'en-garantia')
    const noCorresponde = base.filter(s => s.estadoPago === 'no-corresponde')
    const aCobrar = base.filter(s => !s.estadoPago || s.estadoPago === 'a-cobrar')
    const solucionadoCliente = base.filter(s => s.estado === 'solucionado-cliente')

    let totalCobrado = 0, totalSinIvaMonto = 0, totalConIvaMonto = 0
    let totalACobrarMonto = 0, totalMateriales = 0, totalManoObra = 0

    // Helper: sumar materiales y mano de obra de una lista de servicios
    const calcMatMOLista = (lista) => {
      let mat = 0, mo = 0
      lista.forEach(s => {
        const { totalMatNeto, totalMoNeto } = calcTotalesItems(s.materiales || [], s.manoObra || [])
        mat += totalMatNeto
        mo += totalMoNeto
      })
      return { mat, mo }
    }

    pagados.forEach(s => {
      totalCobrado += calcMontoReal(s)
      const { totalMatNeto, totalMoNeto } = calcTotalesItems(s.materiales || [], s.manoObra || [])
      totalMateriales += totalMatNeto
      totalManoObra += totalMoNeto
    })
    pagadosSinIva.forEach(s => { totalSinIvaMonto += calcMontoTipo(s, false) })
    pagadosConIva.forEach(s => { totalConIvaMonto += calcMontoTipo(s, true) })
    aCobrar.forEach(s => { totalACobrarMonto += calcMontoReal(s) })

    // Calcular materiales y mano de obra por categoría
    const matMOBase = calcMatMOLista(base)
    const matMOPagados = { mat: totalMateriales, mo: totalManoObra }
    const matMOSinIva = calcMatMOLista(pagadosSinIva)
    const matMOConIva = calcMatMOLista(pagadosConIva)
    const matMOACobrar = calcMatMOLista(aCobrar)
    const matMOEnGarantia = calcMatMOLista(enGarantia)
    const matMONoCorresponde = calcMatMOLista(noCorresponde)
    const matMOSolucionadoCliente = calcMatMOLista(solucionadoCliente)

    const ticketPromedio = pagados.length > 0 ? totalCobrado / pagados.length : 0
    const resueltosTotales = base.filter(s => s.estado === 'resuelto' || s.estado === 'solucionado-cliente').length
    const tasaResolucion = base.length > 0 ? (resueltosTotales / base.length) * 100 : 0

    const porMetodo = {}
    pagados.forEach(s => {
      const metodo = s.metodoPago || 'No especificado'
      if (!porMetodo[metodo]) porMetodo[metodo] = { count: 0, monto: 0 }
      porMetodo[metodo].count += 1
      porMetodo[metodo].monto += calcMontoReal(s)
    })

    // Datos para gráfico de barras por estado de pago
    const barrasEstadoPago = [
      { label: 'Pagado', count: pagados.length, monto: totalCobrado, color: '#66BB6A' },
      { label: 'A cobrar', count: aCobrar.length, monto: totalACobrarMonto, color: '#EF5350' },
      { label: 'Sin IVA', count: pagadosSinIva.length, monto: totalSinIvaMonto, color: '#42A5F5' },
      { label: 'Con IVA', count: pagadosConIva.length, monto: totalConIvaMonto, color: '#AB47BC' },
      { label: 'Garantía', count: enGarantia.length, monto: 0, color: '#FFA726' },
      { label: 'No corresp.', count: noCorresponde.length, monto: 0, color: '#78909C' },
    ]

    return {
      totalServicios: base.length,
      pagados: { count: pagados.length, monto: totalCobrado },
      pagadosSinIva: { count: pagadosSinIva.length, monto: totalSinIvaMonto },
      pagadosConIva: { count: pagadosConIva.length, monto: totalConIvaMonto },
      enGarantia: { count: enGarantia.length },
      noCorresponde: { count: noCorresponde.length },
      aCobrar: { count: aCobrar.length, monto: totalACobrarMonto },
      solucionadoCliente: { count: solucionadoCliente.length },
      totalMateriales, totalManoObra, ticketPromedio, tasaResolucion, porMetodo,
      totalMatBase: matMOBase.mat, totalMOBase: matMOBase.mo,
      matMO: {
        pagados: matMOPagados, sinIva: matMOSinIva, conIva: matMOConIva,
        aCobrar: matMOACobrar, enGarantia: matMOEnGarantia,
        noCorresponde: matMONoCorresponde, solucionadoCliente: matMOSolucionadoCliente,
      },
      barrasEstadoPago,
      serviciosPagados: pagados,
      serviciosSinIva: pagadosSinIva,
      serviciosConIva: pagadosConIva,
      serviciosACobrar: aCobrar,
      serviciosEnGarantia: enGarantia,
      serviciosNoCorresponde: noCorresponde,
      serviciosSolucionadoCliente: solucionadoCliente,
      serviciosBase: base,
    }
  }, [filtrados, filtroPeriodoModo, filtroSemana, filtroMes, filtroAnio, filtroPersonalizadoDesde, filtroPersonalizadoHasta])

  const METODO_ICONS = {
    'Efectivo': { icon: '💵', bg: 'rgba(76,175,80,0.2)', color: '#66BB6A' },
    'Transferencia': { icon: '🏦', bg: 'rgba(33,150,243,0.2)', color: '#42A5F5' },
    'Echeq': { icon: '📄', bg: 'rgba(156,39,176,0.2)', color: '#AB47BC' },
    'Tarjeta Crédito/Débito': { icon: '💳', bg: 'rgba(255,152,0,0.2)', color: '#FFA726' },
    'Otro': { icon: '📋', bg: 'rgba(158,158,158,0.2)', color: '#90A4AE' },
    'No especificado': { icon: '❓', bg: 'rgba(158,158,158,0.15)', color: '#78909C' },
  }

  // Materiales/MO dinámicos según tarjeta seleccionada
  const matMOActual = filtroFinanzaCard && statsFinancieros.matMO[filtroFinanzaCard]
    ? statsFinancieros.matMO[filtroFinanzaCard]
    : { mat: statsFinancieros.totalMatBase, mo: statsFinancieros.totalMOBase }
  const totalMatMO = matMOActual.mat + matMOActual.mo
  const pctMat = totalMatMO > 0 ? (matMOActual.mat / totalMatMO) * 100 : 0
  const pctMO = totalMatMO > 0 ? (matMOActual.mo / totalMatMO) * 100 : 0

  // Generar lista de años disponibles
  const aniosDisponibles = useMemo(() => {
    const years = new Set()
    servicios.forEach(s => {
      const f = getFechaServicio(s)
      if (f) years.add(f.getFullYear())
    })
    const arr = [...years].sort((a, b) => b - a)
    if (arr.length === 0) arr.push(new Date().getFullYear())
    return arr
  }, [servicios])

  // ── Datos para gráfico de ingreso de servicios ──
  const datosIngresoServicios = useMemo(() => {
    const mesesNombres = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
    const diasSemana = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']
    const base = filtrarPorPeriodo(filtrados)

    const getFechaIngreso = (s) => {
      if (s.creadoEn?.toDate) return s.creadoEn.toDate()
      if (s.creadoEn) return new Date(s.creadoEn)
      return null
    }

    if (graficoIngresoModo === 'anio') {
      // Barras: una por mes del año seleccionado
      const year = filtroAnio
      const data = Array(12).fill(0)
      base.forEach(s => {
        const f = getFechaIngreso(s)
        if (f && f.getFullYear() === year) data[f.getMonth()]++
      })
      return { labels: mesesNombres, values: data, titulo: `Servicios ingresados por mes — ${year}` }
    }

    if (graficoIngresoModo === 'mes') {
      // Barras: una por día del mes seleccionado
      const [y, m] = filtroMes.split('-').map(Number)
      const diasEnMes = new Date(y, m, 0).getDate()
      const data = Array(diasEnMes).fill(0)
      base.forEach(s => {
        const f = getFechaIngreso(s)
        if (f && f.getFullYear() === y && f.getMonth() === m - 1) data[f.getDate() - 1]++
      })
      return { labels: Array.from({length: diasEnMes}, (_, i) => String(i + 1)), values: data, titulo: `Servicios ingresados por día — ${mesesNombres[m - 1]} ${y}` }
    }

    if (graficoIngresoModo === 'semana') {
      // Barras: Lun-Dom de la semana seleccionada
      const data = Array(7).fill(0)
      if (filtroSemana) {
        const [yearStr, weekStr] = filtroSemana.split('-W')
        const year = parseInt(yearStr, 10)
        const week = parseInt(weekStr, 10)
        let desde = new Date(year, 0, 1 + (week - 1) * 7)
        const dayOffset = desde.getDay() <= 4 ? desde.getDay() - 1 : desde.getDay() - 8
        desde.setDate(desde.getDate() - dayOffset)
        desde.setHours(0,0,0,0)
        const hasta = new Date(desde)
        hasta.setDate(hasta.getDate() + 7)
        base.forEach(s => {
          const f = getFechaIngreso(s)
          if (f && f >= desde && f < hasta) {
            let day = f.getDay() - 1
            if (day < 0) day = 6
            data[day]++
          }
        })
      }
      return { labels: diasSemana, values: data, titulo: `Servicios ingresados por día — Semana ${filtroSemana || ''}` }
    }

    // 'todos': agrupar por mes/año
    const porMesAnio = {}
    base.forEach(s => {
      const f = getFechaIngreso(s)
      if (f) {
        const key = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`
        porMesAnio[key] = (porMesAnio[key] || 0) + 1
      }
    })
    const sortedKeys = Object.keys(porMesAnio).sort()
    return {
      labels: sortedKeys.map(k => { const [y, m] = k.split('-'); return `${mesesNombres[parseInt(m,10)-1]} ${y.slice(2)}` }),
      values: sortedKeys.map(k => porMesAnio[k]),
      titulo: 'Servicios ingresados por mes — Todos los períodos'
    }
  }, [filtrados, graficoIngresoModo, filtroAnio, filtroMes, filtroSemana, filtroPeriodoModo, filtroPersonalizadoDesde, filtroPersonalizadoHasta])


  const exportarExcel = () => {
    const data = filtrados.map(s => ({
      'Nombre y Apellido': s.nombre || '',
      'Dirección': `${s.direccion || ''} ${s.pisoDpto ? s.pisoDpto : ''} ${s.localidad ? ', ' + s.localidad : ''}`.trim(),
      'WhatsApp': s.telefono || '',
      'Problema Reportado': s.descripcion || '',
      'Fecha Ingreso': s.creadoEn ? new Date(s.creadoEn.toDate ? s.creadoEn.toDate() : s.creadoEn).toLocaleDateString('es-AR') : '',
      'Fecha Visita/Asignación': s.fechaAsignada || '',
      'Fecha Cierre/Resolución': s.fechaCierre ? new Date(s.fechaCierre).toLocaleDateString('es-AR') : '',
      'Estado': getEstadoLabel(s.estado),
      'Cobro': (s.estadoPago === 'pagado') ? 'Pagado' : (s.estadoPago === 'en-garantia' ? 'En Garantía' : (s.estadoPago === 'no-corresponde' ? 'No corresponde abonar' : 'A Cobrar'))
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Servicios")
    XLSX.writeFile(wb, "Servicios.xlsx")
  }

  return (
    <div className="container" style={{ maxWidth: 900 }}>
      <div className="admin-header">
        <div className="admin-title">Servicios Técnicos</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={exportarExcel}>
            <Download size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Exportar Excel
          </button>
          <button className="btn-secondary" onClick={() => {
            const url = 'https://eulerservicios.netlify.app/'
            navigator.clipboard.writeText(url)
            alert('✅ Link del formulario copiado')
          }}>
            <Clipboard size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Copiar link cliente
          </button>
        </div>
      </div>

      <div className="stats-row">
        {[
          { key: 'pendiente', value: stats.pendientes, label: 'Pendientes', color: '#E65100' },
          { key: 'en-curso', value: stats.enCurso, label: 'En curso/Incomp.', color: '#1565C0' },
          { key: 'solucionado-cliente', value: stats.solucionadoCliente, label: 'Soluc. Cliente', color: '#7B1FA2' },
          { key: 'resuelto', value: stats.resueltos, label: 'Resueltos', color: '#2E7D32' },
        ].map(({ key, value, label, color }) => {
          const total = stats.pendientes + stats.enCurso + stats.solucionadoCliente + stats.resueltos;
          const pct = total > 0 ? ((value / total) * 100).toFixed(1).replace(/\.0$/, '') : '0';
          const isSelected = filtrosEstados.length === 1 && filtrosEstados.includes(key);
          return (
            <div
              className="stat-card"
              key={label}
              onClick={() => {
                if (isSelected) {
                  setFiltrosEstados([]);
                } else {
                  setFiltrosEstados([key]);
                }
              }}
              style={{
                cursor: 'pointer',
                border: isSelected ? `2px solid ${color}` : '1px solid var(--borde)',
                boxShadow: isSelected ? `0 4px 14px ${color}33` : 'var(--sombra)',
                transform: isSelected ? 'scale(1.02)' : 'none',
                transition: 'all 0.15s ease'
              }}
              title={`Clic para filtrar por ${label}`}
            >
              <div className="stat-number" style={{ color }}>{value}</div>
              <div style={{
                fontSize: '0.78rem',
                color: color,
                margin: '2px 0 4px',
                fontWeight: 700,
                background: color + '15',
                borderRadius: 8,
                padding: '2px 8px',
                display: 'inline-block'
              }}>
                {pct}%
              </div>
              <div className="stat-label">{label}</div>
            </div>
          );
        })}
      </div>

      <div className="filtros" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <input 
          type="text" 
          placeholder="Buscar por nombre, apellido, dirección o teléfono..." 
          value={filtroTexto} 
          onChange={e => setFiltroTexto(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: filtroTexto.trim() ? '1.5px solid #1A5276' : '1px solid #D8E2EE',
            background: filtroTexto.trim() ? '#EEF4FF' : '#FFFFFF',
            fontFamily: 'var(--font)',
            fontSize: '0.85rem',
            flex: '1 1 200px',
            outline: 'none',
            boxShadow: filtroTexto.trim() ? '0 0 0 2px rgba(26,82,118,0.12)' : 'none'
          }} 
        />
        
        {/* Selector con casillas de verificación para estados */}
        <MultiSelectDropdown
          placeholder="Todos los estados"
          labelPrefix="Estados"
          options={ESTADOS_INFO}
          selected={filtrosEstados}
          onChange={setFiltrosEstados}
          minWidth={165}
        />

        {/* Selector con casillas de verificación para cobros */}
        <MultiSelectDropdown
          placeholder="Todos los cobros"
          labelPrefix="Cobros"
          options={COBROS_INFO}
          selected={filtrosPagos}
          onChange={setFiltrosPagos}
          minWidth={155}
        />

        {/* Selector con casillas de verificación para técnicos */}
        <MultiSelectDropdown
          placeholder="Todos los técnicos"
          labelPrefix="Técnicos"
          options={opcionesTecnicos}
          selected={filtrosTecnicos}
          onChange={setFiltrosTecnicos}
          searchable={opcionesTecnicos.length > 5}
          minWidth={165}
        />

        {/* Selector con casillas de verificación para clientes */}
        <MultiSelectDropdown
          placeholder="Todos los clientes"
          labelPrefix="Clientes"
          options={opcionesClientes}
          selected={filtrosClientes}
          onChange={setFiltrosClientes}
          searchable={true}
          minWidth={170}
        />

        {/* Selector con casillas de verificación para localidades */}
        <MultiSelectDropdown
          placeholder="Todas las localidades"
          labelPrefix="Localidades"
          options={opcionesLocalidades}
          selected={filtrosLocalidades}
          onChange={setFiltrosLocalidades}
          searchable={opcionesLocalidades.length > 5}
          minWidth={170}
        />
        
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          borderRadius: 8,
          border: filtroIngreso ? '1.5px solid #1A5276' : '1px solid #D8E2EE',
          background: filtroIngreso ? '#EEF4FF' : '#FFFFFF'
        }}>
          <label style={{ fontSize: '0.78rem', color: filtroIngreso ? '#0C3552' : 'var(--gris-texto)', fontWeight: 700 }}>Ingreso:</label>
          <input type="date" value={filtroIngreso} onChange={e => setFiltroIngreso(e.target.value)} style={{ padding: '4px', border: 'none', background: 'transparent', fontFamily: 'var(--font)', fontSize: '0.82rem', outline: 'none' }} />
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          borderRadius: 8,
          border: filtroVisita ? '1.5px solid #1A5276' : '1px solid #D8E2EE',
          background: filtroVisita ? '#EEF4FF' : '#FFFFFF'
        }}>
          <label style={{ fontSize: '0.78rem', color: filtroVisita ? '#0C3552' : 'var(--gris-texto)', fontWeight: 700 }}>Visita:</label>
          <input type="date" value={filtroVisita} onChange={e => setFiltroVisita(e.target.value)} style={{ padding: '4px', border: 'none', background: 'transparent', fontFamily: 'var(--font)', fontSize: '0.82rem', outline: 'none' }} />
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          borderRadius: 8,
          border: filtroCierre ? '1.5px solid #1A5276' : '1px solid #D8E2EE',
          background: filtroCierre ? '#EEF4FF' : '#FFFFFF'
        }}>
          <label style={{ fontSize: '0.78rem', color: filtroCierre ? '#0C3552' : 'var(--gris-texto)', fontWeight: 700 }}>Cierre:</label>
          <input type="date" value={filtroCierre} onChange={e => setFiltroCierre(e.target.value)} style={{ padding: '4px', border: 'none', background: 'transparent', fontFamily: 'var(--font)', fontSize: '0.82rem', outline: 'none' }} />
        </div>

        {/* Botón Quitar filtros */}
        {tieneFiltrosActivos && (
          <button
            type="button"
            onClick={limpiarFiltros}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              background: '#FFF0EE',
              color: '#C44121',
              border: '1.5px solid #F5B7B1',
              borderRadius: 8,
              fontFamily: 'var(--font)',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 6px rgba(196,65,33,0.12)',
              transition: 'all 0.15s ease'
            }}
          >
            <XCircle size={15} /> Quitar filtros ({cantidadFiltrosActivos})
          </button>
        )}
      </div>

      {/* Testigo de filtros activos y Contador de Servicios Filtrados */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10,
        marginBottom: 16,
        padding: '10px 16px',
        background: tieneFiltrosActivos ? '#EEF4FF' : '#FAFCFF',
        borderRadius: 10,
        border: tieneFiltrosActivos ? '1.5px solid #BCD3F2' : '1px solid #E2E8F0',
        fontSize: '0.85rem',
        boxShadow: tieneFiltrosActivos ? '0 2px 8px rgba(21,101,192,0.08)' : 'none'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {tieneFiltrosActivos ? (
            <>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: '#1565C0',
                color: '#FFF',
                padding: '3px 10px',
                borderRadius: 12,
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.3px',
                textTransform: 'uppercase'
              }}>
                ● Filtros activos ({cantidadFiltrosActivos})
              </span>
              <span style={{ fontWeight: 700, color: 'var(--azul)', fontSize: '0.92rem' }}>
                {filtrados.length} {filtrados.length === 1 ? 'servicio coincidente' : 'servicios coincidentes'}
              </span>
              <span style={{ color: 'var(--gris-suave)' }}>
                (de {servicios.length} en total)
              </span>
            </>
          ) : (
            <span style={{ fontWeight: 600, color: 'var(--gris-texto)' }}>
              Mostrando el total de <strong style={{ color: 'var(--azul)' }}>{servicios.length}</strong> servicios
            </span>
          )}
        </div>

        {tieneFiltrosActivos && (
          <button
            type="button"
            onClick={limpiarFiltros}
            style={{
              background: 'none',
              border: 'none',
              color: '#C44121',
              fontWeight: 700,
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: 0
            }}
          >
            <Trash2 size={13} /> Limpiar todos los filtros
          </button>
        )}
      </div>

      {/* Tabs lista / mapa / papelera */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => setVistaActual('lista')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: '0.85rem', fontWeight: 600, background: vistaActual === 'lista' ? 'var(--azul)' : '#EEF4FF', color: vistaActual === 'lista' ? 'white' : 'var(--azul)' }}>
          <List size={15} /> Lista ({filtrados.length})
        </button>
        <button
          onClick={() => setVistaActual('mapa')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: '0.85rem', fontWeight: 600, background: vistaActual === 'mapa' ? 'var(--azul)' : '#EEF4FF', color: vistaActual === 'mapa' ? 'white' : 'var(--azul)' }}>
          <Map size={15} /> Mapa ({filtrados.length})
        </button>
        <button
          onClick={() => setVistaActual('finanzas')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: '0.85rem', fontWeight: 600, background: vistaActual === 'finanzas' ? 'var(--dorado)' : '#FDF3DC', color: vistaActual === 'finanzas' ? 'white' : '#B8860B' }}>
          <DollarSign size={15} /> Finanzas
        </button>
        <button
          onClick={() => setVistaActual('papelera')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: '0.85rem', fontWeight: 600, background: vistaActual === 'papelera' ? 'var(--rojo)' : '#FFF0EE', color: vistaActual === 'papelera' ? 'white' : 'var(--rojo)' }}>
          <Trash2 size={15} /> Papelera
        </button>
        <button
          onClick={() => setVistaActual('tecnicos')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: '0.85rem', fontWeight: 600, background: vistaActual === 'tecnicos' ? 'var(--azul)' : '#EEF4FF', color: vistaActual === 'tecnicos' ? 'white' : 'var(--azul)' }}>
          <Users size={15} /> Técnicos
        </button>
        <button
          onClick={() => setVistaActual('config')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: '0.85rem', fontWeight: 600, background: vistaActual === 'config' ? 'var(--azul)' : '#EEF4FF', color: vistaActual === 'config' ? 'white' : 'var(--azul)' }}>
          <Settings size={15} /> Configuración
        </button>
        <button
          onClick={() => setVistaActual('manuales')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: '0.85rem', fontWeight: 600, background: vistaActual === 'manuales' ? 'var(--naranja)' : '#FFF3E0', color: vistaActual === 'manuales' ? 'white' : 'var(--naranja)' }}>
          <BookOpen size={15} /> Manuales y Soluciones
        </button>
      </div>

      {vistaActual === 'finanzas' && (
        <>
        <div className="finance-panel" style={{ marginTop: 0 }}>
          <div className="finance-header">
            <div className="finance-title">
              <span className="icon-circle"><DollarSign size={15} color="#e0a42d" /></span>
              Analítica Financiera
            </div>
          </div>

          {/* Selector de período */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 20, background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 14px', position: 'relative', zIndex: 1 }}>
            <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Período:</span>
            <div className="finance-period-selector">
              {[{ key: 'semana', label: 'Semana' }, { key: 'mes', label: 'Mes' }, { key: 'anio', label: 'Año' }, { key: 'personalizado', label: 'Personalizado' }, { key: 'todos', label: 'Todos' }].map(p => (
                <button key={p.key} className={`finance-period-btn${filtroPeriodoModo === p.key ? ' active' : ''}`} onClick={() => setFiltroPeriodoModo(p.key)}>
                  {p.label}
                </button>
              ))}
            </div>
            {filtroPeriodoModo === 'semana' && (
              <input type="week" value={filtroSemana} onChange={e => setFiltroSemana(e.target.value)}
                style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', fontFamily: 'var(--font)', fontSize: '0.8rem' }} />
            )}
            {filtroPeriodoModo === 'mes' && (
              <input type="month" value={filtroMes} onChange={e => setFiltroMes(e.target.value)}
                style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', fontFamily: 'var(--font)', fontSize: '0.8rem' }} />
            )}
            {filtroPeriodoModo === 'anio' && (
              <select value={filtroAnio} onChange={e => setFiltroAnio(Number(e.target.value))}
                style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', fontFamily: 'var(--font)', fontSize: '0.8rem' }}>
                {aniosDisponibles.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
            {filtroPeriodoModo === 'personalizado' && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)' }}>Desde:</span>
                <input type="date" value={filtroPersonalizadoDesde} onChange={e => setFiltroPersonalizadoDesde(e.target.value)}
                  style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', fontFamily: 'var(--font)', fontSize: '0.8rem', colorScheme: 'dark' }} />
                <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', marginLeft: 4 }}>Hasta:</span>
                <input type="date" value={filtroPersonalizadoHasta} onChange={e => setFiltroPersonalizadoHasta(e.target.value)}
                  style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', fontFamily: 'var(--font)', fontSize: '0.8rem', colorScheme: 'dark' }} />
              </div>
            )}
            <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)', marginLeft: 'auto' }}>
              {statsFinancieros.totalServicios} servicio{statsFinancieros.totalServicios !== 1 ? 's' : ''} en período
            </span>
          </div>

          {/* Tarjetas principales — layout jerárquico */}
          <div style={{ marginBottom: 16, position: 'relative', zIndex: 1 }}>
            {/* Fila 1: Total Cobrado (hero) */}
            <div className={`finance-card finance-card-hero${filtroFinanzaCard === 'pagados' ? ' finance-card-active' : ''}`} onClick={() => setFiltroFinanzaCard(prev => prev === 'pagados' ? null : 'pagados')} style={{ cursor: 'pointer', marginBottom: 10 }}>
              <div className="finance-card-label" style={{ textAlign: 'center' }}>Total Cobrado</div>
              <div className="finance-card-value dorado" style={{ textAlign: 'center', fontSize: '1.8rem' }}>${formatMoney(statsFinancieros.pagados.monto)}</div>
              <div style={{ textAlign: 'center', marginTop: 6 }}><span className="finance-card-count"><Check size={11} /> {statsFinancieros.pagados.count} servicio{statsFinancieros.pagados.count !== 1 ? 's' : ''}</span></div>
            </div>
            {/* Fila 2: Sin IVA + Con IVA (sub del total) */}
            <div className="finance-cards-sub-row">
              <div className={`finance-card${filtroFinanzaCard === 'sinIva' ? ' finance-card-active' : ''}`} onClick={() => setFiltroFinanzaCard(prev => prev === 'sinIva' ? null : 'sinIva')} style={{ cursor: 'pointer' }}>
                <div className="finance-card-label">Cobrados sin IVA</div>
                <div className="finance-card-value">${formatMoney(statsFinancieros.pagadosSinIva.monto)}</div>
                <div className="finance-card-count">{statsFinancieros.pagadosSinIva.count} servicio{statsFinancieros.pagadosSinIva.count !== 1 ? 's' : ''}</div>
              </div>
              <div className={`finance-card${filtroFinanzaCard === 'conIva' ? ' finance-card-active' : ''}`} onClick={() => setFiltroFinanzaCard(prev => prev === 'conIva' ? null : 'conIva')} style={{ cursor: 'pointer' }}>
                <div className="finance-card-label">Cobrados con IVA</div>
                <div className="finance-card-value">${formatMoney(statsFinancieros.pagadosConIva.monto)}</div>
                <div className="finance-card-count">{statsFinancieros.pagadosConIva.count} servicio{statsFinancieros.pagadosConIva.count !== 1 ? 's' : ''}</div>
              </div>
            </div>
            {/* Fila 3: Estado del servicio */}
            <div className="finance-cards-status-row">
              <div className={`finance-card${filtroFinanzaCard === 'aCobrar' ? ' finance-card-active' : ''}`} onClick={() => setFiltroFinanzaCard(prev => prev === 'aCobrar' ? null : 'aCobrar')} style={{ cursor: 'pointer' }}>
                <div className="finance-card-label">Pendiente de cobro</div>
                <div className="finance-card-value rojo">${formatMoney(statsFinancieros.aCobrar.monto)}</div>
                <div className="finance-card-count"><Clock size={11} /> {statsFinancieros.aCobrar.count} servicio{statsFinancieros.aCobrar.count !== 1 ? 's' : ''}</div>
              </div>
              <div className={`finance-card${filtroFinanzaCard === 'enGarantia' ? ' finance-card-active' : ''}`} onClick={() => setFiltroFinanzaCard(prev => prev === 'enGarantia' ? null : 'enGarantia')} style={{ cursor: 'pointer' }}>
                <div className="finance-card-label">En Garantía</div>
                <div className="finance-card-value naranja">{statsFinancieros.enGarantia.count}</div>
                <div className="finance-card-sub">servicio{statsFinancieros.enGarantia.count !== 1 ? 's' : ''}</div>
              </div>
              <div className={`finance-card${filtroFinanzaCard === 'noCorresponde' ? ' finance-card-active' : ''}`} onClick={() => setFiltroFinanzaCard(prev => prev === 'noCorresponde' ? null : 'noCorresponde')} style={{ cursor: 'pointer' }}>
                <div className="finance-card-label">No corresponde</div>
                <div className="finance-card-value">{statsFinancieros.noCorresponde.count}</div>
                <div className="finance-card-sub">servicio{statsFinancieros.noCorresponde.count !== 1 ? 's' : ''}</div>
              </div>
              <div className={`finance-card${filtroFinanzaCard === 'solucionadoCliente' ? ' finance-card-active' : ''}`} onClick={() => setFiltroFinanzaCard(prev => prev === 'solucionadoCliente' ? null : 'solucionadoCliente')} style={{ cursor: 'pointer' }}>
                <div className="finance-card-label">Soluc. por cliente</div>
                <div className="finance-card-value" style={{ color: '#CE93D8' }}>{statsFinancieros.solucionadoCliente.count}</div>
                <div className="finance-card-sub">sin visita técnica</div>
              </div>
            </div>
          </div>

          {/* GRÁFICO DE BARRAS — Ingreso de servicios por fecha */}
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '16px', marginBottom: 16, position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.7px', fontWeight: 700 }}>
                <TrendingUp size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />{datosIngresoServicios.titulo}
              </div>
              <div className="finance-period-selector">
                {[{ key: 'semana', label: 'Semana' }, { key: 'mes', label: 'Mes' }, { key: 'anio', label: 'Año' }, { key: 'todos', label: 'Todos' }].map(p => (
                  <button key={p.key} className={`finance-period-btn${graficoIngresoModo === p.key ? ' active' : ''}`} onClick={() => setGraficoIngresoModo(p.key)}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            {datosIngresoServicios.values.every(v => v === 0) ? (
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem', padding: 16 }}>No hay servicios ingresados en este período</div>
            ) : (
              <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', padding: '0 4px', overflowX: datosIngresoServicios.labels.length > 31 ? 'auto' : 'visible' }}>
                {datosIngresoServicios.values.map((val, i) => {
                  const maxVal = Math.max(...datosIngresoServicios.values, 1)
                  const barHeight = Math.max((val / maxVal) * 140, val > 0 ? 4 : 2)
                  return (
                    <div key={i} className="ingreso-chart-bar-group" style={{ minWidth: datosIngresoServicios.labels.length > 20 ? 18 : undefined }}>
                      <span className="ingreso-chart-count">{val > 0 ? val : ''}</span>
                      <div style={{ height: 140, display: 'flex', alignItems: 'flex-end', width: '100%', justifyContent: 'center' }}>
                        <div className="ingreso-chart-bar" style={{ height: barHeight, opacity: val === 0 ? 0.3 : 1 }} />
                      </div>
                      <span className="ingreso-chart-label">{datosIngresoServicios.labels[i]}</span>
                    </div>
                  )
                })}
              </div>
            )}
            <div style={{ textAlign: 'center', marginTop: 10, fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)' }}>
              Total: {datosIngresoServicios.values.reduce((a, b) => a + b, 0)} servicios ingresados
            </div>
          </div>

          {/* GRÁFICO DE BARRAS — Estado de cobro (montos) */}
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '16px', marginBottom: 16, position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.7px', fontWeight: 700, marginBottom: 14 }}>Montos por estado de cobro</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {statsFinancieros.barrasEstadoPago.filter(b => b.monto > 0).map(bar => {
                const maxMonto = Math.max(...statsFinancieros.barrasEstadoPago.map(b => b.monto), 1)
                const totalMontos = statsFinancieros.barrasEstadoPago.reduce((acc, b) => acc + b.monto, 0) || 1
                const barWidth = (bar.monto / maxMonto) * 100
                const pctReal = (bar.monto / totalMontos) * 100
                return (
                  <div key={bar.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>{bar.label} ({bar.count})</span>
                      <span style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 700, fontFamily: 'var(--font-display)' }}>${formatMoney(bar.monto)}</span>
                    </div>
                    <div style={{ height: 22, borderRadius: 6, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${barWidth}%`, background: `linear-gradient(90deg, ${bar.color}88, ${bar.color})`, borderRadius: 6, transition: 'width 0.8s ease', display: 'flex', alignItems: 'center', paddingLeft: 8 }}>
                        {barWidth > 15 && <span style={{ fontSize: '0.65rem', color: '#fff', fontWeight: 700 }}>{pctReal.toFixed(0)}%</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
              {statsFinancieros.barrasEstadoPago.every(b => b.monto === 0) && (
                <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem', padding: 16 }}>No hay montos para mostrar en este período</div>
              )}
            </div>
          </div>

          {/* GRÁFICO DE BARRAS — Conteo por estado de pago */}
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '16px', marginBottom: 16, position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.7px', fontWeight: 700, marginBottom: 14 }}>Cantidad de servicios por estado de cobro</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 160, padding: '0 8px' }}>
              {statsFinancieros.barrasEstadoPago.map(bar => {
                const maxCount = Math.max(...statsFinancieros.barrasEstadoPago.map(b => b.count), 1)
                const pct = (bar.count / maxCount) * 100
                return (
                  <div key={bar.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: '0.72rem', color: '#fff', fontWeight: 700 }}>{bar.count}</span>
                    <div style={{ width: '100%', maxWidth: 50, borderRadius: '6px 6px 0 0', background: `linear-gradient(180deg, ${bar.color}, ${bar.color}66)`, height: `${Math.max(pct, 4)}%`, transition: 'height 0.8s ease', minHeight: 4 }} />
                    <span style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.5)', fontWeight: 600, textAlign: 'center', lineHeight: 1.2 }}>{bar.label}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Desglose Materiales vs Mano de Obra */}
          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.7px', fontWeight: 700, marginBottom: 8 }}>
            Desglose Materiales vs Mano de Obra {filtroFinanzaCard ? <span style={{ color: 'var(--dorado)', textTransform: 'none' }}>— {({ pagados: 'Total Cobrado', sinIva: 'Cobrados sin IVA', conIva: 'Cobrados con IVA', aCobrar: 'Pendientes de cobro', enGarantia: 'En Garantía', noCorresponde: 'No corresponde', solucionadoCliente: 'Soluc. por cliente' })[filtroFinanzaCard]}</span> : <span style={{ textTransform: 'none' }}>— Todos los servicios</span>}
          </div>
          <div className="finance-breakdown">
            <div className="breakdown-card">
              <div className="breakdown-card-header">
                <div className="breakdown-card-title"><Package size={13} color="#42A5F5" /> Materiales</div>
                <div className="breakdown-card-amount">${formatMoney(matMOActual.mat)}</div>
              </div>
              <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)' }}>{pctMat.toFixed(1)}% del total facturado</div>
              <div className="breakdown-bar"><div className="breakdown-bar-fill materiales" style={{ width: `${pctMat}%` }} /></div>
            </div>
            <div className="breakdown-card">
              <div className="breakdown-card-header">
                <div className="breakdown-card-title"><Wrench size={13} color="#FFA726" /> Mano de obra</div>
                <div className="breakdown-card-amount">${formatMoney(matMOActual.mo)}</div>
              </div>
              <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)' }}>{pctMO.toFixed(1)}% del total facturado</div>
              <div className="breakdown-bar"><div className="breakdown-bar-fill mano-obra" style={{ width: `${pctMO}%` }} /></div>
            </div>
          </div>

          {/* GRÁFICO DE BARRAS — Métodos de pago */}
          {Object.keys(statsFinancieros.porMetodo).length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '16px', marginBottom: 16, position: 'relative', zIndex: 1 }}>
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.7px', fontWeight: 700, marginBottom: 14 }}>Facturación por método de pago</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {Object.entries(statsFinancieros.porMetodo)
                  .sort((a, b) => b[1].monto - a[1].monto)
                  .map(([metodo, data]) => {
                    const info = METODO_ICONS[metodo] || METODO_ICONS['Otro']
                    const maxMetodo = Math.max(...Object.values(statsFinancieros.porMetodo).map(m => m.monto), 1)
                    const pct = (data.monto / maxMetodo) * 100
                    return (
                      <div key={metodo}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: '0.9rem' }}>{info.icon}</span> {metodo} ({data.count})
                          </span>
                          <span style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 700, fontFamily: 'var(--font-display)' }}>${formatMoney(data.monto)}</span>
                        </div>
                        <div style={{ height: 18, borderRadius: 5, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${info.color}88, ${info.color})`, borderRadius: 5, transition: 'width 0.8s ease' }} />
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {/* Métodos de Pago - Cards */}
          {Object.keys(statsFinancieros.porMetodo).length > 0 && (
            <div className="payment-methods">
              <div className="payment-methods-title">Detalle por método de pago</div>
              <div className="payment-methods-grid">
                {Object.entries(statsFinancieros.porMetodo)
                  .sort((a, b) => b[1].monto - a[1].monto)
                  .map(([metodo, data]) => {
                    const info = METODO_ICONS[metodo] || METODO_ICONS['Otro']
                    return (
                      <div key={metodo} className="payment-method-item">
                        <div className="payment-method-icon" style={{ background: info.bg }}>{info.icon}</div>
                        <div className="payment-method-info">
                          <div className="payment-method-name">{metodo}</div>
                          <div className="payment-method-amount">${formatMoney(data.monto)}</div>
                          <div className="payment-method-count">{data.count} pago{data.count !== 1 ? 's' : ''}</div>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {/* Footer: Ticket promedio + Tasa de resolución */}
          <div className="finance-footer-stats">
            <div className="finance-mini-stat">
              <TrendingUp size={14} color="#66BB6A" />
              Ticket promedio: <strong>${formatMoney(statsFinancieros.ticketPromedio)}</strong>
            </div>
            <div className="finance-mini-stat">
              <Check size={14} color="#42A5F5" />
              Tasa de resolución: <strong>{statsFinancieros.tasaResolucion.toFixed(1)}%</strong>
            </div>
            <div className="finance-mini-stat">
              Total servicios en período: <strong>{statsFinancieros.totalServicios}</strong>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--azul)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <List size={18} />
            {filtroFinanzaCard ? (
              <>
                {({ pagados: 'Total Cobrado', sinIva: 'Cobrados sin IVA', conIva: 'Cobrados con IVA', aCobrar: 'Pendientes de cobro', enGarantia: 'En Garantía', noCorresponde: 'No corresponde', solucionadoCliente: 'Soluc. por cliente' })[filtroFinanzaCard]} ({({ pagados: statsFinancieros.serviciosPagados, sinIva: statsFinancieros.serviciosSinIva, conIva: statsFinancieros.serviciosConIva, aCobrar: statsFinancieros.serviciosACobrar, enGarantia: statsFinancieros.serviciosEnGarantia, noCorresponde: statsFinancieros.serviciosNoCorresponde, solucionadoCliente: statsFinancieros.serviciosSolucionadoCliente })[filtroFinanzaCard]?.length || 0})
                <button onClick={() => setFiltroFinanzaCard(null)} style={{ background: 'rgba(239,83,80,0.15)', color: '#EF5350', border: '1px solid rgba(239,83,80,0.3)', borderRadius: 6, padding: '2px 10px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                  ✕ Quitar filtro
                </button>
              </>
            ) : (
              <>Servicios del período ({statsFinancieros.totalServicios})</>
            )}
          </div>
          {(() => {
            const listaServicios = filtroFinanzaCard
              ? ({ pagados: statsFinancieros.serviciosPagados, sinIva: statsFinancieros.serviciosSinIva, conIva: statsFinancieros.serviciosConIva, aCobrar: statsFinancieros.serviciosACobrar, enGarantia: statsFinancieros.serviciosEnGarantia, noCorresponde: statsFinancieros.serviciosNoCorresponde, solucionadoCliente: statsFinancieros.serviciosSolucionadoCliente })[filtroFinanzaCard] || []
              : filtrarPorPeriodo(filtrados)
            return listaServicios.length === 0 ? (
              <div className="empty-state" style={{ background: 'white' }}>
                <AlertCircle size={48} />
                <p>No hay servicios {filtroFinanzaCard ? 'en esta categoría' : 'cobrados en este período'}</p>
              </div>
            ) : (
              listaServicios.map(s => (
                <ServicioCard key={s.id} s={s} onUpdate={update} onEliminar={eliminar} onFoto={abrirMedia} clientes={clientes} navigate={navigate} />
              ))
            )
          })()}
        </div>
        </>
      )}

      {vistaActual === 'mapa' && (
        <MapaServicios servicios={filtrados.length > 0 ? filtrados : servicios.filter(s => s.estado !== 'resuelto')} />
      )}

      {vistaActual === 'papelera' && (
        <Papelera />
      )}

      {vistaActual === 'tecnicos' && (
        <GestionTecnicos />
      )}

      {vistaActual === 'config' && (
        <ErrorBoundary key="config-boundary">
          <Configuracion servicios={servicios} clientes={clientes} />
        </ErrorBoundary>
      )}

      {vistaActual === 'manuales' && (
        <ManualesSoluciones usuarioRol="admin" usuarioNombre="Administrador" />
      )}

      {vistaActual === 'lista' && (
        loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : filtrados.length === 0 ? (
          <div className="empty-state">
            <AlertCircle size={48} />
            <p>No hay servicios para mostrar</p>
          </div>
        ) : (
          filtrados.map(s => (
            <ServicioCard key={s.id} s={s} onUpdate={update} onEliminar={eliminar} onFoto={abrirMedia} clientes={clientes} navigate={navigate} />
          ))
        )
      )}

      <button className="fab" onClick={() => navigate('/admin/nuevo')} title="Nuevo servicio">
        <Plus size={24} />
      </button>

      {mediaActivo && (
        <MediaLightbox
          media={mediaActivo.lista}
          index={mediaActivo.index}
          onClose={() => setMediaActivo(null)}
          onChangeIndex={(idx) => setMediaActivo({ ...mediaActivo, index: idx })}
        />
      )}

      {/* Configuración PWA Dispositivo */}
      {!window.matchMedia('(display-mode: standalone)').matches && (
        <div style={{ marginTop: 40, padding: 16, background: '#EEF4FF', borderRadius: 12, border: '1.5px dashed #C0D0E4', textAlign: 'center' }}>
          <div style={{ fontSize: '0.9rem', color: 'var(--azul)', fontWeight: 700, marginBottom: 8 }}>Instalación en Celular</div>
          <p style={{ fontSize: '0.8rem', color: 'var(--gris-texto)', marginBottom: 12 }}>
            Si querés instalar la aplicación en este celular y que se abra siempre en modo Administrador, tocá el botón de abajo y luego elegí "Agregar a la pantalla de inicio" en el menú de tu navegador.
          </p>
          <button
            onClick={() => {
              localStorage.setItem('euler_device_role', '/admin')
              alert('✅ Rol de Administrador asignado a este dispositivo. Ahora podés "Agregar a la pantalla de inicio".')
            }}
            style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--azul)', color: 'white', border: 'none', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
          >
            Fijar Modo Administrador
          </button>
        </div>
      )}
    </div>
  )
}
