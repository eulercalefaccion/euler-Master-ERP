import React, { useState } from 'react';
import { useJornadas } from '../../../context/JornadasContext';

export default function ConfiguracionView() {
    const { appConfig, updateConfig, showToast } = useJornadas();

    const [form, setForm] = useState({
        radioDefecto: appConfig?.radioDefecto || 200,
        radioTolerancia: appConfig?.radioTolerancia || 50,
        horaCierreAuto: appConfig?.horaCierreAuto || 12,
        horarioIngreso: appConfig?.horarioIngreso || '08:30',
        geminiApiKey: appConfig?.geminiApiKey || '',
    });

    const [saving, setSaving] = useState(false);

    function handleChange(field, value) {
        setForm(f => ({ ...f, [field]: value }));
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setSaving(true);
        try {
            await updateConfig({
                radioDefecto: parseInt(form.radioDefecto) || 200,
                radioTolerancia: parseInt(form.radioTolerancia) || 50,
                horaCierreAuto: parseInt(form.horaCierreAuto) || 12,
                horarioIngreso: form.horarioIngreso || '08:30',
                geminiApiKey: form.geminiApiKey || '',
            });
            showToast('Configuraciones guardadas correctamente ✅');
        } catch {
            showToast('Error al guardar', 'error');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div style={{ maxWidth: '800px' }}>
            <div className="page-header">
                <div>
                    <div className="page-title">Configuración de Jornadas</div>
                    <div className="page-subtitle">Ajustes generales, geofencing y horarios de corte</div>
                </div>
            </div>

            <form onSubmit={handleSubmit}>
                {/* Geofencing */}
                <div className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
                    <h3 style={{ fontWeight: '700', fontSize: '16px', color: 'var(--text-primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '20px' }}>📍</span> Ajustes de Geofencing
                    </h3>

                    <div className="grid-2">
                        <div className="form-group">
                            <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Radio por defecto (metros)</span>
                                <span style={{ color: 'var(--text-muted)' }}>Mín 50, Máx 5000</span>
                            </label>
                            <input
                                type="number"
                                className="form-input"
                                min="50" max="5000" step="10"
                                value={form.radioDefecto}
                                onChange={e => handleChange('radioDefecto', e.target.value)}
                                required
                            />
                            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                                Radio del círculo verde al crear una obra. Los colaboradores dentro de este radio tendrán estado "En zona" (🟢).
                            </p>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Tolerancia Amarilla (metros)</label>
                            <input
                                type="number"
                                className="form-input"
                                min="10" max="1000" step="10"
                                value={form.radioTolerancia}
                                onChange={e => handleChange('radioTolerancia', e.target.value)}
                                required
                            />
                            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                                Distancia adicional al radio donde el colaborador marcará "Fuera del área exacta" (🟡). Distancias mayores marcarán "Rojo" (🔴).
                            </p>
                        </div>
                    </div>

                    <div style={{ marginTop: '14px', padding: '14px', background: 'rgba(59,130,246,0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(59,130,246,0.2)' }}>
                        <h4 style={{ fontSize: '13px', fontWeight: '700', color: '#3b82f6', marginBottom: '6px' }}>ℹ️ Comportamiento del semáforo</h4>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                            Para radio de <strong>{form.radioDefecto}m</strong> y tolerancia de <strong>{form.radioTolerancia}m</strong>:<br />
                            • <span style={{ color: '#10b981' }}>🟢 Verde:</span> de 0 a {form.radioDefecto}m (Obra correcta)<br />
                            • <span style={{ color: '#f59e0b' }}>🟡 Amarillo:</span> de {parseInt(form.radioDefecto) + 1}m a {parseInt(form.radioDefecto) + parseInt(form.radioTolerancia)}m (En proximidades)<br />
                            • <span style={{ color: '#ef4444' }}>🔴 Rojo:</span> más de {parseInt(form.radioDefecto) + parseInt(form.radioTolerancia)}m (Genera incidencia automática)
                        </p>
                    </div>
                </div>

                {/* Horarios */}
                <div className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
                    <h3 style={{ fontWeight: '700', fontSize: '16px', color: 'var(--text-primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '20px' }}>⏰</span> Horarios y Jornadas
                    </h3>

                    <div className="grid-2">
                        <div className="form-group">
                            <label className="form-label">Horario de Ingreso Límite</label>
                            <input
                                type="time"
                                className="form-input"
                                value={form.horarioIngreso}
                                onChange={e => handleChange('horarioIngreso', e.target.value)}
                                required
                            />
                            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                                Fichajes iniciados después de este horario se contabilizan como "Llegadas Tarde" en el Dashboard.
                            </p>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Auto-cierre después de (horas)</label>
                            <select
                                className="form-input"
                                value={form.horaCierreAuto}
                                onChange={e => handleChange('horaCierreAuto', e.target.value)}
                            >
                                <option value="8">8 horas</option>
                                <option value="10">10 horas</option>
                                <option value="12">12 horas (Recomendado)</option>
                                <option value="14">14 horas</option>
                                <option value="16">16 horas</option>
                            </select>
                            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                                Si una jornada no fue cerrada por el colaborador, el sistema alertará con incidencia crítica.
                            </p>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button type="submit" className="btn btn-primary" disabled={saving}>
                        {saving ? 'Guardando...' : '💾 Guardar Configuración'}
                    </button>
                </div>
            </form>
        </div>
    );
}
