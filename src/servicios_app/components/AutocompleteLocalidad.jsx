import { useState, useEffect, useRef } from 'react'

const DEFAULT_LOCALIDADES = [
  'Rosario',
  'Funes',
  'Roldán',
  'Ibarlucea',
  'Pérez',
  'Soldini',
  'Zavalla',
  'Granadero Baigorria',
  'Capitán Bermúdez',
  'Fray Luis Beltrán',
  'San Lorenzo',
  'Ricardone',
  'Luis Palacios',
  'San Jerónimo Sud',
  'Carcarañá',
  'Pueblo Esther',
  'General Lagos',
  'Arroyo Seco',
  'Alvear',
  'Villa Gobernador Gálvez'
]

// Mapeo para normalizar ciudades comunes (asegura acentos y mayúsculas correctas)
export const LOCALIDADES_MAP = {
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

// Función de normalización generalizada
export function normalizarNombreLocalidad(raw) {
  if (raw === undefined || raw === null) return ''
  const str = String(raw)
  if (str.trim() === '') return ''
  const trimmed = str.trim().replace(/\s+/g, ' ')
  const lower = trimmed.toLowerCase()
  
  if (LOCALIDADES_MAP[lower]) {
    return LOCALIDADES_MAP[lower]
  }
  
  // Si no está en el mapa, capitalizar cada palabra
  return trimmed
    .split(' ')
    .map(word => {
      if (word.length === 0) return ''
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}

export default function AutocompleteLocalidad({ value, onChange, placeholder, style, inputStyle, localidades = [] }) {
  const [sugerencias, setSugerencias] = useState([])
  const [mostrarDropdown, setMostrarDropdown] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const containerRef = useRef(null)

  // Combinar sugerencias por defecto con dinámicas existentes de Firestore
  const safeLocalidades = Array.isArray(localidades) ? localidades : []
  const allLocalidades = [...new Set([
    ...DEFAULT_LOCALIDADES,
    ...safeLocalidades.map(l => normalizarNombreLocalidad(l)).filter(Boolean)
  ])].sort()

  // Filtrar sugerencias según el texto ingresado
  useEffect(() => {
    if (!value || value.trim() === '') {
      // Si está enfocado pero vacío, mostrar las localidades más comunes como sugerencias principales
      setSugerencias(allLocalidades.slice(0, 10))
      return
    }

    const busqueda = value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    const filtradas = allLocalidades.filter(loc => {
      const normalizada = loc.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      return normalizada.includes(busqueda)
    })
    setSugerencias(filtradas)
  }, [value, localidades])

  // Cerrar dropdown al hacer clic fuera del componente
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        cerrarYNormalizar()
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [value])

  const cerrarYNormalizar = () => {
    setMostrarDropdown(false)
    setActiveIdx(-1)
    if (value && value.trim() !== '') {
      const normalizada = normalizarNombreLocalidad(value)
      if (normalizada !== value) {
        onChange(normalizada)
      }
    }
  }

  const handleKeyDown = (e) => {
    if (!mostrarDropdown) {
      if (e.key === 'ArrowDown') {
        setMostrarDropdown(true)
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(prev => (prev + 1) % sugerencias.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(prev => (prev - 1 + sugerencias.length) % sugerencias.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIdx >= 0 && activeIdx < sugerencias.length) {
        seleccionarSugerencia(sugerencias[activeIdx])
      } else {
        cerrarYNormalizar()
      }
    } else if (e.key === 'Escape') {
      setMostrarDropdown(false)
      setActiveIdx(-1)
    }
  }

  const seleccionarSugerencia = (sug) => {
    onChange(sug)
    setMostrarDropdown(false)
    setActiveIdx(-1)
  }

  const dropdownStyle = {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    background: 'white',
    border: '1.5px solid #D8E2EE',
    borderRadius: '8px',
    boxShadow: '0 4px 20px rgba(30,58,95,0.15)',
    zIndex: 9999,
    maxHeight: '220px',
    overflowY: 'auto',
    marginTop: '4px',
    padding: '4px 0',
  }

  const itemStyle = (isHovered) => ({
    padding: '10px 14px',
    fontSize: '0.92rem',
    color: '#1E3A5F',
    cursor: 'pointer',
    background: isHovered ? '#EEF4FF' : 'transparent',
    fontWeight: isHovered ? '600' : '500',
    transition: 'background 0.15s, color 0.15s',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  })

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', ...style }}>
      <input
        type="text"
        placeholder={placeholder || "Ej: Rosario, Roldán..."}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setMostrarDropdown(true)}
        onKeyDown={handleKeyDown}
        style={inputStyle}
      />
      {mostrarDropdown && sugerencias.length > 0 && (
        <div style={dropdownStyle} className="autocomplete-dropdown">
          {sugerencias.map((sug, i) => (
            <div
              key={sug}
              style={itemStyle(i === activeIdx)}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => seleccionarSugerencia(sug)}
            >
              <span style={{ color: '#F5A623', fontSize: '0.85rem' }}>📍</span>
              {sug}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
