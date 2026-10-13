import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { Search, X, FileSignature, Clock, CheckCircle, FileSpreadsheet } from 'lucide-react';
import { db } from '../../services/firebaseConfig';
import { COL_REMITOS } from '../../services/remitosService';
import { METODO_FIRMA } from '../../services/pdfRemito';
import { normalizarNombre } from '../../services/ventasCalculo';
import { fechaAR, exportarExcel } from '../../services/listadosService';
import { KpiCard, EmpresaBadge, Pill } from '../Listados/listadosUI';
import { cellPad, inputSt } from '../Listados/listadosHelpers';
import { diasDesde, thSt } from '../Ventas/ventasHelpers';
import { Seg } from '../Ventas/ventasUI';
import RemitoModal, { EstadoFirmaPill } from './RemitoModal';

const num = (n) => Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });
const th = (h, right) => <th key={h} style={{ ...cellPad, textAlign: right ? 'right' : 'left', fontWeight: 600, fontSize: '0.72rem', whiteSpace: 'nowrap' }}>{h}</th>;

/** Listado de remitos de entrega con su estado de conformidad. */
export default function RemitosLista({ verPruebas = false }) {
  const [remitos, setRemitos] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState('todos'); // todos | pendiente | firmado | anulado
  const [abierto, setAbierto] = useState(null);

  useEffect(() => onSnapshot(collection(db, COL_REMITOS), (s) => setRemitos(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {}), []);

  const base = useMemo(() => remitos.filter((r) => verPruebas || !r.prueba), [remitos, verPruebas]);
  const filtrados = useMemo(() => {
    const t = normalizarNombre(busqueda);
    return base.filter((r) => {
      if (filtro === 'pendiente' && (r.estado === 'anulado' || r.estadoFirma === 'firmado')) return false;
      if (filtro === 'firmado' && (r.estado === 'anulado' || r.estadoFirma !== 'firmado')) return false;
      if (filtro === 'anulado' && r.estado !== 'anulado') return false;
      if (!t) return true;
      return normalizarNombre([r.numero, r.clienteNombre, r.comprobanteNumero, r.entregadoPor, ...(r.items || []).map((i) => i.descripcion)].join(' ')).includes(t);
    }).sort((a, b) => String(b.numero).localeCompare(String(a.numero)) || String(b.fecha).localeCompare(String(a.fecha)));
  }, [base, filtro, busqueda]);

  const vig = base.filter((r) => r.estado !== 'anulado');
  const pend = vig.filter((r) => r.estadoFirma !== 'firmado');
  const viejos = pend.filter((r) => diasDesde(r.fecha) > 7);

  const exportar = () => exportarExcel(filtrados, [
    { titulo: 'Remito', valor: (r) => r.numero, ancho: 18 },
    { titulo: 'Fecha', valor: (r) => fechaAR(r.fecha), ancho: 11 },
    { titulo: 'Empresa', valor: (r) => r.emisor?.razonSocial || r.empresaId, ancho: 24 },
    { titulo: 'Cliente', valor: (r) => r.clienteNombre, ancho: 32 },
    { titulo: 'Referencia', valor: (r) => r.comprobanteNumero || '', ancho: 22 },
    { titulo: 'Materiales', valor: (r) => (r.items || []).map((i) => `${num(i.cantidad)} ${i.unidad || ''} ${i.descripcion}`).join(' | '), ancho: 60 },
    { titulo: 'Entregó', valor: (r) => r.entregadoPor || '', ancho: 20 },
    { titulo: 'Estado', valor: (r) => (r.estado === 'anulado' ? 'Anulado' : r.estadoFirma === 'firmado' ? 'Firmado' : 'Pendiente de firma'), ancho: 16 },
    { titulo: 'Firmó', valor: (r) => (r.firma ? `${r.firma.nombre || ''}${r.firma.dni ? ` DNI ${r.firma.dni}` : ''}` : ''), ancho: 26 },
    { titulo: 'Método', valor: (r) => (r.firma ? METODO_FIRMA[r.firma.metodo] || '' : ''), ancho: 30 },
  ], `Remitos_${new Date().toISOString().slice(0, 10)}.xlsx`, 'Remitos');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0.25rem 0' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
        <KpiCard titulo="Remitos emitidos" valor={String(vig.length)} color="#0D2A4E" icono={<FileSignature size={18} />} detalle={`${vig.filter((r) => r.estadoFirma === 'firmado').length} con conformidad`} />
        <div onClick={() => setFiltro('pendiente')} style={{ cursor: 'pointer' }}>
          <KpiCard titulo="Pendientes de firma" valor={String(pend.length)} color={pend.length ? '#b45309' : '#047857'} icono={<Clock size={18} />} detalle={viejos.length ? `${viejos.length} con más de 7 días` : 'Al día'} />
        </div>
        <div onClick={() => setFiltro('firmado')} style={{ cursor: 'pointer' }}>
          <KpiCard titulo="Firmados" valor={String(vig.length - pend.length)} color="#047857" icono={<CheckCircle size={18} />}
            detalle={`${vig.filter((r) => r.firma?.metodo === 'link').length} por link · ${vig.filter((r) => r.firma?.metodo === 'presencial').length} en dispositivo · ${vig.filter((r) => r.firma?.metodo === 'papel').length} papel`} />
        </div>
      </div>

      <div className="card" style={{ padding: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input style={{ ...inputSt, width: '100%', paddingLeft: 32, boxSizing: 'border-box' }} placeholder="Buscar remito, cliente, material…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          {busqueda && <button onClick={() => setBusqueda('')} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><X size={14} /></button>}
        </div>
        <Seg opciones={[['todos', 'Todos'], ['pendiente', 'Pendientes de firma'], ['firmado', 'Firmados'], ['anulado', 'Anulados']]} valor={filtro} onChange={setFiltro} />
        <button className="btn btn-secondary" onClick={exportar} disabled={!filtrados.length} style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}><FileSpreadsheet size={15} /> Excel</button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          {filtrados.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No hay remitos{busqueda || filtro !== 'todos' ? ' para los filtros elegidos' : ''}.
              <div style={{ fontSize: '0.78rem', marginTop: 6 }}>Se generan al facturar materiales que se entregan en el momento y al registrar entregas de materiales pendientes.</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
              <thead><tr style={thSt}>{th('Remito')}{th('Fecha')}{th('Cliente')}{th('Referencia')}{th('Materiales')}{th('Entregó')}{th('Conformidad')}</tr></thead>
              <tbody>
                {filtrados.map((r) => (
                  <tr key={r.id} onClick={() => setAbierto(r)} style={{ borderTop: '1px solid var(--border-light)', cursor: 'pointer', opacity: r.estado === 'anulado' ? 0.55 : 1, background: r.prueba ? 'rgba(254, 226, 226, 0.18)' : undefined }}>
                    <td style={{ ...cellPad, whiteSpace: 'nowrap', fontWeight: 700 }}>{r.numero}</td>
                    <td style={{ ...cellPad, whiteSpace: 'nowrap' }}>{fechaAR(r.fecha)}</td>
                    <td style={cellPad}><div style={{ fontWeight: 600 }}>{r.clienteNombre}</div><div style={{ display: 'flex', gap: 4, marginTop: 2 }}><EmpresaBadge empresaId={r.empresaId} />{r.prueba && <Pill texto="PRUEBA" color="#b91c1c" bg="#fee2e2" />}</div></td>
                    <td style={{ ...cellPad, whiteSpace: 'nowrap', fontSize: '0.78rem' }}>{r.comprobanteNumero || '—'}<div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{r.origen === 'factura' ? 'Entrega en la venta' : 'Entrega pendiente'}</div></td>
                    <td style={{ ...cellPad, maxWidth: 360, fontSize: '0.76rem' }}>{(r.items || []).slice(0, 3).map((i) => `${num(i.cantidad)} × ${i.descripcion}`).join(' · ')}{(r.items || []).length > 3 ? ` · +${r.items.length - 3} más` : ''}</td>
                    <td style={{ ...cellPad, fontSize: '0.76rem' }}>{r.entregadoPor || '—'}</td>
                    <td style={{ ...cellPad, whiteSpace: 'nowrap' }}><EstadoFirmaPill rem={r} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {abierto && <RemitoModal remito={abierto} onClose={() => setAbierto(null)} />}
    </div>
  );
}
