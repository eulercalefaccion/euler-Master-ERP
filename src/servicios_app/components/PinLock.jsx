import { useState, useEffect, createContext, useContext } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../../services/firebaseConfig'

const TecnicosContext = createContext({ tecnicos: [], loading: true, usuarios: {}, tecnicosLista: [] })

export function TecnicosProvider({ children }) {
  const [tecnicos, setTecnicos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'usuarios'), (snap) => {
      const docs = snap.docs.map(d => {
        const data = d.data()
        return {
          id: d.id,
          ...data,
          // Normalize role to rol for compatibility
          rol: data.role || data.rol || 'tecnico'
        }
      })
      setTecnicos(docs)
      setLoading(false)
    }, (err) => {
      console.error('Error cargando usuarios:', err)
      setLoading(false)
    })
    return unsub
  }, [])

  // Lista de nombres de técnicos activos (para dropdowns de asignación)
  const tecnicosLista = [...new Set(
    tecnicos
      .filter(t => t.activo !== false && (t.rol === 'tecnico' || t.rol === 'admin'))
      .map(t => t.nombre)
  )]

  return (
    <TecnicosContext.Provider value={{ tecnicos, loading, usuarios: {}, tecnicosLista }}>
      {children}
    </TecnicosContext.Provider>
  )
}

export function useTecnicos() {
  return useContext(TecnicosContext)
}
