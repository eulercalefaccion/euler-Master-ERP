import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Download, ShieldCheck, MessageCircle, HardHat, FileSpreadsheet, TrendingUp, Clock, FileText, AlertCircle, ChevronUp, Wallet, Ban, Undo2,
} from 'lucide-react';
import { lineasDesdeObra, calcularTotales } from '../../services/arcaFacturacionService';
import { generarPDFFacturaArca } from '../../services/pdfFacturaArca';
import {
  EMPRESAS_LISTADO, SIGLA_LABEL, ESTADOS_FACTURA, rangoPeriodo, enRango, ars, fechaAR, abrirWhatsApp, exportarExcel,
} from '../../services/listadosService';
import { KpiCard, Pill, EmpresaBadge, SortTh, IconBtn, BarraFiltros } from '../Listados/listadosUI';
import { ordenar, cellPad, inputSt } from '../Listados/listadosHelpers';
import { thSt } from './ventasHelpers';

const letraDe = (c) => c.letra || String(c.tipoComprobante || '').slice(-1);

/** Estado considerando NC, cobros (recibos) y anulación. */
const estadoDe = (c, cartera) => {
  if (c.esNotaCredito) return 'nota_credito';
  if (c.estado === 'anulado') return 'anulada';
  const nc = cartera.ncPor[c.id] || 0;
  const total = Number(c.totalComprobante || 0);
  if (nc >= total - 0.01 && nc > 0) return 'anulada';
  const pend = cartera.pendienteDe(c);
  if (pend <= 0.01) return 'cobrada';
  if ((cartera.cobradoPor[c.id] || 0) > 0) return 'parcial';
  if (nc > 0) return 'nc_parcial';
  return 'pendiente';
};

