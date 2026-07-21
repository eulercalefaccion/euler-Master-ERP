import { useLocation, useNavigate } from 'react-router-dom'
import { Settings, ArrowLeft, Users, Wrench, HardHat } from 'lucide-react'

export default function Header() {
  const location = useLocation()
  const navigate = useNavigate()
  
  if (location.pathname.startsWith('/ver/')) {
    return null
  }

  const isAdmin = location.pathname.startsWith('/servicios')
  const isTecnico = location.pathname.startsWith('/tecnico')
  const isClientes = location.pathname.startsWith('/servicios/clientes')
  const isServicios = location.pathname === '/servicios'

  return (
    <header className="header">
      <div className="header-inner">
        <div className="header-logo">
          {(isTecnico && location.pathname !== '/tecnico') && (
            <button onClick={() => navigate('/tecnico')} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', marginRight: 4 }}>
              <ArrowLeft size={20} />
            </button>
          )}
          {(isAdmin && location.pathname !== '/servicios' && !isClientes) && (
            <button onClick={() => navigate('/servicios')} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', marginRight: 4 }}>
              <ArrowLeft size={20} />
            </button>
          )}
          {isClientes && location.pathname !== '/servicios/clientes' && (
            <button onClick={() => navigate('/servicios/clientes')} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', marginRight: 4 }}>
              <ArrowLeft size={20} />
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src={import.meta.env.VITE_APP_LOGO_URL || "/logo-final.png"} alt="Logo" style={{ width: 36, height: 36, borderRadius: '50%', background: 'white', objectFit: 'contain' }} />
            <div>
              <div className="header-title">{import.meta.env.VITE_APP_NAME || 'Euler Calefacción'}</div>
              <div className="header-subtitle">
                {isTecnico ? 'Vista técnico' : isAdmin ? 'Panel de gestión' : 'Servicios técnicos'}
              </div>
            </div>
          </div>
        </div>

        {!isAdmin && !isTecnico && (
          <button onClick={() => navigate('/servicios')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 4 }} title="Panel interno">
            <Settings size={20} />
          </button>
        )}
      </div>

      {/* Tabs de navegación admin */}
      {isAdmin && (
        <div style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <button
            onClick={() => navigate('/servicios')}
            style={{
              flex: 1, padding: '10px', background: 'none', border: 'none', cursor: 'pointer',
              color: isServicios ? 'var(--naranja)' : 'rgba(255,255,255,0.6)',
              fontFamily: 'var(--font)', fontSize: '0.78rem', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: 0.5,
              borderBottom: isServicios ? '2px solid var(--naranja)' : '2px solid transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
            <Wrench size={14} /> Servicios
          </button>
          <button
            onClick={() => navigate('/servicios/clientes')}
            style={{
              flex: 1, padding: '10px', background: 'none', border: 'none', cursor: 'pointer',
              color: isClientes ? 'var(--naranja)' : 'rgba(255,255,255,0.6)',
              fontFamily: 'var(--font)', fontSize: '0.78rem', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: 0.5,
              borderBottom: isClientes ? '2px solid var(--naranja)' : '2px solid transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
            <Users size={14} /> Clientes
          </button>
          <button
            onClick={() => navigate('/tecnico')}
            style={{
              flex: 1, padding: '10px', background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.6)',
              fontFamily: 'var(--font)', fontSize: '0.78rem', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: 0.5,
              borderBottom: '2px solid transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
            <HardHat size={14} /> Técnico
          </button>
        </div>
      )}

      <div className="header-accent" />
    </header>
  )
}
