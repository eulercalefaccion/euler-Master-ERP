import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import {
  Target, Receipt, Wallet, PackageCheck, FileSignature, Download, HardHat, RefreshCw, Loader, AlertTriangle, ExternalLink,
} from 'lucide-react';
import { db } from '../../services/firebaseConfig';
import { getArcaConfig } from '../../services/arcaFacturacionService';
import { getVentasConfig, VENTAS_CONFIG_DEFAULT, EMPRESA_AYALA, EMPRESA_EULER } from '../../services/cobranzasService';
import { calcularCartera, MEDIOS_COBRO, detalleMedio } from '../../services/ventasCalculo';
import { empresaDeCanal, EMPRESAS_LISTADO, fechaAR } from '../../services/listadosService';
import { generarPDFFacturaArca } from '../../services/pdfFacturaArca';
import { calcularTrazabilidad, EPS } from '../../services/presupuestoAlcance';
import { sincronizarJornadas } from '../../services/aprobacionesService';
import { clienteDesdePresupuesto } from '../../pages/Ventas/ventasHelpers';
import NuevaFacturaModal from '../../pages/Ventas/NuevaFacturaModal';
import ReciboModal from '../../pages/Ventas/ReciboModal';
import EntregaModal from '../../pages/Remitos/EntregaModal';
import RemitoModal from '../../pages/Remitos/RemitoModal';

