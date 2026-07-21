import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, onSnapshot, updateDoc, arrayUnion, getDoc } from 'firebase/firestore'
import { db } from '../../services/firebaseConfig'
import { Camera, Mic, MicOff, Clock, CheckCircle, PlusCircle, XCircle, Save, MapPin, MessageCircle, Trash2 } from 'lucide-react'
import TranscriberWorker from '../worker?worker'

const CLOUDINARY_CLOUD = 'djehdlthw'
const CLOUDINARY_PRESET = 'euler_servicios'

const EQUIPO_LABELS = {
  caldera: 'Caldera', radiador: 'Radiador', piso_radiante: 'Piso Radiante',
  termostato: 'Termostato', climatizador_piscina: 'Climatizador Piscina',
  mantenimiento: 'Mantenimiento Preventivo', otro: 'Otro',
}

function formatHora(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

function duracion(llegada, salida) {
  if (!llegada || !salida) return null
  const mins = Math.round((new Date(salida) - new Date(llegada)) / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}min` : `${m}min`
}

export default function TecnicoServicio() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [servicio, setServicio] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [grabando, setGrabando] = useState(false)
  const [transcribiendo, setTranscribiendo] = useState(false)
  const [diagnostico, setDiagnostico] = useState('')
  const [materiales, setMateriales] = useState([])
  const [modeloCargado, setModeloCargado] = useState(false)
  const [cargandoModelo, setCargandoModelo] = useState(false)
  const mediaRecorder = useRef(null)
  const audioChunks = useRef([])
  const workerRef = useRef(null)
  const transcriptRef = useRef({})

  const usuario = JSON.parse(sessionStorage.getItem('euler_tecnico') || '{}')

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'servicios', id), snap => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() }
        setServicio(data)
        setDiagnostico(data.diagnostico || '')
        setMateriales(data.materialesUsados || [])
      }
    })
    
    // Inicializar el worker de transcripción
    workerRef.current = new TranscriberWorker()
    workerRef.current.onmessage = async (e) => {
      const { status, text, error } = e.data
      if (status === 'ready') {
        setModeloCargado(true)
        setCargandoModelo(false)
      } else if (status === 'loading') {
        setCargandoModelo(true)
      } else if (status === 'complete') {
        setTranscribiendo(false)
        const audioURL = transcriptRef.current.audioURL
        const finalTranscript = text || ''
        
        if (transcriptRef.current.isUpdate) {
          const docSnap = await getDoc(doc(db, 'servicios', id))
          const currentNotas = docSnap.data().notasVoz || []
          currentNotas[transcriptRef.current.index].transcripcion = finalTranscript
          await updateDoc(doc(db, 'servicios', id), { notasVoz: currentNotas })
        } else {
          const nuevaNota = { audioURL, transcripcion: finalTranscript, fecha: new Date().toISOString(), tecnico: usuario.nombre }
          await updateDoc(doc(db, 'servicios', id), { notasVoz: arrayUnion(nuevaNota) })
        }
        transcriptRef.current = {}
      } else if (status === 'error') {
        console.error("Worker error:", error)
        setTranscribiendo(false)
        const audioURL = transcriptRef.current.audioURL
        if (audioURL) {
          if (transcriptRef.current.isUpdate) {
            const docSnap = await getDoc(doc(db, 'servicios', id))
            const currentNotas = docSnap.data().notasVoz || []
            currentNotas[transcriptRef.current.index].transcripcion = '(Error al transcribir)'
            await updateDoc(doc(db, 'servicios', id), { notasVoz: currentNotas })
          } else {
            const nuevaNota = { audioURL, transcripcion: '(Error al transcribir)', fecha: new Date().toISOString(), tecnico: usuario.nombre }
            await updateDoc(doc(db, 'servicios', id), { notasVoz: arrayUnion(nuevaNota) })
          }
        }
        transcriptRef.current = {}
      }
    }
    workerRef.current.postMessage({ type: 'load' })

    return () => {
      unsub()
      workerRef.current?.terminate()
    }
  }, [id, usuario.nombre])

  const upd = async (data) => {
    await updateDoc(doc(db, 'servicios', id), data)
  }

  const registrarLlegada = async () => {
    if (servicio?.horaLlegada) return
    await upd({ horaLlegada: new Date().toISOString(), estado: 'en-curso' })
  }

  const registrarSalida = async () => {
    if (servicio?.horaSalida) return
    await upd({ horaSalida: new Date().toISOString() })
  }

  const guardarNotas = async () => {
    setGuardando(true)
    await upd({ diagnostico, materialesUsados: materiales })
    setGuardando(false)
    alert('✅ Guardado')
  }

  const marcarIncompleto = async () => {
    if (!confirm('¿Marcar visita como realizada pero con trabajo pendiente?')) return
    setGuardando(true)
    const now = new Date().toISOString()
    await upd({ diagnostico, materialesUsados: materiales, estado: 'visitado-incompleto', horaSalida: servicio?.horaSalida || now, fechaCierre: now })
    setGuardando(false)
    navigate('/tecnico')
  }

  const cerrarServicio = async () => {
    if (!confirm('¿Marcar este servicio como resuelto?')) return
    setGuardando(true)
    const now = new Date().toISOString()
    await upd({ diagnostico, materialesUsados: materiales, estado: 'resuelto', horaSalida: servicio?.horaSalida || now, fechaCierre: now })
    setGuardando(false)
    navigate('/tecnico')
  }

  const subirFoto = async (file, tipo) => {
    setSubiendo(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('upload_preset', CLOUDINARY_PRESET)
      const resourceType = file.type.startsWith('video/') ? 'video' : 'image'
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/${resourceType}/upload`, { method: 'POST', body: fd })
      const data = await res.json()
      const foto = { url: data.secure_url, fecha: new Date().toISOString(), tipo, tecnico: usuario.nombre || 'Técnico' }
      await updateDoc(doc(db, 'servicios', id), { fotosHecnico: arrayUnion(foto) })
    } catch (e) { console.error(e) }
    setSubiendo(false)
  }

  const iniciarGrabacion = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorder.current = new MediaRecorder(stream)
      audioChunks.current = []
      mediaRecorder.current.ondataavailable = e => audioChunks.current.push(e.data)

      mediaRecorder.current.onstop = async () => {
        const blob = new Blob(audioChunks.current, { type: 'audio/webm' })
        setTranscribiendo(true)
        
        try {
          // 1. Subir audio a Cloudinary
          const fd = new FormData()
          fd.append('file', blob, 'nota_voz.webm')
          fd.append('upload_preset', CLOUDINARY_PRESET)
          fd.append('resource_type', 'video')
          const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/video/upload`, { method: 'POST', body: fd })
          const data = await res.json()
          const audioURL = data.secure_url
          
          transcriptRef.current = { audioURL }

          // 2. Transcribir localmente si el modelo está listo
          if (modeloCargado) {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            const arrayBuffer = await blob.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            const audioData = audioBuffer.getChannelData(0);
            
            workerRef.current.postMessage({ type: 'transcribe', audio: audioData })
          } else {
            // Guardar nota sin transcripción si falló la carga del modelo
            const nuevaNota = { audioURL, transcripcion: '(Transcripción no disponible)', fecha: new Date().toISOString(), tecnico: usuario.nombre }
            await updateDoc(doc(db, 'servicios', id), { notasVoz: arrayUnion(nuevaNota) })
            setTranscribiendo(false)
          }

        } catch (e) {
          console.error(e)
          setTranscribiendo(false)
        }
        stream.getTracks().forEach(t => t.stop())
      }
      mediaRecorder.current.start()
      setGrabando(true)
    } catch (e) {
      alert('No se pudo acceder al micrófono')
    }
  }

  const transcribirVieja = async (index, audioURL) => {
    if (!modeloCargado) {
      alert("El modelo de IA aún está cargando. Esperá unos segundos.")
      return
    }
    setTranscribiendo(true)
    transcriptRef.current = { audioURL, isUpdate: true, index }
    try {
      const response = await fetch(audioURL)
      const arrayBuffer = await response.arrayBuffer()
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 })
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
      const audioData = audioBuffer.getChannelData(0)
      workerRef.current.postMessage({ type: 'transcribe', audio: audioData })
    } catch (e) {
      console.error(e)
      alert("Error descargando el audio para transcribir.")
      setTranscribiendo(false)
    }
  }

  const detenerGrabacion = () => {
    mediaRecorder.current?.stop()
    setGrabando(false)
  }

  const addMaterial = () => setMateriales([...materiales, { desc: '', cant: 1, precio: '' }])
  const removeMaterial = (i) => setMateriales(materiales.filter((_, idx) => idx !== i))
  const editMaterial = (i, field, val) => setMateriales(materiales.map((m, idx) => idx === i ? { ...m, [field]: val } : m))

  if (!servicio) return <div className="loading"><div className="spinner" /></div>

  const inp = {
    width: '100%', padding: '10px 12px', border: '1.5px solid #D8E2EE',
    borderRadius: 8, fontFamily: 'var(--font)', fontSize: '0.9rem',
    color: 'var(--azul)', background: '#FAFBFD', outline: 'none',
  }

  const section = (txt) => (
    <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--naranja)', marginBottom: 10, marginTop: 20 }}>{txt}</div>
  )

  const dur = duracion(servicio.horaLlegada, servicio.horaSalida)

  return (
    <div className="container" style={{ maxWidth: 700 }}>

      {/* Banner de Asignación */}
      {servicio.tecnico === usuario.nombre && (
        <div style={{ background: '#E3F2FD', color: '#1565C0', border: '1.5px solid #90CAF9', borderRadius: 12, padding: '10px 14px', fontSize: '0.85rem', fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6, boxShadow: 'var(--sombra)' }}>
          📌 SERVICIO ASIGNADO A VOS
        </div>
      )}

      {/* Header */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            {servicio.numeroST && <div style={{ fontSize: '0.75rem', color: 'var(--naranja)', fontWeight: 700, marginBottom: 4 }}>{servicio.numeroST}</div>}
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 800, color: 'var(--azul)', textTransform: 'uppercase' }}>{servicio.nombre}</div>
          </div>
          <span className={`tag tag-estado tag-${servicio.estado}`}>{servicio.estado?.replace('-', ' ')}</span>
        </div>

        {/* Dirección + WhatsApp + Maps */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {servicio.telefono && (
            <a href={`https://wa.me/54${servicio.telefono.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#25D366', color: 'white', borderRadius: 8, textDecoration: 'none', fontSize: '0.82rem', fontWeight: 600 }}>
              <MessageCircle size={14} /> WhatsApp
            </a>
          )}
          {servicio.direccion && (
            <a href={`https://maps.google.com/?q=${encodeURIComponent((servicio.direccion || '') + ' ' + (servicio.localidad || ''))}`} target="_blank" rel="noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#4285F4', color: 'white', borderRadius: 8, textDecoration: 'none', fontSize: '0.82rem', fontWeight: 600 }}>
              <MapPin size={14} /> Google Maps
            </a>
          )}
        </div>

        {/* Desglose de Dirección Completa */}
        <div style={{ fontSize: '0.88rem', color: 'var(--gris-texto)', background: '#F8F9FA', padding: 14, borderRadius: 8, border: '1.5px solid #EAECEF', marginTop: 12, marginBottom: 12, display: 'grid', gap: 5 }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--azul-medio)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>📍 Dirección del servicio</div>
          <div><strong>Calle y número:</strong> {servicio.direccion || '—'}</div>
          {servicio.pisoDpto && <div><strong>Piso / Depto:</strong> {servicio.pisoDpto}</div>}
          <div><strong>Localidad:</strong> {servicio.localidad || '—'}</div>
          {servicio.barrio && <div><strong>Barrio:</strong> {servicio.barrio}</div>}
          {servicio.lote && <div><strong>Lote:</strong> {servicio.lote}</div>}
        </div>

        <div style={{ fontSize: '0.85rem', color: 'var(--gris-texto)' }}>
          {servicio.equipos?.length > 0 && `🔧 ${servicio.equipos.map(e => EQUIPO_LABELS[e] || e).join(', ')}`}
          {servicio.marca && ` · ${servicio.marca} ${servicio.modelo || ''}`}
        </div>

        {/* Coordinación de Visita */}
        <div style={{ marginTop: 12, padding: 12, background: '#F8F9FA', borderRadius: 8, border: '1px solid #EAECEF' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--azul-medio)', textTransform: 'uppercase', marginBottom: 6 }}>🗓 Coordinación de Visita</div>
          <input 
            type="date" 
            style={{ ...inp, marginBottom: 0 }} 
            value={servicio.fechaAsignada || ''} 
            onChange={e => {
              const newDate = e.target.value;
              const updates = { fechaAsignada: newDate };
              if (newDate && servicio.estado === 'pendiente') {
                updates.estado = 'coordinado';
              }
              upd(updates);
            }} 
          />
        </div>

        {servicio.descripcion && (
          <div style={{ marginTop: 10, padding: 10, background: '#EEF4FF', borderRadius: 8, fontSize: '0.85rem', color: 'var(--azul)' }}>
            <strong>Problema reportado:</strong> {servicio.descripcion}
          </div>
        )}

        {((servicio.notasInternasHistorial && servicio.notasInternasHistorial.length > 0) || servicio.notasInternas) && (
          <div style={{ marginTop: 8, padding: 10, background: '#FFF8EE', borderRadius: 8, fontSize: '0.85rem', color: 'var(--azul)', borderLeft: '3px solid var(--naranja)', display: 'grid', gap: 6 }}>
            <strong>Notas del admin:</strong>
            {servicio.notasInternasHistorial?.map((nota, idx) => (
              <div key={idx} style={{ fontSize: '0.8rem', borderBottom: idx < servicio.notasInternasHistorial.length - 1 ? '1px solid rgba(12,53,82,0.1)' : 'none', paddingBottom: idx < servicio.notasInternasHistorial.length - 1 ? 4 : 0 }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--gris-suave)', fontWeight: 600 }}>
                  {new Date(nota.fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
                <div style={{ whiteSpace: 'pre-wrap', marginTop: 2 }}>{nota.texto}</div>
              </div>
            ))}
            {servicio.notasInternas && (!servicio.notasInternasHistorial || servicio.notasInternasHistorial.length === 0) && (
              <div style={{ whiteSpace: 'pre-wrap' }}>{servicio.notasInternas}</div>
            )}
          </div>
        )}

        {/* Foto del cliente */}
        {(servicio.fotosCliente || []).length > 0 ? (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--gris-texto)', marginBottom: 4 }}>Fotos del cliente:</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {servicio.fotosCliente.map((url, i) => (
                <img key={i} src={url} alt={`Equipo ${i+1}`} onClick={() => window.open(url, '_blank')} style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid #D8E2EE', cursor: 'pointer' }} />
              ))}
            </div>
          </div>
        ) : servicio.fotoURL ? (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--gris-texto)', marginBottom: 4 }}>Foto del cliente:</div>
            <img src={servicio.fotoURL} alt="Equipo" onClick={() => window.open(servicio.fotoURL, '_blank')} style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 8, border: '2px solid #D8E2EE', cursor: 'pointer' }} />
          </div>
        ) : null}
      </div>

      {/* Registro horario */}
      <div className="card">
        {section('Registro horario')}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button
            onClick={registrarLlegada}
            disabled={!!servicio.horaLlegada}
            style={{
              padding: '14px', borderRadius: 10, border: 'none', cursor: servicio.horaLlegada ? 'default' : 'pointer',
              background: servicio.horaLlegada ? '#E8F5E9' : 'var(--azul)', color: servicio.horaLlegada ? '#2E7D32' : 'white',
              fontFamily: 'var(--font-display)', fontSize: '0.95rem', fontWeight: 700, textTransform: 'uppercase',
            }}>
            <Clock size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            {servicio.horaLlegada ? `Llegué ${formatHora(servicio.horaLlegada)}` : 'Llegué'}
          </button>
          <button
            onClick={registrarSalida}
            disabled={!!servicio.horaSalida || !servicio.horaLlegada}
            style={{
              padding: '14px', borderRadius: 10, border: 'none',
              cursor: (servicio.horaSalida || !servicio.horaLlegada) ? 'default' : 'pointer',
              background: servicio.horaSalida ? '#E8F5E9' : (!servicio.horaLlegada ? '#F0F0F0' : 'var(--rojo)'),
              color: servicio.horaSalida ? '#2E7D32' : (!servicio.horaLlegada ? '#999' : 'white'),
              fontFamily: 'var(--font-display)', fontSize: '0.95rem', fontWeight: 700, textTransform: 'uppercase',
            }}>
            <CheckCircle size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            {servicio.horaSalida ? `Salí ${formatHora(servicio.horaSalida)}` : 'Terminé'}
          </button>
        </div>
        {dur && (
          <div style={{ textAlign: 'center', marginTop: 10, fontSize: '0.9rem', fontWeight: 700, color: 'var(--azul)' }}>
            ⏱ Duración total: {dur}
          </div>
        )}
      </div>

      {/* Diagnóstico */}
      <div className="card">
        {section('Diagnostico tecnico/Solucion/recomendacion/notas')}
        <textarea style={{ ...inp, resize: 'vertical', minHeight: 120 }}
          placeholder="¿Qué tenía el equipo? ¿Qué se hizo? Recomendaciones..."
          value={diagnostico}
          onChange={e => setDiagnostico(e.target.value)}
        />
      </div>

      {/* Notas de voz */}
      <div className="card">
        {section('Notas de voz')}
        <button
          onClick={grabando ? detenerGrabacion : iniciarGrabacion}
          style={{
            width: '100%', padding: '14px', borderRadius: 10, border: 'none',
            background: grabando ? 'var(--rojo)' : 'var(--azul)', color: 'white',
            fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            animation: grabando ? 'pulse 1s infinite' : 'none',
          }}>
          {grabando ? <><MicOff size={18} /> Detener grabación</> : <><Mic size={18} /> Grabar nota de voz</>}
        </button>

        {transcribiendo && (
          <div style={{ textAlign: 'center', marginTop: 10, fontSize: '0.85rem', color: 'var(--gris-texto)' }}>
            Guardando audio...
          </div>
        )}

        {(servicio.notasVoz || []).length > 0 && (
          <div style={{ marginTop: 12 }}>
            {(servicio.notasVoz || []).map((n, i) => (
              <div key={i} style={{ background: '#F4F6F9', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gris-texto)' }}>
                    🎙 {n.tecnico} · {new Date(n.fecha).toLocaleString('es-AR')}
                  </div>
                  <button onClick={async () => {
                    if (confirm('¿Eliminar este audio permanentemente?')) {
                      const nuevasNotas = [...servicio.notasVoz];
                      nuevasNotas.splice(i, 1);
                      await upd({ notasVoz: nuevasNotas });
                    }
                  }} style={{ background: 'none', border: 'none', color: 'var(--rojo)', cursor: 'pointer', padding: 4 }}>
                    <Trash2 size={14} />
                  </button>
                </div>
                <audio src={n.audioURL} controls style={{ width: '100%', height: 36 }} />
                {(!n.transcripcion || n.transcripcion.includes('(Error') || n.transcripcion.includes('(Transcripción')) ? (
                  <button onClick={() => transcribirVieja(i, n.audioURL)} disabled={transcribiendo} style={{ marginTop: 8, padding: '6px 12px', fontSize: '0.8rem', background: '#EEF4FF', color: 'var(--azul)', border: '1px solid #D8E2EE', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 600 }}>
                    {transcribiendo ? 'Procesando...' : 'Transcribir audio ahora'}
                  </button>
                ) : (
                  <div style={{ fontSize: '0.83rem', color: 'var(--azul)', marginTop: 6, fontStyle: 'italic' }}>
                    "{n.transcripcion}"
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Materiales usados */}
      <div className="card">
        {section('Materiales usados')}
        {materiales.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 55px 90px 24px', gap: 4, marginBottom: 4 }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--gris-texto)', fontWeight: 600 }}>Descripción</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--gris-texto)', fontWeight: 600 }}>Cant.</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--gris-texto)', fontWeight: 600 }}>Precio (opt.)</div>
              <div />
            </div>
            {materiales.map((m, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 55px 90px 24px', gap: 4, marginBottom: 6 }}>
                <input style={{ ...inp }} placeholder="Ej: Vaso de expansión" value={m.desc} onChange={e => editMaterial(i, 'desc', e.target.value)} />
                <input style={{ ...inp, textAlign: 'center' }} type="number" min="1" value={m.cant} onChange={e => editMaterial(i, 'cant', e.target.value)} />
                <input style={{ ...inp, textAlign: 'right' }} type="number" placeholder="$" value={m.precio} onChange={e => editMaterial(i, 'precio', e.target.value)} />
                <button onClick={() => removeMaterial(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rojo)', display: 'flex', alignItems: 'center' }}>
                  <XCircle size={18} />
                </button>
              </div>
            ))}
          </div>
        )}
        <button onClick={addMaterial} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--azul-medio)', background: 'none', border: '1.5px dashed #C0D0E4', borderRadius: 7, padding: '8px 14px', cursor: 'pointer', fontFamily: 'var(--font)', width: '100%', justifyContent: 'center' }}>
          <PlusCircle size={15} /> Agregar material
        </button>
      </div>

      {/* Fotos del técnico */}
      <div className="card">
        {section('Fotos del técnico')}
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>

          {/* Antes — abre cámara directamente en móvil */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, textAlign: 'center', color: 'var(--azul)', textTransform: 'uppercase', letterSpacing: 0.3 }}>Antes</div>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '10px 8px', background: 'var(--azul)', color: 'white', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: '0.82rem', fontWeight: 600 }}>
              <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => e.target.files[0] && subirFoto(e.target.files[0], 'antes')} />
              <Camera size={15} /> Foto
            </label>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '10px 8px', background: 'var(--azul)', color: 'white', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: '0.82rem', fontWeight: 600, opacity: 0.85 }}>
              <input type="file" accept="video/*" capture="environment" style={{ display: 'none' }} onChange={e => e.target.files[0] && subirFoto(e.target.files[0], 'antes')} />
              🎥 Video
            </label>
          </div>

          {/* Después — abre cámara directamente en móvil */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, textAlign: 'center', color: 'var(--azul-medio)', textTransform: 'uppercase', letterSpacing: 0.3 }}>Después</div>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '10px 8px', background: 'var(--azul-medio)', color: 'white', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: '0.82rem', fontWeight: 600 }}>
              <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => e.target.files[0] && subirFoto(e.target.files[0], 'después')} />
              <Camera size={15} /> Foto
            </label>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '10px 8px', background: 'var(--azul-medio)', color: 'white', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: '0.82rem', fontWeight: 600, opacity: 0.85 }}>
              <input type="file" accept="video/*" capture="environment" style={{ display: 'none' }} onChange={e => e.target.files[0] && subirFoto(e.target.files[0], 'después')} />
              🎥 Video
            </label>
          </div>

          {/* Galería — selección libre desde la galería del dispositivo */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, textAlign: 'center', color: '#555', textTransform: 'uppercase', letterSpacing: 0.3 }}>Galería</div>
            <label style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5, padding: '10px 8px', background: '#555', color: 'white', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: '0.82rem', fontWeight: 600 }}>
              <input type="file" accept="image/*,video/*" multiple style={{ display: 'none' }} onChange={e => { Array.from(e.target.files).forEach(f => subirFoto(f, 'galería')) }} />
              🖼 Elegir archivo
            </label>
          </div>

        </div>

        {subiendo && <div style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--gris-texto)', marginBottom: 10 }}>Subiendo archivo...</div>}

        {(servicio.fotosHecnico || []).length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {(servicio.fotosHecnico || []).map((f, i) => {
              const esVideo = f.url.toLowerCase().includes('/video/upload/') || f.url.match(/\.(mp4|webm|ogg|mov|avi)($|\?)/i)
              return (
                <div key={i}>
                  {esVideo ? (
                    <div onClick={() => window.open(f.url, '_blank')} style={{ width: '100%', height: 80, position: 'relative', borderRadius: 8, overflow: 'hidden', cursor: 'pointer', border: '2px solid #D8E2EE' }}>
                      <video src={f.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}>
                        <span style={{ color: 'white', fontSize: '0.75rem', fontWeight: 'bold' }}>▶</span>
                      </div>
                    </div>
                  ) : (
                    <img src={f.url} alt="Foto técnico" onClick={() => window.open(f.url, '_blank')} style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 8, border: '2px solid #D8E2EE', cursor: 'pointer' }} />
                  )}
                  <div style={{ fontSize: '0.65rem', color: 'var(--gris-texto)', textAlign: 'center', marginTop: 2 }}>{f.tipo}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Botones finales */}
      <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
        <button className="btn-primary" onClick={guardarNotas} disabled={guardando}>
          <Save size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          {guardando ? 'Guardando...' : 'Guardar cambios'}
        </button>
        <button
          onClick={marcarIncompleto}
          disabled={guardando}
          style={{ width: '100%', padding: '14px', background: '#F39C12', color: 'white', border: 'none', borderRadius: 10, fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          <Clock size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          Visita Realizada - Trabajo Pendiente
        </button>
        <button
          onClick={cerrarServicio}
          disabled={guardando}
          style={{ width: '100%', padding: '14px', background: '#27AE60', color: 'white', border: 'none', borderRadius: 10, fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          <CheckCircle size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          Cerrar servicio como resuelto
        </button>
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
      `}</style>
    </div>
  )
}
