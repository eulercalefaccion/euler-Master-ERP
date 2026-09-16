import React, { useState } from 'react';
import { useJornadas } from '../../../context/JornadasContext';
import MapView from '../../../components/MapView';
import * as XLSX from 'xlsx';

function ModalMapaJornada({ jornada, onClose }) {
    const { obrasActivas, appConfig, empleados } = useJornadas();
    const emp = empleados.find(e => e.id === jornada.empleadoId);
    const nombre = emp ? `${emp.nombre} ${emp.apellido}` : 'Colaborador';

    const customMarkers = [];
    if (jornada.latIngreso && jornada.lngIngreso) {
        customMarkers.push({
            lat: jornada.latIngreso, lng: jornada.lngIngreso,
            icon: '🟢', color: '#10b981', label: `<b>Inicio de Jornada</b><br>${jornada.horaIngreso}`
        });
    }
    if (jornada.latSalida && jornada.lngSalida) {
        customMarkers.push({
            lat: jornada.latSalida, lng: jornada.lngSalida,
            icon: '🔴', color: '#ef4444', label: `<b>Fin de Jornada</b><br>${jornada.horaSalida}`
        });
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" style={{ width: '90%', maxWidth: '800px' }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 style={{ margin: 0, fontSize: '16px' }}>📍 Ubicación de Jornada</h3>
                    <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
                </div>
                <div style={{ padding: '20px' }}>
                    <div style={{ marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontWeight: '800', fontSize: '15px' }}>{nombre}</div>
                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                {jornada.fechaIngreso} • Ingreso: {jornada.horaIngreso} {jornada.horaSalida ? `• Salida: ${jornada.horaSalida}` : ''}
                            </div>
                        </div>
                        <span style={{ fontSize: '20px' }}>
                            {jornada.semaforo === 'verde' ? '🟢' : jornada.semaforo === 'amarillo' ? '🟡' : '🔴'}
                        </span>
                    </div>

                    <div style={{ marginBottom: '16px', padding: '12px', background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--radius-md)' }}>
                        <span style={{ fontWeight: '700', color: 'var(--text-secondary)' }}>Lugar Registrado:</span> {jornada.obraDetectada || 'Desconocido'}
                        <br />
                        <span style={{ fontWeight: '700', color: 'var(--text-secondary)' }}>Coordenadas:</span> {jornada.latIngreso}, {jornada.lngIngreso}
                    </div>

                    <div style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                        <MapView
                            obras={obrasActivas}
                            appConfig={appConfig}
                            jornadas={[]}
                            customMarkers={customMarkers}
                            height="380px"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function ReportesView() {
    const { jornadas, empleados, empleadosActivos, showToast, deleteJornada, restoreJornada } = useJornadas();
    const [filtroEmps, setFiltroEmps] = useState([]);
    const [filtroEmpOpen, setFiltroEmpOpen] = useState(false);
    const [fechaDesde, setFechaDesde] = useState('');
    const [fechaHasta, setFechaHasta] = useState('');
    const [modalMapa, setModalMapa] = useState(null);
    const [viewVerPapelera, setViewVerPapelera] = useState(false);

    function padZ(n) { return String(n).padStart(2, '0'); }

    function calcHoras(ingreso, salida) {
        if (!ingreso || !salida) return '-';
        const [hi, mi] = ingreso.split(':').map(Number);
        const [hs, ms] = salida.split(':').map(Number);
        let t = (hs * 60 + ms) - (hi * 60 + mi);
        if (t < 0) t += 1440;
        if (t <= 0) return '-';
        return `${padZ(Math.floor(t / 60))}h ${padZ(t % 60)}m`;
    }

    const filtradas = jornadas.filter(j => {
        if (viewVerPapelera ? !j.eliminada : j.eliminada) return false;
        if (filtroEmps.length > 0 && !filtroEmps.includes(j.empleadoId)) return false;
        if (fechaDesde && j.fechaIngreso < fechaDesde) return false;
        if (fechaHasta && j.fechaIngreso > fechaHasta) return false;
        return true;
    }).sort((a, b) => (b.fechaIngreso + (b.horaIngreso || '')).localeCompare(a.fechaIngreso + (a.horaIngreso || '')));

    const totalJornadas = filtradas.length;
    let totalMinutos = 0;
    let totalBocas = 0;

    filtradas.forEach(j => {
        if (j.horaIngreso && j.horaSalida) {
            const [hi, mi] = j.horaIngreso.split(':').map(Number);
            const [hs, ms] = j.horaSalida.split(':').map(Number);
            let m = (hs * 60 + ms) - (hi * 60 + mi);
            if (m < 0) m += 1440;
            if (m > 0) totalMinutos += m;
        }
        if (j.metodoPago === 'produccion' && j.produccionFinalizada) {
            totalBocas += Number(j.cantidadBocas) || 0;
        }
    });

    const totalHoras = totalMinutos > 0 ? `${padZ(Math.floor(totalMinutos / 60))}h ${padZ(totalMinutos % 60)}m` : '0h 00m';

    function exportarExcel() {
        const rows = filtradas.map(j => {
            const emp = empleados.find(e => e.id === j.empleadoId);
            return {
                'Colaborador': emp ? `${emp.nombre} ${emp.apellido}` : j.empleadoId,
                'DNI': emp?.dni || '-',
                'Fecha': j.fechaIngreso || '-',
                'Hora Ingreso': j.horaIngreso || '-',
                'Hora Salida': j.horaSalida || '-',
                'Total Horas': calcHoras(j.horaIngreso, j.horaSalida),
                'Obra / Lugar': j.obraDetectada || '-',
                'Semáforo': j.semaforo || '-',
                'Estado': j.estado || '-',
                'Método Pago': j.metodoPago || 'hora',
                'Bocas': j.metodoPago === 'produccion' ? (j.cantidadBocas || '-') : '-',
            };
        });
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Jornadas');
        XLSX.writeFile(wb, `Euler_Reporte_Jornadas_${new Date().toISOString().slice(0, 10)}.xlsx`);
    }

    return (
        <div>
            <div className="page-header">
                <div>
                    <div className="page-title">Reportes y Exportación</div>
                    <div className="page-subtitle">{totalJornadas} jornadas encontradas</div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        className="btn btn-primary btn-sm"
                        onClick={exportarExcel}
                        disabled={filtradas.length === 0}
                    >
                        📊 Exportar a Excel
                    </button>
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setViewVerPapelera(!viewVerPapelera)}
                        style={viewVerPapelera ? { color: '#ef4444' } : {}}
                    >
                        {viewVerPapelera ? '📋 Ver Activas' : '🗑️ Papelera'}
                    </button>
                </div>
            </div>

            {/* Filtros */}
            <div className="glass-card" style={{ padding: '16px 20px', marginBottom: '24px', position: 'relative', zIndex: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                    <div className="form-group" style={{ position: 'relative', margin: 0 }}>
                        <label className="form-label">Colaboradores ({filtroEmps.length === 0 ? 'Todos' : filtroEmps.length})</label>
                        <div
                            className="form-input"
                            style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            onClick={() => setFiltroEmpOpen(!filtroEmpOpen)}
                        >
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {filtroEmps.length === 0 ? 'Todos seleccionados' : `${filtroEmps.length} seleccionados`}
                            </span>
                            <span style={{ fontSize: '12px' }}>▼</span>
                        </div>
                        {filtroEmpOpen && (
                            <div style={{
                                position: 'absolute', top: '100%', left: 0, right: 0,
                                background: 'var(--bg-deep)', border: '1px solid var(--border-bright)',
                                borderRadius: 'var(--radius-md)', padding: '8px',
                                marginTop: '4px', zIndex: 100, maxHeight: '250px', overflowY: 'auto',
                                boxShadow: '0 10px 40px rgba(0,0,0,0.8)'
                            }}>
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--border)' }}>
                                    <button className="btn btn-ghost btn-sm" style={{ flex: 1, fontSize: '11px' }} onClick={() => setFiltroEmps(empleadosActivos.map(e => e.id))}>Todos</button>
                                    <button className="btn btn-ghost btn-sm" style={{ flex: 1, fontSize: '11px' }} onClick={() => setFiltroEmps([])}>Ninguno</button>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {empleadosActivos.map(e => (
                                        <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', cursor: 'pointer', borderRadius: '4px' }}>
                                            <input
                                                type="checkbox"
                                                style={{ width: '16px', height: '16px', margin: 0 }}
                                                checked={filtroEmps.includes(e.id)}
                                                onChange={(ev) => {
                                                    if (ev.target.checked) setFiltroEmps(prev => [...prev, e.id]);
                                                    else setFiltroEmps(prev => prev.filter(id => id !== e.id));
                                                }}
                                            />
                                            <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{e.nombre} {e.apellido}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Fecha Desde</label>
                        <input type="date" className="form-input" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Fecha Hasta</label>
                        <input type="date" className="form-input" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} />
                    </div>
                </div>
            </div>

            {/* Resumen */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                <div className="glass-card" style={{ padding: '18px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ fontSize: '32px' }}>📋</div>
                    <div>
                        <div style={{ fontSize: '22px', fontWeight: '900', color: '#3b82f6', lineHeight: 1, marginBottom: '4px' }}>{totalJornadas}</div>
                        <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Jornadas</div>
                    </div>
                </div>
                <div className="glass-card" style={{ padding: '18px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ fontSize: '32px' }}>⏱️</div>
                    <div>
                        <div style={{ fontSize: '22px', fontWeight: '900', color: '#10b981', lineHeight: 1, marginBottom: '4px' }}>{totalHoras}</div>
                        <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Horas Totales</div>
                    </div>
                </div>
                <div className="glass-card" style={{ padding: '18px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ fontSize: '32px' }}>🔧</div>
                    <div>
                        <div style={{ fontSize: '22px', fontWeight: '900', color: '#f59e0b', lineHeight: 1, marginBottom: '4px' }}>{totalBocas}</div>
                        <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Bocas Producidas</div>
                    </div>
                </div>
            </div>

            {/* Tabla */}
            <div className="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Colaborador</th>
                            <th>Fecha</th>
                            <th>Ingreso</th>
                            <th>Salida</th>
                            <th>Horas</th>
                            <th>Modalidad</th>
                            <th>Lugar / Obra</th>
                            <th>Sem.</th>
                            <th>Estado</th>
                            <th style={{ textAlign: 'right' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtradas.length === 0 && (
                            <tr><td colSpan={10} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>Sin jornadas encontradas</td></tr>
                        )}
                        {filtradas.map(j => {
                            const emp = empleados.find(e => e.id === j.empleadoId);
                            const horas = calcHoras(j.horaIngreso, j.horaSalida);
                            const semColors = { verde: '#10b981', amarillo: '#f59e0b', rojo: '#ef4444' };
                            return (
                                <tr key={j.id}>
                                    <td style={{ fontWeight: '600' }}>{emp ? `${emp.nombre} ${emp.apellido}` : j.empleadoId}</td>
                                    <td>{j.fechaIngreso}</td>
                                    <td>{j.horaIngreso || '-'}</td>
                                    <td>{j.horaSalida || '-'}</td>
                                    <td style={{ fontWeight: '700', color: '#10b981' }}>{horas}</td>
                                    <td>
                                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: j.metodoPago === 'produccion' ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.15)', color: j.metodoPago === 'produccion' ? '#f59e0b' : '#3b82f6' }}>
                                            {j.metodoPago === 'produccion' ? `Bocas (${j.cantidadBocas || 0})` : 'Por Hora'}
                                        </span>
                                    </td>
                                    <td style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {j.obraDetectada || 'Desconocido'}
                                    </td>
                                    <td>
                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: semColors[j.semaforo] || '#6b7280' }} />
                                    </td>
                                    <td>
                                        <span style={{ fontSize: '11px', fontWeight: '700', color: j.estado === 'abierta' ? '#10b981' : '#6b7280' }}>
                                            {j.estado === 'abierta' ? 'Activa' : 'Cerrada'}
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                            {(j.latIngreso || j.latSalida) && (
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => setModalMapa(j)}
                                                    title="Ver en el mapa"
                                                >
                                                    🗺️
                                                </button>
                                            )}
                                            {!j.eliminada ? (
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => { deleteJornada(j.id); showToast('Movida a papelera', 'info'); }}
                                                    style={{ color: '#ef4444' }}
                                                    title="Eliminar"
                                                >
                                                    🗑️
                                                </button>
                                            ) : (
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => { restoreJornada(j.id); showToast('Jornada restaurada', 'success'); }}
                                                    style={{ color: '#10b981' }}
                                                    title="Restaurar"
                                                >
                                                    ♻️
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {modalMapa && <ModalMapaJornada jornada={modalMapa} onClose={() => setModalMapa(null)} />}
        </div>
    );
}
