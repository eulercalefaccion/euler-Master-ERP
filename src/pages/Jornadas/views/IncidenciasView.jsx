import React, { useState } from 'react';
import { useJornadas } from '../../../context/JornadasContext';

export default function IncidenciasView() {
    const { jornadas, empleados, updateJornada, showToast } = useJornadas();
    const [resueltasVis, setResueltasVis] = useState(false);
    const hoyStr = new Date().toISOString().slice(0, 10);

    const incidencias = [];

    jornadas.forEach(j => {
        if (j.eliminada) return;
        const emp = empleados.find(e => e.id === j.empleadoId);
        const nombre = emp ? `${emp.nombre} ${emp.apellido}` : (j.empleadoId || 'Desconocido');

        // Jornada abierta sin salida por más de 12 horas o del día anterior
        if (j.estado === 'abierta' && j.horaIngreso) {
            const ingreso = new Date(`${j.fechaIngreso}T${j.horaIngreso}`);
            const horas = (Date.now() - ingreso.getTime()) / 3600000;
            if (horas >= 12 || j.fechaIngreso < hoyStr) {
                incidencias.push({
                    id: `${j.id}_sin_salida`,
                    type: 'sin_salida',
                    label: 'Jornada sin cierre (>12hs)',
                    empleado: nombre,
                    fecha: j.fechaIngreso,
                    hora: j.horaIngreso,
                    jornada: j,
                    resuelta: false,
                    color: '#ef4444',
                });
            }
        }

        // Ubicación roja
        if (j.semaforo === 'rojo') {
            incidencias.push({
                id: `${j.id}_ubicacion`,
                type: 'ubicacion_roja',
                label: 'Ingreso en ubicación no reconocida',
                empleado: nombre,
                fecha: j.fechaIngreso,
                hora: j.horaIngreso,
                jornada: j,
                resuelta: j.incidencias?.includes('Resuelta manualmente'),
                color: '#f59e0b',
            });
        }

        // Incidencias del registro
        if (j.incidencias && j.incidencias.length > 0 && j.semaforo !== 'rojo') {
            j.incidencias.forEach((inc, idx) => {
                if (inc === 'Resuelta manualmente') return;
                incidencias.push({
                    id: `${j.id}_inc_${idx}`,
                    type: 'registro',
                    label: inc,
                    empleado: nombre,
                    fecha: j.fechaIngreso,
                    hora: j.horaIngreso,
                    jornada: j,
                    resuelta: j.incidencias?.includes('Resuelta manualmente'),
                    color: '#8b5cf6',
                });
            });
        }
    });

    const visibles = incidencias.filter(i => resueltasVis || !i.resuelta);
    const pendientes = incidencias.filter(i => !i.resuelta).length;

    function handleResolver(inc) {
        const j = inc.jornada;
        updateJornada(j.id, { ...j, incidencias: [...(j.incidencias || []), 'Resuelta manualmente'] });
        showToast('Incidencia marcada como resuelta', 'success');
    }

    function handleCerrar(inc) {
        const j = inc.jornada;
        const ahora = new Date();
        updateJornada(j.id, {
            ...j,
            estado: 'cerrada',
            fechaSalida: ahora.toISOString().slice(0, 10),
            horaSalida: ahora.toTimeString().slice(0, 5),
            latSalida: j.latIngreso, lngSalida: j.lngIngreso,
            tipoSalida: 'MANUAL_ADMIN',
            incidencias: [...(j.incidencias || []), 'Cerrada manualmente por admin'],
        });
        showToast('Jornada cerrada manualmente', 'info');
    }

    return (
        <div>
            <div className="page-header">
                <div>
                    <div className="page-title">Incidencias</div>
                    <div className="page-subtitle">
                        {pendientes} pendiente{pendientes !== 1 ? 's' : ''}
                    </div>
                </div>
                <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setResueltasVis(v => !v)}
                >
                    {resueltasVis ? '👁️ Ocultar resueltas' : '👁️ Ver resueltas'}
                </button>
            </div>

            {visibles.length === 0 && (
                <div className="glass-card" style={{ padding: '40px', textAlign: 'center' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>✅</div>
                    <p style={{ color: 'var(--text-secondary)', margin: 0 }}>{resueltasVis ? 'Sin incidencias registradas' : 'Sin incidencias pendientes'}</p>
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {visibles.map(inc => (
                    <div
                        key={inc.id}
                        className="glass-card"
                        style={{
                            padding: '18px',
                            borderLeft: `4px solid ${inc.color}`,
                            opacity: inc.resuelta ? 0.6 : 1,
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: '700', fontSize: '14px', color: inc.color }}>
                                        {inc.type === 'sin_salida' ? '⏰' : inc.type === 'ubicacion_roja' ? '📍' : '⚠️'} {inc.label}
                                    </span>
                                    {inc.resuelta && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: 'rgba(16,185,129,0.15)', color: '#10b981', fontWeight: '800' }}>✅ Resuelta</span>}
                                </div>
                                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                    👤 <strong>{inc.empleado}</strong> · 📅 {inc.fecha} · 🕐 {inc.hora}
                                </div>
                            </div>
                            {!inc.resuelta && (
                                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                                    {inc.type === 'sin_salida' && (
                                        <button className="btn btn-ghost btn-sm" onClick={() => handleCerrar(inc)} title="Cerrar jornada ahora">
                                            ⏹ Cerrar
                                        </button>
                                    )}
                                    <button className="btn btn-ghost btn-sm" onClick={() => handleResolver(inc)}>
                                        ✅ Resolver
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