const $ = (n) => `$ ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const q = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('es-AR', { maximumFractionDigits: 3 }));
const th = { padding: '0.4rem 0.5rem', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.72rem', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border-light)', background: 'var(--bg-surface-hover, #f8fafc)' };
const td = { padding: '0.35rem 0.5rem', borderBottom: '1px solid var(--border-light)', fontSize: '0.8rem', verticalAlign: 'top' };
const seccion = { border: '1px solid var(--border-light)', borderRadius: 10, padding: '0.75rem 1rem', background: 'var(--bg-primary, #fff)' };
const h4 = { margin: '0 0 0.6rem 0', color: 'var(--primary-700)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 };
const Pill = ({ t, c = '#475569', bg = '#f1f5f9' }) => <span style={{ padding: '0.1rem 0.45rem', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700, color: c, background: bg, whiteSpace: 'nowrap' }}>{t}</span>;

/**
 * Pestaña «Gestión comercial» del presupuesto: aprobado / facturado / cobrado / entregado en un solo lugar.
 * Lee los mismos registros que Ventas, Cobranzas, Stock y Obras (en vivo), y abre los formularios existentes.
 */
export default function GestionComercialTab({ presupuesto: p, onAprobarPendientes }) {
  const navigate = useNavigate();
  const [reales, setReales] = useState([]);
  const [pruebas, setPruebas] = useState([]);
  const [recibos, setRecibos] = useState([]);
  const [saldosIni, setSaldosIni] = useState([]);
  const [materiales, setMateriales] = useState([]);
  const [remitos, setRemitos] = useState([]);
  const [obras, setObras] = useState([]);
  const [arcaCfg, setArcaCfg] = useState(null);
  const [ventasCfg, setVentasCfg] = useState(VENTAS_CONFIG_DEFAULT);
  const [cargando, setCargando] = useState(true);
  const [modalFactura, setModalFactura] = useState(false);
  const [modalRecibo, setModalRecibo] = useState(null);
  const [modalEntrega, setModalEntrega] = useState(null);
  const [modalRemito, setModalRemito] = useState(null);
  const [reintentando, setReintentando] = useState(false);
  const [msgJornadas, setMsgJornadas] = useState('');

  useEffect(() => {
    const map = (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }));
    const subs = [
      onSnapshot(collection(db, 'comprobantes_venta'), (s) => { setReales(map(s)); setCargando(false); }, () => setCargando(false)),
      onSnapshot(collection(db, 'arca_pruebas'), (s) => setPruebas(map(s)), () => {}),
      onSnapshot(collection(db, 'recibos'), (s) => setRecibos(map(s)), () => {}),
      onSnapshot(collection(db, 'saldos_iniciales'), (s) => setSaldosIni(map(s)), () => {}),
      onSnapshot(collection(db, 'materiales_a_favor'), (s) => setMateriales(map(s)), () => {}),
      onSnapshot(collection(db, 'remitos_entrega'), (s) => setRemitos(map(s)), () => {}),
      onSnapshot(collection(db, 'obras'), (s) => setObras(map(s)), () => {}),
    ];
    getArcaConfig().then(setArcaCfg).catch(() => {});
    getVentasConfig().then(setVentasCfg).catch(() => {});
    return () => subs.forEach((u) => u());
  }, []);

  // Homologación: los comprobantes de prueba solo se muestran mientras ARCA está en homologación (igual que Ventas)
  const incluirPruebas = arcaCfg ? arcaCfg.entorno !== 'produccion' : false;
  const comprobantes = useMemo(() => [
    ...reales.map((c) => ({ ...c, _col: 'comprobantes_venta', _prueba: false, coleccion: 'comprobantes_venta' })),
    ...(incluirPruebas ? pruebas.map((c) => ({ ...c, _col: 'arca_pruebas', _prueba: true, coleccion: 'arca_pruebas' })) : []),
  ], [reales, pruebas, incluirPruebas]);
  const recibosVis = useMemo(() => recibos.filter((r) => incluirPruebas || !r.prueba), [recibos, incluirPruebas]);
  const cartera = useMemo(() => calcularCartera(comprobantes, recibosVis, saldosIni), [comprobantes, recibosVis, saldosIni]);
  const obra = useMemo(() => obras.find((o) => !o.deleted && (o.id === p.obraId || o.presupuestoId === p.id)) || null, [obras, p.obraId, p.id]);

  const t = useMemo(() => calcularTrazabilidad({
    presupuesto: p, obra, comprobantes, recibos: recibosVis, remitos, materiales, incluirPruebas,
  }), [p, obra, comprobantes, recibosVis, remitos, materiales, incluirPruebas]);

  const cli = clienteDesdePresupuesto(p);
  const claveCliente = cartera.claveDe({ clienteId: cli.id, clienteCuit: cli.docNro, clienteNombre: cli.nombre });
  const cuenta = cartera.cuentas[claveCliente];
  const anticiposSinAplicar = cuenta?.creditoSinAplicar || 0;

  const pendientesCobro = t.facturas.filter((f) => !f._anulado && f._pendiente > 0.009);
  const registrarCobranza = () => {
    const emp = pendientesCobro[0]?.empresaId || empresaDeCanal(p.canal);
    const ids = pendientesCobro.filter((f) => (f.empresaId || EMPRESA_AYALA) === emp).map((f) => f.id);
    const ref = pendientesCobro[0];
    setModalRecibo({
      empresaId: emp,
      cliente: ref
        ? { clave: cartera.claveDe(ref), id: ref.clienteId || cli.id, nombre: ref.clienteNombre, docNro: ref.clienteCuit || cli.docNro, telefono: ref.clienteTelefono || cli.telefono, domicilio: ref.receptor?.domicilio || cli.domicilio, condicionIva: ref.receptor?.condicionIva || cli.condicionIva }
        : { ...cli, clave: claveCliente },
      comprobanteIds: ids,
    });
  };
  const cobrarRecienEmitido = (r) => {
    setModalFactura(false);
    setModalRecibo({
      empresaId: r.empresaId || EMPRESA_AYALA,
      cliente: { ...(r._cliente || cli), clave: cartera.claveDe(r) },
      comprobanteIds: [r.id], comprobante: r, importeInicial: Number(r.totalComprobante || 0),
    });
  };
  const pdf = (c) => generarPDFFacturaArca(c, c.letra === 'X' ? ventasCfg.euler : arcaCfg).catch((e) => alert(e.message));
  const reintentarJornadas = async () => {
    if (!obra) return;
    setReintentando(true); setMsgJornadas('');
    const r = await sincronizarJornadas(obra.id);
    setMsgJornadas(r.ok ? 'Sincronizada con Euler Jornadas.' : `Error: ${r.error}`);
    setReintentando(false);
  };

  const r = t.resumen;
  const pagoDerivado = r.cobrosAplicados > 0 || t.facturas.length
    ? (r.totalAprobado > 0 ? `${Math.round((r.cobrosAplicados / r.totalAprobado) * 100)}% del alcance aprobado cobrado (según recibos)` : 'Hay comprobantes sin aprobación registrada')
    : null;
  const kpis = [
    ['Total cotizado', r.totalCotizado, '#0D2A4E', 'Revisión vigente'],
    ['Total aprobado', r.totalAprobado, '#047857', r.tipoAprobacion ? (r.tipoAprobacion === 'historica' ? 'Aprobación histórica (sin detalle)' : `Aprobación ${r.tipoAprobacion}`) : 'Sin aprobación'],
    ['Pendiente de aprobar', r.pendienteAprobar, '#64748b', 'Alcance no contratado: NO es deuda'],
    ['Aprobado pend. de facturar', r.aprobadoPendienteFacturar, '#b45309', 'Por cantidades aprobadas'],
    ['Facturado (con ajustes)', r.facturado, '#7c3aed', r.facturadoSinAsignar > 0.01 ? `${$(r.facturadoSinAsignar)} sin asignar a ítems` : 'Facturas − notas de crédito'],
    ['Cobros aplicados', r.cobrosAplicados, '#15803d', pagoDerivado || 'Sin cobros'],
    ['Anticipos sin aplicar', anticiposSinAplicar, '#0e7490', 'Del cliente (no asignados a este presupuesto)'],
    ['Saldo pendiente de cobro', r.saldoPendienteCobro, '#b91c1c', 'Documentos emitidos'],
  ];

  if (cargando) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}><Loader size={18} className="spin" /> Cargando gestión comercial…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Acciones */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-primary" onClick={onAprobarPendientes} disabled={!t.filas.some((f) => !f.eliminado && f.sinAprobar > EPS)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Target size={15} /> Aprobar pendientes</button>
        <button className="btn btn-secondary" onClick={() => setModalFactura(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Receipt size={15} /> Facturar ítems</button>
        <button className="btn btn-secondary" onClick={registrarCobranza} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Wallet size={15} /> Registrar cobranza</button>
        {obra && <button className="btn btn-secondary" onClick={() => navigate(`/obras?obra=${obra.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><HardHat size={15} /> Obra {obra.otNumber}</button>}
        <button className="btn btn-secondary" onClick={() => navigate('/facturas')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><ExternalLink size={15} /> Ventas</button>
        {incluirPruebas && <Pill t="ARCA en homologación: se muestran comprobantes de PRUEBA" c="#92400e" bg="#fef3c7" />}
      </div>

      {obra && obra.jornadasSync?.estado === 'error' && (
        <div style={{ padding: '0.6rem 0.75rem', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <AlertTriangle size={15} /> La obra no se sincronizó con Euler Jornadas: {obra.jornadasSync.error}
          <button className="btn btn-secondary" onClick={reintentarJornadas} disabled={reintentando} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            {reintentando ? <Loader size={14} className="spin" /> : <RefreshCw size={14} />} Reintentar
          </button>
        </div>
      )}
      {msgJornadas && <div style={{ fontSize: '0.8rem', color: msgJornadas.startsWith('Error') ? '#b91c1c' : '#166534' }}>{msgJornadas}</div>}

      {/* Resumen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.5rem' }}>
        {kpis.map(([titulo, v, c, det]) => (
          <div key={titulo} style={{ ...seccion, padding: '0.55rem 0.75rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{titulo}</div>
            <div style={{ fontWeight: 800, color: c, fontSize: '1rem' }}>{$(v)}</div>
            <div style={{ fontSize: '0.66rem', color: 'var(--text-tertiary)' }}>{det}</div>
          </div>
        ))}
      </div>
      {p.paymentStatus && p.paymentStatus !== 'Pendiente' && (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          Estado de pago declarado manualmente al aprobar: <b>{p.paymentStatus}</b> (declaración, no es un registro de cobro).
        </div>
      )}
      {t.avisos.length > 0 && <div style={{ padding: '0.6rem 0.75rem', borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: '0.78rem', whiteSpace: 'pre-wrap' }}>{t.avisos.join('\n')}</div>}

      {/* Detalle por ítem */}
      <div style={seccion}>
        <h4 style={h4}>Detalle por ítem</h4>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {['Ítem', 'Cotizado', 'Aprobado', 'Facturado', 'Entregado', 'Sin aprobar', 'Aprob. sin facturar', 'Fact. sin entregar', 'Documentos'].map((h, i) => (
                <th key={h} style={{ ...th, textAlign: i === 0 || i === 8 ? 'left' : 'right' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {t.filas.map((f) => (
                <tr key={f.key} style={{ opacity: f.eliminado ? 0.7 : 1 }}>
                  <td style={td}>{f.descripcion}{f.eliminado && <div><Pill t="Ya no está en el presupuesto (aprobado antes)" c="#9a3412" bg="#ffedd5" /></div>}
                    <div style={{ fontSize: '0.66rem', color: 'var(--text-tertiary)' }}>{f.inventariable ? 'Inventariable' : 'Sin stock (mano de obra / servicio / global)'}</div></td>
                  <td style={{ ...td, textAlign: 'right' }}>{q(f.cotizada)}</td>
                  <td style={{ ...td, textAlign: 'right', color: '#047857', fontWeight: 600 }}>{q(f.aprobada)}</td>
                  <td style={{ ...td, textAlign: 'right', color: '#7c3aed' }}>{q(f.facturada)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{f.inventariable ? q(f.entregada) : '—'}</td>
                  <td style={{ ...td, textAlign: 'right', color: '#64748b' }}>{q(f.sinAprobar)}</td>
                  <td style={{ ...td, textAlign: 'right', color: f.aprobadaSinFacturar > EPS ? '#b45309' : undefined }}>{q(f.aprobadaSinFacturar)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{f.facturadaSinEntregar === null ? '—' : q(f.facturadaSinEntregar)}</td>
                  <td style={{ ...td, fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{[...f.docsFacturas, ...f.docsEntregas].join(' · ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Comprobantes */}
      <div style={seccion}>
        <h4 style={h4}><Receipt size={15} /> Comprobantes</h4>
        {!t.facturas.length ? <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Sin comprobantes vinculados.</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Tipo', 'Emisor / canal', 'Número', 'Fecha', 'Estado', 'Importe', 'NC', 'Cobrado', 'Saldo', ''].map((h, i) => <th key={h + i} style={{ ...th, textAlign: i >= 5 && i <= 8 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
            <tbody>
              {t.facturas.map((c) => {
                const emp = EMPRESAS_LISTADO[c.empresaId || EMPRESA_AYALA];
                const estado = c._anulado ? ['Anulado', '#b91c1c', '#fee2e2'] : c._anuladaPorNC ? ['Anulada por NC', '#b91c1c', '#fee2e2'] : c._pendiente <= 0.009 ? ['Cobrado', '#047857', '#d1fae5'] : c._cobrado > 0 ? ['Cobro parcial', '#1d4ed8', '#dbeafe'] : ['Pendiente de cobro', '#92400e', '#fef3c7'];
                return (
                  <tr key={c.id}>
                    <td style={td}>{c.letra === 'X' ? 'Comprobante X (interno)' : `Factura ${c.letra} (fiscal)`}{c._prueba && <div><Pill t="PRUEBA" c="#92400e" bg="#fef3c7" /></div>}{!c._items && <div><Pill t="Sin detalle por ítem" /></div>}</td>
                    <td style={td}>{emp?.corto || c.empresaId}<div style={{ fontSize: '0.66rem', color: 'var(--text-tertiary)' }}>{emp?.canal}</div></td>
                    <td style={td}>{c.numeroOriginal}</td>
                    <td style={td}>{fechaAR(c.fechaEmision)}</td>
                    <td style={td}><Pill t={estado[0]} c={estado[1]} bg={estado[2]} />{c._ncParcial && <div><Pill t="NC parcial" c="#9a3412" bg="#ffedd5" /></div>}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{$(c._total)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{c._nc ? `− ${$(c._nc)}` : '—'}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{$(c._cobrado)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{$(c._pendiente)}</td>
                    <td style={td}><button className="btn btn-secondary" style={{ padding: '0.2rem 0.45rem' }} title="Descargar PDF" onClick={() => pdf(c)}><Download size={13} /></button></td>
                  </tr>
                );
              })}
              {t.notasCredito.map((n) => (
                <tr key={n.id} style={{ background: '#faf5ff' }}>
                  <td style={td}>{n.tipoComprobante || 'Nota de crédito'}</td>
                  <td style={td}>{EMPRESAS_LISTADO[n.empresaId || EMPRESA_AYALA]?.corto}</td>
                  <td style={td}>{n.numeroOriginal}</td>
                  <td style={td}>{fechaAR(n.fechaEmision)}</td>
                  <td style={td}>Acredita {n.comprobanteAsociado?.numeroOriginal}</td>
                  <td style={{ ...td, textAlign: 'right' }}>− {$(n.totalComprobante)}</td>
                  <td style={td} colSpan={3} />
                  <td style={td}><button className="btn btn-secondary" style={{ padding: '0.2rem 0.45rem' }} onClick={() => pdf(n)}><Download size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Cobranzas (a nivel comprobante: no se asignan a ítems) */}
      <div style={seccion}>
        <h4 style={h4}><Wallet size={15} /> Cobranzas <span style={{ textTransform: 'none', fontWeight: 400, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>· aplicadas a comprobantes, no a ítems</span></h4>
        {!t.recibos.length ? <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Sin cobros aplicados a comprobantes de este presupuesto.</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Recibo', 'Fecha', 'Medios de pago', 'Aplicado a', 'Aplicado', 'Total recibo'].map((h, i) => <th key={h} style={{ ...th, textAlign: i >= 4 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
            <tbody>
              {t.recibos.map((rc) => (
                <tr key={rc.id}>
                  <td style={td}>{rc.numeroOriginal}{rc.prueba && <div><Pill t="PRUEBA" c="#92400e" bg="#fef3c7" /></div>}</td>
                  <td style={td}>{fechaAR(rc.fechaEmision)}</td>
                  <td style={td}>{(rc.mediosPago || []).map((m, i) => (
                    <div key={i}>{MEDIOS_COBRO[m.tipo]?.corto || m.tipo} {$(m.importe)} <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{detalleMedio(m)}</span></div>
                  ))}</td>
                  <td style={td}>{rc._imputacionesPresupuesto.map((i) => `${i.tipoComprobante} ${i.numeroOriginal}: ${$(i.importe)}`).join(' · ')}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{$(rc._aplicado)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{$(rc.totalRecibo)}{Number(rc.aCuenta) > 0.009 && <div style={{ fontSize: '0.66rem', color: '#0e7490' }}>a cuenta {$(rc.aCuenta)}</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Entregas y reservas */}
      <div style={seccion}>
        <h4 style={h4}><PackageCheck size={15} /> Entregas, reservas y pendientes</h4>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 6 }}>Reservado = aprobado, facturado con entrega posterior y cobrado. Facturado sin cobrar con entrega pendiente no reserva stock.</div>
        {t.materiales.filter((m) => m.estado !== 'entregado').map((m) => {
          const reservadoM = t.reservas.filter((x) => x.ref.id === m.id);
          return (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.4rem 0', borderBottom: '1px solid var(--border-light)', fontSize: '0.8rem', flexWrap: 'wrap' }}>
              <Pill t={reservadoM.length ? 'Reservado (cobrado)' : 'Pendiente de entrega · sin cobrar (no reserva)'} c={reservadoM.length ? '#b45309' : '#64748b'} bg={reservadoM.length ? '#fef3c7' : '#f1f5f9'} />
              <span style={{ flex: 1 }}>{m.comprobanteNumero || 'Saldo inicial'} · {(m.items || []).map((it) => `${it.descripcion}: ${q(Number(it.cantidad) - Number(it.cantidadEntregada || 0))} pend.`).join(' · ')}{m.prueba ? ' · PRUEBA' : ''}</span>
              <button className="btn btn-secondary" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => setModalEntrega(m)}><PackageCheck size={13} /> Registrar entrega</button>
            </div>
          );
        })}
        {t.remitos.map((rm) => (
          <div key={rm.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.4rem 0', borderBottom: '1px solid var(--border-light)', fontSize: '0.8rem', flexWrap: 'wrap' }}>
            <Pill t={rm.estado === 'anulado' ? 'Remito anulado' : `Remito · ${rm.estadoFirma === 'firmado' ? 'firmado' : 'sin firma'}`} c={rm.estado === 'anulado' ? '#b91c1c' : '#047857'} bg={rm.estado === 'anulado' ? '#fee2e2' : '#d1fae5'} />
            <span style={{ flex: 1 }}>N° {rm.numero} · {fechaAR(rm.fecha)} · {(rm.items || []).map((it) => `${it.descripcion} × ${q(it.cantidad)}`).join(' · ')}</span>
            <button className="btn btn-secondary" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => setModalRemito(rm)}><FileSignature size={13} /> Ver / conformidad</button>
          </div>
        ))}
        {(obra?.stockDescontado || []).filter((d) => d.via === 'directo').length > 0 && (
          <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: 6 }}>
            Descontado de stock en la obra: {obra.stockDescontado.filter((d) => d.via === 'directo').map((d) => `${d.descripcion} × ${q(d.cantidad)} (${d.etapa})`).join(' · ')}
          </div>
        )}
        {!t.materiales.length && !t.remitos.length && !(obra?.stockDescontado || []).length && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Sin entregas ni materiales pendientes.</div>}
      </div>

      {/* Historial */}
      <div style={seccion}>
        <h4 style={h4}>Historial comercial</h4>
        {!t.historial.length ? <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Sin movimientos.</div> : t.historial.map((h, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, fontSize: '0.8rem', padding: '0.25rem 0', borderBottom: '1px dashed var(--border-light)' }}>
            <span style={{ width: 80, color: 'var(--text-secondary)' }}>{fechaAR(String(h.fecha).slice(0, 10))}</span>
            <Pill t={{ aprobacion: 'Aprobación', factura: 'Factura', nc: 'Nota de crédito', cobro: 'Cobro', entrega: 'Entrega' }[h.tipo]} />
            <span style={{ flex: 1 }}>{h.texto}</span>
            {h.importe !== undefined && <b>{$(h.importe)}</b>}
          </div>
        ))}
      </div>

      {modalFactura && (
        <NuevaFacturaModal
          preset={{ presupuestoId: p.id, empresaId: empresaDeCanal(p.canal) === EMPRESA_EULER ? EMPRESA_EULER : EMPRESA_AYALA }}
          arcaCfg={arcaCfg || {}} ventasCfg={ventasCfg} cuentas={Object.values(cartera.cuentas)} comprobantes={comprobantes} obras={obras}
          onClose={() => setModalFactura(false)} onCobrar={cobrarRecienEmitido}
        />
      )}
      {modalRecibo && <ReciboModal preset={modalRecibo} arcaCfg={arcaCfg || {}} ventasCfg={ventasCfg} cartera={cartera} onClose={() => setModalRecibo(null)} />}
      {modalEntrega && <EntregaModal mat={modalEntrega} onClose={() => setModalEntrega(null)} />}
      {modalRemito && <RemitoModal remito={modalRemito} onClose={() => setModalRemito(null)} />}
    </div>
  );
}
