import React from 'react';
import { useAuth } from '../context/AuthContext';
import { LogOut, User, Bell } from 'lucide-react';

const Header = () => {
  const { currentUser, logout } = useAuth();

  return (
    <header style={{ 
      height: '64px',
      padding: '0 2rem', 
      borderBottom: '1px solid var(--border-light)', 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center',
      background: 'var(--bg-surface)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: '600' }}>Panel de Control</h1>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <button style={{ color: 'var(--text-secondary)' }} title="Notificaciones" className="flex items-center">
          <Bell size={20} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderLeft: '1px solid var(--border-light)', paddingLeft: '1.5rem' }}>
          <div style={{ backgroundColor: 'var(--primary-100)', color: 'var(--primary-700)', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '600' }}>
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
    </header>
  );
};

export default Header;
