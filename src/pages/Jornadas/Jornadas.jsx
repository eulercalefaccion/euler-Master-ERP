import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useJornadas } from '../../context/JornadasContext';
import AdminDashboardView from './views/AdminDashboardView';
import ObrasView from './views/ObrasView';
import ReportesView from './views/ReportesView';
import IncidenciasView from './views/IncidenciasView';
import GastosView from './views/GastosView';
import ConfiguracionView from './views/ConfiguracionView';
import EmployeeDashboardView from './views/EmployeeDashboardView';
import './jornadas.css';

const NAV_ITEMS = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'obras', label: 'Obras', icon: '🔨' },
    { id: 'reportes', label: 'Reportes', icon: '📋' },
    { id: 'incidencias', label: 'Incidencias', icon: '⚠️' },
    { id: 'gastos', label: 'Gastos', icon: '💸' },
    { id: 'config', label: 'Configuración', icon: '⚙️' },
];

export default function Jornadas() {
    const navigate = useNavigate();
    const { jornadas, gastos, loading } = useJornadas();
    const [activePage, setActivePage] = useState('dashboard');
    const [isEmployeeMode, setIsEmployeeMode] = useState(false);

    // Badges reactivos
    const badges = useMemo(() => {
        const hoyStr = new Date().toISOString().slice(0, 10);
        const incPendientes = jornadas.filter(j => {
            if (j.eliminada) return false;
            if (j.semaforo === 'rojo' && !j.incidencias?.includes('Resuelta manualmente')) return true;
            if (j.estado === 'abierta' && j.fechaIngreso < hoyStr) return true;
            return false;
        }).length;

        const ayer = new Date();
        ayer.setDate(ayer.getDate() - 1);
        const ayerStr = ayer.toISOString().slice(0, 10);
        const gastosRecientes = gastos.filter(g => g.fecha >= ayerStr).length;

        return { incidencias: incPendientes, gastos: gastosRecientes };
    }, [jornadas, gastos]);

    if (loading) {
        return (
            <div className="jornadas-theme-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <div style={{ fontSize: '40px', marginBottom: '16px' }}>🔥</div>
                    <div style={{ fontSize: '16px', fontWeight: '600' }}>Conectando con Euler Jornadas en tiempo real...</div>
                </div>
            </div>
        );
    }

    if (isEmployeeMode) {
        return (
            <div className="jornadas-theme-root" style={{ padding: '24px' }}>
                <EmployeeDashboardView onBackToAdmin={() => setIsEmployeeMode(false)} />
            </div>
        );
    }

    return (
        <div className="jornadas-theme-root" style={{ display: 'flex', minHeight: 'calc(100vh - 60px)' }}>
            {/* Sub-Sidebar idéntico a Euler Jornadas */}
            <aside className="admin-sidebar" style={{ flexShrink: 0 }}>
                {/* Logo & Header */}
                <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '32px', height: '32px', background: 'white', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                            🔥
                        </div>
                        <div>
                            <div style={{ fontWeight: '800', fontSize: '14px', color: 'var(--text-primary)' }}>Euler</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Panel Admin Jornadas</div>
                        </div>
                    </div>
                </div>

                {/* Navegación interna */}
                <nav style={{ flex: 1, padding: '14px 10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {NAV_ITEMS.map(item => {
                        const badge = item.id === 'incidencias' ? badges.incidencias : item.id === 'gastos' ? badges.gastos : 0;
                        const isActive = activePage === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => setActivePage(item.id)}
                                className={`nav-item ${isActive ? 'nav-item-active' : ''}`}
                            >
                                <span style={{ fontSize: '16px' }}>{item.icon}</span>
                                <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
                                {badge > 0 && (
                                    <span className="nav-badge">{badge > 99 ? '99+' : badge}</span>
                                )}
                            </button>
                        );
                    })}

                    {/* Acceso directo a Colaboradores */}
                    <button
                        onClick={() => navigate('/colaboradores')}
                        className="nav-item"
                        style={{ marginTop: '8px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}
                    >
                        <span style={{ fontSize: '16px' }}>👥</span>
                        <span style={{ flex: 1, textAlign: 'left' }}>Colaboradores</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>ERP ↗</span>
                    </button>
                </nav>

                {/* Footer del sidebar */}
                <div style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
                    <button
                        onClick={() => setIsEmployeeMode(true)}
                        className="btn btn-ghost btn-sm"
                        style={{
                            width: '100%',
                            marginBottom: '12px',
                            background: 'rgba(16,185,129,0.12)',
                            color: '#10b981',
                            border: '1px solid rgba(16,185,129,0.3)',
                            justifyContent: 'flex-start'
                        }}
                    >
                        📱 Ir a Mi Jornada
                    </button>
                    <div style={{ fontSize: '11px', color: 'rgba(196,65,33,0.9)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--euler-red)', display: 'inline-block' }} />
                        Administrador Activo
                    </div>
                </div>
            </aside>

            {/* Contenido Principal */}
            <div className="admin-main">
                {/* Barra superior con badge de incidencias */}
                <header className="admin-topbar">
                    <span style={{ fontWeight: '700', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {NAV_ITEMS.find(n => n.id === activePage)?.icon}{' '}
                        {NAV_ITEMS.find(n => n.id === activePage)?.label}
                    </span>

                    {badges.incidencias > 0 && (
                        <button
                            onClick={() => setActivePage('incidencias')}
                            style={{
                                marginLeft: 'auto',
                                background: 'rgba(239,68,68,0.15)',
                                border: '1px solid rgba(239,68,68,0.3)',
                                color: '#ef4444',
                                borderRadius: 'var(--radius-full)',
                                padding: '4px 14px',
                                fontSize: '12px',
                                fontWeight: '700',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                            }}
                        >
                            🚨 {badges.incidencias} incidencia{badges.incidencias !== 1 ? 's' : ''}
                        </button>
                    )}
                </header>

                {/* Vistas dinámicas */}
                <main style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
                    {activePage === 'dashboard' && <AdminDashboardView />}
                    {activePage === 'obras' && <ObrasView />}
                    {activePage === 'reportes' && <ReportesView />}
                    {activePage === 'incidencias' && <IncidenciasView />}
                    {activePage === 'gastos' && <GastosView />}
                    {activePage === 'config' && <ConfiguracionView />}
                </main>
            </div>
        </div>
    );
}
