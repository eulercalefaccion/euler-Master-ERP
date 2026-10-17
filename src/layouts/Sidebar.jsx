import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { X, LogOut, ChevronDown, ChevronRight, Search, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { NAV_SECTIONS, filtrarPorRol, findNavByLocation, searchNav } from './navigation';

const LS_GRUPOS = 'euler.sidebar.gruposPlegados';
const LS_COMPACTO = 'euler.sidebar.compacto';

const leerLS = (key, fallback) => {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};
const guardarLS = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sin storage */ } };

const COLOR_TEXTO = '#94a3b8';
const COLOR_GRUPO = '#64748b';
const BORDE = '1px solid #1e293b';

const BadgeIA = ({ texto }) => (
  <span style={{
    fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.04em', padding: '1px 6px', borderRadius: 999,
    background: 'rgba(245, 166, 35, 0.15)', color: '#F5A623', border: '1px solid rgba(245, 166, 35, 0.35)', lineHeight: 1.4,
  }}>{texto}</span>
);

const Sidebar = ({ className = '', isMobile, onClose }) => {
  const { logout, currentUser, isSuperAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = currentUser?.role === 'administrador' || isSuperAdmin;

  const sections = useMemo(() => filtrarPorRol(NAV_SECTIONS, isAdmin), [isAdmin]);
  const activo = useMemo(() => findNavByLocation(location, sections), [location, sections]);

  const [plegados, setPlegados] = useState(() => leerLS(LS_GRUPOS, []));
  const [compacto, setCompacto] = useState(() => !isMobile && leerLS(LS_COMPACTO, false));
  const [submenusAbiertos, setSubmenusAbiertos] = useState({});
  const [busqueda, setBusqueda] = useState('');
  const [resaltado, setResaltado] = useState(0);
  const [tooltip, setTooltip] = useState(null);
  const inputRef = useRef(null);
  const tooltipTimer = useRef(null);

  // El área de la página actual se abre sola al navegar (ajuste durante el render, sin effect)
  const [ultimoActivo, setUltimoActivo] = useState(null);
  if (activo && activo.item !== ultimoActivo) {
    setUltimoActivo(activo.item);
    if (plegados.includes(activo.section.id)) setPlegados(plegados.filter((id) => id !== activo.section.id));
  }

  // Persistencia de preferencias del usuario
  useEffect(() => { guardarLS(LS_GRUPOS, plegados); }, [plegados]);
  useEffect(() => { if (!isMobile) guardarLS(LS_COMPACTO, compacto); }, [compacto, isMobile]);

  // Atajo global Ctrl+K / ⌘K para buscar módulos
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (compacto) setCompacto(false);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [compacto]);

  useEffect(() => () => clearTimeout(tooltipTimer.current), []);

  const resultados = useMemo(() => searchNav(busqueda, sections), [busqueda, sections]);

  const toggleGrupo = (id) => {
    setPlegados((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleCompacto = () => {
    setTooltip(null);
    setCompacto((c) => !c);
  };

  const irA = (path) => {
    navigate(path);
    setBusqueda('');
    setResaltado(0);
    inputRef.current?.blur();
    if (isMobile && onClose) onClose();
  };

  const onKeyBusqueda = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setResaltado((i) => Math.min(i + 1, resultados.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setResaltado((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && resultados[resaltado]) { e.preventDefault(); irA(resultados[resaltado].item.path); }
    else if (e.key === 'Escape') { setBusqueda(''); inputRef.current?.blur(); }
  };

  // Tooltip flotante (fuera del scroll del nav) con nombre + descripción
  const mostrarTooltip = (e, item) => {
    if (isMobile) return;
    const rect = e.currentTarget.getBoundingClientRect();
    clearTimeout(tooltipTimer.current);
    tooltipTimer.current = setTimeout(() => setTooltip({ item, top: rect.top + rect.height / 2, left: rect.right + 10 }), compacto ? 0 : 450);
  };
  const ocultarTooltip = () => { clearTimeout(tooltipTimer.current); setTooltip(null); };

  const estiloItem = (isActive, nivel = 0) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: compacto ? '0.625rem 0' : `0.625rem 1.5rem 0.625rem ${nivel ? '2.75rem' : '1.5rem'}`,
    justifyContent: compacto ? 'center' : 'flex-start',
    color: isActive ? 'white' : COLOR_TEXTO,
    background: isActive ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
    borderTop: 'none',
    borderLeft: 'none',
    borderBottom: 'none',
    borderRight: isActive ? '3px solid var(--primary-500)' : '3px solid transparent',
    fontWeight: isActive ? '600' : '400',
    fontSize: nivel ? '0.85rem' : '0.9rem',
    textDecoration: 'none',
    transition: 'all 150ms ease',
    width: '100%',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
  });

  const renderLink = (item, nivel = 0) => {
    const Icono = item.icon;
    const isActive = activo?.item === item;
    return (
      <li key={item.path}>
        <NavLink
          to={item.path}
          className="sidebar-link"
          onClick={() => { ocultarTooltip(); if (isMobile && onClose) onClose(); }}
          onMouseEnter={(e) => mostrarTooltip(e, item)}
          onMouseLeave={ocultarTooltip}
          aria-label={item.name}
          style={estiloItem(isActive, nivel)}
        >
          <span style={{ opacity: 0.85, display: 'flex', flexShrink: 0 }}><Icono size={nivel ? 17 : 20} /></span>
          {!compacto && <span style={{ flex: 1, minWidth: 0 }}>{item.name}</span>}
          {!compacto && item.badge && <BadgeIA texto={item.badge} />}
        </NavLink>
      </li>
    );
  };

  const renderSubmenu = (item) => {
    const Icono = item.icon;
    const hijoActivo = activo?.parent === item;
    const abierto = !!submenusAbiertos[item.path] || hijoActivo;
    return (
      <li key={item.path}>
        <button
          type="button"
          className="sidebar-link"
          onClick={() => setSubmenusAbiertos((prev) => ({ ...prev, [item.path]: !abierto }))}
          onMouseEnter={(e) => mostrarTooltip(e, item)}
          onMouseLeave={ocultarTooltip}
          aria-expanded={abierto}
          aria-label={item.name}
          style={{ ...estiloItem(false), color: hijoActivo ? 'white' : COLOR_TEXTO, fontWeight: hijoActivo ? 600 : 400 }}
        >
          <span style={{ opacity: 0.85, display: 'flex', flexShrink: 0 }}><Icono size={20} /></span>
          {!compacto && <span style={{ flex: 1 }}>{item.name}</span>}
          {!compacto && (abierto ? <ChevronDown size={15} /> : <ChevronRight size={15} />)}
        </button>
        {abierto && (
          <ul style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: 2 }}>
            {item.children.map((c) => renderLink(c, 1))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className={className} style={{ width: compacto ? '72px' : '250px', background: 'var(--bg-sidebar)', color: 'var(--text-sidebar)', display: 'flex', flexDirection: 'column', flexShrink: 0, transition: 'width 200ms ease', height: '100%' }}>
      <style>{`
        .sidebar-link:hover { background: rgba(148, 163, 184, 0.08) !important; color: #e2e8f0 !important; }
        .sidebar-grupo:hover { color: #94a3b8 !important; }
        .sidebar-search::placeholder { color: #64748b; }
        .sidebar-search:focus { border-color: var(--primary-500) !important; background: rgba(15, 23, 42, 0.6) !important; }
        @keyframes sidebarTooltipIn { from { opacity: 0; transform: translate(-4px, -50%); } to { opacity: 1; transform: translate(0, -50%); } }
      `}</style>

      {/* Logo */}
      <div style={{ padding: compacto ? '1.25rem 0.5rem' : '1.5rem', display: 'flex', alignItems: 'center', justifyContent: compacto ? 'center' : 'space-between', borderBottom: BORDE }}>
        <img src="/logo_euler.png" alt="Euler Logo" style={{ height: compacto ? '28px' : '40px', maxWidth: compacto ? '52px' : 'none', objectFit: 'contain' }} />
        {isMobile && (
          <button onClick={onClose} aria-label="Cerrar menú" style={{ background: 'none', border: 'none', color: COLOR_TEXTO, cursor: 'pointer' }}>
            <X size={24} />
          </button>
        )}
      </div>

      {/* Buscador de módulos */}
      {!compacto ? (
        <div style={{ padding: '0.75rem 1rem 0.25rem', position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: '1.6rem', top: '50%', transform: 'translateY(-35%)', color: COLOR_GRUPO, pointerEvents: 'none' }} />
          <input
            id="sidebar-buscador"
            ref={inputRef}
            className="sidebar-search"
            value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setResaltado(0); }}
            onKeyDown={onKeyBusqueda}
            placeholder="Buscar módulo…"
            aria-label="Buscar módulo del sistema"
            autoComplete="off"
            style={{
              width: '100%', padding: '0.5rem 3rem 0.5rem 2.1rem', borderRadius: 8, border: '1px solid #1e293b',
              background: 'rgba(15, 23, 42, 0.35)', color: '#e2e8f0', fontSize: '0.85rem', outline: 'none', transition: 'all 150ms ease', fontFamily: 'inherit',
            }}
          />
          {!isMobile && !busqueda && (
            <kbd style={{ position: 'absolute', right: '1.6rem', top: '50%', transform: 'translateY(-35%)', fontSize: '0.65rem', color: COLOR_GRUPO, border: '1px solid #334155', borderRadius: 4, padding: '0 5px', fontFamily: 'inherit', pointerEvents: 'none' }}>Ctrl K</kbd>
          )}
          {busqueda && (
            <button type="button" onClick={() => setBusqueda('')} aria-label="Limpiar búsqueda" style={{ position: 'absolute', right: '1.5rem', top: '50%', transform: 'translateY(-35%)', background: 'none', border: 'none', color: COLOR_GRUPO, cursor: 'pointer', display: 'flex' }}>
              <X size={14} />
            </button>
          )}
        </div>
      ) : (
        <button type="button" className="sidebar-link" onClick={() => { setCompacto(false); setTimeout(() => inputRef.current?.focus(), 220); }}
          aria-label="Buscar módulo" title="Buscar módulo (Ctrl+K)"
          style={{ ...estiloItem(false), marginTop: '0.5rem' }}>
          <Search size={20} />
        </button>
      )}

      <nav aria-label="Navegación principal" style={{ flex: 1, padding: '0.5rem 0 0.75rem', display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden' }}>
        {busqueda ? (
          /* Resultados de búsqueda */
          <ul style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '0 0.5rem' }}>
            {resultados.length === 0 && (
              <li style={{ padding: '1rem', fontSize: '0.8rem', color: COLOR_GRUPO, textAlign: 'center' }}>
                No se encontró “{busqueda}”.<br />Probá con otra palabra (ej. factura, cheque, deuda).
              </li>
            )}
            {resultados.map(({ item, section, parent }, i) => {
              const Icono = item.icon;
              return (
                <li key={item.path}>
                  <button type="button" onClick={() => irA(item.path)} onMouseEnter={() => setResaltado(i)}
                    style={{
                      display: 'flex', gap: '0.65rem', alignItems: 'flex-start', width: '100%', padding: '0.55rem 0.75rem', borderRadius: 8, border: 'none',
                      background: i === resaltado ? 'rgba(59, 130, 246, 0.18)' : 'transparent', color: i === resaltado ? 'white' : COLOR_TEXTO, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                    }}>
                    <span style={{ display: 'flex', marginTop: 2, flexShrink: 0 }}><Icono size={18} /></span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.88rem', fontWeight: 600 }}>
                        {item.name} {item.badge && <BadgeIA texto={item.badge} />}
                      </span>
                      <span style={{ display: 'block', fontSize: '0.68rem', color: COLOR_GRUPO, letterSpacing: '0.06em', margin: '1px 0 2px' }}>
                        {section.label}{parent ? ` › ${parent.name.toUpperCase()}` : ''}
                      </span>
                      <span style={{ display: 'block', fontSize: '0.75rem', lineHeight: 1.35, color: '#94a3b8' }}>{item.description}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          sections.map((section, si) => {
            const plegado = plegados.includes(section.id);
            const tieneActivo = activo?.section.id === section.id;
            return (
              <div key={section.id} style={{ borderTop: si > 0 ? BORDE : 'none', marginTop: si > 0 ? '0.35rem' : 0, paddingTop: si > 0 ? '0.15rem' : 0 }}>
                {!compacto ? (
                  <button
                    type="button"
                    className="sidebar-grupo"
                    onClick={() => toggleGrupo(section.id)}
                    aria-expanded={!plegado}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: '0.65rem', fontWeight: '700', color: tieneActivo && plegado ? '#cbd5e1' : COLOR_GRUPO,
                      padding: '0.85rem 1.5rem 0.45rem', letterSpacing: '0.1em', fontFamily: 'inherit', transition: 'color 150ms ease',
                    }}
                  >
                    <span>{section.label}</span>
                    {plegado ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                  </button>
                ) : (
                  si > 0 && <div style={{ height: 6 }} />
                )}
                {(!plegado || compacto) && (
                  <ul style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {section.items.map((item) => (item.children ? renderSubmenu(item) : renderLink(item)))}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </nav>

      {/* Pie */}
      <div style={{ padding: compacto ? '0.75rem 0.5rem' : '0.75rem 1rem 1rem', borderTop: BORDE, display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
        {isMobile && (
          <button onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.875rem' }}>
            <LogOut size={16} /> Cerrar Sesión
          </button>
        )}
        {!isMobile && (
          <button type="button" onClick={toggleCompacto} className="sidebar-link"
            aria-label={compacto ? 'Expandir menú' : 'Contraer menú'} title={compacto ? 'Expandir menú' : 'Contraer menú (solo íconos)'}
            style={{ display: 'flex', alignItems: 'center', justifyContent: compacto ? 'center' : 'flex-start', gap: '0.6rem', width: '100%', padding: '0.45rem 0.5rem', background: 'none', border: 'none', borderRadius: 6, color: COLOR_GRUPO, cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit' }}>
            {compacto ? <PanelLeftOpen size={18} /> : <><PanelLeftClose size={18} /> Contraer menú</>}
          </button>
        )}
        {!compacto && (
          <div style={{ fontSize: '0.7rem', color: '#475569', textAlign: 'center' }}>
            Euler Master ERP v2.1
          </div>
        )}
      </div>

      {/* Tooltip con descripción del módulo */}
      {tooltip && (
        <div role="tooltip" style={{
          position: 'fixed', top: tooltip.top, left: tooltip.left, transform: 'translateY(-50%)', zIndex: 10000, maxWidth: 260,
          background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 8, padding: '0.6rem 0.75rem',
          boxShadow: '0 10px 25px rgba(0,0,0,0.35)', pointerEvents: 'none', animation: 'sidebarTooltipIn 140ms ease-out',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: '0.82rem', marginBottom: 3 }}>
            {tooltip.item.name} {tooltip.item.badge && <BadgeIA texto={tooltip.item.badge} />}
          </div>
          <div style={{ fontSize: '0.75rem', lineHeight: 1.4, color: '#94a3b8' }}>{tooltip.item.description}</div>
        </div>
      )}
    </div>
  );
};

export default Sidebar;
