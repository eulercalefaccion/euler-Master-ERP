import { useEffect, useRef } from 'react'
import { X, ChevronLeft, ChevronRight, Download } from 'lucide-react'

export default function MediaLightbox({ media, index, onClose, onChangeIndex }) {
  const touchStartX = useRef(0)
  const touchEndX = useRef(0)

  // Cambiar a la siguiente imagen/video
  const mostrarSiguiente = () => {
    if (index < media.length - 1) {
      onChangeIndex(index + 1)
    } else {
      onChangeIndex(0) // Círculo continuo
    }
  }

  // Cambiar a la anterior imagen/video
  const mostrarAnterior = () => {
    if (index > 0) {
      onChangeIndex(index - 1)
    } else {
      onChangeIndex(media.length - 1) // Círculo continuo
    }
  }

  // Descargar archivo físicamente salvando restricciones de CORS
  const descargarArchivo = async (url) => {
    try {
      const nombreSugerido = url.split('/').pop().split('?')[0] || 'archivo'
      const res = await fetch(url)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = nombreSugerido
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
    } catch (err) {
      // Fallback si CORS bloquea el fetch directo
      window.open(url, '_blank')
    }
  }

  // Escuchar eventos de teclado (Laptop/Desktop)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight') mostrarSiguiente()
      if (e.key === 'ArrowLeft') mostrarAnterior()
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [index, media])

  if (!media || media.length === 0) return null
  const current = media[index]

  // Eventos gestuales (Touch en móviles)
  const handleTouchStart = (e) => {
    touchStartX.current = e.changedTouches[0].screenX
  }

  const handleTouchEnd = (e) => {
    touchEndX.current = e.changedTouches[0].screenX
    handleSwipe()
  }

  const handleSwipe = () => {
    const diffX = touchStartX.current - touchEndX.current
    if (diffX > 50) {
      // Deslizar a la izquierda -> Siguiente
      mostrarSiguiente()
    } else if (diffX < -50) {
      // Deslizar a la derecha -> Anterior
      mostrarAnterior()
    }
  }

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10, 18, 30, 0.94)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1100,
        userSelect: 'none',
      }}
    >
      {/* Barra de cabecera con contador e info */}
      <div style={{ position: 'absolute', top: 20, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 24px', color: 'white', zIndex: 1110 }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>
          {index + 1} de {media.length} {current.info ? `· ${current.info}` : ''}
        </div>
        
        {/* Botón Cerrar */}
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            color: 'white',
            width: 38,
            height: 38,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.25)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
        >
          <X size={20} />
        </button>
      </div>

      {/* Flecha Izquierda (Laptop) */}
      {media.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); mostrarAnterior() }}
          style={{
            position: 'absolute',
            left: 20,
            background: 'rgba(255,255,255,0.06)',
            border: 'none',
            color: 'white',
            width: 48,
            height: 48,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'background 0.2s',
            zIndex: 1110,
          }}
          className="no-print"
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
        >
          <ChevronLeft size={28} />
        </button>
      )}

      {/* Visor central del medio (Foto o Video) */}
      <div 
        onClick={onClose} 
        style={{ 
          width: '100%', 
          height: '100%', 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          padding: 24 
        }}
      >
        <div 
          onClick={(e) => e.stopPropagation()} 
          style={{ 
            maxWidth: '90%', 
            maxHeight: '75vh', 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            position: 'relative' 
          }}
        >
          {current.tipo === 'video' ? (
            <video
              src={current.url}
              controls
              autoPlay
              style={{
                maxWidth: '100%',
                maxHeight: '75vh',
                borderRadius: 12,
                boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
                display: 'block',
              }}
            />
          ) : (
            <img
              src={current.url}
              alt="Ampliada"
              style={{
                maxWidth: '100%',
                maxHeight: '75vh',
                borderRadius: 12,
                boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
                objectFit: 'contain',
                display: 'block',
              }}
            />
          )}
        </div>
      </div>

      {/* Flecha Derecha (Laptop) */}
      {media.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); mostrarSiguiente() }}
          style={{
            position: 'absolute',
            right: 20,
            background: 'rgba(255,255,255,0.06)',
            border: 'none',
            color: 'white',
            width: 48,
            height: 48,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'background 0.2s',
            zIndex: 1110,
          }}
          className="no-print"
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
        >
          <ChevronRight size={28} />
        </button>
      )}

      {/* Barra de pie con botón descargar */}
      <div style={{ position: 'absolute', bottom: 30, display: 'flex', justifyContent: 'center', zIndex: 1110 }}>
        <button
          onClick={() => descargarArchivo(current.url)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 24px',
            background: 'linear-gradient(135deg, var(--azul) 0%, var(--azul-medio) 100%)',
            color: 'white',
            border: 'none',
            borderRadius: 30,
            fontSize: '0.9rem',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(30,58,95,0.4)',
            transition: 'transform 0.15s, opacity 0.2s',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.04)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'none')}
        >
          <Download size={18} /> Descargar archivo
        </button>
      </div>
    </div>
  )
}