export default function TabComprobantes({
  comprobantes, obras, arcaCfg, ventasCfg, cartera, verPruebas, setVerPruebas, cantPruebas, esProduccion,
  onNuevaFactura, onCobrar, onAnular, onNotaCredito,
}) {
  const navigate = useNavigate();
  const [busqueda, setBusqueda] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [periodo, setPeriodo] = useState('anio');
  const [custom, setCustom] = useState({});
  const [tipo, setTipo] = useState('');
  const [estado, setEstado] = useState('');
  const [orden, setOrden] = useState({ campo: 'fecha', dir: 'desc' });
  const [verPendFacturar, setVerPendFacturar] = useState(false);

  const obraPorId = useMemo(() => Object.fromEntries((obras || []).map((o) => [o.id, o])), [obras]);

  const todas = useMemo(() => comprobantes.map((c) => ({
    ...c,
    _empresa: c.empresaId || 'ayala-nicolas',
    _estado: estadoDe(c, cartera),
    _letra: letraDe(c),
    _total: (c.esNotaCredito ? -1 : 1) * Number(c.totalComprobante || 0),
    _pend: c.esNotaCredito || c.estado === 'anulado' ? 0 : Math.max(0, cartera.pendienteDe(c)),
    _cobrado: cartera.cobradoPor[c.id] || 0,
    _obra: obraPorId[c.obraId],
  })), [comprobantes, cartera, obraPorId]);

  const [desde, hasta] = rangoPeriodo(periodo, custom);
  const filtradas = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    const f = todas.filter((c) => {
      if (empresa && c._empresa !== empresa) return false;
      if (!enRango(c.fechaEmision, [desde, hasta])) return false;
      if (tipo === 'NC' && !c.esNotaCredito) return false;
      if (tipo && tipo !== 'NC' && (c.esNotaCredito || c._letra !== tipo)) return false;
      if (estado && c._estado !== estado) return false;
      if (!t) return true;
      return [c.clienteNombre, c.clienteCuit, c.numeroOriginal, c.tipoComprobante, c.cae, c.obraNombre, c.otNumber, c.notas, c.observaciones, c.presupuestoNumero]
        .some((v) => String(v || '').toLowerCase().includes(t));
    });
    return ordenar(f, orden, {
      fecha: (c) => `${c.fechaEmision || ''}${c.numeroOriginal || ''}`,
      comprobante: (c) => `${c.tipoComprobante} ${c.numeroOriginal}`,
      cliente: (c) => c.clienteNombre,
      empresa: (c) => c._empresa,
      estado: (c) => ESTADOS_FACTURA[c._estado]?.label,
      total: (c) => c._total,
      saldo: (c) => c._pend,
    });
  }, [todas, empresa, desde, hasta, tipo, estado, busqueda, orden]);

  const kpi = useMemo(() => {
    const k = { total: 0, neto: 0, iva: 0, pendiente: 0, cantPend: 0, cant: filtradas.length, nc: 0, porEmpresa: {} };
    filtradas.forEach((c) => {
      if (c.estado === 'anulado') return;
      const s = c.esNotaCredito ? -1 : 1;
      k.total += c._total;
      k.neto += s * Number(c.subtotalNeto || 0);
      k.iva += s * Number(c.totalIva || 0);
      if (c.esNotaCredito) k.nc += 1;
      if (c._pend > 0.01) { k.pendiente += c._pend; k.cantPend += 1; }
      k.porEmpresa[c._empresa] = (k.porEmpresa[c._empresa] || 0) + c._total;
    });
    return k;
  }, [filtradas]);

  const pendFacturar = useMemo(() => (obras || [])
    .filter((o) => !o.deleted && (o.canal || 'iva') === 'iva' && (o.quoteItems || []).length)
    .map((o) => {
      const presupuestado = calcularTotales(lineasDesdeObra(o)).total;
      const facturado = ((esProduccion ? o.facturasArca : o.facturasArcaPrueba) || [])
        .reduce((a, f) => a + (f.esNotaCredito ? -1 : 1) * Number(f.total || 0), 0);
      return { obra: o, presupuestado, facturado, pendiente: Math.round((presupuestado - facturado) * 100) / 100 };
    })
    .filter((r) => r.pendiente > 1)
    .sort((a, b) => b.pendiente - a.pendiente), [obras, esProduccion]);
  const totalPendFacturar = pendFacturar.reduce((a, r) => a + r.pendiente, 0);

  const descargarPDF = async (c) => {
    try { await generarPDFFacturaArca(c, c._letra === 'X' ? ventasCfg.euler : (arcaCfg || {})); } catch (e) { alert(`No se pudo generar el PDF: ${e.message}`); }
  };
  const tel = (c) => c.clienteTelefono || c._obra?.telefono || c._obra?.contactoTelefono || c._obra?.clientPhone || '';
  const whatsapp = (c) => {
    const nombre = (c.clienteNombre || '').split(' ')[0] || '';
    const tipoTxt = SIGLA_LABEL[c.tipoComprobante] || c.tipoComprobante;
    const saldo = c._pend > 0.01 ? `\nSaldo pendiente: ${ars(c._pend)}.` : '';
    abrirWhatsApp(tel(c), `Hola ${nombre}, te enviamos la ${tipoTxt} N° ${c.numeroOriginal} por ${ars(c.totalComprobante)}.${saldo}${c.qrUrl ? `\nPodés verificarla en ARCA: ${c.qrUrl}` : ''}\n\nEuler Calefacción`);
  };
  const exportar = () => exportarExcel(filtradas, [
    { titulo: 'Fecha', valor: (c) => fechaAR(c.fechaEmision), ancho: 11 },
    { titulo: 'Comprobante', valor: (c) => `${c.tipoComprobante} ${c.numeroOriginal}`, ancho: 22 },
    { titulo: 'Empresa', valor: (c) => EMPRESAS_LISTADO[c._empresa]?.nombre || c._empresa, ancho: 26 },
    { titulo: 'Cliente', valor: (c) => c.clienteNombre, ancho: 34 },
    { titulo: 'CUIT/DNI', valor: (c) => c.clienteCuit, ancho: 14 },
    { titulo: 'Obra', valor: (c) => [c.otNumber, c.obraNombre].filter(Boolean).join(' – '), ancho: 30 },
    { titulo: 'Presupuesto', valor: (c) => c.presupuestoNumero || '', ancho: 18 },
    { titulo: 'Neto', valor: (c) => (c.esNotaCredito ? -1 : 1) * Number(c.subtotalNeto || 0), ancho: 14 },
    { titulo: 'IVA', valor: (c) => (c.esNotaCredito ? -1 : 1) * Number(c.totalIva || 0), ancho: 14 },
    { titulo: 'Total', valor: (c) => c._total, ancho: 14 },
    { titulo: 'Cobrado', valor: (c) => c._cobrado, ancho: 14 },
    { titulo: 'Saldo', valor: (c) => c._pend, ancho: 14 },
    { titulo: 'Estado', valor: (c) => ESTADOS_FACTURA[c._estado]?.label, ancho: 16 },
    { titulo: 'CAE', valor: (c) => c.cae || '', ancho: 16 },
    { titulo: 'Prueba', valor: (c) => (c._prueba ? 'Sí' : ''), ancho: 8 },
  ], `Comprobantes_${new Date().toISOString().slice(0, 10)}.xlsx`, 'Comprobantes');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.75rem' }}>
        <KpiCard titulo="Facturado en el período" valor={ars(kpi.total)} color="#047857" icono={<TrendingUp size={18} />}
          detalle={Object.entries(kpi.porEmpresa).map(([e, v]) => `${EMPRESAS_LISTADO[e]?.corto || e}: ${ars(v)}`).join(' · ') || 'Sin comprobantes'} />
        <div onClick={() => setEstado(estado === 'pendiente' ? '' : 'pendiente')} style={{ cursor: 'pointer' }} title="Filtrar pendientes de cobro">
          <KpiCard titulo="Pendiente de cobro" valor={ars(kpi.pendiente)} color="#b45309" icono={<Clock size={18} />} detalle={`${kpi.cantPend} comprobante(s) con saldo`} />
        </div>
        <KpiCard titulo="IVA débito fiscal" valor={ars(kpi.iva)} color="#1d4ed8" icono={<FileText size={18} />} detalle={`Neto gravado ${ars(kpi.neto)}`} />
        <div onClick={() => setVerPendFacturar((v) => !v)} style={{ cursor: 'pointer' }} title="Ver obras con saldo a facturar">
          <KpiCard titulo="Pendiente de facturar (Canal 1)" valor={ars(totalPendFacturar)} color="#7c3aed" icono={<AlertCircle size={18} />}
            detalle={`${pendFacturar.length} obra(s) · clic para ver ${verPendFacturar ? '▲' : '▼'}`} />
        </div>
      </div>

      {verPendFacturar && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)' }}>
            <b style={{ fontSize: '0.9rem' }}>Obras de Canal 1 con saldo a facturar</b>
            <button onClick={() => setVerPendFacturar(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><ChevronUp size={18} /></button>
          </div>
          {pendFacturar.length === 0 ? (
            <div style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No hay obras de Canal 1 con saldo pendiente de facturar.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead><tr style={thSt}>
                  {['Obra', 'Cliente', 'Presupuestado', 'Facturado', 'Avance', 'Pendiente', ''].map((h, i) => (
                    <th key={h + i} style={{ ...cellPad, textAlign: i >= 2 && i <= 5 ? 'right' : 'left', fontWeight: 600, fontSize: '0.75rem' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {pendFacturar.map(({ obra: o, presupuestado, facturado, pendiente }) => {
                    const pct = presupuestado > 0 ? Math.max(0, Math.min(100, (facturado / presupuestado) * 100)) : 0;
                    return (
                      <tr key={o.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={cellPad}><b>{o.otNumber || ''}</b> {o.name}</td>
                        <td style={cellPad}>{o.clientName}</td>
                        <td style={{ ...cellPad, textAlign: 'right' }}>{ars(presupuestado)}</td>
                        <td style={{ ...cellPad, textAlign: 'right' }}>{ars(facturado)}</td>
                        <td style={{ ...cellPad, textAlign: 'right', minWidth: 110 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                            <div style={{ width: 60, height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: '#7c3aed' }} /></div>
                            <span style={{ fontSize: '0.72rem' }}>{pct.toFixed(0)}%</span>
                          </div>
                        </td>
                        <td style={{ ...cellPad, textAlign: 'right', fontWeight: 700, color: '#7c3aed' }}>{ars(pendiente)}</td>
                        <td style={{ ...cellPad, textAlign: 'right' }}>
                          <button className="btn btn-primary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem' }}
                            onClick={() => (o.presupuestoId ? onNuevaFactura({ presupuestoId: o.presupuestoId }) : navigate(`/obras?obra=${o.id}&tab=facturacion`))}>Facturar</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <BarraFiltros
        busqueda={busqueda} setBusqueda={setBusqueda} empresa={empresa} setEmpresa={setEmpresa}
        periodo={periodo} setPeriodo={setPeriodo} custom={custom} setCustom={setCustom}
        placeholder="Buscar cliente, número, CUIT, obra, presupuesto o CAE…"
      >
        <select style={inputSt} value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          <option value="A">Factura A</option>
          <option value="B">Factura B</option>
          <option value="X">Comprobante X (no fiscal)</option>
          <option value="NC">Notas de crédito</option>
        </select>
        <select style={inputSt} value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          {Object.entries(ESTADOS_FACTURA).map(([id, e]) => <option key={id} value={id}>{e.label}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={verPruebas} onChange={(e) => setVerPruebas(e.target.checked)} /> Incluir pruebas (homologación)
        </label>
        <button className="btn btn-secondary" onClick={exportar} disabled={!filtradas.length} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginLeft: 'auto' }}>
          <FileSpreadsheet size={15} /> Excel
        </button>
      </BarraFiltros>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
            <thead>
              <tr style={thSt}>
                <SortTh label="Fecha" campo="fecha" orden={orden} setOrden={setOrden} />
                <SortTh label="Comprobante" campo="comprobante" orden={orden} setOrden={setOrden} />
                <SortTh label="Empresa" campo="empresa" orden={orden} setOrden={setOrden} />
                <SortTh label="Cliente" campo="cliente" orden={orden} setOrden={setOrden} />
                <th style={{ ...cellPad, textAlign: 'left', fontWeight: 600, fontSize: '0.75rem' }}>Obra / Notas</th>
                <SortTh label="Estado" campo="estado" orden={orden} setOrden={setOrden} />
                <SortTh label="Total" campo="total" orden={orden} setOrden={setOrden} align="right" />
                <SortTh label="Saldo" campo="saldo" orden={orden} setOrden={setOrden} align="right" />
                <th style={{ ...cellPad, textAlign: 'center', fontWeight: 600, fontSize: '0.75rem' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No hay comprobantes para los filtros elegidos.
                  {!verPruebas && cantPruebas > 0 && <div style={{ marginTop: 6, fontSize: '0.78rem' }}>Hay {cantPruebas} comprobante(s) de prueba: activá “Incluir pruebas”.</div>}
                </td></tr>
              ) : filtradas.map((c) => {
                const est = ESTADOS_FACTURA[c._estado];
                const esX = c._letra === 'X';
                const tienePDF = !!c.cae || esX;
                const anulado = c.estado === 'anulado';
                return (
                  <tr key={`${c._col}-${c.id}`} style={{ borderBottom: '1px solid var(--border-light)', background: c._prueba ? 'rgba(254, 226, 226, 0.18)' : undefined, opacity: anulado ? 0.55 : 1 }}>
                    <td style={{ ...cellPad, whiteSpace: 'nowrap' }}>{fechaAR(c.fechaEmision)}</td>
                    <td style={{ ...cellPad, whiteSpace: 'nowrap' }}>
                      <button onClick={() => tienePDF && descargarPDF(c)} title={tienePDF ? 'Descargar PDF' : ''}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: tienePDF ? 'pointer' : 'default', color: c.esNotaCredito ? '#7e22ce' : 'var(--primary-600, #1d4ed8)', fontWeight: 600, fontSize: '0.83rem', textDecoration: anulado ? 'line-through' : 'none' }}>
                        {c.tipoComprobante} {c.numeroOriginal}
                      </button>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 2 }}>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{SIGLA_LABEL[c.tipoComprobante] || ''}</span>
                        {c._prueba && <Pill texto="PRUEBA" color="#b91c1c" bg="#fee2e2" title="Homologación – sin validez fiscal" />}
                      </div>
                    </td>
                    <td style={cellPad}><EmpresaBadge empresaId={c._empresa} /></td>
                    <td style={cellPad}>
                      <div style={{ fontWeight: 500 }}>{c.clienteNombre}</div>
                      {c.clienteCuit && <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{c.clienteCuit}</div>}
                    </td>
                    <td style={{ ...cellPad, maxWidth: 240 }}>
                      {(c.otNumber || c.obraNombre) && (
                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={c.obraNombre}>{c.otNumber && <b>{c.otNumber} </b>}{c.obraNombre}</div>
                      )}
                      {(c.notas || c.comprobanteAsociado || c.motivoAnulacion) && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={c.notas}>
                          {anulado ? `Anulado: ${c.motivoAnulacion || ''}` : (c.notas || `Asoc. a ${c.comprobanteAsociado?.numeroOriginal || ''}`)}
                        </div>
                      )}
                    </td>
                    <td style={cellPad}><Pill texto={est?.label} color={est?.color} bg={est?.bg} /></td>
                    <td style={{ ...cellPad, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', color: c.esNotaCredito ? '#b91c1c' : 'inherit' }}>{ars(c._total)}</td>
                    <td style={{ ...cellPad, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600, color: c._pend > 0.01 ? '#b45309' : 'var(--text-secondary)' }}>{c._pend > 0.01 ? ars(c._pend) : '—'}</td>
                    <td style={{ ...cellPad, whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <IconBtn title={tienePDF ? 'Descargar PDF' : 'Sin PDF'} onClick={() => descargarPDF(c)} disabled={!tienePDF} color="#c2410c" bg="#ffedd5"><Download size={14} /></IconBtn>
                        <IconBtn title="Cobrar (recibo)" onClick={() => onCobrar(c)} disabled={c._pend <= 0.01} color="#047857" bg="#d1fae5"><Wallet size={14} /></IconBtn>
                        {!esX && <IconBtn title="Verificar en ARCA" onClick={() => window.open(c.qrUrl, '_blank', 'noopener')} disabled={!c.qrUrl} color="#1d4ed8" bg="#dbeafe"><ShieldCheck size={14} /></IconBtn>}
                        <IconBtn title={tel(c) ? 'Enviar por WhatsApp' : 'Sin teléfono'} onClick={() => whatsapp(c)} disabled={!tel(c)} color="#15803d" bg="#dcfce7"><MessageCircle size={14} /></IconBtn>
                        <IconBtn title="Ir a la obra" onClick={() => navigate(`/obras?obra=${c.obraId}&tab=facturacion`)} disabled={!c.obraId || !c._obra} color="#0D2A4E" bg="#e8eff7"><HardHat size={14} /></IconBtn>
                        {esX
                          ? <IconBtn title={c._cobrado > 0 ? 'Tiene cobros: anulá primero los recibos' : 'Anular comprobante X'} onClick={() => onAnular(c)} disabled={anulado || c._cobrado > 0} color="#b91c1c" bg="#fee2e2"><Ban size={14} /></IconBtn>
                          : <IconBtn title="Emitir nota de crédito" onClick={() => onNotaCredito(c)} disabled={c.esNotaCredito || c._estado === 'anulada'} color="#7e22ce" bg="#f3e8ff"><Undo2 size={14} /></IconBtn>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {filtradas.length > 0 && (
              <tfoot>
                <tr style={{ background: 'var(--bg-surface-hover, #f8fafc)', fontWeight: 700 }}>
                  <td colSpan={6} style={{ ...cellPad, fontSize: '0.8rem' }}>{filtradas.length} comprobante(s){kpi.nc ? ` · ${kpi.nc} nota(s) de crédito` : ''}</td>
                  <td style={{ ...cellPad, textAlign: 'right', whiteSpace: 'nowrap' }}>{ars(kpi.total)}</td>
                  <td style={{ ...cellPad, textAlign: 'right', whiteSpace: 'nowrap', color: '#b45309' }}>{ars(kpi.pendiente)}</td>
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
