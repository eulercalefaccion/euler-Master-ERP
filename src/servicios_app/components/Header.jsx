import { useLocation, useNavigate } from 'react-router-dom'
import { Settings, ArrowLeft, Users, Wrench, HardHat, LogOut } from 'lucide-react'
// useAuth provided by ERP auth shim
const useAuth = () => ({ user: { uid: 'erp-admin', nombre: 'Administrador', role: 'admin' }, logout: () => {} })
export default function Header() {
  const location = useLocation()
  const navigate = useNavigate()
  const { currentUser, logout, role } = useAuth()
  
  if (location.pathname.startsWith('/ver/')) {
    return null
  }

  const isAdmin = location.pathname.startsWith('/admin')
  const isTecnico = location.pathname.startsWith('/tecnico')
  const isClientes = location.pathname.startsWith('/admin/clientes')
  const isServicios = location.pathname === '/admin'

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <header className="header">
      <div className="header-inner">
        <div className="header-logo">
          {(isTecnico && location.pathname !== '/tecnico') && (
            <button onClick={() => navigate('/tecnico')} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', marginRight: 4 }}>
              <ArrowLeft size={20} />
            </button>
          )}
          {(isAdmin && location.pathname !== '/admin' && !isClientes) && (
            <button onClick={() => navigate('/admin')} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', marginRight: 4 }}>
              <ArrowLeft size={20} />
            </button>
          )}
          {isClientes && location.pathname !== '/admin/clientes' && (
            <button onClick={() => navigate('/admin/clientes')} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', marginRight: 4 }}>
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!isAdmin && !isTecnico && !currentUser && (
            <button onClick={() => navigate('/admin')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 4 }} title="Panel interno">
              <Settings size={20} />
            </button>
          )}
          {currentUser && (
            <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 4 }} title="Cerrar sesión">
              <LogOut size={20} />
            </button>
          )}
        </div>
      </div>

      {/* Tabs de navegación (Solo visibles para Admins) */}
      {role === 'admin' && (
        <div style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <button
            onClick={() => navigate('/admin')}
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
            onClick={() => navigate('/admin/clientes')}
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
              color: isTecnico ? 'var(--naranja)' : 'rgba(255,255,255,0.6)',
              fontFamily: 'var(--font)', fontSize: '0.78rem', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: 0.5,
              borderBottom: isTecnico ? '2px solid var(--naranja)' : '2px solid transparent',
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
