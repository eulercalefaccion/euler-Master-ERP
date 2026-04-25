import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, Calculator, ClipboardList, Package, MapPin, Receipt, Flame, HardHat, Wallet } from 'lucide-react';

const Sidebar = () => {
  const sections = [
    {
      label: null,
      items: [
        { name: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/' },
      ]
    },
    {
      label: 'COMERCIAL',
      items: [
        { name: 'Clientes', icon: <Users size={20} />, path: '/clientes' },
        { name: 'Presupuestos', icon: <Calculator size={20} />, path: '/presupuestos' },
      ]
    },
    {
      label: 'OPERACIONES',
      items: [
        { name: 'Obras', icon: <HardHat size={20} />, path: '/obras' },
        { name: 'Stock', icon: <Package size={20} />, path: '/stock' },
        { name: 'Jornadas', icon: <MapPin size={20} />, path: '/jornadas' },
      ]
    },
    {
      label: 'RRHH & FINANZAS',
      items: [
        { name: 'Personas', icon: <ClipboardList size={20} />, path: '/personas' },
        { name: 'Sueldos', icon: <Receipt size={20} />, path: '/sueldos' },
        { name: 'Balance', icon: <Wallet size={20} />, path: '/balance' },
      ]
    }
  ];

  return (
    <div style={{ width: '250px', background: 'var(--bg-sidebar)', color: 'var(--text-sidebar)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <div style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid #1e293b' }}>
        <Flame color="var(--primary-500)" size={28} />
        <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'white', letterSpacing: '-0.025em', margin: 0 }}>Euler Master</h2>
      </div>
      
      <nav style={{ flex: 1, padding: '0.75rem 0', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        {sections.map((section, si) => (
          <div key={si}>
            {section.label && (
              <div style={{
                fontSize: '0.65rem', fontWeight: '700', color: '#64748b',
                padding: '1rem 1.5rem 0.5rem', letterSpacing: '0.1em',
                borderTop: si > 0 ? '1px solid #1e293b' : 'none',
                marginTop: si > 0 ? '0.5rem' : 0
              }}>
                {section.label}
              </div>
            )}
            <ul style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {section.items.map((item) => (
                <li key={item.path}>
                  <NavLink 
                    to={item.path}
                    style={({ isActive }) => ({
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.625rem 1.5rem',
                      color: isActive ? 'white' : '#94a3b8',
                      background: isActive ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                      borderRight: isActive ? '3px solid var(--primary-500)' : '3px solid transparent',
                      fontWeight: isActive ? '600' : '400',
                      fontSize: '0.9rem',
                      textDecoration: 'none',
                      transition: 'all 150ms ease'
                    })}
                  >
                    <span style={{ opacity: 0.85, display: 'flex' }}>{item.icon}</span>
                    {item.name}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div style={{ padding: '1rem', borderTop: '1px solid #1e293b', fontSize: '0.7rem', color: '#475569', textAlign: 'center' }}>
        Euler Master ERP v2.1
      </div>
    </div>
  );
};

export default Sidebar;
