import React, { useState, useEffect, useMemo } from 'react';
import { useJornadas } from '../../../context/JornadasContext';
import MapView from '../../../components/MapView';

export default function AdminDashboardView() {
    const { empleadosActivos, jornadas, obrasActivas, empleados, appConfig } = useJornadas();
    const hoyStr = new Date().toISOString().slice(0, 10);
    const [currentTime, setCurrentTime] = useState(new Date());

    // Filtros
    const [filtroFecha, setFiltroFecha] = useState('hoy');
    const [customDesde, setCustomDesde] = useState(hoyStr);
    const [customHasta, setCustomHasta] = useState(hoyStr);
    const [filtroEmp, setFiltroEmp] = useState('');
    const [showIncidencias, setShowIncidencias] = useState(false);
    const [showTrabajando, setShowTrabajando] = useState(false);
    const [showLlegadas, setShowLlegadas] = useState(false);
    const [hoveredDay, setHoveredDay] = useState(null);

    useEffect(() => {
        const t = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(t);
    }, []);

    const {
        jornadasActivas,
        empleadosAusentes,
        jRango,
        llegadasTarde,
        incidencias,
        totalMinutosFiltrados,
        horasPorObra,
        actividad7Dias
    } = useMemo(() => {
        let fMin = hoyStr, fMax = hoyStr;
        const d = new Date();
        if (filtroFecha === 'ayer') {
            d.setDate(d.getDate() - 1);
            fMin = fMax = d.toISOString().slice(0, 10);
        } else if (filtroFecha === '7') {
            d.setDate(d.getDate() - 6);
            fMin = d.toISOString().slice(0, 10);
        } else if (filtroFecha === '30') {
            d.setDate(d.getDate() - 29);
            fMin = d.toISOString().slice(0, 10);
        } else if (filtroFecha === 'custom') {
            fMin = customDesde || hoyStr;
            fMax = customHasta || hoyStr;
        }

        if (fMin > fMax) { const temp = fMin; fMin = fMax; fMax = temp; }

        let jRangoObj = jornadas.filter(j => j.fechaIngreso >= fMin && j.fechaIngreso <= fMax);

        if (filtroEmp) {
            const lowQ = filtroEmp.toLowerCase().trim();
            jRangoObj = jRangoObj.filter(j => {
                const e = empleados.find(x => x.id === j.empleadoId);
                return e && (`${e.nombre} ${e.apellido}`.toLowerCase().includes(lowQ));
            });
        }

        const abiertas = jornadas.filter(j => j.estado === 'abierta');
        const eIdsHoy = new Set(jornadas.filter(j => j.fechaIngreso === hoyStr).map(j => j.empleadoId));
        const ausentes = empleadosActivos.filter(e => !eIdsHoy.has(e.id));

        const limitTime = appConfig?.horarioIngreso || '08:30';
        const tardanzas = jRangoObj.filter(j => j.horaIngreso > limitTime);
        const inc = jRangoObj.filter(j => j.semaforo === 'rojo' || (j.fechaIngreso < hoyStr && j.estado === 'abierta'));

        let tMin = 0;
        const hObra = {};
        jRangoObj.forEach(j => {
            if (!j.horaSalida) return;
            const [hi, mi] = j.horaIngreso.split(':').map(Number);
            const [hs, ms] = j.horaSalida.split(':').map(Number);
            let min = (hs * 60 + ms) - (hi * 60 + mi);
            if (min < 0) min += 1440;
            if (min > 0) {
                tMin += min;
                const ob = j.obraDetectada || 'Desconocida';
                if (!hObra[ob]) hObra[ob] = { minutos: 0, empIds: new Set() };
                hObra[ob].minutos += min;
                hObra[ob].empIds.add(j.empleadoId);
            }
        });

        const obrasArr = Object.entries(hObra).map(([nob, data]) => ({
            nombre: nob,
            minutos: data.minutos,
            empleados: data.empIds.size
        })).sort((a, b) => b.minutos - a.minutos);

        const ult7 = [];
        for (let i = 6; i >= 0; i--) {
            const dd = new Date();
            dd.setDate(dd.getDate() - i);
            const fStr = dd.toISOString().slice(0, 10);
            const lbl = dd.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' });
            let djMin = 0;
            jornadas.filter(j => j.fechaIngreso === fStr).forEach(j => {
                if (j.horaSalida) {
                    const [hi2, mi2] = j.horaIngreso.split(':').map(Number);
                    const [hs2, ms2] = j.horaSalida.split(':').map(Number);
                    let m = (hs2 * 60 + ms2) - (hi2 * 60 + mi2);
                    if (m < 0) m += 1440;
                    if (m > 0) djMin += m;
                }
            });
            ult7.push({ fecha: fStr, label: lbl, horas: djMin / 60 });
        }

        return {
            jornadasActivas: abiertas,
            empleadosAusentes: ausentes,
            jRango: jRangoObj,
            llegadasTarde: tardanzas,
            incidencias: inc,
            totalMinutosFiltrados: tMin,
            horasPorObra: obrasArr,
            actividad7Dias: ult7
        };
    }, [jornadas, empleadosActivos, filtroFecha, customDesde, customHasta, filtroEmp, hoyStr, appConfig, empleados]);

    function minToH(m) {
        if (!m) return '0h';
        return `${Math.floor(m / 60)}h ${m % 60}m`;
    }

    const metrics = [
        { label: 'Trabajando Ahora', value: jornadasActivas.length, icon: '👷', color: '#10b981', help: 'Viendo: Siempre HOY', action: () => setShowTrabajando(true) },
        { label: 'Aún no inician', value: empleadosAusentes.length, icon: '⏳', color: '#6b7280', help: 'Viendo: Siempre HOY' },
        { label: 'Llegadas Tarde', value: llegadasTarde.length, icon: '⏰', color: '#f59e0b', help: `Filtro actual`, action: () => setShowLlegadas(true) },
        { label: 'Incidencias', value: incidencias.length, icon: '🚨', color: '#ef4444', help: 'Click para ver más', action: () => setShowIncidencias(true) },
        { label: 'Horas Trabajadas', value: minToH(totalMinutosFiltrados).split(' ')[0], icon: '⏱️', color: '#3b82f6', help: `Total en ${filtroFecha}` }
    ];

    return (
        <div className="dashboard-saas" style={{ paddingBottom: '40px' }}>
            <div className="page-header" style={{ marginBottom: '24px' }}>
                <div>
                    <div className="page-title">Panel de Control Operativo</div>
                    <div className="page-subtitle">{currentTime.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
                </div>
                <div style={{ fontSize: '14px', color: 'var(--text-primary)', background: 'var(--surface)', padding: '8px 16px', borderRadius: 'var(--radius-full)', border: '1px solid var(--border)', fontWeight: 'bold' }}>
                    🕐 {currentTime.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                </div>
            </div>

            {/* Barra de Filtros */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
                <select className="form-input" style={{ width: '220px' }} value={filtroFecha} onChange={e => setFiltroFecha(e.target.value)}>
                    <option value="hoy">📅 Visualizando: Hoy</option>
                    <option value="ayer">📅 Visualizando: Ayer</option>
                    <option value="7">📅 Visualizando: Últimos 7 Días</option>
                    <option value="30">📅 Visualizando: Últimos 30 Días</option>
                    <option value="custom">📅 Personalizado...</option>
                </select>

                {filtroFecha === 'custom' && (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'var(--surface)', padding: '4px 8px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Desde</span>
                        <input type="date" className="form-input" style={{ width: '130px', padding: '6px' }} value={customDesde} onChange={e => setCustomDesde(e.target.value)} />
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Hasta</span>
                        <input type="date" className="form-input" style={{ width: '130px', padding: '6px' }} value={customHasta} onChange={e => setCustomHasta(e.target.value)} />
                    </div>
                )}

                <input
                    type="search" className="form-input" style={{ flex: 1, minWidth: '250px' }}
                    placeholder="🔍 Buscar colaborador por nombre o apellido..."
                    value={filtroEmp} onChange={e => setFiltroEmp(e.target.value)}
                />
            </div>

            {/* SECCION 1: Métricas */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                {metrics.map(m => (
                    <div key={m.label} className="glass-card" onClick={m.action} style={{
                        padding: '20px', borderTop: `4px solid ${m.color}`,
                        cursor: m.action ? 'pointer' : 'default',
                        transition: 'transform 0.2s',
                        background: 'var(--surface)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', fontWeight: '700', marginBottom: '8px' }}>{m.label}</div>
                                <div style={{ fontSize: '32px', fontWeight: '900', lineHeight: 1, color: 'var(--text-primary)' }}>{m.value}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>{m.help}</div>
                            </div>
                            <div style={{ fontSize: '24px', background: `${m.color}20`, width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '12px' }}>{m.icon}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* SECCION 2: Mapa y Estado */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr', gap: '20px', marginBottom: '24px' }} className="resp-grid">
                <div className="glass-card" style={{ padding: '0', display: 'flex', flexDirection: 'column', minHeight: '420px', overflow: 'hidden' }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
                        <h3 style={{ margin: 0, fontSize: '15px' }}>📍 Mapa en Tiempo Real</h3>
                    </div>
                    <div style={{ flex: 1, minHeight: '360px' }}>
                        <MapView
                            obras={obrasActivas}
                            jornadas={jornadasActivas}
                            empleados={empleados}
                            appConfig={appConfig}
                            height="100%"
                        />
                    </div>
                </div>

                <div className="glass-card" style={{ padding: '0', display: 'flex', flexDirection: 'column', minHeight: '420px', background: 'var(--surface)' }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                        <h3 style={{ margin: 0, fontSize: '15px' }}>👥 Estado de Colaboradores (Hoy)</h3>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', maxHeight: '380px', padding: '12px' }}>
                        {empleadosActivos.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Sin colaboradores</div>}
                        {empleadosActivos.map(emp => {
                            const jsHoy = jornadas.filter(j => j.empleadoId === emp.id && j.fechaIngreso === hoyStr);
                            const jActiva = jsHoy.find(j => j.estado === 'abierta');
                            const jCerrada = jsHoy.find(j => j.estado === 'cerrada');

                            let label = 'No inició jornada';
                            let dotColor = '#6b7280';
                            let sub = 'Ausente o pendiente';

                            if (jActiva) {
                                label = 'En jornada';
                                dotColor = jActiva.semaforo === 'rojo' ? '#ef4444' : (jActiva.semaforo === 'amarillo' ? '#f59e0b' : '#10b981');
                                sub = `Desde ${jActiva.horaIngreso} — ${jActiva.obraDetectada || 'Otro lugar'}`;
                            } else if (jCerrada) {
                                label = 'Salió';
                                dotColor = '#3b82f6';
                                sub = `${jCerrada.horaIngreso} - ${jCerrada.horaSalida} — ${jCerrada.obraDetectada || 'Lugar'}`;
                            }

                            return (
                                <div key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: dotColor, flexShrink: 0, boxShadow: `0 0 8px ${dotColor}80` }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>{emp.nombre} {emp.apellido}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
                                    </div>
                                    <div style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '4px', background: `${dotColor}20`, color: dotColor, fontWeight: '800' }}>
                                        {label}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* SECCION 3: Horas por Obra & Actividad 7 días */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }} className="resp-grid">
                <div className="glass-card" style={{ padding: '24px', background: 'var(--surface)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                        <h3 style={{ margin: 0, fontSize: '15px' }}>🏗️ Horas Trabajadas por Obra</h3>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Muestra datos de: {filtroFecha}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {horasPorObra.length === 0 && <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>Sin horas registradas en este período</div>}
                        {horasPorObra.map((ob, i) => {
                            const maxM = horasPorObra[0]?.minutos || 1;
                            const pct = (ob.minutos / maxM) * 100;
                            return (
                                <div key={ob.nombre}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
                                        <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{i + 1}. {ob.nombre}</span>
                                        <span style={{ fontWeight: '600' }}>{minToH(ob.minutos)} <small style={{ color: 'var(--text-secondary)', fontWeight: 'normal' }}>({ob.empleados} emp)</small></span>
                                    </div>
                                    <div style={{ height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                                        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--grad-primary)', borderRadius: '4px', transition: 'width 1s ease-out' }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>
                    <h3 style={{ margin: '0 0 20px 0', fontSize: '15px' }}>📈 Actividad (Últimos 7 días)</h3>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', flex: 1, minHeight: '180px' }}>
                        {actividad7Dias.map(d => {
                            const maxH = Math.max(...actividad7Dias.map(x => x.horas), 1);
                            const active = d.fecha === hoyStr;
                            const isHovered = hoveredDay === d.fecha;
                            const totalJornadasDia = jornadas.filter(j => j.fechaIngreso === d.fecha && j.estado === 'cerrada').length;
                            return (
                                <div
                                    key={d.fecha}
                                    style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', height: '100%', justifyContent: 'flex-end', position: 'relative', cursor: d.horas > 0 ? 'pointer' : 'default' }}
                                    onMouseEnter={() => d.horas > 0 && setHoveredDay(d.fecha)}
                                    onMouseLeave={() => setHoveredDay(null)}
                                >
                                    {isHovered && (
                                        <div style={{
                                            position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)',
                                            background: 'rgba(0,0,0,0.95)', color: 'white', borderRadius: '8px',
                                            padding: '8px 12px', fontSize: '12px', whiteSpace: 'nowrap',
                                            border: '1px solid rgba(255,255,255,0.15)', zIndex: 10,
                                            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                                            pointerEvents: 'none',
                                        }}>
                                            <div style={{ fontWeight: '800', color: '#3b82f6', marginBottom: '2px' }}>{d.horas.toFixed(2)}h totales</div>
                                            <div style={{ color: 'rgba(255,255,255,0.7)' }}>{totalJornadasDia} jornada{totalJornadasDia !== 1 ? 's' : ''}</div>
                                        </div>
                                    )}
                                    <div style={{ fontSize: '11px', fontWeight: '800', color: active ? '#3b82f6' : 'var(--text-secondary)' }}>
                                        {d.horas > 0 ? d.horas.toFixed(1) + 'h' : ''}
                                    </div>
                                    <div style={{
                                        width: '100%',
                                        height: `${Math.max(6, (d.horas / maxH) * 100)}%`,
                                        background: isHovered ? '#3b82f6' : (active ? 'rgba(59,130,246,0.8)' : (d.horas > 0 ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.06)')),
                                        borderRadius: '6px',
                                        transition: 'height 0.5s ease, background 0.2s ease',
                                    }} />
                                    <div style={{ fontSize: '11px', color: active ? 'white' : 'var(--text-muted)', fontWeight: active ? '700' : '500', textAlign: 'center' }}>{d.label}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Modal Incidencias */}
            {showIncidencias && (
                <div className="modal-overlay" onClick={() => setShowIncidencias(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%' }}>
                        <div className="modal-header">
                            <h2 style={{ margin: 0, fontSize: '16px' }}>🚨 Panel de Incidencias</h2>
                            <button className="btn btn-ghost btn-sm" onClick={() => setShowIncidencias(false)}>✕</button>
                        </div>
                        <div style={{ maxHeight: '60vh', overflowY: 'auto', padding: '16px 20px' }}>
                            {incidencias.length === 0 ? (
                                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>✅</div>
                                    <p style={{ margin: 0 }}>¡Todo en orden! No hay incidencias en este período.</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {incidencias.map(inc => {
                                        const em = empleados.find(e => e.id === inc.empleadoId);
                                        const name = em ? `${em.nombre} ${em.apellido}` : inc.empleadoId;
                                        let motive = inc.semaforo === 'rojo' ? 'Fuera del área de trabajo' : 'Otra incidencia';
                                        if (inc.fechaIngreso < hoyStr && inc.estado === 'abierta') motive = 'Jornada crítica sin cerrar de días previos';
                                        return (
                                            <div key={inc.id} style={{ background: 'rgba(239,68,68,0.1)', borderLeft: '4px solid #ef4444', padding: '14px', borderRadius: '6px' }}>
                                                <div style={{ fontWeight: '800', fontSize: '14px' }}>{name}</div>
                                                <div style={{ fontSize: '13px', color: '#ef4444', fontWeight: '600', margin: '4px 0' }}>{motive}</div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                                    📅 {inc.fechaIngreso} — Inició a las {inc.horaIngreso}<br />
                                                    📍 Detectado en: {inc.obraDetectada || 'Desconocido'}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Trabajando Ahora */}
            {showTrabajando && (
                <div className="modal-overlay" onClick={() => setShowTrabajando(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%' }}>
                        <div className="modal-header">
                            <h2 style={{ margin: 0, fontSize: '16px' }}>👷 Personas Trabajando Ahora</h2>
                            <button className="btn btn-ghost btn-sm" onClick={() => setShowTrabajando(false)}>✕</button>
                        </div>
                        <div style={{ maxHeight: '60vh', overflowY: 'auto', padding: '16px 20px' }}>
                            {jornadasActivas.length === 0 ? (
                                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>🏖️</div>
                                    <p style={{ margin: 0 }}>Nadie está trabajando actualmente.</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {jornadasActivas.map(jor => {
                                        const em = empleados.find(e => e.id === jor.empleadoId);
                                        const name = em ? `${em.nombre} ${em.apellido}` : jor.empleadoId;
                                        return (
                                            <div key={jor.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '14px', borderRadius: '6px' }}>
                                                <div>
                                                    <div style={{ fontWeight: '800', fontSize: '14px' }}>{name}</div>
                                                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>Desde las {jor.horaIngreso} — {jor.obraDetectada || 'Desconocido'}</div>
                                                </div>
                                                <div style={{ color: '#10b981', background: 'rgba(16,185,129,0.15)', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '800' }}>
                                                    Activo
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Llegadas Tarde */}
            {showLlegadas && (
                <div className="modal-overlay" onClick={() => setShowLlegadas(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%' }}>
                        <div className="modal-header">
                            <h2 style={{ margin: 0, fontSize: '16px' }}>⏰ Llegadas Tarde</h2>
                            <button className="btn btn-ghost btn-sm" onClick={() => setShowLlegadas(false)}>✕</button>
                        </div>
                        <div style={{ maxHeight: '60vh', overflowY: 'auto', padding: '16px 20px' }}>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>
                                Horario límite: {appConfig?.horarioIngreso || '08:30'} — Período: {filtroFecha}
                            </div>
                            {llegadasTarde.length === 0 ? (
                                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>✅</div>
                                    <p style={{ margin: 0 }}>Nadie llegó tarde en este período.</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {llegadasTarde.map(jor => {
                                        const em = empleados.find(e => e.id === jor.empleadoId);
                                        const name = em ? `${em.nombre} ${em.apellido}` : jor.empleadoId;
                                        const limitTime = appConfig?.horarioIngreso || '08:30';
                                        const [lH, lM] = limitTime.split(':').map(Number);
                                        const [jH, jM] = jor.horaIngreso.split(':').map(Number);
                                        const delayMins = (jH * 60 + jM) - (lH * 60 + lM);

                                        return (
                                            <div key={jor.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(245,158,11,0.1)', borderLeft: '4px solid #f59e0b', padding: '14px', borderRadius: '6px' }}>
                                                <div>
                                                    <div style={{ fontWeight: '800', fontSize: '14px' }}>{name}</div>
                                                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>📅 {jor.fechaIngreso} — {jor.obraDetectada || 'Desconocido'}</div>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ color: '#f59e0b', fontSize: '14px', fontWeight: '800' }}>{jor.horaIngreso}</div>
                                                    <div style={{ color: '#ef4444', fontSize: '11px', fontWeight: '600' }}>+{delayMins} min</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
