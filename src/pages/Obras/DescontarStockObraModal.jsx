import React, { useEffect, useMemo, useState } from 'react';
import { PlayCircle, PackageMinus, Loader, FileSignature } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Modal, Alerta, Campo } from '../Ventas/ventasUI';
import { inp } from '../Ventas/ventasHelpers';
import RemitoModal from '../Remitos/RemitoModal';
import {
  ETAPAS, etapaDeObra, cargarItemsStockObra, descontarStockObra, esDescuentoLegacy,
} from '../../services/obraStockService';

const th = { padding: '0.45rem 0.55rem', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' };
const td = { padding: '0.45rem 0.55rem', verticalAlign: 'middle' };

/**
 * Inicio de etapa de obra (descuenta los materiales de esa etapa) o descuento manual de materiales pendientes.
 *   - Obra de cañería → se preseleccionan los materiales PEX.
 *   - Instalación de equipos → se preselecciona el resto (calderas, radiadores, válvulas…).
 * @param {{ obra: object, modo: 'iniciar'|'manual', construirUpdates?: (dias:number)=>object, onClose: Function, onDone?: Function }} props
 */
export default function DescontarStockObraModal({ obra: obraProp, modo = 'iniciar', construirUpdates, onClose, onDone }) {
  const { currentUser } = useAuth();
  // Foto de la obra al abrir: las actualizaciones en vivo de Firestore no deben reiniciar la selección.
  const [obra] = useState(obraProp);
  const etapa = etapaDeObra(obra);
  const legacy = esDescuentoLegacy(obra);
  const [items, setItems] = useState(null);
  const [sel, setSel] = useState({});
  const [dias, setDias] = useState(1);
  const [entregadoPor, setEntregadoPor] = useState(currentUser?.displayName || currentUser?.name || currentUser?.email || '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);
  const [verRemito, setVerRemito] = useState(null);

  useEffect(() => {
    let vivo = true;
    cargarItemsStockObra(obra).then((lst) => {
      if (!vivo) return;
      lst.sort((a, b) => (a.etapa === etapa ? 0 : 1) - (b.etapa === etapa ? 0 : 1));
      setItems(lst);
      setSel(Object.fromEntries(lst.map((x) => [x.itemIndex, x.etapa === etapa && x.pendiente > 0 ? x.pendiente : 0])));
    }).catch((e) => { if (vivo) { setError(e.message); setItems([]); } });
    return () => { vivo = false; };
  }, [obra, etapa]);

  const elegidos = useMemo(() => (items || []).filter((x) => Number(sel[x.itemIndex]) > 0), [items, sel]);

  if (verRemito) return <RemitoModal remito={verRemito} onClose={() => setVerRemito(null)} />;

  const confirmar = async () => {
    setError('');
    const invalido = elegidos.find((x) => Number(sel[x.itemIndex]) > x.pendiente + 0.0001);
    if (invalido) { setError(`"${invalido.descripcion}": no podés descontar más de lo pendiente (${invalido.pendiente}).`); return; }
    setGuardando(true);
    try {
      const n = elegidos.length;
      const texto = modo === 'iniciar'
        ? `${ETAPAS[etapa].label} iniciada — ${n ? `stock descontado (${n} ítem${n > 1 ? 's' : ''})` : 'sin materiales descontados'}. Días estimados: ${parseInt(dias) || 1}`
        : `Stock descontado manualmente (${n} ítem${n > 1 ? 's' : ''}) — ${ETAPAS[etapa].label}`;
      const obraUpdates = modo === 'iniciar' && construirUpdates ? construirUpdates(parseInt(dias) || 1) : {};
      const res = await descontarStockObra({
        obra, etapa, entregadoPor,
        seleccion: elegidos.map((x) => ({ itemIndex: x.itemIndex, cantidad: Number(sel[x.itemIndex]) })),
        obraUpdates,
        bitacora: texto,
      }, currentUser);
      onDone?.(res, obraUpdates);
      if (res.remitos.length) setResultado(res);
      else onClose();
    } catch (e) { setError(e.message); }
    setGuardando(false);
  };

  if (resultado) {
    return (
      <Modal titulo="Stock descontado" subtitulo={obra.name} onClose={onClose} ancho={620}
        pie={<div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn btn-primary" onClick={onClose}>Listo</button></div>}>
        <Alerta tipo="ok">
          {resultado.directos.length > 0 && `${resultado.directos.length} ítem(s) descontados del stock.\n`}
          Parte del material ya estaba facturado con entrega pendiente: se registró la entrega y se generó el remito para la conformidad del cliente.
        </Alerta>
        {resultado.remitos.map((r) => (
          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border-light)', borderRadius: 8, padding: '0.6rem 0.8rem' }}>
            <div style={{ fontSize: '0.85rem' }}><strong>Remito {r.numero}</strong> · {r.items.length} ítem(s) · {r.clienteNombre}</div>
            <button className="btn btn-secondary" style={{ fontSize: '0.78rem', display: 'flex', gap: 6, alignItems: 'center' }} onClick={() => setVerRemito(r)}>
              <FileSignature size={14} /> Conformidad / PDF
            </button>
          </div>
        ))}
      </Modal>
    );
  }

  const titulo = modo === 'iniciar' ? `Iniciar ${ETAPAS[etapa].label.toLowerCase()}` : 'Descontar materiales del stock';
  const Icono = modo === 'iniciar' ? PlayCircle : PackageMinus;

  return (
    <Modal titulo={titulo} subtitulo={obra.name} onClose={onClose} ancho={860}
      pie={(
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{elegidos.length} ítem(s) a descontar</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={onClose} disabled={guardando}>Cancelar</button>
            <button className="btn btn-primary" disabled={guardando || items === null || (modo === 'manual' && !elegidos.length)} onClick={confirmar}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#16a34a', borderColor: '#16a34a' }}>
              {guardando ? <Loader size={15} className="spin" /> : <Icono size={15} />} {modo === 'iniciar' ? 'Confirmar inicio' : 'Descontar'}
            </button>
          </div>
        </div>
      )}>
      {modo === 'iniciar' && (
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Se pasa a <strong>En Proceso</strong> y se descuentan del stock los materiales de esta etapa.{' '}
          {etapa === 'obra'
            ? <>En la <strong>obra de cañería</strong>, al confirmar se abre la <strong>carga de la ingeniería</strong>: los caños, accesorios y piezas reales que salen del depósito. Calderas, radiadores, válvulas, etc. se descuentan al iniciar la instalación de equipos.</>
            : <>En la <strong>instalación de equipos</strong> se descuentan calderas, radiadores, válvulas y el resto de los materiales.</>}
        </div>
      )}
      {legacy && (
        <Alerta tipo="info">Esta obra se inició con el sistema anterior, que ya descontó todo el presupuesto. Por eso no queda nada pendiente de descontar.</Alerta>
      )}

      {items === null ? (
        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}><Loader size={18} className="spin" /> Cargando materiales…</div>
      ) : items.length === 0 ? (
        etapa === 'obra' ? null : <Alerta tipo="info">El presupuesto de esta obra no tiene materiales vinculados al stock.</Alerta>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border-light)', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface-hover, #f8fafc)', color: 'var(--text-secondary)' }}>
                <th style={th}></th>
                <th style={th}>Material</th>
                <th style={th}>Etapa</th>
                <th style={{ ...th, textAlign: 'right' }}>Presup.</th>
                <th style={{ ...th, textAlign: 'right' }}>Ya descontado</th>
                <th style={{ ...th, textAlign: 'right' }}>Stock actual</th>
                <th style={{ ...th, textAlign: 'right', width: 110 }}>Descontar</th>
              </tr>
            </thead>
            <tbody>
              {items.map((x) => {
                const on = Number(sel[x.itemIndex]) > 0;
                const otra = x.etapa !== etapa;
                return (
                  <tr key={x.itemIndex} style={{ borderTop: '1px solid var(--border-light)', opacity: x.pendiente > 0 ? 1 : 0.5, background: on ? '#f0fdf4' : undefined }}>
                    <td style={td}>
                      <input type="checkbox" disabled={x.pendiente <= 0} checked={on}
                        onChange={(e) => setSel({ ...sel, [x.itemIndex]: e.target.checked ? x.pendiente : 0 })} />
                    </td>
                    <td style={td}>
                      {x.descripcion}
                      {x.cubiertoFacturado > 0 && x.pendiente > 0 && (
                        <div style={{ fontSize: '0.7rem', color: '#7c3aed' }}>Facturado con entrega pendiente: se genera remito</div>
                      )}
                    </td>
                    <td style={td}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '2px 7px', borderRadius: 10, whiteSpace: 'nowrap',
                        background: x.etapa === 'obra' ? '#e0f2fe' : '#fef3c7', color: x.etapa === 'obra' ? '#0369a1' : '#92400e' }}>
                        {ETAPAS[x.etapa].corto}
                      </span>
                      {otra && x.pendiente > 0 && <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>otra etapa</div>}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>{x.cantidad} {x.unidad}</td>
                    <td style={{ ...td, textAlign: 'right', color: x.descontado > 0 ? '#166534' : 'var(--text-tertiary)' }}>{x.descontado || '—'}</td>
                    <td style={{ ...td, textAlign: 'right', color: x.stockActual !== null && x.stockActual < x.pendiente ? '#b91c1c' : undefined }}>
                      {x.stockActual ?? '—'}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      {x.pendiente > 0
                        ? <input type="number" min="0" max={x.pendiente} step="any" style={{ ...inp, width: 90, textAlign: 'right' }}
                            value={sel[x.itemIndex] ?? 0} onChange={(e) => setSel({ ...sel, [x.itemIndex]: e.target.value })} />
                        : 'Descontado'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: modo === 'iniciar' ? '1fr 1fr' : '1fr', gap: '0.75rem' }}>
        {modo === 'iniciar' && (
          <Campo label="Días estimados (sin sábados ni domingos)">
            <input type="number" min="1" style={inp} value={dias} onChange={(e) => setDias(e.target.value)} />
          </Campo>
        )}
        <Campo label="Responsable (Euler)">
          <input style={inp} value={entregadoPor} onChange={(e) => setEntregadoPor(e.target.value)} />
        </Campo>
      </div>
      <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
        Podés tildar o destildar cualquier ítem y ajustar cantidades. Cada material se descuenta una sola vez por obra; lo que no descuentes ahora queda pendiente
        (también podés descontarlo después desde la pestaña Materiales).
      </div>
      {error && <Alerta>{error}</Alerta>}
    </Modal>
  );
}
