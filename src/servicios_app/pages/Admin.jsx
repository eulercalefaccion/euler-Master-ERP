import { useState, useEffect, useMemo, Component } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection, onSnapshot, doc, updateDoc, deleteDoc, query, orderBy, getDocs, addDoc, serverTimestamp, setDoc, writeBatch
} from 'firebase/firestore'
import { db } from '../../services/firebaseConfig'
import { Plus, Clipboard, AlertCircle, ChevronDown, ChevronUp, FileText, Trash2, PlusCircle, XCircle, Link, Clock, Map, List, Download, Settings, Users, Edit3, Eye, EyeOff, Check, X, Shield, Wrench, MessageCircle, MapPin, Calendar, BookOpen } from 'lucide-react'
import PinLock, { useTecnicos } from '../components/PinLock'
import MapaServicios from '../components/MapaServicios'
import MediaLightbox from '../components/MediaLightbox'
import ManualesSoluciones from '../components/ManualesSoluciones'
import AutocompleteLocalidad from '../components/AutocompleteLocalidad'
import * as XLSX from 'xlsx'
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
function ServicioCard({ s, onUpdate, onEliminar, onFoto, clientes, navigate }) {
  const [expandido, setExpandido] = useState(false)
  const [materiales, setMateriales] = useState(s.materiales || [])
  const [manoObra, setManoObra] = useState(s.manoObra || [])
  const [transcribiendoIdx, setTranscribiendoIdx] = useState(null)
  const [mostrarModalFecha, setMostrarModalFecha] = useState(false)
  const [fechaResolucion, setFechaResolucion] = useState(() => new Date().toISOString().slice(0, 10))
  const [nuevaNotaTexto, setNuevaNotaTexto] = useState('')

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

          {/* Datos del cliente */}
          <div style={{ marginBottom: 16 }}>
            {sectionLabel('Datos del cliente')}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input style={inputStyle} placeholder="Nombre" value={s.nombre || ''} onChange={e => upd({ nombre: e.target.value })} />
              <input style={inputStyle} placeholder="Teléfono" value={s.telefono || ''} onChange={e => upd({ telefono: e.target.value })} />
              <input style={{ ...inputStyle, gridColumn: '1/-1' }} placeholder="Email" type="email" value={s.email || ''} onChange={e => upd({ email: e.target.value })} />
              <input style={inputStyle} placeholder="Dirección" value={s.direccion || ''} onChange={e => upd({ direccion: e.target.value })} />
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
                <input style={inputStyle} placeholder="Marca" value={s.marca || ''} onChange={e => upd({ marca: e.target.value })} />
              )}
              {(s.equipos || []).includes('caldera') && s.marca && s.marca !== 'OTRA' && s.marca !== 'FLOWING' ? (
                <select style={inputStyle} value={s.modelo || ''} onChange={e => upd({ modelo: e.target.value })}>
                  <option value="">Seleccioná modelo...</option>
                  {(MODELOS_CALDERA[s.marca] || []).map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              ) : (
                <input style={inputStyle} placeholder="Modelo" value={s.modelo || ''} onChange={e => upd({ modelo: e.target.value })} />
              )}
            </div>
            <textarea style={{ ...inputStyle, marginTop: 8, resize: 'vertical', minHeight: 70 }} placeholder="Descripción del problema" value={s.descripcion || ''} onChange={e => upd({ descripcion: e.target.value })} />
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
              <input style={{ ...inputStyle, gridColumn: '1/-1' }} type="date" value={s.fechaAsignada || ''} onChange={e => upd({ fechaAsignada: e.target.value })} />
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
                  ¿Cliente nuevo? Crealo en la sección <span style={{ color: 'var(--azul-medio)', cursor: 'pointer', fontWeight: 600 }} onClick={() => navigate('/servicios/clientes')}>Clientes</span> y volvé a vincularlo.
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
            <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 120, marginBottom: 8 }} placeholder="¿Qué tenía el equipo? ¿Qué se hizo? Recomendaciones..." value={s.diagnostico || ''} onChange={e => upd({ diagnostico: e.target.value })} />
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
  const [mostrarPin, setMostrarPin] = useState({})
  const [nuevoTecnico, setNuevoTecnico] = useState(null)
  const [guardando, setGuardando] = useState(false)

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

  const validarPin = (pin, idExcluir) => {
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) return 'El PIN debe ser exactamente 4 dígitos numéricos'
    const duplicado = tecnicos.find(t => t.pin === pin && t.id !== idExcluir)
    if (duplicado) return `El PIN ya está en uso por ${duplicado.nombre}`
    return null
  }

  const handleEditar = (t) => {
    setEditandoId(t.id)
    setEditData({ nombre: t.nombre, pin: t.pin, rol: t.rol || 'tecnico', activo: t.activo !== false })
    setNuevoTecnico(null)
  }

  const handleGuardarEdit = async () => {
    const errorPin = validarPin(editData.pin, editandoId)
    if (errorPin) return alert(errorPin)
    if (!editData.nombre.trim()) return alert('El nombre no puede estar vacío')
    setGuardando(true)
    try {
      await updateDoc(doc(db, 'tecnicos', editandoId), {
        nombre: editData.nombre.trim(),
        pin: editData.pin,
        rol: editData.rol,
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
    try {
      await deleteDoc(doc(db, 'tecnicos', t.id))
    } catch (e) {
      alert('Error al eliminar: ' + e.message)
    }
  }

  const handleNuevo = () => {
    setNuevoTecnico({ nombre: '', pin: '', rol: 'tecnico', activo: true })
    setEditandoId(null)
  }

  const handleGuardarNuevo = async () => {
    const errorPin = validarPin(nuevoTecnico.pin)
    if (errorPin) return alert(errorPin)
    if (!nuevoTecnico.nombre.trim()) return alert('El nombre no puede estar vacío')
    setGuardando(true)
    try {
      await addDoc(collection(db, 'tecnicos'), {
        nombre: nuevoTecnico.nombre.trim(),
        pin: nuevoTecnico.pin,
        rol: nuevoTecnico.rol,
        activo: true,
        creadoEn: serverTimestamp(),
      })
      setNuevoTecnico(null)
    } catch (e) {
      alert('Error al agregar: ' + e.message)
    }
    setGuardando(false)
  }

  const togglePin = (id) => setMostrarPin(prev => ({ ...prev, [id]: !prev[id] }))

  if (loading) return <div className="loading"><div className="spinner" /></div>

  const admins = tecnicos.filter(t => t.rol === 'admin')
  const tecnicosList = tecnicos.filter(t => t.rol !== 'admin')

  const renderFila = (t) => {
    const isEditing = editandoId === t.id
    const pinVisible = mostrarPin[t.id]

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
            style={{ ...inputStyle, textAlign: 'center', letterSpacing: 4, fontWeight: 700 }}
            value={editData.pin}
            onChange={e => setEditData({ ...editData, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
            placeholder="PIN"
            maxLength={4}
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
            background: t.rol === 'admin'
              ? 'linear-gradient(135deg, var(--naranja), var(--rojo))'
              : 'linear-gradient(135deg, var(--azul), var(--azul-medio))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {t.rol === 'admin' ? <Shield size={14} color="white" /> : <Wrench size={14} color="white" />}
          </div>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--azul)', fontSize: '0.9rem' }}>{t.nombre}</div>
            {t.activo === false && <span style={{ fontSize: '0.7rem', color: 'var(--rojo)' }}>Inactivo</span>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            fontFamily: 'monospace', fontSize: '0.9rem', fontWeight: 600,
            color: 'var(--azul)', letterSpacing: pinVisible ? 4 : 2,
          }}>
            {pinVisible ? t.pin : '••••'}
          </span>
          <button
            onClick={() => togglePin(t.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gris-texto)', display: 'flex', padding: 2 }}
            title={pinVisible ? 'Ocultar PIN' : 'Mostrar PIN'}
          >
            {pinVisible ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <div>
          <span style={{
            padding: '3px 8px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
            background: t.rol === 'admin' ? '#FFF3E0' : '#E3F2FD',
            color: t.rol === 'admin' ? '#E65100' : '#1565C0',
          }}>
            {t.rol === 'admin' ? 'Admin' : 'Técnico'}
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
        <div>PIN</div>
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
            style={{ ...inputStyle, textAlign: 'center', letterSpacing: 4, fontWeight: 700 }}
            value={nuevoTecnico.pin}
            onChange={e => setNuevoTecnico({ ...nuevoTecnico, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
            placeholder="PIN"
            maxLength={4}
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
        <strong>💡 Nota:</strong> Los PINs son de 4 dígitos y se usan para acceder tanto al panel de administración como a la vista de técnico. Los técnicos con rol "Admin" pueden acceder al panel de administración. Los cambios se aplican inmediatamente.
      </div>
    </div>
  )
}

// ── Main Admin ─────────────────────────────────────────────────────────────────
export default function Admin() {
  const navigate = useNavigate()
  const [desbloqueado, setDesbloqueado] = useState(true)
  const [servicios, setServicios] = useState([])
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroPago, setFiltroPago] = useState('')
  const [filtroTecnico, setFiltroTecnico] = useState('')
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroLocalidad, setFiltroLocalidad] = useState('')
  const [filtroIngreso, setFiltroIngreso] = useState('')
  const [filtroVisita, setFiltroVisita] = useState('')
  const [filtroCierre, setFiltroCierre] = useState('')
  const [filtroTexto, setFiltroTexto] = useState('')
  const { tecnicosLista: TECNICOS } = useTecnicos()
  const [vistaActual, setVistaActual] = useState('lista') // 'lista' | 'mapa' | 'papelera' | 'tecnicos'
  const [mediaActivo, setMediaActivo] = useState(null) // { lista: [...], index: 0 }

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
    if (!desbloqueado) return
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
  }, [desbloqueado])



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

  const filtrados = servicios.filter(s => {
    if (filtroEstado) {
      if (filtroEstado === 'en-curso') {
        if (s.estado !== 'en-curso' && s.estado !== 'visitado-incompleto') return false
      } else {
        if (s.estado !== filtroEstado) return false
      }
    }
    if (filtroTecnico && s.tecnico !== filtroTecnico) return false
    if (filtroCliente && s.clienteId !== filtroCliente) return false
    if (filtroLocalidad && (s.localidad || '').toLowerCase() !== filtroLocalidad.toLowerCase()) return false
    
    if (filtroPago && (s.estadoPago || 'a-cobrar') !== filtroPago) return false
    
    // Fecha de Ingreso
    if (filtroIngreso && s.creadoEn) {
      const d = s.creadoEn.toDate ? s.creadoEn.toDate() : new Date(s.creadoEn)
      if (d.toISOString().slice(0, 10) !== filtroIngreso) return false
    }
    // Fecha de Visita (Asignación o real)
    if (filtroVisita && s.fechaAsignada !== filtroVisita && (!s.horaLlegada || new Date(s.horaLlegada).toISOString().slice(0, 10) !== filtroVisita)) return false
    // Fecha de Cierre
    if (filtroCierre && s.fechaCierre) {
      if (new Date(s.fechaCierre).toISOString().slice(0, 10) !== filtroCierre) return false
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

  const stats = {
    pendientes: servicios.filter(s => s.estado === 'pendiente').length,
    enCurso: servicios.filter(s => s.estado === 'en-curso' || s.estado === 'visitado-incompleto').length,
    solucionadoCliente: servicios.filter(s => s.estado === 'solucionado-cliente').length,
    resueltos: servicios.filter(s => s.estado === 'resuelto').length,
  }

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
            const url = window.location.origin + '/'
            navigator.clipboard.writeText(url)
            alert('✅ Link del formulario copiado')
          }}>
            <Clipboard size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Copiar link cliente
          </button>
        </div>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-number" style={{ color: '#E65100' }}>{stats.pendientes}</div>
          <div className="stat-label">Pendientes</div>
        </div>
        <div className="stat-card">
          <div className="stat-number" style={{ color: '#1565C0' }}>{stats.enCurso}</div>
          <div className="stat-label">En curso/Incomp.</div>
        </div>
        <div className="stat-card">
          <div className="stat-number" style={{ color: '#7B1FA2' }}>{stats.solucionadoCliente}</div>
          <div className="stat-label">Soluc. Cliente</div>
        </div>
        <div className="stat-card">
          <div className="stat-number" style={{ color: '#2E7D32' }}>{stats.resueltos}</div>
          <div className="stat-label">Resueltos</div>
        </div>
      </div>

      <div className="filtros" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <input 
          type="text" 
          placeholder="Buscar por nombre, apellido, dirección o teléfono..." 
          value={filtroTexto} 
          onChange={e => setFiltroTexto(e.target.value)}
          style={{ padding: '8px', borderRadius: 6, border: '1px solid #D8E2EE', fontFamily: 'var(--font)', fontSize: '0.85rem', flex: '1 1 200px' }} 
        />
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          {ESTADOS.map(e => <option key={e} value={e}>{getEstadoLabel(e)}</option>)}
        </select>
        <select value={filtroPago} onChange={e => setFiltroPago(e.target.value)}>
          <option value="">Todos los cobros</option>
          <option value="a-cobrar">A Cobrar</option>
          <option value="pagado">Pagado</option>
          <option value="en-garantia">En Garantía</option>
          <option value="no-corresponde">No corresponde</option>
        </select>
        <select value={filtroTecnico} onChange={e => setFiltroTecnico(e.target.value)}>
          <option value="">Todos los técnicos</option>
          {TECNICOS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)}>
          <option value="">Todos los clientes</option>
          {clientes.map(c => <option key={c.id} value={c.id}>{c.nombreCompleto || c.nombre} {c.numeroCliente ? `(${c.numeroCliente})` : ''}</option>)}
        </select>
        <select value={filtroLocalidad} onChange={e => setFiltroLocalidad(e.target.value)}>
          <option value="">Todas las localidades</option>
          {localidades.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--gris-texto)', fontWeight: 600 }}>Ingreso:</label>
          <input type="date" value={filtroIngreso} onChange={e => setFiltroIngreso(e.target.value)} style={{ padding: '6px', borderRadius: 6, border: '1px solid #D8E2EE', fontFamily: 'var(--font)', fontSize: '0.85rem' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--gris-texto)', fontWeight: 600 }}>Visita:</label>
          <input type="date" value={filtroVisita} onChange={e => setFiltroVisita(e.target.value)} style={{ padding: '6px', borderRadius: 6, border: '1px solid #D8E2EE', fontFamily: 'var(--font)', fontSize: '0.85rem' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--gris-texto)', fontWeight: 600 }}>Cierre:</label>
          <input type="date" value={filtroCierre} onChange={e => setFiltroCierre(e.target.value)} style={{ padding: '6px', borderRadius: 6, border: '1px solid #D8E2EE', fontFamily: 'var(--font)', fontSize: '0.85rem' }} />
        </div>
      </div>

      {/* Tabs lista / mapa / papelera */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => setVistaActual('lista')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: '0.85rem', fontWeight: 600, background: vistaActual === 'lista' ? 'var(--azul)' : '#EEF4FF', color: vistaActual === 'lista' ? 'white' : 'var(--azul)' }}>
          <List size={15} /> Lista
        </button>
        <button
          onClick={() => setVistaActual('mapa')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: '0.85rem', fontWeight: 600, background: vistaActual === 'mapa' ? 'var(--azul)' : '#EEF4FF', color: vistaActual === 'mapa' ? 'white' : 'var(--azul)' }}>
          <Map size={15} /> Mapa
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

      <button className="fab" onClick={() => navigate('/servicios/nuevo')} title="Nuevo servicio">
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
              localStorage.setItem('euler_device_role', '/servicios')
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
