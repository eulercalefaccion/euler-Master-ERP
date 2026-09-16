import React, { useState } from 'react';
import { useJornadas } from '../../../context/JornadasContext';
import * as XLSX from 'xlsx';

function formatPesosG(n) {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n || 0);
}

export default function GastosView() {
    const { gastos, empleados, empleadosActivos, deleteGasto, showToast } = useJornadas();
    const [confirmDelete, setConfirmDelete] = useState(null);

    // Filtros
    const [filtroEmps, setFiltroEmps] = useState([]);
    const [filtroEmpOpen, setFiltroEmpOpen] = useState(false);
    const [fechaDesde, setFechaDesde] = useState('');
    const [fechaHasta, setFechaHasta] = useState('');
    const [imagenAmpliada, setImagenAmpliada] = useState(null);

    const filtrados = gastos.filter(g => {
        if (filtroEmps.length > 0 && !filtroEmps.includes(g.empleadoId)) return false;
        if (fechaDesde && g.fecha < fechaDesde) return false;
        if (fechaHasta && g.fecha > fechaHasta) return false;
        return true;
    }).sort((a, b) => (b.creadoEn || 0) - (a.creadoEn || 0));

    const totalFiltrado = filtrados.reduce((acc, g) => acc + (g.monto || 0), 0);

    async function confirmarDelete() {
        if (!confirmDelete) return;
        await deleteGasto(confirmDelete.id);
        showToast('Gasto eliminado', 'info');
        setConfirmDelete(null);
    }

    function exportarExcel() {
        const rows = filtrados.map(g => {
            const emp = empleados.find(e => e.id === g.empleadoId);
            return {
                'Colaborador': emp ? `${emp.nombre} ${emp.apellido}` : (g.empleadoNombre || g.empleadoId),
                'DNI': emp?.dni || '-',
                'Fecha': g.fecha || '-',
                'Descripción': g.descripcion || '-',
                'Monto': g.monto || 0,
                'Comprobante': g.archivoUrl || '-'
            };
        });
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Gastos');
        XLSX.writeFile(wb, `Euler_Gastos_${new Date().toISOString().slice(0, 10)}.xlsx`);
    }

    return (
        <div>
            <div className="page-header">
                <div>
                    <div className="page-title">Gastos</div>
                    <div className="page-subtitle">{gastos.length} gasto{gastos.length !== 1 && 's'} registrado{gastos.length !== 1 && 's'}</div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={exportarExcel}
                        disabled={filtrados.length === 0}
                        title="Exportar gastos filtrados a Excel"
                    >📊 Excel</button>
                </div>
            </div>

            {/* Modal de confirmación de borrado */}
            {confirmDelete && (
                <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px', width: '90%' }}>
                        <div className="modal-header">
                            <h2 style={{ margin: 0, fontSize: '16px' }}>🗑️ Eliminar Gasto</h2>
                            <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(null)}>✕</button>
                        </div>
                        <div style={{ padding: '20px' }}>
                            <p style={{ marginBottom: '12px', color: 'var(--text-secondary)' }}>¿Estás seguro que querés eliminar este gasto?</p>
                            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-md)', padding: '14px', marginBottom: '20px' }}>
                                <div style={{ fontWeight: '700' }}>{confirmDelete.descripcion}</div>
                                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{confirmDelete.empleadoNombre} · {formatPesosG(confirmDelete.monto)}</div>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Cancelar</button>
                                <button className="btn btn-primary" style={{ background: 'var(--grad-danger)' }} onClick={confirmarDelete}>Eliminar</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Filtros */}
            <div className="glass-card" style={{ padding: '16px 20px', marginBottom: '24px', position: 'relative', zIndex: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                    {/* Multi-select colaboradores */}
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
                                        <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', cursor: 'pointer', borderRadius: '4px', background: filtroEmps.includes(e.id) ? 'rgba(59,130,246,0.1)' : 'transparent' }}>
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
                        <label className="form-label">Desde</label>
                        <input type="date" className="form-input" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Hasta</label>
                        <input type="date" className="form-input" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} />
                    </div>
                </div>
            </div>

            {/* Stat cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                <div className="glass-card" style={{ padding: '18px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ fontSize: '32px' }}>📋</div>
                    <div>
                        <div style={{ fontSize: '22px', fontWeight: '900', color: '#3b82f6', lineHeight: 1, marginBottom: '4px' }}>{filtrados.length}</div>
                        <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Gastos (filtro)</div>
                    </div>
                </div>
                <div className="glass-card" style={{ padding: '18px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ fontSize: '32px' }}>💸</div>
                    <div>
                        <div style={{ fontSize: '22px', fontWeight: '900', color: '#f59e0b', lineHeight: 1, marginBottom: '4px' }}>{formatPesosG(totalFiltrado)}</div>
                        <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Total Filtrado</div>
                    </div>
                </div>
                <div className="glass-card" style={{ padding: '18px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ fontSize: '32px' }}>🏷️</div>
                    <div>
                        <div style={{ fontSize: '22px', fontWeight: '900', color: '#10b981', lineHeight: 1, marginBottom: '4px' }}>{formatPesosG(gastos.reduce((a, g) => a + (g.monto || 0), 0))}</div>
                        <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Total General</div>
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
                            <th>Descripción</th>
                            <th style={{ textAlign: 'right' }}>Monto</th>
                            <th style={{ textAlign: 'center' }}>Comprobante</th>
                            <th style={{ textAlign: 'right' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtrados.length === 0 && (
                            <tr><td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>Sin gastos registrados</td></tr>
                        )}
                        {filtrados.map(g => {
                            const emp = empleados.find(e => e.id === g.empleadoId);
                            return (
                                <tr key={g.id}>
                                    <td style={{ fontWeight: '600' }}>
                                        {emp ? `${emp.nombre} ${emp.apellido}` : (g.empleadoNombre || g.empleadoId)}
                                    </td>
                                    <td style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                        {g.fecha || '-'}
                                    </td>
                                    <td style={{ maxWidth: '240px' }}>
                                        <div style={{ fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={g.descripcion}>
                                            {g.descripcion}
                                        </div>
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: '800', color: '#f59e0b', whiteSpace: 'nowrap' }}>
                                        {formatPesosG(g.monto)}
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        {g.archivoUrl ? (
                                            <button
                                                onClick={() => setImagenAmpliada(g)}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                                title="Ver comprobante"
                                            >
                                                <img
                                                    src={g.archivoUrl}
                                                    alt="Comprobante"
                                                    style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}
                                                />
                                            </button>
                                        ) : (
                                            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>
                                        )}
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            style={{ padding: '4px 8px', fontSize: '12px', color: '#ef4444' }}
                                            onClick={() => setConfirmDelete(g)}
                                            title="Eliminar gasto"
                                        >
                                            🗑️
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Modal imagen ampliada */}
            {imagenAmpliada && (
                <div
                    className="modal-overlay"
                    onClick={() => setImagenAmpliada(null)}
                >
                    <div
                        style={{ maxWidth: '90vw', maxHeight: '90vh', background: 'var(--bg-deep)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', padding: '16px', border: '1px solid var(--border-bright)' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <div>
                                <div style={{ fontWeight: '700', fontSize: '15px' }}>{imagenAmpliada.descripcion}</div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                    {imagenAmpliada.fecha} · {formatPesosG(imagenAmpliada.monto)}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <a href={imagenAmpliada.archivoUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">🔗 Abrir</a>
                                <button className="btn btn-ghost btn-sm" onClick={() => setImagenAmpliada(null)}>✕</button>
                            </div>
                        </div>
                        <img
                            src={imagenAmpliada.archivoUrl}
                            alt="Comprobante"
                            style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 'var(--radius-md)' }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
