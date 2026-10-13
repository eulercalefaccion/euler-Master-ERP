import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import {
  Package, Users, AlertTriangle, ShoppingCart, Clock, FileSpreadsheet, Search, X, ChevronDown, ChevronRight, PackageCheck, Link2, MessageCircle, HardHat, Wallet, Loader,
} from 'lucide-react';
import { db } from '../../services/firebaseConfig';
import { useAuth } from '../../context/AuthContext';
import { calcularReservas } from '../../services/reservasStock';
import { calcularCartera, normalizarNombre, r2 } from '../../services/ventasCalculo';
import { registrarEntregaMateriales, vincularMaterialArticulo } from '../../services/cobranzasService';
import { ars, fechaAR, abrirWhatsApp, exportarExcel } from '../../services/listadosService';
import { KpiCard, Pill, EmpresaBadge, IconBtn } from '../Listados/listadosUI';
import { cellPad, inputSt } from '../Listados/listadosHelpers';
import { diasDesde, thSt, inp } from '../Ventas/ventasHelpers';
import { Modal, Seg, Alerta } from '../Ventas/ventasUI';

const DIAS_ALERTA = 60;
const num = (n) => Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });
const th = (h, right) => <th key={h} style={{ ...cellPad, textAlign: right ? 'right' : 'left', fontWeight: 600, fontSize: '0.72rem', whiteSpace: 'nowrap' }}>{h}</th>;
const origenPill = (r) => (r.origen === 'pagado'
  ? <Pill texto="Vendido · entrega pendiente" color="#b45309" bg="#fef3c7" />
  : <Pill texto="Obra aprobada sin iniciar" color="#1d4ed8" bg="#dbeafe" />);
const refTxt = (r) => (r.origen === 'pagado' ? (r.comprobanteNumero || 'Saldo inicial') : `${r.otNumber ? `${r.otNumber} · ` : ''}${r.obraNombre || 'Obra'}`);

function VincularModal({ reserva, lista, onClose }) {
  const [t, setT] = useState(reserva.descripcion || '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const res = useMemo(() => {
    const q = normalizarNombre(t);
    if (!q) return [];
    const palabras = q.split(' ');
    return lista.filter((i) => !['mano_de_obra', 'servicio', 'gasto'].includes(i.tipo))
      .filter((i) => { const d = normalizarNombre(i.descripcion); return palabras.every((p) => d.includes(p)); })
      .slice(0, 25);
  }, [t, lista]);
  const elegir = async (art) => {
    setGuardando(true);
    try { await vincularMaterialArticulo(reserva.ref, reserva.itemIndex, art); onClose(); } catch (e) { setError(e.message); setGuardando(false); }
  };
  return (
    <Modal titulo="Vincular con un artículo del stock" subtitulo={`${reserva.descripcion} · ${reserva.clienteNombre}`} onClose={onClose} ancho={680}>
      <Alerta tipo="info">Al vincularlo, esta reserva pasa a descontar del disponible de ese artículo, y la entrega descuenta el stock físico.</Alerta>
      <input style={inp} value={t} onChange={(e) => setT(e.target.value)} placeholder="Buscar en la lista de precios…" autoFocus />
      <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: 8 }}>
        {res.length === 0 ? <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Sin resultados.</div> : res.map((a) => (
          <button key={a.id} disabled={guardando} onClick={() => elegir(a)}
            style={{ display: 'flex', justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', border: 'none', borderBottom: '1px solid var(--border-light)', background: 'none', cursor: 'pointer', fontSize: '0.82rem', color: 'inherit' }}>
            <span>{a.descripcion}<span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}> · {a.categoria || ''}</span></span>
            <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Stock {num(a.stock)}</span>
          </button>
        ))}
      </div>
      {guardando && <div style={{ fontSize: '0.8rem' }}><Loader size={14} className="spin" /> Guardando…</div>}
      {error && <Alerta>{error}</Alerta>}
    </Modal>
  );
}

/**
 * Reporte de materiales reservados: vendidos con entrega pendiente + obras aprobadas sin iniciar.
 */
