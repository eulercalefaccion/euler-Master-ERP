import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, User, Bell, CheckCircle, X } from 'lucide-react';
import { db } from '../services/firebaseConfig';
import { collection, query, onSnapshot, where, orderBy, updateDoc, doc } from 'firebase/firestore';

const pageNames = {
  '/': 'Dashboard',
  '/clientes': 'Directorio de Clientes',
  '/presupuestos': 'Presupuestos (CRM)',
  '/lista-precios': 'Lista de Precios',
  '/obras': 'Gestión de Obras',
  '/stock': 'Inventario / Stock',
  '/jornadas': 'Control de Jornadas',
  '/personas': 'Gestión de Personas',
  '/sueldos': 'Liquidación de Sueldos',
  '/balance': 'Balance General',
};

const Header = () => {
  const { currentUser, logout } = useAuth();
  const location = useLocation();
  const pageName = pageNames[location.pathname] || 'Panel de Control';

  const [notifications, setNotifications] = React.useState([]);
  const [showNotifications, setShowNotifications] = React.useState(false);
  const [showPopup, setShowPopup] = React.useState(null);
  const notificationsRef = React.useRef(null);

  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  React.useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, 'notifications'),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Mostrar popup solo para notificaciones nuevas y no leídas que entraron mientras el usuario está activo
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          if (!data.read) {
            setShowPopup({ id: change.doc.id, ...data });
          }
        }
      });
      
      setNotifications(notifs);
    });
    return () => unsubscribe();
  }, [currentUser]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = async (id) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (e) { console.error(e); }
  };

  const markAllAsRead = async () => {
    const unread = notifications.filter(n => !n.read);
    for (const notif of unread) {
      await markAsRead(notif.id);
    }
  };

  return (
    <header style={{ 
      height: '64px',
      padding: '0 2rem', 
      borderBottom: '1px solid var(--border-light)', 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center',
      background: 'var(--bg-surface)',
      flexShrink: 0
    }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: '600', margin: 0 }}>{pageName}</h1>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        
        {/* Notificaciones */}
        <div style={{ position: 'relative' }} ref={notificationsRef}>
          <button 
            onClick={() => setShowNotifications(!showNotifications)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', position: 'relative', color: 'var(--text-secondary)' }}
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span style={{ position: 'absolute', top: '-4px', right: '-4px', background: '#ef4444', color: 'white', fontSize: '0.65rem', fontWeight: 'bold', width: '16px', height: '16px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div style={{ position: 'absolute', top: '35px', right: '-60px', width: '320px', background: 'white', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)', border: '1px solid var(--border-light)', zIndex: 1000, display: 'flex', flexDirection: 'column', maxHeight: '400px' }}>
              <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '600' }}>Notificaciones</h3>
                {unreadCount > 0 && (
                  <button onClick={markAllAsRead} style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '0.75rem', cursor: 'pointer', fontWeight: '500' }}>
                    Marcar todas leídas
                  </button>
                )}
              </div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                    No hay notificaciones
                  </div>
                ) : (
                  notifications.map(n => (
                    <div key={n.id} onClick={() => markAsRead(n.id)} style={{ padding: '1rem', borderBottom: '1px solid #f1f5f9', background: n.read ? 'white' : '#f0f9ff', cursor: 'pointer', transition: 'background 0.2s' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                        <span style={{ fontWeight: '600', fontSize: '0.875rem', color: n.read ? '#334155' : '#0f172a' }}>{n.title}</span>
                        {!n.read && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6', marginTop: '4px' }} />}
                      </div>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>{n.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderLeft: '1px solid var(--border-light)', paddingLeft: '1.5rem' }}>
          <div style={{ backgroundColor: 'var(--primary-100)', color: 'var(--primary-700)', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '600', fontSize: '0.875rem' }}>
            {currentUser?.name?.charAt(0) || <User size={20} />}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: '500', color: 'var(--text-primary)' }}>{currentUser?.name}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{currentUser?.role || 'user'}</span>
          </div>
        </div>

        <button 
          onClick={logout}
          className="btn btn-secondary" 
          style={{ padding: '0.375rem 0.75rem', fontSize: '0.875rem' }}
          title="Cerrar sesión"
        >
          <LogOut size={16} />
          Salir
        </button>
      </div>

      {/* Popup de nueva notificación */}
      {showPopup && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn 0.3s ease-out' }}>
          <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', border: '1px solid #bfdbfe', padding: '2rem', width: '600px', maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '1.5rem', animation: 'popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.5rem' }}>
              <div style={{ background: '#eff6ff', color: '#3b82f6', padding: '1rem', borderRadius: '50%' }}>
                <Bell size={40} />
              </div>
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: '0 0 0.5rem 0', color: '#1e3a8a', fontSize: '1.5rem' }}>¡Atención!</h4>
                <p style={{ margin: 0, fontSize: '1.25rem', color: '#475569', lineHeight: 1.4, fontWeight: 'bold' }}>{showPopup.title}</p>
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '1.1rem', color: '#64748b' }}>{showPopup.message}</p>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button 
                onClick={() => setShowPopup(null)} 
                style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', padding: '0.75rem 2rem', fontSize: '1.1rem', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.3)' }}
              >
                ENTENDIDO
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes popIn {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </header>
  );
};

export default Header;
