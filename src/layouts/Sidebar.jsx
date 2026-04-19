import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, Calculator, ClipboardList, Package, MapPin, Receipt, Flame } from 'lucide-react';

const Sidebar = () => {
  const menuItems = [
    { name: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/' },
    { name: 'Clientes', icon: <Users size={20} />, path: '/clientes' },
    { name: 'Presupuestos', icon: <Calculator size={20} />, path: '/presupuestos' },
    { name: 'Obras', icon: <ClipboardList size={20} />, path: '/obras' },
    { name: 'Stock', icon: <Package size={20} />, path: '/stock' },
    { name: 'Jornadas', icon: <MapPin size={20} />, path: '/jornadas' },
    { name: 'Sueldos', icon: <Receipt size={20} />, path: '/sueldos' },
    { name: 'Balance', icon: <Flame size={20} />, path: '/balance' },
  ];

  return (
    <div style={{ width: '250px', background: 'var(--bg-sidebar)', color: 'var(--text-sidebar)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid #1e293b' }}>
        <Flame color="var(--primary-500)" size={28} />
        <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'white', letterSpacing: '-0.025em' }}>Euler Master</h2>
      </div>
      
      <nav style={{ flex: 1, padding: '1rem 0', display: 'flex', flexDirection: 'column' }}>
        <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {menuItems.map((item) => (
            <li key={item.path}>
              <NavLink 
                to={item.path}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem 1.5rem',
                  color: isActive ? 'white' : 'var(--text-sidebar)',
                  background: isActive ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                  borderRight: isActive ? '3px solid var(--primary-500)' : '3px solid transparent',
                  fontWeight: isActive ? '500' : '400',
                  textDecoration: 'none',
                  transition: 'background var(--transition-fast)'
                })}
              >
                <span style={{ opacity: 0.8 }}>{item.icon}</span>
                {item.name}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div style={{ padding: '1rem', borderTop: '1px solid #1e293b', fontSize: '0.75rem', color: 'var(--text-sidebar-hover)', textAlign: 'center' }}>
        v2.0 Beta
      </div>
    </div>
  );
};

export default Sidebar;
