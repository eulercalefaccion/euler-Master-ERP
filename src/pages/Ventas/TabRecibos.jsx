import React, { useMemo, useState } from 'react';
import { Download, MessageCircle, Ban, FileSpreadsheet, Wallet, Landmark, CreditCard, Banknote } from 'lucide-react';
import { generarPDFRecibo } from '../../services/pdfRecibo';
import { MEDIOS_COBRO, detalleMedio } from '../../services/ventasCalculo';
import { EMPRESAS_LISTADO, rangoPeriodo, enRango, ars, fechaAR, abrirWhatsApp, exportarExcel } from '../../services/listadosService';
import { KpiCard, Pill, EmpresaBadge, SortTh, IconBtn, BarraFiltros } from '../Listados/listadosUI';
import { ordenar, cellPad, inputSt } from '../Listados/listadosHelpers';
import { thSt, emisorDe } from './ventasHelpers';

const dineroDe = (r) => Number(r.totalRecibo || 0) - Number(r.saldoFavorUsado || 0);

export default function TabRecibos({ recibos, arcaCfg, ventasCfg, cartera, verPruebas, setVerPruebas, onAnular, onNuevoRecibo }) {
  const [busqueda, setBusqueda] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [periodo, setPeriodo] = useState('mes');
  const [custom, setCustom] = useState({});
  const [medio, setMedio] = useState('');
  const [verAnulados, setVerAnulados] = useState(false);
  const [orden, setOrden] = useState({ campo: 'fecha', dir: 'desc' });

  const [desde, hasta] = rangoPeriodo(periodo, custom);
  const filtrados = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    const f = recibos.filter((r) => {
      if (!verAnulados && r.estado === 'anulado') return false;
      if (empresa && (r.empresaId || 'ayala-nicolas') !== empresa) return false;
      if (!enRango(r.fechaEmision, [desde, hasta])) return false;
      if (medio && !(r.mediosPago || []).some((m) => m.tipo === medio)) return false;
      if (!t) return true;
      return [r.clienteNombre, r.clienteCuit, r.numeroOriginal, r.notas, ...(r.imputaciones || []).map((i) => i.numeroOriginal), ...(r.mediosPago || []).map(detalleMedio)]
        .some((v) => String(v || '').toLowerCase().includes(t));
    });
    return ordenar(f, orden, {
      fecha: (r) => `${r.fechaEmision || ''}${r.numeroOriginal || ''}`,
      numero: (r) => r.numeroOriginal,
      cliente: (r) => r.clienteNombre,
      empresa: (r) => r.empresaId,
      total: (r) => Number(r.totalRecibo || 0),
    });
  }, [recibos, verAnulados, empresa, desde, hasta, medio, busqueda, orden]);

  const kpi = useMemo(() => {
    const k = { cobrado: 0, cant: 0, porMedio: {}, porEmpresa: {}, aCuenta: 0 };
    filtrados.forEach((r) => {
      if (r.estado === 'anulado') return;
      k.cant += 1;
      k.cobrado += dineroDe(r);
      k.aCuenta += Number(r.aCuenta || 0);
      const emp = r.empresaId || 'ayala-nicolas';
      k.porEmpresa[emp] = (k.porEmpresa[emp] || 0) + dineroDe(r);
      (r.mediosPago || []).forEach((m) => {
        if (m.tipo === 'saldo_favor') return;
        k.porMedio[m.tipo] = (k.porMedio[m.tipo] || 0) + Number(m.importe || 0);
      });
    });
    return k;
  }, [filtrados]);

  const chequesCartera = useMemo(() => {
    let total = 0; let cant = 0;
    recibos.forEach((r) => {
      if (r.estado === 'anulado') return;
      (r.mediosPago || []).forEach((m) => {
        if ((m.tipo === 'cheque' || m.tipo === 'echeq') && (!m.fechaPago || m.fechaPago >= new Date().toISOString().slice(0, 10))) { total += Number(m.importe || 0); cant += 1; }
      });
    });
    return { total, cant };
  }, [recibos]);

  const telDe = (r) => r.clienteTelefono || cartera.cuentas[cartera.claveDe(r)]?.telefono || '';
  const pdf = (r) => generarPDFRecibo(r, emisorDe(r.empresaId, arcaCfg, ventasCfg)).catch((e) => alert(`No se pudo generar el PDF: ${e.message}`));
  const whatsapp = (r) => abrirWhatsApp(telDe(r), `Hola ${(r.clienteNombre || '').split(' ')[0]}, te confirmamos la recepción de tu pago por ${ars(r.totalRecibo)} (Recibo N° ${r.numeroOriginal}). ¡Muchas gracias!\n\nEuler Calefacción`);

  const exportar = () => exportarExcel(filtrados, [
    { titulo: 'Fecha', valor: (r) => fechaAR(r.fechaEmision), ancho: 11 },
    { titulo: 'Recibo', valor: (r) => r.numeroOriginal, ancho: 18 },
    { titulo: 'Empresa', valor: (r) => EMPRESAS_LISTADO[r.empresaId]?.nombre || r.empresaId, ancho: 26 },
    { titulo: 'Cliente', valor: (r) => r.clienteNombre, ancho: 34 },
    { titulo: 'Formas de cobro', valor: (r) => (r.mediosPago || []).map((m) => `${MEDIOS_COBRO[m.tipo]?.corto || m.tipo} ${Number(m.importe).toFixed(2)}${detalleMedio(m) ? ` (${detalleMedio(m)})` : ''}`).join(' | '), ancho: 50 },
    { titulo: 'Imputado a', valor: (r) => (r.imputaciones || []).map((i) => `${i.tipoComprobante} ${i.numeroOriginal}`).join(', '), ancho: 40 },
    { titulo: 'A cuenta', valor: (r) => Number(r.aCuenta || 0), ancho: 12 },
    { titulo: 'Total', valor: (r) => Number(r.totalRecibo || 0), ancho: 14 },
    { titulo: 'Estado', valor: (r) => (r.estado === 'anulado' ? `Anulado: ${r.motivoAnulacion || ''}` : 'Emitido'), ancho: 18 },
    { titulo: 'Prueba', valor: (r) => (r.prueba ? 'Sí' : ''), ancho: 8 },
  ], `Recibos_${new Date().toISOString().slice(0, 10)}.xlsx`, 'Recibos');

  const ICONO = { efectivo: <Banknote size={13} />, transferencia: <Landmark size={13} />, tarjeta_credito: <CreditCard size={13} />, tarjeta_debito: <CreditCard size={13} /> };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.75rem' }}>
        <KpiCard titulo="Cobrado en el período" valor={ars(kpi.cobrado)} color="#047857" icono={<Wallet size={18} />}
          detalle={Object.entries(kpi.porEmpresa).map(([e, v]) => `${EMPRESAS_LISTADO[e]?.corto || e}: ${ars(v)}`).join(' · ') || `${kpi.cant} recibo(s)`} />
        <div className="card" style={{ padding: '0.85rem 1rem', gridColumn: 'span 2' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6 }}>Por forma de cobro</div>
          {Object.keys(kpi.porMedio).length === 0 ? <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Sin cobros en el período</div> : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {Object.entries(kpi.porMedio).sort((a, b) => b[1] - a[1]).map(([t, v]) => (
                <button key={t} onClick={() => setMedio(medio === t ? '' : t)} title="Filtrar por esta forma"
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0.3rem 0.6rem', borderRadius: 999, fontSize: '0.76rem', cursor: 'pointer', border: `1px solid ${medio === t ? '#0D2A4E' : 'var(--border-light)'}`, background: medio === t ? '#e8eff7' : 'transparent', color: 'inherit' }}>
                  {ICONO[t]}<span>{MEDIOS_COBRO[t]?.corto || t}</span><b>{ars(v)}</b>
                </button>
              ))}
            </div>
          )}
          {kpi.aCuenta > 0.01 && <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 6 }}>Incluye {ars(kpi.aCuenta)} cobrados a cuenta (saldo a favor de clientes)</div>}
        </div>
        <KpiCard titulo="Cheques a cobrar (no vencidos)" valor={ars(chequesCartera.total)} color="#7c3aed" icono={<Landmark size={18} />} detalle={`${chequesCartera.cant} cheque(s) / e-cheq`} />
      </div>

      <BarraFiltros
        busqueda={busqueda} setBusqueda={setBusqueda} empresa={empresa} setEmpresa={setEmpresa}
        periodo={periodo} setPeriodo={setPeriodo} custom={custom} setCustom={setCustom}
        placeholder="Buscar cliente, recibo, factura imputada, banco, n° de cheque…"
      >
        <select style={inputSt} value={medio} onChange={(e) => setMedio(e.target.value)}>
          <option value="">Todas las formas</option>
          {Object.entries(MEDIOS_COBRO).map(([id, m]) => <option key={id} value={id}>{m.label}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={verAnulados} onChange={(e) => setVerAnulados(e.target.checked)} /> Ver anulados
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={verPruebas} onChange={(e) => setVerPruebas(e.target.checked)} /> Incluir pruebas
        </label>
        <button className="btn btn-secondary" onClick={exportar} disabled={!filtrados.length} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginLeft: 'auto' }}>
          <FileSpreadsheet size={15} /> Excel
        </button>
      </BarraFiltros>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
            <thead>
              <tr style={thSt}>
                <SortTh label="Fecha" campo="fecha" orden={orden} setOrden={setOrden} />
                <SortTh label="Recibo" campo="numero" orden={orden} setOrden={setOrden} />
                <SortTh label="Empresa" campo="empresa" orden={orden} setOrden={setOrden} />
                <SortTh label="Cliente" campo="cliente" orden={orden} setOrden={setOrden} />
                <th style={{ ...cellPad, textAlign: 'left', fontWeight: 600, fontSize: '0.75rem' }}>Formas de cobro</th>
                <th style={{ ...cellPad, textAlign: 'left', fontWeight: 600, fontSize: '0.75rem' }}>Imputado a</th>
                <SortTh label="Total" campo="total" orden={orden} setOrden={setOrden} align="right" />
                <th style={{ ...cellPad, textAlign: 'center', fontWeight: 600, fontSize: '0.75rem' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No hay recibos para los filtros elegidos.
                  <div style={{ marginTop: 8 }}><button className="btn btn-primary" onClick={() => onNuevoRecibo()}>Cargar un recibo</button></div>
                </td></tr>
              ) : filtrados.map((r) => {
                const anulado = r.estado === 'anulado';
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border-light)', background: r.prueba ? 'rgba(254, 226, 226, 0.18)' : undefined, opacity: anulado ? 0.55 : 1 }}>
                    <td style={{ ...cellPad, whiteSpace: 'nowrap' }}>{fechaAR(r.fechaEmision)}</td>
                    <td style={{ ...cellPad, whiteSpace: 'nowrap' }}>
                      <button onClick={() => pdf(r)} title="Descargar PDF"
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#047857', fontWeight: 600, fontSize: '0.83rem', textDecoration: anulado ? 'line-through' : 'none' }}>
                        REC {r.numeroOriginal}
                      </button>
                      <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                        {r.prueba && <Pill texto="PRUEBA" color="#b91c1c" bg="#fee2e2" />}
                        {anulado && <Pill texto="ANULADO" color="#b91c1c" bg="#fee2e2" title={r.motivoAnulacion} />}
                      </div>
                    </td>
                    <td style={cellPad}><EmpresaBadge empresaId={r.empresaId || 'ayala-nicolas'} /></td>
                    <td style={cellPad}>
                      <div style={{ fontWeight: 500 }}>{r.clienteNombre}</div>
                      {r.clienteCuit && <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{r.clienteCuit}</div>}
                    </td>
                    <td style={{ ...cellPad, maxWidth: 260 }}>
                      {(r.mediosPago || []).map((m, i) => (
                        <div key={i} style={{ fontSize: '0.76rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={detalleMedio(m)}>
                          <b>{MEDIOS_COBRO[m.tipo]?.corto || m.tipo}</b> {ars(m.importe)}
                          {detalleMedio(m) && <span style={{ color: 'var(--text-secondary)' }}> · {detalleMedio(m)}</span>}
                        </div>
                      ))}
                    </td>
                    <td style={{ ...cellPad, maxWidth: 220, fontSize: '0.76rem' }}>
                      {(r.imputaciones || []).map((i) => <div key={i.comprobanteId} style={{ whiteSpace: 'nowrap' }}>{i.tipoComprobante} {i.numeroOriginal} <span style={{ color: 'var(--text-secondary)' }}>{ars(i.importe)}</span></div>)}
                      {Number(r.aCuenta) > 0.009 && <div style={{ color: '#7c3aed', fontWeight: 600 }}>A cuenta {ars(r.aCuenta)}</div>}
                    </td>
                    <td style={{ ...cellPad, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{ars(r.totalRecibo)}</td>
                    <td style={{ ...cellPad, whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <IconBtn title="Descargar PDF" onClick={() => pdf(r)} color="#c2410c" bg="#ffedd5"><Download size={14} /></IconBtn>
                        <IconBtn title={telDe(r) ? 'Enviar por WhatsApp' : 'Sin teléfono'} onClick={() => whatsapp(r)} disabled={!telDe(r)} color="#15803d" bg="#dcfce7"><MessageCircle size={14} /></IconBtn>
                        <IconBtn title="Anular recibo" onClick={() => onAnular(r)} disabled={anulado} color="#b91c1c" bg="#fee2e2"><Ban size={14} /></IconBtn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {filtrados.length > 0 && (
              <tfoot>
                <tr style={{ background: 'var(--bg-surface-hover, #f8fafc)', fontWeight: 700 }}>
                  <td colSpan={6} style={{ ...cellPad, fontSize: '0.8rem' }}>{kpi.cant} recibo(s) vigentes</td>
                  <td style={{ ...cellPad, textAlign: 'right', whiteSpace: 'nowrap' }}>{ars(filtrados.filter((r) => r.estado !== 'anulado').reduce((a, r) => a + Number(r.totalRecibo || 0), 0))}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