export default function ReservasStock({ lista, materiales, obras, tc, articuloInicial, verPruebas }) {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [vista, setVista] = useState('articulo');
  const [busqueda, setBusqueda] = useState(articuloInicial || '');
  const [origen, setOrigen] = useState('');
  const [soloFaltantes, setSoloFaltantes] = useState(false);
  const [soloViejas, setSoloViejas] = useState(false);
  const [abiertos, setAbiertos] = useState({});
  const [vincular, setVincular] = useState(null);
  const [error, setError] = useState('');
  const [comps, setComps] = useState([]);
  const [recs, setRecs] = useState([]);

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'comprobantes_venta'), (s) => setComps(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {});
    const u2 = onSnapshot(collection(db, 'recibos'), (s) => setRecs(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {});
    return () => { u1(); u2(); };
  }, []);

  const { reservas, porArticulo } = useMemo(() => calcularReservas({ materiales, obras, lista, incluirPruebas: verPruebas }), [materiales, obras, lista, verPruebas]);
  const cartera = useMemo(() => calcularCartera(comps, recs, []), [comps, recs]);
  const compPor = useMemo(() => Object.fromEntries(comps.map((c) => [c.id, c])), [comps]);
  const listaPor = useMemo(() => Object.fromEntries(lista.map((i) => [i.id, i])), [lista]);

  const pagoDe = (r) => {
    if (r.origen !== 'pagado') return null;
    const c = r.comprobanteId ? compPor[r.comprobanteId] : null;
    if (!c) return r.comprobanteId ? null : { txt: 'Saldo inicial', ok: true };
    const p = cartera.pendienteDe(c);
    return p <= 0.01 ? { txt: 'Cobrado', ok: true } : { txt: `Debe ${ars(p)}`, ok: false };
  };
  const costoDe = (r) => {
    const a = r.articuloId ? listaPor[r.articuloId] : null;
    return a?.costoUSD && tc?.valor ? r2(Number(a.costoUSD) * tc.valor * r.pendiente) : 0;
  };

  const filtradas = useMemo(() => {
    const t = normalizarNombre(busqueda);
    return reservas.filter((r) => {
      if (origen && r.origen !== origen) return false;
      if (soloViejas && diasDesde(r.fecha) <= DIAS_ALERTA) return false;
      if (!t) return true;
      return normalizarNombre([r.descripcion, r.clienteNombre, refTxt(r)].join(' ')).includes(t);
    });
  }, [reservas, origen, soloViejas, busqueda]);

  const articulos = useMemo(() => {
    const keys = new Set(filtradas.map((r) => (r.articuloId || `txt:${normalizarNombre(r.descripcion)}`)));
    return Object.values(porArticulo).filter((a) => keys.has(a.clave)).filter((a) => !soloFaltantes || (a.faltante || 0) > 0)
      .map((a) => ({ ...a, _res: a.reservas.filter((r) => filtradas.includes(r)) }))
      .sort((a, b) => (b.faltante || 0) - (a.faltante || 0) || b.reservado - a.reservado);
  }, [porArticulo, filtradas, soloFaltantes]);

  const clientes = useMemo(() => {
    const m = {};
    filtradas.forEach((r) => {
      const k = r.clienteClave || `nom:${normalizarNombre(r.clienteNombre)}`;
      if (!m[k]) m[k] = { clave: k, ctaClave: r.clienteClave, nombre: r.clienteNombre, telefono: r.clienteTelefono, reservas: [], unidades: 0, fecha: '', origenes: new Set() };
      const c = m[k];
      c.reservas.push(r); c.unidades = r2(c.unidades + r.pendiente); c.origenes.add(r.origen);
      if (!c.telefono && r.clienteTelefono) c.telefono = r.clienteTelefono;
      if (r.fecha && (!c.fecha || r.fecha < c.fecha)) c.fecha = r.fecha;
    });
    return Object.values(m).sort((a, b) => (a.fecha || '9').localeCompare(b.fecha || '9'));
  }, [filtradas]);

  const kpi = (() => {
    const k = { unidades: 0, articulos: new Set(), clientes: new Set(), costo: 0, pagadoValor: 0, viejas: 0, sinVincular: 0 };
    filtradas.forEach((r) => {
      k.unidades += r.pendiente;
      k.articulos.add(r.articuloId || r.descripcion);
      k.clientes.add(r.clienteClave || normalizarNombre(r.clienteNombre));
      k.costo += costoDe(r);
      if (r.origen === 'pagado') k.pagadoValor += r.pendiente * r.precioUnitario;
      if (diasDesde(r.fecha) > DIAS_ALERTA) k.viejas += 1;
      if (!r.articuloId) k.sinVincular += 1;
    });
    const falt = Object.values(porArticulo).filter((a) => (a.faltante || 0) > 0);
    return { ...k, articulos: k.articulos.size, clientes: k.clientes.size, faltArt: falt.length, faltUnid: falt.reduce((s, a) => s + a.faltante, 0) };
  })();

  const entregar = async (r) => {
    const v = window.prompt(`Entregar "${r.descripcion}" a ${r.clienteNombre}.\nPendiente: ${num(r.pendiente)} ${r.unidad}.\n\n¿Cuántas unidades se entregan ahora?${r.articuloId ? '\n(Se descuentan del stock físico)' : '\n(Ítem sin vincular: no descuenta stock)'}`, String(r.pendiente));
    if (v === null) return;
    const cant = Number(String(v).replace(',', '.'));
    if (!(cant > 0)) return;
    try { await registrarEntregaMateriales(r.ref, { [r.itemIndex]: cant }, 'Entrega desde Reservas de stock', currentUser); } catch (e) { setError(e.message); }
  };
  const whatsapp = (c) => abrirWhatsApp(c.telefono, `Hola ${(c.nombre || '').split(' ')[0]}, te escribimos de Euler Calefacción. Tenemos registrados estos materiales tuyos pendientes de entrega:\n${c.reservas.map((r) => `• ${num(r.pendiente)} ${r.unidad} ${r.descripcion}`).join('\n')}\n\n¿Coordinamos la entrega/instalación?`);

  const exportarDetalle = () => exportarExcel(filtradas, [
    { titulo: 'Fecha', valor: (r) => fechaAR(r.fecha), ancho: 11 },
    { titulo: 'Días', valor: (r) => diasDesde(r.fecha), ancho: 7 },
    { titulo: 'Origen', valor: (r) => (r.origen === 'pagado' ? 'Vendido - entrega pendiente' : 'Obra aprobada sin iniciar'), ancho: 26 },
    { titulo: 'Comprobante / Obra', valor: refTxt, ancho: 28 },
    { titulo: 'Cliente', valor: (r) => r.clienteNombre, ancho: 32 },
    { titulo: 'Teléfono', valor: (r) => r.clienteTelefono || '', ancho: 15 },
    { titulo: 'Artículo', valor: (r) => r.descripcion, ancho: 44 },
    { titulo: 'Vinculado a stock', valor: (r) => (r.articuloId ? 'Sí' : 'No'), ancho: 10 },
    { titulo: 'Cantidad', valor: (r) => r.cantidad, ancho: 10 },
    { titulo: 'Entregado', valor: (r) => r.entregada, ancho: 10 },
    { titulo: 'Pendiente', valor: (r) => r.pendiente, ancho: 10 },
    { titulo: 'Unidad', valor: (r) => r.unidad, ancho: 8 },
    { titulo: 'Estado de pago', valor: (r) => pagoDe(r)?.txt || '', ancho: 18 },
    { titulo: 'Costo reservado ARS', valor: costoDe, ancho: 16 },
  ], `Materiales_reservados_${new Date().toISOString().slice(0, 10)}.xlsx`, 'Reservados');
  const exportarCompras = () => exportarExcel(Object.values(porArticulo).filter((a) => (a.faltante || 0) > 0).sort((a, b) => b.faltante - a.faltante), [
    { titulo: 'Artículo', valor: (a) => a.descripcion, ancho: 48 },
    { titulo: 'Proveedor', valor: (a) => a.articulo?.proveedor || '', ancho: 18 },
    { titulo: 'Stock físico', valor: (a) => a.stock, ancho: 12 },
    { titulo: 'Reservado', valor: (a) => a.reservado, ancho: 12 },
    { titulo: 'Faltante a comprar', valor: (a) => a.faltante, ancho: 14 },
    { titulo: 'Mínimo', valor: (a) => Number(a.articulo?.stockMinimo || 0), ancho: 10 },
    { titulo: 'Sugerido (faltante + mínimo)', valor: (a) => a.faltante + Number(a.articulo?.stockMinimo || 0), ancho: 16 },
    { titulo: 'Costo USD unit.', valor: (a) => Number(a.articulo?.costoUSD || 0), ancho: 12 },
    { titulo: 'Costo total USD', valor: (a) => r2(Number(a.articulo?.costoUSD || 0) * a.faltante), ancho: 14 },
  ], `Lista_de_compras_${new Date().toISOString().slice(0, 10)}.xlsx`, 'Compras');

  const filaReserva = (r, conArticulo) => {
    const d = diasDesde(r.fecha);
    const pago = pagoDe(r);
    return (
      <tr key={r.key} style={{ borderTop: '1px solid var(--border-light)', background: r.prueba ? 'rgba(254, 226, 226, 0.18)' : undefined }}>
        <td style={{ ...cellPad, whiteSpace: 'nowrap' }}>{fechaAR(r.fecha)}<div style={{ fontSize: '0.68rem', color: d > DIAS_ALERTA ? '#b91c1c' : 'var(--text-secondary)', fontWeight: d > DIAS_ALERTA ? 700 : 400 }}>{d} días</div></td>
        <td style={cellPad}><div style={{ fontWeight: 600 }}>{r.clienteNombre}</div><div style={{ display: 'flex', gap: 4, marginTop: 2 }}><EmpresaBadge empresaId={r.empresaId} />{r.prueba && <Pill texto="PRUEBA" color="#b91c1c" bg="#fee2e2" />}</div></td>
        <td style={cellPad}>{origenPill(r)}<div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>{refTxt(r)}</div></td>
        {conArticulo && (
          <td style={cellPad}>
            {r.descripcion}
            {!r.articuloId && <div><Pill texto="Sin vincular al stock" color="#b91c1c" bg="#fee2e2" title="No descuenta del disponible" /></div>}
          </td>
        )}
        <td style={{ ...cellPad, textAlign: 'right', whiteSpace: 'nowrap' }}>{num(r.cantidad)}{r.entregada ? <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>entreg. {num(r.entregada)}</div> : null}</td>
        <td style={{ ...cellPad, textAlign: 'right', fontWeight: 700, color: '#b45309', whiteSpace: 'nowrap' }}>{num(r.pendiente)} {r.unidad}</td>
        <td style={{ ...cellPad, whiteSpace: 'nowrap' }}>{pago ? <span style={{ fontSize: '0.74rem', fontWeight: 600, color: pago.ok ? '#047857' : '#b91c1c' }}>{pago.txt}</span> : <span style={{ color: 'var(--text-secondary)' }}>—</span>}</td>
        <td style={{ ...cellPad, whiteSpace: 'nowrap' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {r.origen === 'pagado' && <IconBtn title="Registrar entrega" onClick={() => entregar(r)} color="#047857" bg="#d1fae5"><PackageCheck size={14} /></IconBtn>}
            {r.origen === 'pagado' && !r.articuloId && <IconBtn title="Vincular con artículo del stock" onClick={() => setVincular(r)} color="#b91c1c" bg="#fee2e2"><Link2 size={14} /></IconBtn>}
            {r.origen === 'pagado' && r.clienteClave && <IconBtn title="Cuenta corriente" onClick={() => navigate(`/facturas?cliente=${encodeURIComponent(r.clienteClave)}`)}><Wallet size={14} /></IconBtn>}
            {r.obraId && <IconBtn title="Ir a la obra" onClick={() => navigate(`/obras?obra=${r.obraId}`)} color="#0D2A4E" bg="#e8eff7"><HardHat size={14} /></IconBtn>}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0.25rem 0' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
        <KpiCard titulo="Unidades reservadas" valor={num(kpi.unidades)} color="#b45309" icono={<Package size={18} />} detalle={`${kpi.articulos} artículo(s) distintos`} />
        <KpiCard titulo="Clientes con reservas" valor={String(kpi.clientes)} color="#1d4ed8" icono={<Users size={18} />} detalle={kpi.pagadoValor > 0 ? `${ars(kpi.pagadoValor)} vendidos sin entregar` : 'Sin ventas pendientes de entrega'} />
        <div onClick={() => { setSoloFaltantes((v) => !v); setVista('articulo'); }} style={{ cursor: 'pointer' }} title="Ver solo faltantes">
          <KpiCard titulo="Faltante a comprar" valor={`${num(kpi.faltUnid)} u.`} color="#b91c1c" icono={<ShoppingCart size={18} />} detalle={`${kpi.faltArt} artículo(s) con disponible negativo`} />
        </div>
        <KpiCard titulo="Costo de lo reservado" valor={ars(kpi.costo)} color="#7c3aed" icono={<AlertTriangle size={18} />} detalle={tc ? `al costo, TC ${num(tc.valor)}` : 'sin tipo de cambio'} />
        <div onClick={() => setSoloViejas((v) => !v)} style={{ cursor: 'pointer' }} title={`Reservas de más de ${DIAS_ALERTA} días`}>
          <KpiCard titulo={`Reservas de +${DIAS_ALERTA} días`} valor={String(kpi.viejas)} color={kpi.viejas ? '#b91c1c' : '#047857'} icono={<Clock size={18} />} detalle={kpi.sinVincular ? `${kpi.sinVincular} ítem(s) sin vincular al stock` : 'Todo vinculado al stock'} />
        </div>
      </div>

      <div className="card" style={{ padding: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input style={{ ...inputSt, width: '100%', paddingLeft: 32, boxSizing: 'border-box' }} placeholder="Buscar artículo, cliente, comprobante u obra…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          {busqueda && <button onClick={() => setBusqueda('')} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><X size={14} /></button>}
        </div>
        <Seg opciones={[['articulo', 'Por artículo'], ['cliente', 'Por cliente'], ['detalle', 'Detalle']]} valor={vista} onChange={setVista} />
        <Seg opciones={[['', 'Todo'], ['pagado', 'Vendido sin entregar'], ['obra', 'Obras sin iniciar']]} valor={origen} onChange={setOrigen} />
        {soloFaltantes && <span onClick={() => setSoloFaltantes(false)} style={{ cursor: 'pointer' }}><Pill texto="Solo faltantes ✕" color="#b91c1c" bg="#fee2e2" /></span>}
        {soloViejas && <span onClick={() => setSoloViejas(false)} style={{ cursor: 'pointer' }}><Pill texto={`+${DIAS_ALERTA} días ✕`} color="#b91c1c" bg="#fee2e2" /></span>}
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <button className="btn btn-secondary" onClick={exportarCompras} disabled={!kpi.faltArt} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><ShoppingCart size={15} /> Lista de compras</button>
          <button className="btn btn-secondary" onClick={exportarDetalle} disabled={!filtradas.length} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><FileSpreadsheet size={15} /> Excel</button>
        </div>
      </div>
      {error && <Alerta>{error}</Alerta>}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          {filtradas.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No hay materiales reservados{busqueda || origen ? ' para los filtros elegidos' : ''}.
              <div style={{ fontSize: '0.78rem', marginTop: 6 }}>Se reservan al facturar ítems con “Entrega pendiente” y con las obras aprobadas que todavía no se iniciaron.</div>
            </div>
          ) : vista === 'articulo' ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
              <thead><tr style={thSt}>{th('')}{th('Artículo')}{th('Stock físico', 1)}{th('Reservado', 1)}{th('Disponible', 1)}{th('A comprar', 1)}{th('Clientes', 1)}{th('Más antigua')}</tr></thead>
              <tbody>
                {articulos.map((a) => {
                  const ab = !!abiertos[a.clave];
                  return (
                    <React.Fragment key={a.clave}>
                      <tr onClick={() => setAbiertos({ ...abiertos, [a.clave]: !ab })} style={{ borderTop: '1px solid var(--border-light)', cursor: 'pointer', background: (a.faltante || 0) > 0 ? 'rgba(220,38,38,0.04)' : undefined }}>
                        <td style={{ ...cellPad, width: 24 }}>{ab ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
                        <td style={cellPad}>
                          <div style={{ fontWeight: 600 }}>{a.descripcion}</div>
                          {!a.articuloId && <Pill texto="Sin vincular al stock" color="#b91c1c" bg="#fee2e2" />}
                          {a.articulo?.categoria && <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{a.articulo.categoria}</span>}
                        </td>
                        <td style={{ ...cellPad, textAlign: 'right' }}>{a.stock === null ? '—' : num(a.stock)}</td>
                        <td style={{ ...cellPad, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <b style={{ color: '#b45309' }}>{num(a.reservado)}</b>
                          <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)' }}>{[a.reservadoPagado && `${num(a.reservadoPagado)} vend.`, a.reservadoObra && `${num(a.reservadoObra)} obras`].filter(Boolean).join(' · ')}</div>
                        </td>
                        <td style={{ ...cellPad, textAlign: 'right', fontWeight: 800, color: a.disponible === null ? 'var(--text-secondary)' : a.disponible < 0 ? '#dc2626' : '#059669' }}>{a.disponible === null ? '—' : num(a.disponible)}</td>
                        <td style={{ ...cellPad, textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>{a.faltante ? num(a.faltante) : '—'}</td>
                        <td style={{ ...cellPad, textAlign: 'right' }}>{a.cantClientes}</td>
                        <td style={{ ...cellPad, whiteSpace: 'nowrap' }}>{fechaAR(a.fechaMasVieja)}</td>
                      </tr>
                      {ab && (
                        <tr><td colSpan={8} style={{ padding: '0 0.75rem 0.75rem 2.2rem', background: 'var(--bg-surface-hover, #f8fafc)' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', background: 'var(--bg-primary, #fff)', border: '1px solid var(--border-light)', borderRadius: 6 }}>
                            <thead><tr style={thSt}>{th('Fecha')}{th('Cliente')}{th('Origen')}{th('Cantidad', 1)}{th('Pendiente', 1)}{th('Pago')}{th('')}</tr></thead>
                            <tbody>{a._res.map((r) => filaReserva(r, false))}</tbody>
                          </table>
                        </td></tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          ) : vista === 'cliente' ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
              <thead><tr style={thSt}>{th('')}{th('Cliente')}{th('Materiales')}{th('Unidades', 1)}{th('Desde')}{th('')}</tr></thead>
              <tbody>
                {clientes.map((c) => {
                  const ab = !!abiertos[c.clave];
                  const d = diasDesde(c.fecha);
                  return (
                    <React.Fragment key={c.clave}>
                      <tr onClick={() => setAbiertos({ ...abiertos, [c.clave]: !ab })} style={{ borderTop: '1px solid var(--border-light)', cursor: 'pointer' }}>
                        <td style={{ ...cellPad, width: 24 }}>{ab ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
                        <td style={cellPad}><div style={{ fontWeight: 600 }}>{c.nombre}</div><div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{c.telefono}</div></td>
                        <td style={{ ...cellPad, maxWidth: 420, fontSize: '0.76rem' }}>{c.reservas.slice(0, 3).map((r) => `${num(r.pendiente)} × ${r.descripcion}`).join(' · ')}{c.reservas.length > 3 ? ` · +${c.reservas.length - 3} más` : ''}</td>
                        <td style={{ ...cellPad, textAlign: 'right', fontWeight: 700, color: '#b45309' }}>{num(c.unidades)}</td>
                        <td style={{ ...cellPad, whiteSpace: 'nowrap' }}>{fechaAR(c.fecha)}<div style={{ fontSize: '0.68rem', color: d > DIAS_ALERTA ? '#b91c1c' : 'var(--text-secondary)' }}>{d} días</div></td>
                        <td style={{ ...cellPad, whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <IconBtn title={c.telefono ? 'Coordinar entrega por WhatsApp' : 'Sin teléfono'} onClick={() => whatsapp(c)} disabled={!c.telefono} color="#15803d" bg="#dcfce7"><MessageCircle size={14} /></IconBtn>
                            {c.ctaClave && <IconBtn title="Cuenta corriente" onClick={() => navigate(`/facturas?cliente=${encodeURIComponent(c.ctaClave)}`)}><Wallet size={14} /></IconBtn>}
                          </div>
                        </td>
                      </tr>
                      {ab && (
                        <tr><td colSpan={6} style={{ padding: '0 0.75rem 0.75rem 2.2rem', background: 'var(--bg-surface-hover, #f8fafc)' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', background: 'var(--bg-primary, #fff)', border: '1px solid var(--border-light)' }}>
                            <thead><tr style={thSt}>{th('Fecha')}{th('Cliente')}{th('Origen')}{th('Artículo')}{th('Cantidad', 1)}{th('Pendiente', 1)}{th('Pago')}{th('')}</tr></thead>
                            <tbody>{c.reservas.map((r) => filaReserva(r, true))}</tbody>
                          </table>
                        </td></tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
              <thead><tr style={thSt}>{th('Fecha')}{th('Cliente')}{th('Origen')}{th('Artículo')}{th('Cantidad', 1)}{th('Pendiente', 1)}{th('Pago')}{th('Acciones')}</tr></thead>
              <tbody>{[...filtradas].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '')).map((r) => filaReserva(r, true))}</tbody>
            </table>
          )}
        </div>
      </div>
      {vincular && <VincularModal reserva={vincular} lista={lista} onClose={() => setVincular(null)} />}
    </div>
  );
}
