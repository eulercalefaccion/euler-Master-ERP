import React, { useMemo, useState } from 'react';
import { Wallet, FilePlus, FileSpreadsheet, MessageCircle, FileDown, PackageCheck, Ban, Loader, PlusCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { registrarEntregaMateriales, anularSaldoInicial } from '../../services/cobranzasService';
import { conSaldoCorrido, totalesCuenta } from '../../services/ventasCalculo';
import { generarPDFEstadoCuenta } from '../../services/pdfEstadoCuenta';
import { EMPRESAS_LISTADO, ars, fechaAR, abrirWhatsApp, exportarExcel } from '../../services/listadosService';
import { EmpresaBadge, Pill } from '../Listados/listadosUI';
import { cellPad } from '../Listados/listadosHelpers';
import { thSt, inp, diasDesde, tramoDe, clienteDeCuenta } from './ventasHelpers';
import { Modal, Alerta, Seg } from './ventasUI';

const empresaDe = (x) => x.empresaId || 'ayala-nicolas';
const th = (h, right) => <th key={h} style={{ ...cellPad, textAlign: right ? 'right' : 'left', fontWeight: 600, fontSize: '0.72rem' }}>{h}</th>;

function MaterialCard({ mat, onError }) {
  const { currentUser } = useAuth();
  const [cant, setCant] = useState({});
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const abierto = mat.estado !== 'entregado' && mat.estado !== 'anulado';
  const registrar = async () => {
    setGuardando(true);
    try { await registrarEntregaMateriales(mat, cant, nota, currentUser); setCant({}); setNota(''); } catch (e) { onError(e.message); } finally { setGuardando(false); }
  };
  const est = { pendiente: ['Pendiente', '#b45309', '#fef3c7'], parcial: ['Entrega parcial', '#1d4ed8', '#dbeafe'], entregado: ['Entregado', '#047857', '#d1fae5'], anulado: ['Anulado', '#b91c1c', '#fee2e2'] }[mat.estado] || ['—', '#475569', '#f1f5f9'];
  return (
    <div style={{ border: '1px solid var(--border-light)', borderRadius: 8, overflow: 'hidden', opacity: mat.estado === 'anulado' ? 0.55 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.5rem 0.75rem', background: 'var(--bg-surface-hover, #f8fafc)', fontSize: '0.8rem', flexWrap: 'wrap' }}>
        <b>{mat.comprobanteNumero || 'Saldo inicial'}</b>
        <span style={{ color: 'var(--text-secondary)' }}>{fechaAR(mat.fecha)}</span>
        <EmpresaBadge empresaId={empresaDe(mat)} />
        <Pill texto={est[0]} color={est[1]} bg={est[2]} />
        {mat.prueba && <Pill texto="PRUEBA" color="#b91c1c" bg="#fee2e2" />}
        {mat.nota && <span style={{ color: 'var(--text-secondary)', fontSize: '0.74rem' }}>{mat.nota}</span>}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
        <thead><tr style={thSt}>{th('Material')}{th('Cantidad', 1)}{th('Entregado', 1)}{th('Pendiente', 1)}{abierto && th('Entregar ahora', 1)}</tr></thead>
        <tbody>
          {(mat.items || []).map((it, i) => {
            const pend = Math.round((Number(it.cantidad) - Number(it.cantidadEntregada || 0)) * 100) / 100;
            return (
              <tr key={i} style={{ borderTop: '1px solid var(--border-light)' }}>
                <td style={cellPad}>{it.descripcion}</td>
                <td style={{ ...cellPad, textAlign: 'right' }}>{it.cantidad} {it.unidad}</td>
                <td style={{ ...cellPad, textAlign: 'right' }}>{it.cantidadEntregada || 0}</td>
                <td style={{ ...cellPad, textAlign: 'right', fontWeight: 700, color: pend > 0 ? '#b45309' : '#047857' }}>{pend}</td>
                {abierto && (
                  <td style={{ ...cellPad, textAlign: 'right' }}>
                    {pend > 0 && <input type="number" min="0" max={pend} step="any" style={{ ...inp, width: 90, textAlign: 'right' }} value={cant[i] ?? ''} onChange={(e) => setCant({ ...cant, [i]: e.target.value })} placeholder="0" />}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {abierto && (
        <div style={{ display: 'flex', gap: 8, padding: '0.5rem 0.75rem', borderTop: '1px solid var(--border-light)', alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
            onClick={() => setCant(Object.fromEntries((mat.items || []).map((it, i) => [i, Math.max(0, Number(it.cantidad) - Number(it.cantidadEntregada || 0))])))}>Todo</button>
          <input style={{ ...inp, flex: 1, minWidth: 160 }} placeholder="Nota de la entrega (opcional): remito, quién retiró…" value={nota} onChange={(e) => setNota(e.target.value)} />
          <button className="btn btn-primary" disabled={guardando || !Object.values(cant).some((v) => Number(v) > 0)} onClick={registrar} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem' }}>
            {guardando ? <Loader size={14} className="spin" /> : <PackageCheck size={14} />} Registrar entrega
          </button>
        </div>
      )}
      {(mat.entregas || []).length > 0 && (
        <div style={{ padding: '0.4rem 0.75rem', borderTop: '1px dashed var(--border-light)', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
          {(mat.entregas || []).map((e, i) => (
            <div key={i}>{fechaAR(String(e.fecha).slice(0, 10))}: {(e.items || []).map((x) => `${x.cantidad} × ${x.descripcion}`).join(', ')}{e.nota ? ` — ${e.nota}` : ''}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CuentaDetalleModal({ cuenta, materiales = [], ventasCfg, onClose, onNuevoRecibo, onNuevaFactura, onSaldoInicial, onCobrar }) {
  const { currentUser } = useAuth();
  const [empresa, setEmpresa] = useState('');
  const [tab, setTab] = useState(cuenta.pendientes.length ? 'pendientes' : 'movimientos');
  const [error, setError] = useState('');

  const tot = totalesCuenta(cuenta, empresa);
  const movs = useMemo(() => conSaldoCorrido(cuenta.movimientos.filter((m) => !empresa || m.empresaId === empresa)), [cuenta, empresa]);
  const pend = cuenta.pendientes.filter((p) => !empresa || empresaDe(p) === empresa);
  const mats = materiales.filter((m) => !empresa || empresaDe(m) === empresa);
  const matsAbiertos = mats.filter((m) => m.estado === 'pendiente' || m.estado === 'parcial');
  const cliente = clienteDeCuenta(cuenta);

  const whatsapp = () => {
    const nombre = (cuenta.nombre || '').split(' ')[0];
    const lineas = pend.map((p) => `• ${p.tipoComprobante} ${p.numeroOriginal} (${fechaAR(p.fechaEmision)}): ${ars(p._pendiente)}`).join('\n');
    const txt = tot.saldo > 0.009
      ? `Hola ${nombre}, te compartimos el estado de tu cuenta con Euler Calefacción.\nSaldo pendiente: ${ars(tot.saldo)}${lineas ? `\n${lineas}` : ''}\n\nCualquier consulta, estamos a disposición. ¡Gracias!`
      : `Hola ${nombre}, te compartimos el estado de tu cuenta con Euler Calefacción: ${tot.saldo < -0.009 ? `tenés un saldo a favor de ${ars(-tot.saldo)}` : 'tu cuenta está al día'}.${matsAbiertos.length ? '\nAdemás tenés materiales pagados pendientes de entrega.' : ''}\n\n¡Gracias!`;
    abrirWhatsApp(cuenta.telefono, txt);
  };
  const excel = () => exportarExcel(movs, [
    { titulo: 'Fecha', valor: (m) => fechaAR(m.fecha), ancho: 11 },
    { titulo: 'Empresa', valor: (m) => EMPRESAS_LISTADO[m.empresaId]?.nombre || m.empresaId, ancho: 24 },
    { titulo: 'Comprobante', valor: (m) => m.concepto, ancho: 24 },
    { titulo: 'Detalle', valor: (m) => m.detalle, ancho: 40 },
    { titulo: 'Debe', valor: (m) => m.debe || 0, ancho: 14 },
    { titulo: 'Haber', valor: (m) => m.haber || 0, ancho: 14 },
    { titulo: 'Saldo', valor: (m) => m.saldo, ancho: 14 },
  ], `CtaCte_${(cuenta.nombre || 'cliente').replace(/[^A-Za-z0-9]+/g, '_').slice(0, 40)}.xlsx`, 'Cuenta corriente');
  const pdf = () => generarPDFEstadoCuenta(cuenta, { empresaId: empresa, materiales, contacto: ventasCfg?.euler }).catch((e) => setError(`No se pudo generar el PDF: ${e.message}`));
  const anularSI = async (s) => {
    const motivo = window.prompt(`¿Anular el saldo inicial "${s.detalle || ''}" por ${ars(Math.abs(s.importe))}? Indicá el motivo:`);
    if (motivo === null) return;
    try { await anularSaldoInicial(s, motivo, currentUser); } catch (e) { setError(e.message); }
  };

  const resumen = (id, titulo) => {
    const t = totalesCuenta(cuenta, id);
    const activo = empresa === id;
    return (
      <button onClick={() => setEmpresa(id)} style={{ textAlign: 'left', flex: '1 1 180px', padding: '0.7rem 0.9rem', borderRadius: 10, cursor: 'pointer', border: `2px solid ${activo ? '#0D2A4E' : 'var(--border-light)'}`, background: 'var(--bg-primary, #fff)', color: 'inherit' }}>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{titulo}</div>
        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: t.saldo > 0.009 ? '#b45309' : t.saldo < -0.009 ? '#047857' : 'inherit' }}>
          {ars(Math.abs(t.saldo))} <span style={{ fontSize: '0.7rem', fontWeight: 600 }}>{t.saldo > 0.009 ? 'debe' : t.saldo < -0.009 ? 'a favor' : 'al día'}</span>
        </div>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Fact. {ars(t.facturado + t.inicial)} · Cobr. {ars(t.cobrado)}{t.notasCredito ? ` · NC ${ars(t.notasCredito)}` : ''}</div>
      </button>
    );
  };

  return (
    <Modal titulo={cuenta.nombre || 'Cliente'} ancho={1080} onClose={onClose}
      subtitulo={[cuenta.cuit && `${String(cuenta.cuit).length === 11 ? 'CUIT' : 'Doc.'} ${cuenta.cuit}`, cuenta.telefono && `Tel. ${cuenta.telefono}`, cuenta.domicilio].filter(Boolean).join(' · ') || 'Cuenta corriente'}
      pie={(
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={pdf} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><FileDown size={15} /> Estado de cuenta PDF</button>
            <button className="btn btn-secondary" onClick={excel} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><FileSpreadsheet size={15} /> Excel</button>
            <button className="btn btn-secondary" onClick={whatsapp} disabled={!cuenta.telefono} title={cuenta.telefono ? '' : 'Sin teléfono'} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MessageCircle size={15} /> WhatsApp</button>
            <button className="btn btn-secondary" onClick={() => onSaldoInicial(cliente)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><PlusCircle size={15} /> Saldo inicial</button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => onNuevaFactura({ empresaId: empresa || undefined, cliente })} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><FilePlus size={15} /> Nueva factura</button>
            <button className="btn btn-primary" onClick={() => onNuevoRecibo({ empresaId: empresa || (pend[0] ? empresaDe(pend[0]) : undefined), cliente })} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Wallet size={15} /> Nuevo recibo</button>
          </div>
        </div>
      )}>
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        {resumen('ayala-nicolas', 'AYALA NICOLAS FEDERICO (Canal 1)')}
        {resumen('euler-calefaccion', 'EULER CALEFACCIÓN (Canal 2)')}
        {resumen('', 'TOTAL')}
      </div>
      {tot.creditoSinAplicar > 0.009 && <Alerta tipo="ok">Tiene {ars(tot.creditoSinAplicar)} cobrados a cuenta, disponibles para aplicar a facturas (forma de cobro “Saldo a favor”).</Alerta>}
      {error && <Alerta>{error}</Alerta>}

      <Seg opciones={[['pendientes', `Pendientes (${pend.length})`], ['movimientos', `Movimientos (${movs.length})`], ['materiales', `Materiales a favor (${matsAbiertos.length})`]]} valor={tab} onChange={setTab} />

      {tab === 'pendientes' && (pend.length === 0 ? <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No tiene comprobantes pendientes de pago.</div> : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border-light)', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead><tr style={thSt}>{th('Fecha')}{th('Comprobante')}{th('Empresa')}{th('Antigüedad')}{th('Total', 1)}{th('Pagado / NC', 1)}{th('Pendiente', 1)}{th('')}</tr></thead>
            <tbody>
              {pend.map((p) => {
                const d = diasDesde(p.fechaEmision); const tr = tramoDe(d);
                return (
                  <tr key={`${p._col}-${p.id}`} style={{ borderTop: '1px solid var(--border-light)', background: p._prueba ? 'rgba(254, 226, 226, 0.18)' : undefined }}>
                    <td style={cellPad}>{fechaAR(p.fechaEmision)}</td>
                    <td style={cellPad}><b>{p.tipoComprobante} {p.numeroOriginal}</b>{p._prueba && <> <Pill texto="PRUEBA" color="#b91c1c" bg="#fee2e2" /></>}</td>
                    <td style={cellPad}><EmpresaBadge empresaId={empresaDe(p)} /></td>
                    <td style={{ ...cellPad, color: tr.color, fontWeight: 600 }}>{d} días</td>
                    <td style={{ ...cellPad, textAlign: 'right' }}>{ars(p.totalComprobante)}</td>
                    <td style={{ ...cellPad, textAlign: 'right' }}>{ars((p._cobrado || 0) + (p._nc || 0))}</td>
                    <td style={{ ...cellPad, textAlign: 'right', fontWeight: 700, color: '#b45309' }}>{ars(p._pendiente)}</td>
                    <td style={{ ...cellPad, textAlign: 'right' }}>
                      <button className="btn btn-primary" style={{ fontSize: '0.74rem', padding: '0.25rem 0.6rem' }} onClick={() => onCobrar(p)}>Cobrar</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {tab === 'movimientos' && (movs.length === 0 ? <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Sin movimientos.</div> : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border-light)', borderRadius: 8, maxHeight: 460, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead style={{ position: 'sticky', top: 0 }}><tr style={thSt}>{th('Fecha')}{th('Empresa')}{th('Comprobante')}{th('Detalle')}{th('Debe', 1)}{th('Haber', 1)}{th('Saldo', 1)}{th('')}</tr></thead>
            <tbody>
              {movs.map((m, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border-light)' }}>
                  <td style={{ ...cellPad, whiteSpace: 'nowrap' }}>{fechaAR(m.fecha)}</td>
                  <td style={cellPad}><EmpresaBadge empresaId={m.empresaId} /></td>
                  <td style={{ ...cellPad, whiteSpace: 'nowrap', fontWeight: 600, color: m.tipo === 'recibo' ? '#047857' : m.tipo === 'nc' ? '#7e22ce' : 'inherit' }}>{m.concepto}</td>
                  <td style={{ ...cellPad, fontSize: '0.75rem', color: 'var(--text-secondary)', maxWidth: 300 }}>{m.detalle}</td>
                  <td style={{ ...cellPad, textAlign: 'right', whiteSpace: 'nowrap' }}>{m.debe ? ars(m.debe) : ''}</td>
                  <td style={{ ...cellPad, textAlign: 'right', whiteSpace: 'nowrap' }}>{m.haber ? ars(m.haber) : ''}</td>
                  <td style={{ ...cellPad, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700, color: m.saldo > 0.009 ? '#b45309' : m.saldo < -0.009 ? '#047857' : 'inherit' }}>{ars(m.saldo)}</td>
                  <td style={cellPad}>
                    {m.tipo === 'inicial' && (
                      <button title="Anular saldo inicial" onClick={() => anularSI(m.ref)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c' }}><Ban size={14} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {tab === 'materiales' && (
        mats.length === 0
          ? <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No tiene materiales a favor. Se generan al facturar con “Entrega pendiente” o cargando un saldo inicial de materiales.</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>{mats.map((m) => <MaterialCard key={m.id} mat={m} onError={setError} />)}</div>
      )}
    </Modal>
  );
}
