import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, addDoc, serverTimestamp, getCountFromServer, getDocs, query, where } from 'firebase/firestore'
import { db } from '../../services/firebaseConfig'
import { User, MapPin, Wrench, Camera, Settings } from 'lucide-react'
import AutocompleteLocalidad from '../components/AutocompleteLocalidad'
import { useTecnicos } from '../components/PinLock'

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

export default function NuevoServicio() {
  const navigate = useNavigate()
  const { tecnicosLista: TECNICOS } = useTecnicos()
  const [form, setForm] = useState({
    nombre: '',
    telefono: '',
    email: '',
    direccion: '',
    localidad: '',
    barrio: '',
    lote: '',
    equipos: [],
    otroEquipo: '',
    marca: '',
    modelo: '',
    descripcion: '',
    tecnico: '',
    fechaAsignada: '',
    presupuesto: '',
    notasInternas: '',
  })
  const [foto, setFoto] = useState(null)
  const [fotoPreview, setFotoPreview] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const toggleEquipo = (id) => {
    setForm(prev => ({
      ...prev,
      equipos: prev.equipos.includes(id)
        ? prev.equipos.filter(e => e !== id)
        : [...prev.equipos, id]
    }))
  }

  const handleFoto = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setFoto(file)
    const reader = new FileReader()
    reader.onload = (ev) => setFotoPreview(ev.target.result)
    reader.readAsDataURL(file)
  }

  const handleGuardar = async () => {
    setError('')
    if (!form.nombre.trim()) return setError('Ingresá el nombre del cliente.')
    if (!form.descripcion.trim()) return setError('Describí el problema.')

    setGuardando(true)
    try {
      // Buscar si el cliente ya existe en la base de datos por nombre
      const nombreCompleto = form.nombre.trim().toLowerCase()
      const qCliente = query(collection(db, 'clientes'), where('nombreBusqueda', '==', nombreCompleto))
      const snapCliente = await getDocs(qCliente)
      
      let clienteId = ''
      let clienteNumero = ''
      let clienteNombre = ''

      if (!snapCliente.empty) {
        const clDoc = snapCliente.docs[0]
        const cl = clDoc.data()
        clienteId = clDoc.id
        clienteNumero = cl.numeroCliente || ''
        clienteNombre = cl.nombreCompleto || cl.nombre || ''

        // Verificar si ya cuenta con un servicio activo
        const qServicios = query(collection(db, 'servicios'), where('clienteId', '==', clienteId))
        const snapServicios = await getDocs(qServicios)
        const tieneActivo = snapServicios.docs.some(doc => {
          const s = doc.data()
          return s.estado !== 'resuelto' && s.estado !== 'solucionado-cliente'
        })

        if (tieneActivo) {
          const confirmNew = confirm(`El cliente ${clienteNombre} ya tiene un servicio activo. ¿Está seguro de que desea crear uno nuevo?`)
          if (!confirmNew) {
            setGuardando(false)
            return
          }
        }
      }

      let fotoURL = null
      if (foto) {
        const formData = new FormData()
        formData.append('file', foto)
        formData.append('upload_preset', 'euler_servicios')
        const resourceType = foto.type.startsWith('video/') ? 'video' : 'image'
        const res = await fetch(`https://api.cloudinary.com/v1_1/djehdlthw/${resourceType}/upload`, {
          method: 'POST',
          body: formData,
        })
        const data = await res.json()
        fotoURL = data.secure_url
      }

      // Generar número ST automático
      const snap = await getCountFromServer(collection(db, 'servicios'))
      const total = snap.data().count + 1
      const anio = new Date().getFullYear()
      const numeroST = `ST-${anio}-${String(total).padStart(3, '0')}`

      await addDoc(collection(db, 'servicios'), {
        ...form,
        direccionCompleta: [form.direccion.trim(), form.barrio?.trim(), form.lote?.trim()].filter(Boolean).join(', '),
        numeroST,
        fotoURL,
        clienteId,
        clienteNombre,
        clienteNumero,
        estado: 'pendiente',
        notasInternasHistorial: form.notasInternas.trim() ? [{
          fecha: new Date().toISOString(),
          texto: form.notasInternas.trim()
        }] : [],
        creadoEn: serverTimestamp(),
        origen: 'interno',
      })

      navigate('/servicios')
    } catch (err) {
      console.error(err)
      setError('Error al guardar. Intentá nuevamente.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="container">

      <div className="admin-header">
        <div className="admin-title">Nuevo servicio</div>
      </div>

      {/* Datos del cliente */}
      <div className="card">
        <div className="card-title"><User size={18} />Cliente</div>

        <div className="form-group">
          <label>Nombre y apellido <span className="req">*</span></label>
          <input type="text" placeholder="Juan García" value={form.nombre}
            onChange={e => setForm({ ...form, nombre: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Teléfono</label>
          <input type="tel" placeholder="341 555 1234" value={form.telefono}
            onChange={e => setForm({ ...form, telefono: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Email</label>
          <input type="email" placeholder="ejemplo@gmail.com" value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Dirección</label>
          <input type="text" placeholder="San Martín 1234" value={form.direccion}
            onChange={e => setForm({ ...form, direccion: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Localidad</label>
          <AutocompleteLocalidad
            value={form.localidad}
            onChange={val => setForm({ ...form, localidad: val })}
            placeholder="Ej: Rosario, Roldán, Funes..."
          />
        </div>
        <div className="form-group">
          <label>Barrio (opcional)</label>
          <input type="text" placeholder="Ej: Tierra de Sueños 2" value={form.barrio}
            onChange={e => setForm({ ...form, barrio: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Lote (opcional)</label>
          <input type="text" placeholder="Ej: Lote 45 Manzana 3" value={form.lote}
            onChange={e => setForm({ ...form, lote: e.target.value })} />
        </div>
      </div>

      {/* Equipo */}
      <div className="card">
        <div className="card-title"><Wrench size={18} />Equipo y problema</div>

        <div className="form-group">
          <label>Equipo con problema</label>
          <div className="checkbox-group">
            {EQUIPOS.map(eq => (
              <label key={eq.id} htmlFor={`eq-${eq.id}`} className={`checkbox-item ${form.equipos.includes(eq.id) ? 'checked' : ''}`}>
                <input id={`eq-${eq.id}`} type="checkbox" checked={form.equipos.includes(eq.id)} onChange={() => toggleEquipo(eq.id)} />
                <span>{eq.label}</span>
              </label>
            ))}
          </div>
        </div>

        {form.equipos.includes('otro') && (
          <div className="form-group">
            <label>Describí el equipo</label>
            <input type="text" value={form.otroEquipo}
              onChange={e => setForm({ ...form, otroEquipo: e.target.value })} />
          </div>
        )}

        <div className="form-group">
          <label>Marca</label>
          {form.equipos.includes('caldera') || form.equipos.includes('mantenimiento') ? (
            <select value={form.marca} onChange={e => setForm({ ...form, marca: e.target.value, modelo: '' })}>
              <option value="">Seleccioná la marca...</option>
              {MARCAS_CALDERA.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <input type="text" placeholder="Baxi, Ferroli..." value={form.marca}
              onChange={e => setForm({ ...form, marca: e.target.value })} />
          )}
        </div>
        <div className="form-group">
          <label>Modelo</label>
          {(form.equipos.includes('caldera') || form.equipos.includes('mantenimiento')) && form.marca && form.marca !== 'OTRA' && form.marca !== 'FLOWING' ? (
            <select value={form.modelo} onChange={e => setForm({ ...form, modelo: e.target.value })}>
              <option value="">Seleccioná el modelo...</option>
              {(MODELOS_CALDERA[form.marca] || []).map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <input type="text" placeholder="Luna 3 240 Fi" value={form.modelo}
              onChange={e => setForm({ ...form, modelo: e.target.value })} />
          )}
        </div>
        <div className="form-group">
          <label>Descripción del problema <span className="req">*</span></label>
          <textarea placeholder="Describí el problema..." value={form.descripcion}
            onChange={e => setForm({ ...form, descripcion: e.target.value })} />
        </div>
      </div>

      {/* Foto o Video */}
      <div className="card">
        <div className="card-title"><Camera size={18} />Foto o video</div>
        <div className="form-group">
          <label>Cargue aquí la foto o video del equipo (opcional)</label>
          <label className="file-upload">
            <input type="file" accept="image/*,video/*" capture="environment" onChange={handleFoto} />
            {fotoPreview ? (
              <div className="file-preview">
                {foto && foto.type.startsWith('video/') ? (
                  <video src={fotoPreview} style={{ width: '100%', maxHeight: 200, objectFit: 'contain' }} controls />
                ) : (
                  <img src={fotoPreview} alt="Preview" />
                )}
              </div>
            ) : (
              <div className="file-upload-text">
                <strong>📷 Tocá para agregar foto o video</strong>
              </div>
            )}
          </label>
        </div>
      </div>

      {/* Gestión interna */}
      <div className="card">
        <div className="card-title"><Settings size={18} />Gestión</div>

        <div className="form-group">
          <label>Técnico asignado</label>
          <select value={form.tecnico} onChange={e => setForm({ ...form, tecnico: e.target.value })}>
            <option value="">Sin asignar</option>
            {TECNICOS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Fecha asignada</label>
          <input type="date" value={form.fechaAsignada}
            onChange={e => setForm({ ...form, fechaAsignada: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Presupuesto estimado ($)</label>
          <input type="text" placeholder="Ej: 150000" value={form.presupuesto}
            onChange={e => setForm({ ...form, presupuesto: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Notas internas</label>
          <textarea placeholder="Observaciones, contexto, acuerdos..." value={form.notasInternas}
            onChange={e => setForm({ ...form, notasInternas: e.target.value })} />
        </div>
      </div>

      {error && (
        <div style={{ background: '#FFF0EE', border: '1.5px solid #E04E2B', borderRadius: 8, padding: '12px 16px', marginBottom: 12, color: '#C0392B', fontSize: '0.9rem' }}>
          {error}
        </div>
      )}

      <button className="btn-primary" onClick={handleGuardar} disabled={guardando}>
        {guardando ? 'Guardando...' : 'Guardar servicio'}
      </button>

    </div>
  )
}
