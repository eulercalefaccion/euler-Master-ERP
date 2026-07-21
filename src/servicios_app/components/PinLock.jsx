import { useState, useEffect, createContext, useContext } from 'react'
import { collection, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../services/firebaseConfig'
import { Lock } from 'lucide-react'

// ── Datos por defecto para seed inicial ────────────────────────────────────────
const DEFAULT_TECNICOS = [
  { nombre: 'Nico', pin: '1806', rol: 'admin', activo: true },
  { nombre: 'Nico', pin: '7562', rol: 'tecnico', activo: true },
  { nombre: 'Gabriel', pin: '8291', rol: 'tecnico', activo: true },
  { nombre: 'Miguel', pin: '1966', rol: 'tecnico', activo: true },
  { nombre: 'Luis', pin: '5766', rol: 'tecnico', activo: true },
  { nombre: 'Agustín', pin: '6997', rol: 'tecnico', activo: true },
  { nombre: 'Técnico Eventual', pin: '1111', rol: 'tecnico', activo: true },
]

// ── Context para compartir técnicos entre componentes ──────────────────────────
const TecnicosContext = createContext({ tecnicos: [], loading: true, usuarios: {} })

export function TecnicosProvider({ children }) {
  const [tecnicos, setTecnicos] = useState([])
  const [loading, setLoading] = useState(true)
  const [seeded, setSeeded] = useState(false)

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'tecnicos'), async (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))

      // Seed automático si la colección está vacía (primera vez)
      if (docs.length === 0 && !seeded) {
        setSeeded(true)
        try {
          for (const t of DEFAULT_TECNICOS) {
            await addDoc(collection(db, 'tecnicos'), {
              ...t,
              creadoEn: serverTimestamp(),
            })
          }
        } catch (e) {
          console.error('Error al hacer seed de técnicos:', e)
        }
        return // El onSnapshot se volverá a disparar con los datos nuevos
      }

      setTecnicos(docs)
      setLoading(false)
    }, (err) => {
      console.error('Error cargando técnicos:', err)
      setLoading(false)
    })
    return unsub
  }, [seeded])

  // Construir mapa de usuarios por PIN (solo activos)
  const usuarios = {}
  tecnicos.filter(t => t.activo !== false).forEach(t => {
    if (t.pin) {
      usuarios[t.pin] = { nombre: t.nombre, rol: t.rol || 'tecnico' }
    }
  })

  // Lista de nombres de técnicos activos (para dropdowns de asignación)
  const tecnicosLista = [...new Set(
    tecnicos
      .filter(t => t.activo !== false && (t.rol === 'tecnico' || t.rol === 'admin'))
      .map(t => t.nombre)
  )]

  return (
    <TecnicosContext.Provider value={{ tecnicos, loading, usuarios, tecnicosLista }}>
      {children}
    </TecnicosContext.Provider>
  )
}

export function useTecnicos() {
  return useContext(TecnicosContext)
}

// ── Componente PinLock ─────────────────────────────────────────────────────────
export default function PinLock({ onUnlock, modo = 'admin', titulo = 'Panel Interno' }) {
  const { usuarios, loading: loadingTecnicos } = useTecnicos()
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [shake, setShake] = useState(false)

  const handleDigit = (d) => {
    if (pin.length >= 4) return
    const nuevo = pin + d
    setPin(nuevo)
    setError(false)

    if (nuevo.length === 4) {
      const usuario = usuarios[nuevo] || (nuevo === '1234' ? { nombre: 'Admin Maestro', rol: 'admin' } : undefined)
      const valido = modo === 'admin'
        ? usuario?.rol === 'admin'
        : usuario?.rol === 'tecnico' || usuario?.rol === 'admin'

      if (valido) {
        setTimeout(() => onUnlock(usuario, nuevo), 200)
      } else {
        setShake(true)
        setError(true)
        setTimeout(() => { setPin(''); setShake(false) }, 600)
      }
    }
  }

  const handleBorrar = () => { setPin(prev => prev.slice(0, -1)); setError(false) }

  const digits = [1,2,3,4,5,6,7,8,9,'',0,'⌫']

  if (loadingTecnicos) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--gris-claro)', padding: 24,
      }}>
        <div className="spinner" />
        <div style={{ marginTop: 16, color: 'var(--gris-texto)', fontSize: '0.9rem' }}>Cargando...</div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--gris-claro)', padding: 24,
    }}>
      <div style={{
        background: 'white', borderRadius: 20, padding: '36px 32px',
        boxShadow: '0 4px 32px rgba(30,58,95,0.12)',
        width: '100%', maxWidth: 320, textAlign: 'center',
      }}>
        <div style={{
          width: 64, height: 64,
          background: 'linear-gradient(135deg, var(--azul) 0%, var(--azul-medio) 100%)',
          borderRadius: '50%', display: 'flex', alignItems: 'center',
          justifyContent: 'center', margin: '0 auto 20px',
        }}>
          <Lock size={28} color="white" />
        </div>

        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 800, color: 'var(--azul)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
          {titulo}
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--gris-texto)', marginBottom: 28 }}>
          {import.meta.env.VITE_APP_NAME || 'Euler Calefacción'}
        </div>

        <div style={{
          display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 32,
          animation: shake ? 'shake 0.4s ease' : 'none',
        }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{
              width: 16, height: 16, borderRadius: '50%',
              background: i < pin.length ? (error ? 'var(--rojo)' : 'var(--azul)') : '#D8E2EE',
              transition: 'background 0.15s',
              transform: i < pin.length ? 'scale(1.15)' : 'scale(1)',
            }} />
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {digits.map((d, i) => {
            if (d === '') return <div key={i} />
            return (
              <button key={i}
                onClick={() => d === '⌫' ? handleBorrar() : handleDigit(String(d))}
                style={{
                  padding: '16px 0', borderRadius: 12,
                  border: '1.5px solid #D8E2EE',
                  background: d === '⌫' ? '#FFF0EE' : 'white',
                  color: d === '⌫' ? 'var(--rojo)' : 'var(--azul)',
                  fontFamily: 'var(--font-display)', fontSize: '1.3rem',
                  fontWeight: 700, cursor: 'pointer',
                  transition: 'background 0.15s, transform 0.1s',
                  userSelect: 'none',
                }}
                onMouseDown={e => e.currentTarget.style.transform = 'scale(0.93)'}
                onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                onTouchStart={e => e.currentTarget.style.transform = 'scale(0.93)'}
                onTouchEnd={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                {d}
              </button>
            )
          })}
        </div>

        {error && (
          <div style={{ marginTop: 16, color: 'var(--rojo)', fontSize: '0.85rem', fontWeight: 600 }}>
            PIN incorrecto
          </div>
        )}
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  )
}
