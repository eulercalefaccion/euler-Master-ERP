import React, { useEffect, useMemo, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { Wrench, PackageMinus, PackagePlus, Ban, FileSpreadsheet } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { consumosDeObraQuery, resumenConsumos, anularConsumo, TIPOS_MOV } from '../../services/consumosObraService';
import ConsumoModal from './ConsumoModal';

const th = { padding: '0.5rem 0.65rem', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border-light)' };
const td = { padding: '0.5rem 0.65rem', borderBottom: '1px solid var(--border-light)' };
const fmtFecha = (f) => (f ? f.split('-').reverse().join('/') : '');

/** Consumo real de caños y piezas de la obra: ingeniería, salidas adicionales, devoluciones y balance. */
export default function ConsumosObraPanel({ obra, abrirIngenieria = false, onIngenieriaAbierta }) {
  const { currentUser } = useAuth();
  const [consumos, setConsumos] = useState([]);
  const [modal, setModal] = useState(null); // { tipo, ingenieria }
  const [verHistorial, setVerHistorial] = useState(false);

  useEffect(() => {
    if (!obra?.id) return undefined;
    return onSnapshot(consumosDeObraQuery(obra.id), (s) => {
      setConsumos(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    });
  }, [obra?.id]);

  useEffect(() => {
    if (abrirIngenieria) {
      // Pedido externo (al iniciar la obra de cañería): abre la carga de ingeniería una sola vez.
      setModal({ tipo: 'salida', ingenieria: true });
      onIngenieriaAbierta?.();
    }
  }, [abrirIngenieria, onIngenieriaAbierta]);

  const resumen = useMemo(() => resumenConsumos(consumos), [consumos]);
  const hayIngenieria = consumos.some((c) => c.estado === 'vigente' && c.ingenieria);

  const anular = async (c) => {
    const motivo = window.prompt(`Anular "${TIPOS_MOV[c.tipo].label}" del ${fmtFecha(c.fecha)}. El stock se revierte.\nMotivo:`);
    if (motivo === null) return;
    try { await anularConsumo(c, motivo, currentUser); } catch (e) { alert(e.message); }
  };

  const exportar = async () => {
    const XLSX = await import('xlsx');
    const filas = resumen.map((r) => ({ Material: r.descripcion, Unidad: r.unidad, Ingenieria: r.ingenieria, 'Salidas adicionales': r.salidas, Devoluciones: r.devoluciones, 'Consumo neto': r.neto, 'Diferencia vs ingenieria': r.diferencia }));
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Consumo');
    XLSX.writeFile(wb, `Consumo_${obra.otNumber || obra.id}.xlsx`);
  };

  const btn = { fontSize: '0.78rem', padding: '0.35rem 0.7rem', display: 'flex', alignItems: 'center', gap: 5 };

  return (
    <div style={{ border: '1px solid var(--border-light)', borderRadius: 10, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 6 }}><Wrench size={16} /> Consumo de caños y piezas</div>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: 2 }}>
            Material real que sale del depósito para esta obra (la cañería se presupuesta y factura como ítem global).
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className={`btn ${hayIngenieria ? 'btn-secondary' : 'btn-primary'}`} style={btn} onClick={() => setModal({ tipo: 'salida', ingenieria: true })}>
            <Wrench size={14} /> {hayIngenieria ? 'Agregar a ingeniería' : 'Cargar ingeniería'}
          </button>
          <button className="btn btn-secondary" style={btn} onClick={() => setModal({ tipo: 'salida', ingenieria: false })}><PackageMinus size={14} /> Salida adicional</button>
          <button className="btn btn-secondary" style={btn} onClick={() => setModal({ tipo: 'devolucion', ingenieria: false })}><PackagePlus size={14} /> Devolución</button>
          {resumen.length > 0 && <button className="btn btn-secondary" style={btn} onClick={exportar}><FileSpreadsheet size={14} /> Excel</button>}
        </div>
      </div>

      {resumen.length === 0 ? (
        <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-tertiary)', border: '1px dashed var(--border-light)', borderRadius: 8 }}>
          Todavía no se descargaron caños ni piezas para esta obra. Empezá por <b>Cargar ingeniería</b>.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface-hover)' }}>
                <th style={th}>Material</th>
                <th style={{ ...th, textAlign: 'right' }}>Ingeniería</th>
                <th style={{ ...th, textAlign: 'right' }}>Salidas adic.</th>
                <th style={{ ...th, textAlign: 'right' }}>Devoluciones</th>
                <th style={{ ...th, textAlign: 'right' }}>Consumo neto</th>
                <th style={{ ...th, textAlign: 'right' }}>Dif. vs ingeniería</th>
              </tr>
            </thead>
            <tbody>
              {resumen.map((r) => (
                <tr key={r.listaItemId}>
                  <td style={td}>{r.descripcion} <span style={{ color: 'var(--text-tertiary)', fontSize: '0.72rem' }}>{r.unidad}</span></td>
                  <td style={{ ...td, textAlign: 'right' }}>{r.ingenieria || '—'}</td>
                  <td style={{ ...td, textAlign: 'right', color: r.salidas ? '#b45309' : 'var(--text-tertiary)' }}>{r.salidas || '—'}</td>
                  <td style={{ ...td, textAlign: 'right', color: r.devoluciones ? '#0369a1' : 'var(--text-tertiary)' }}>{r.devoluciones || '—'}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{r.neto}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: r.diferencia > 0 ? '#b91c1c' : r.diferencia < 0 ? '#166534' : 'var(--text-tertiary)' }}>
                    {r.diferencia > 0 ? `+${r.diferencia}` : r.diferencia || '0'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {consumos.length > 0 && (
        <div>
          <button onClick={() => setVerHistorial(!verHistorial)} style={{ background: 'none', border: 'none', color: 'var(--primary-600)', cursor: 'pointer', fontSize: '0.78rem', padding: 0 }}>
            {verHistorial ? 'Ocultar movimientos' : `Ver movimientos (${consumos.length})`}
          </button>
          {verHistorial && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {consumos.map((c) => (
                <div key={c.id} style={{ border: '1px solid var(--border-light)', borderRadius: 8, padding: '0.5rem 0.7rem', fontSize: '0.78rem', opacity: c.estado === 'anulado' ? 0.55 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <b style={{ color: c.tipo === 'devolucion' ? '#0369a1' : c.ingenieria ? '#7c3aed' : '#b45309' }}>
                        {c.ingenieria ? 'Ingeniería' : TIPOS_MOV[c.tipo].label}
                      </b>
                      {' · '}{fmtFecha(c.fecha)} · {c.responsable}{c.nota ? ` · ${c.nota}` : ''}
                      {c.estado === 'anulado' && <span style={{ color: '#b91c1c', fontWeight: 700 }}> · ANULADO{c.motivoAnulacion ? ` (${c.motivoAnulacion})` : ''}</span>}
                    </div>
                    {c.estado === 'vigente' && (
                      <button onClick={() => anular(c)} title="Anular (revierte el stock)" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.72rem' }}>
                        <Ban size={13} /> Anular
                      </button>
                    )}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>
                    {(c.items || []).map((it) => `${it.descripcion} × ${it.cantidad}`).join(' · ')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {modal && (
        <ConsumoModal obra={obra} tipo={modal.tipo} ingenieria={modal.ingenieria} resumen={resumen} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
