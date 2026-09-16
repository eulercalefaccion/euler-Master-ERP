import React, { useState, useEffect } from 'react';
import { useJornadas } from '../../../context/JornadasContext';

export default function EmployeeDashboardView({ onBackToAdmin }) {
    const { empleados, jornadas, obrasActivas, showToast } = useJornadas();
    const [selectedEmpId, setSelectedEmpId] = useState('');
    const hoyStr = new Date().toISOString().slice(0, 10);

    const emp = empleados.find(e => e.id === selectedEmpId) || empleados[0];

    useEffect(() => {
        if (!selectedEmpId && empleados.length > 0) {
            setSelectedEmpId(empleados[0].id);
        }
    }, [empleados, selectedEmpId]);

    const jsHoy = jornadas.filter(j => j.empleadoId === emp?.id && j.fechaIngreso === hoyStr);
    const jActiva = jsHoy.find(j => j.estado === 'abierta');

    return (
        <div style={{ maxWidth: '600px', margin: '0 auto', paddingBottom: '40px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <button className="btn btn-ghost btn-sm" onClick={onBackToAdmin}>
                    ⬅️ Volver al Panel Admin
                </button>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    Vista de Fichaje (Móvil)
                </div>
            </div>

            {/* Selector de Colaborador para prueba */}
            <div className="glass-card" style={{ padding: '16px', marginBottom: '20px' }}>
                <label className="form-label">Simular colaborador:</label>
                <select
                    className="form-input"
                    value={selectedEmpId}
                    onChange={e => setSelectedEmpId(e.target.value)}
                >
                    {empleados.map(e => (
                        <option key={e.id} value={e.id}>{e.nombre} {e.apellido} (@{e.usuario || e.dni})</option>
                    ))}
                </select>
            </div>

            {/* Tarjeta de Estado del Colaborador */}
            <div className="glass-card" style={{ padding: '24px', textAlign: 'center', marginBottom: '20px' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>
                    {jActiva ? '👷' : '🏖️'}
                </div>
                <h2 style={{ margin: '0 0 4px 0', fontSize: '20px', color: 'var(--text-primary)' }}>
                    {emp ? `${emp.nombre} ${emp.apellido}` : 'Colaborador'}
                </h2>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                    {jActiva ? `Jornada iniciada a las ${jActiva.horaIngreso} — ${jActiva.obraDetectada || 'En obra'}` : 'Sin jornada activa'}
                </div>

                <div style={{ display: 'inline-block', padding: '6px 16px', borderRadius: '20px', fontSize: '13px', fontWeight: '800', background: jActiva ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.06)', color: jActiva ? '#10b981' : 'var(--text-muted)' }}>
                    {jActiva ? '🟢 TRABAJANDO AHORA' : '⚪ JORNADA NO INICIADA'}
                </div>
            </div>

            {/* Info de Obras Disponibles */}
            <div className="glass-card" style={{ padding: '20px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'var(--text-primary)' }}>
                    📍 Obras activas para fichar ({obrasActivas.length})
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '250px', overflowY: 'auto' }}>
                    {obrasActivas.slice(0, 8).map(o => (
                        <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontSize: '12px' }}>
                            <span style={{ fontWeight: '600' }}>{o.nombre}</span>
                            <span style={{ color: 'var(--text-secondary)' }}>Radio: {o.radio}m</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
