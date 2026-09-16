import React, { useState } from 'react';
import { useJornadas } from '../../../context/JornadasContext';
import MapView from '../../../components/MapView';

const TIPOS = [
    { v: 'obra', l: '🔨 Obra', c: '#f59e0b' },
    { v: 'oficina', l: '🏢 Oficina', c: '#3b82f6' },
    { v: 'deposito', l: '🏭 Depósito', c: '#8b5cf6' },
];

function ModalObra({ obra, onSave, onClose }) {
    const { appConfig, showToast } = useJornadas();
    const [form, setForm] = useState(obra || {
        nombre: '', direccion: '', lat: '', lng: '', radio: appConfig?.radioDefecto || 200, tipo: 'obra', color: '#f59e0b', activa: true
    });
    const [clickCoords, setClickCoords] = useState(
        obra && obra.lat ? { lat: obra.lat, lng: obra.lng } : null
    );

    function handleChange(field, value) { setForm(f => ({ ...f, [field]: value })); }

    function handleMapClick(coords) {
        setClickCoords(coords);
        setForm(f => ({ ...f, lat: coords.lat, lng: coords.lng }));
    }

    function handleTipo(tipo) {
        const t = TIPOS.find(t => t.v === tipo);
        setForm(f => ({ ...f, tipo, color: t?.c || '#f59e0b' }));
    }

    function handleSubmit(e) {
        e.preventDefault();
        if (!form.nombre) return;
        onSave({
            ...form,
            lat: parseFloat(form.lat) || null,
            lng: parseFloat(form.lng) || null,
            radio: parseInt(form.radio) || 200,
        });
    }

    return (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="modal-box" style={{ maxWidth: '560px', width: '90%' }}>
                <div className="modal-header">
                    <span className="modal-title">{obra ? 'Editar Obra' : 'Nueva Obra'}</span>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '20px' }}>
                    <div className="form-group">
                        <label className="form-label">Nombre *</label>
                        <input className="form-input" placeholder="Ej: Obra Palermo" value={form.nombre} onChange={e => handleChange('nombre', e.target.value)} required />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Dirección</label>
                        <input className="form-input" placeholder="Av. Santa Fe 3000, Rosario" value={form.direccion} onChange={e => handleChange('direccion', e.target.value)} />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Tipo</label>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {TIPOS.map(t => (
                                <button
                                    key={t.v} type="button"
                                    onClick={() => handleTipo(t.v)}
                                    style={{
                                        padding: '8px 14px', borderRadius: 'var(--radius-md)',
                                        background: form.tipo === t.v ? `${t.c}20` : 'var(--surface)',
                                        border: `1px solid ${form.tipo === t.v ? t.c : 'var(--border)'}`,
                                        color: form.tipo === t.v ? t.c : 'var(--text-secondary)',
                                        fontWeight: form.tipo === t.v ? '700' : '500',
                                        fontSize: '13px', cursor: 'pointer',
                                    }}
                                >{t.l}</button>
                            ))}
                        </div>
                    </div>

                    {/* Mapa para seleccionar coordenadas */}
                    <div className="form-group">
                        <label className="form-label">📍 Ubicación (hacé click en el mapa)</label>
                        <MapView
                            obras={[]}
                            height="200px"
                            onMapClick={handleMapClick}
                            marker={clickCoords}
                            appConfig={appConfig}
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                        <div className="form-group">
                            <label className="form-label">Latitud</label>
                            <input className="form-input" type="number" step="any" placeholder="-32.946" value={form.lat || ''} onChange={e => handleChange('lat', e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Longitud</label>
                            <input className="form-input" type="number" step="any" placeholder="-60.639" value={form.lng || ''} onChange={e => handleChange('lng', e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Radio (m)</label>
                            <input className="form-input" type="number" min="50" max="2000" placeholder="200" value={form.radio} onChange={e => handleChange('radio', e.target.value)} />
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '12px' }}>
                        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
                        <button type="submit" className="btn btn-primary">{obra ? '💾 Guardar' : '➕ Crear'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default function ObrasView() {
    const { obras, addObra, updateObra, deleteObra, showToast, jornadas, appConfig } = useJornadas();
    const [modal, setModal] = useState(null);
    const [tab, setTab] = useState('activas');
    const [mapaFocoId, setMapaFocoId] = useState(null);

    const obrasActivasList = obras.filter(o => o.activa);
    const obrasInactivasList = obras.filter(o => !o.activa);
    const obrasAMostrar = tab === 'activas' ? obrasActivasList : obrasInactivasList;
    const obrasMapa = mapaFocoId ? obrasActivasList.filter(o => o.id === mapaFocoId) : obrasActivasList;

    function handleSave(form) {
        if (modal && modal.id) { updateObra(modal.id, form); showToast('Obra actualizada'); }
        else { addObra(form); showToast('Obra creada ✅'); }
        setModal(null);
    }

    function countJornadas(obraId) {
        const nombre = obras.find(o => o.id === obraId)?.nombre;
        return jornadas.filter(j => j.obraDetectada === nombre).length;
    }

    return (
        <div>
            <div className="page-header">
                <div>
                    <div className="page-title">Obras y Ubicaciones</div>
                    <div className="page-subtitle">{obrasActivasList.length} ubicaciones activas | {obrasInactivasList.length} eliminadas</div>
                </div>
                <button className="btn btn-primary" onClick={() => setModal('new')}>➕ Nueva Obra</button>
            </div>

            {/* Selector de Pestañas */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <button
                    className={`btn ${tab === 'activas' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setTab('activas')}
                >
                    📍 Obras Activas ({obrasActivasList.length})
                </button>
                <button
                    className={`btn ${tab === 'inactivas' ? '' : 'btn-ghost'}`}
                    style={tab === 'inactivas' ? { background: '#ef4444', color: 'white' } : {}}
                    onClick={() => setTab('inactivas')}
                >
                    🗑️ Papelera ({obrasInactivasList.length})
                </button>
            </div>

            {/* Mapa general de obras */}
            {tab === 'activas' && (
                <div className="glass-card" style={{ padding: '16px', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                        <h3 style={{ fontWeight: '700', fontSize: '15px', margin: 0 }}>
                            {mapaFocoId ? '📍 Ubicación de la Obra' : '📍 Mapa General de Obras'}
                        </h3>
                        {mapaFocoId && (
                            <button className="btn btn-ghost btn-sm" onClick={() => setMapaFocoId(null)}>
                                Mostrar todas
                            </button>
                        )}
                    </div>
                    <MapView obras={obrasMapa} height="320px" appConfig={appConfig} />
                </div>
            )}

            {/* Tabla de obras */}
            <div className="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Nombre</th>
                            <th>Dirección</th>
                            <th>Tipo</th>
                            <th>Radio</th>
                            <th>Jornadas</th>
                            <th style={{ textAlign: 'right' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {obrasAMostrar.length === 0 && (
                            <tr>
                                <td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                                    {tab === 'activas' ? 'Sin obras activas registradas' : 'La papelera está vacía'}
                                </td>
                            </tr>
                        )}
                        {obrasAMostrar.map(obra => {
                            const tipo = TIPOS.find(t => t.v === obra.tipo);
                            return (
                                <tr key={obra.id} style={{ opacity: obra.activa ? 1 : 0.6 }}>
                                    <td>
                                        <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{obra.nombre}</div>
                                        {obra.lat && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>GPS: {obra.lat?.toFixed(4)}, {obra.lng?.toFixed(4)}</div>}
                                    </td>
                                    <td style={{ color: 'var(--text-secondary)' }}>{obra.direccion || '-'}</td>
                                    <td>
                                        <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '12px', background: `${tipo?.c}20`, color: tipo?.c, border: `1px solid ${tipo?.c}` }}>
                                            {tipo?.l || '📍'}
                                        </span>
                                    </td>
                                    <td style={{ color: 'var(--text-secondary)' }}>{obra.radio}m</td>
                                    <td>
                                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: 'rgba(59,130,246,0.15)', color: '#60a5fa', fontWeight: '800' }}>
                                            {countJornadas(obra.id)}
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                            {tab === 'activas' && obra.lat && (
                                                <button
                                                    className="btn btn-primary btn-sm"
                                                    style={{ padding: '4px 8px', fontSize: '11px' }}
                                                    onClick={() => {
                                                        setMapaFocoId(obra.id);
                                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                                    }}
                                                    title="Ver en el mapa"
                                                >
                                                    🗺️ Mapa
                                                </button>
                                            )}
                                            <button className="btn btn-ghost btn-sm" onClick={() => setModal(obra)} title="Editar">✏️</button>
                                            {obra.activa ? (
                                                <button className="btn btn-ghost btn-sm" onClick={() => { deleteObra(obra.id); showToast('Movida a la papelera', 'info'); }} style={{ color: '#ef4444' }} title="Desactivar">🗑️</button>
                                            ) : (
                                                <button className="btn btn-ghost btn-sm" onClick={() => { updateObra(obra.id, { ...obra, activa: true }); showToast('Obra Reactivada', 'info'); }} style={{ color: '#10b981' }} title="Restaurar">♻️</button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {modal && (
                <ModalObra
                    obra={modal === 'new' ? null : modal}
                    onSave={handleSave}
                    onClose={() => setModal(null)}
                />
            )}
        </div>
    );
}
