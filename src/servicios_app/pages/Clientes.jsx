import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, onSnapshot, addDoc, serverTimestamp, query, orderBy, getCountFromServer } from 'firebase/firestore'
import { db } from '../../services/firebaseConfig'
import { UserPlus, Search, ChevronRight, Users } from 'lucide-react'
import PinLock from '../components/PinLock'
import AutocompleteLocalidad from '../components/AutocompleteLocalidad'

export default function Clientes() {
  const navigate = useNavigate()
  const [desbloqueado, setDesbloqueado] = useState(true)
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [mostrando, setMostrando] = useState(false)
  const [nuevo, setNuevo] = useState({ nombre: '', telefono: '', email: '', direccion: '', localidad: '' })
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!desbloqueado) return
    const q = query(collection(db, 'clientes'), orderBy('nombre'))
    const unsub = onSnapshot(q, snap => {
      setClientes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return unsub
  }, [desbloqueado])



  const filtrados = clientes.filter(c => {
    const busq = busqueda.toLowerCase()
    return (
      (c.nombreBusqueda || (c.nombre + ' ' + (c.apellido || '')).toLowerCase()).includes(busq) ||
      (c.telefono || '').includes(busq) ||
      (c.telefonoNormalizado || '').includes(busq) ||
      (c.localidad || '').toLowerCase().includes(busq) ||
      (c.numeroCliente || '').toLowerCase().includes(busq)
    )
  })

  const handleGuardar = async () => {
    if (!nuevo.nombre.trim()) return
    const nombreCompletoNuevo = `${nuevo.nombre.trim()} ${nuevo.apellido?.trim() || ''}`.trim().toLowerCase()
    const existe = clientes.some(c => (c.nombreCompleto || `${c.nombre} ${c.apellido || ''}`.trim()).toLowerCase() === nombreCompletoNuevo)
    if (existe) {
      alert("Ya existe un cliente registrado con ese nombre y apellido.")
      return
    }
    setGuardando(true)
    try {
      const totalSnap = await getCountFromServer(collection(db, 'clientes'))
      const total = totalSnap.data().count + 1
      const numeroCliente = `C-${String(total).padStart(3, '0')}`
      const telefonoNormalizado = (nuevo.codigoArea || '').trim() + (nuevo.numero || '').trim()
      await addDoc(collection(db, 'clientes'), {
        nombre: nuevo.nombre.trim(),
        apellido: nuevo.apellido?.trim() || '',
        nombreCompleto: `${nuevo.nombre.trim()} ${nuevo.apellido?.trim() || ''}`.trim(),
        nombreBusqueda: `${nuevo.nombre.trim()} ${nuevo.apellido?.trim() || ''}`.toLowerCase(),
        codigoArea: nuevo.codigoArea?.trim() || '',
        numero: nuevo.numero?.trim() || '',
        telefonoNormalizado,
        telefono: nuevo.codigoArea && nuevo.numero ? `${nuevo.codigoArea.trim()} ${nuevo.numero.trim()}` : (nuevo.telefono || ''),
        email: nuevo.email?.trim() || '',
        direccion: nuevo.direccion?.trim() || '',
        localidad: nuevo.localidad?.trim() || '',
        numeroCliente,
        creadoEn: serverTimestamp(),
        fotos: [],
      })
      setNuevo({ nombre: '', apellido: '', codigoArea: '', numero: '', email: '', direccion: '', localidad: '' })
      setMostrando(false)
    } catch (e) { console.error(e) }
    setGuardando(false)
  }

  const inp = {
    width: '100%', padding: '10px 12px', border: '1.5px solid #D8E2EE',
    borderRadius: 8, fontFamily: 'var(--font)', fontSize: '0.9rem',
    color: 'var(--azul)', background: '#FAFBFD', outline: 'none', marginBottom: 10,
  }

  return (
    <div className="container" style={{ maxWidth: 700 }}>
      <div className="admin-header">
        <div className="admin-title">Clientes</div>
        <button className="btn-secondary" onClick={() => setMostrando(!mostrando)}>
          <UserPlus size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
          Nuevo cliente
        </button>
      </div>

      {mostrando && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title"><UserPlus size={18} />Nuevo cliente</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input style={inp} placeholder="Nombre *" value={nuevo.nombre || ''} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} />
            <input style={inp} placeholder="Apellido" value={nuevo.apellido || ''} onChange={e => setNuevo({ ...nuevo, apellido: e.target.value })} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 8 }}>
            <input style={inp} placeholder="Cód. área" value={nuevo.codigoArea || ''} onChange={e => setNuevo({ ...nuevo, codigoArea: e.target.value.replace(/\D/g, '') })} maxLength={5} />
            <input style={inp} placeholder="Número WhatsApp (sin 15)" value={nuevo.numero || ''} onChange={e => setNuevo({ ...nuevo, numero: e.target.value.replace(/\D/g, '') })} maxLength={8} />
          </div>
          <input style={inp} placeholder="Email" type="email" value={nuevo.email || ''} onChange={e => setNuevo({ ...nuevo, email: e.target.value })} />
          <input style={inp} placeholder="Dirección" value={nuevo.direccion || ''} onChange={e => setNuevo({ ...nuevo, direccion: e.target.value })} />
          <AutocompleteLocalidad
            value={nuevo.localidad || ''}
            onChange={val => setNuevo({ ...nuevo, localidad: val })}
            placeholder="Localidad"
            inputStyle={inp}
            localidades={(clientes || []).map(c => c ? c.localidad : '')}
            style={{ marginBottom: 10 }}
          />
          <button className="btn-primary" onClick={handleGuardar} disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar cliente'}
          </button>
        </div>
      )}

      {/* Buscador */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--gris-texto)' }} />
        <input
          type="text"
          placeholder="Buscar por nombre, teléfono o localidad..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          style={{ ...inp, paddingLeft: 36, marginBottom: 0 }}
        />
      </div>

      {/* Stats */}
      <div style={{ fontSize: '0.82rem', color: 'var(--gris-texto)', marginBottom: 12 }}>
        {clientes.length} cliente{clientes.length !== 1 ? 's' : ''} registrado{clientes.length !== 1 ? 's' : ''}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : filtrados.length === 0 ? (
        <div className="empty-state">
          <Users size={48} />
          <p>{busqueda ? 'No se encontraron clientes' : 'Todavía no hay clientes registrados'}</p>
        </div>
      ) : (
        filtrados.map(c => (
          <div key={c.id}
            onClick={() => navigate(`/admin/clientes/${c.id}`)}
            style={{
              background: 'white', borderRadius: 12, padding: '16px 20px',
              marginBottom: 10, boxShadow: 'var(--sombra)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              cursor: 'pointer', transition: 'box-shadow 0.2s',
              borderLeft: '4px solid var(--azul)',
            }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 20px rgba(30,58,95,0.15)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'var(--sombra)'}
          >
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem', color: 'var(--azul)', textTransform: 'uppercase' }}>
                {c.nombreCompleto || `${c.nombre} ${c.apellido || ''}`.trim()}
              </div>
              <div style={{ fontSize: '0.83rem', color: 'var(--gris-texto)', marginTop: 3 }}>
                {c.numeroCliente && <span style={{ color: 'var(--naranja)', fontWeight: 700, marginRight: 8 }}>{c.numeroCliente}</span>}
                {c.telefono && `📱 ${c.telefono}`}
                {c.telefono && c.localidad && ' · '}
                {c.localidad && `📍 ${c.localidad}`}
              </div>
            </div>
            <ChevronRight size={20} color="var(--gris-texto)" />
          </div>
        ))
      )}
    </div>
  )
}
