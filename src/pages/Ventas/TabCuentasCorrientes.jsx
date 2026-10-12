import React, { useMemo, useState } from 'react';
import { Users, TrendingDown, PiggyBank, Package, FileSpreadsheet, PlusCircle, Wallet, MessageCircle, Search, X } from 'lucide-react';
import { EMPRESAS_LISTADO, ars, fechaAR, abrirWhatsApp, exportarExcel } from '../../services/listadosService';
import { KpiCard, Pill, SortTh, IconBtn } from '../Listados/listadosUI';
import { ordenar, cellPad, inputSt } from '../Listados/listadosHelpers';
import { thSt, diasDesde, tramoDe, TRAMOS_ANTIGUEDAD, clienteDeCuenta } from './ventasHelpers';
import { Seg } from './ventasUI';
import CuentaDetalleModal from './CuentaDetalleModal';
import SaldoInicialModal from './SaldoInicialModal';

const AYALA = 'ayala-nicolas';
const EULER = 'euler-calefaccion';
const cuentaVacia = (m, clave) => ({
  clave, clienteId: m.clienteId || null, nombre: m.clienteNombre || '', cuit: m.clienteCuit || '', telefono: m.clienteTelefono || '',
  domicilio: m.clienteDomicilio || '', condicionIva: m.clienteCondicionIva || '', porEmpresa: {}, movimientos: [], pendientes: [],
  ultimaFecha: m.fecha || '', saldo: 0, deudaFacturas: 0, creditoSinAplicar: 0,
});

export default function TabCuentasCorrientes({ cartera, materiales, ventasCfg, clienteInicial, onNuevoRecibo, onNuevaFactura, onCobrar }) {
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState('deuda');
  const [empresa, setEmpresa] = useState('');
  const [tramo, setTramo] = useState('');
  const [orden, setOrden] = useState({ campo: 'saldo', dir: 'desc' });
  const [detalle, setDetalle] = useState(clienteInicial || null);
  const [saldoIni, setSaldoIni] = useState(null); // null | { cliente }

  // Materiales agrupados por cuenta
  const { matsPor, cuentas } = useMemo(() => {
    const mp = {};
    const cs = { ...cartera.cuentas };
    (materiales || []).forEach((m) => {
      if (m.estado === 'anulado') return;
      const k = cartera.claveDe(m);
      (mp[k] = mp[k] || []).push(m);
      if (!cs[k]) cs[k] = cuentaVacia(m, k);
    });
    return { matsPor: mp, cuentas: cs };
  }, [cartera, materiales]);

  const filas = useMemo(() => Object.values(cuentas).map((c) => {
    const sAy = c.porEmpresa[AYALA]?.saldo || 0;
    const sEu = c.porEmpresa[EULER]?.saldo || 0;
    const saldo = empresa === AYALA ? sAy : empresa === EULER ? sEu : c.saldo;
    const pend = c.pendientes.filter((p) => !empresa || (p.empresaId || AYALA) === empresa);
    const masVieja = pend.reduce((min, p) => (!min || (p.fechaEmision || '') < min ? p.fechaEmision : min), '');
    const dias = masVieja ? diasDesde(masVieja) : 0;
    const mats = (matsPor[c.clave] || []).filter((m) => (m.estado === 'pendiente' || m.estado === 'parcial') && (!empresa || m.empresaId === empresa));
    const unidades = mats.reduce((a, m) => a + (m.items || []).reduce((b, it) => b + Math.max(0, Number(it.cantidad) - Number(it.cantidadEntregada || 0)), 0), 0);
    return { ...c, _sAy: sAy, _sEu: sEu, _saldo: saldo, _dias: dias, _tramo: pend.length ? tramoDe(dias) : null, _cantPend: pend.length, _mats: mats.length, _unidades: unidades };
  }), [cuentas, matsPor, empresa]);

  const kpi = useMemo(() => {
    const k = { deuda: 0, favor: 0, conDeuda: 0, conFavor: 0, conMats: 0, tramos: Object.fromEntries(TRAMOS_ANTIGUEDAD.map((t) => [t.id, 0])) };
    filas.forEach((f) => {
      if (f._saldo > 0.009) { k.deuda += f._saldo; k.conDeuda += 1; }
      if (f._saldo < -0.009) { k.favor += -f._saldo; k.conFavor += 1; }
      if (f._mats) k.conMats += 1;
      f.pendientes.forEach((p) => {
        if (empresa && (p.empresaId || AYALA) !== empresa) return;
        k.tramos[tramoDe(diasDesde(p.fechaEmision)).id] += p._pendiente;
      });
    });
    return k;
  }, [filas, empresa]);

  const filtradas = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    const f = filas.filter((c) => {
      if (filtro === 'deuda' && !(c._saldo > 0.009)) return false;
      if (filtro === 'favor' && !(c._saldo < -0.009)) return false;
      if (filtro === 'materiales' && !c._mats) return false;
      if (tramo && c._tramo?.id !== tramo) return false;
      if (!t) return true;
      return [c.nombre, c.cuit, c.telefono, c.domicilio].some((v) => String(v || '').toLowerCase().includes(t));
    });
    return ordenar(f, orden, {
      cliente: (c) => c.nombre,
      ayala: (c) => c._sAy,
      euler: (c) => c._sEu,
      saldo: (c) => c._saldo,
      ultima: (c) => c.ultimaFecha,
      dias: (c) => c._dias,
    });
  }, [filas, filtro, tramo, busqueda, orden]);

  const totalTramos = Object.values(kpi.tramos).reduce((a, v) => a + v, 0);
  const cuentaDetalle = detalle ? cuentas[detalle] : null;

  const exportar = () => exportarExcel(filtradas, [
    { titulo: 'Cliente', valor: (c) => c.nombre, ancho: 36 },
    { titulo: 'CUIT/DNI', valor: (c) => c.cuit, ancho: 14 },
    { titulo: 'Teléfono', valor: (c) => c.telefono, ancho: 16 },
    { titulo: `Saldo ${EMPRESAS_LISTADO[AYALA].nombre}`, valor: (c) => c._sAy, ancho: 18 },
    { titulo: `Saldo ${EMPRESAS_LISTADO[EULER].nombre}`, valor: (c) => c._sEu, ancho: 18 },
    { titulo: 'Saldo total', valor: (c) => c.saldo, ancho: 16 },
    { titulo: 'Comprobantes pendientes', valor: (c) => c._cantPend, ancho: 12 },
    { titulo: 'Antigüedad (días)', valor: (c) => (c._cantPend ? c._dias : ''), ancho: 12 },
    { titulo: 'Última operación', valor: (c) => fechaAR(c.ultimaFecha), ancho: 12 },
    { titulo: 'Materiales a entregar (unid.)', valor: (c) => c._unidades || '', ancho: 14 },
  ], `CuentasCorrientes_${new Date().toISOString().slice(0, 10)}.xlsx`, 'Cuentas corrientes');

  const whatsapp = (c) => abrirWhatsApp(c.telefono, `Hola ${(c.nombre || '').split(' ')[0]}, te recordamos que tenés un saldo pendiente con Euler Calefacción de ${ars(c._saldo)}.\nCualquier consulta, estamos a disposición. ¡Gracias!`);
  const saldoCell = (v) => (
    <span style={{ fontWeight: 600, color: v > 0.009 ? '#b45309' : v < -0.009 ? '#047857' : 'var(--text-secondary)' }}>
      {Math.abs(v) < 0.01 ? '—' : `${v < 0 ? '−' : ''}${ars(Math.abs(v))}`}
    </span>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.75rem' }}>
        <div onClick={() => setFiltro('deuda')} style={{ cursor: 'pointer' }}>
          <KpiCard titulo="Total a cobrar" valor={ars(kpi.deuda)} color="#b45309" icono={<TrendingDown size={18} />} detalle={`${kpi.conDeuda} cliente(s) con deuda`} />
        </div>
        <div onClick={() => setFiltro('favor')} style={{ cursor: 'pointer' }}>
          <KpiCard titulo="Saldo a favor de clientes" valor={ars(kpi.favor)} color="#047857" icono={<PiggyBank size={18} />} detalle={`${kpi.conFavor} cliente(s) con anticipos`} />
        </div>
        <div onClick={() => setFiltro('materiales')} style={{ cursor: 'pointer' }}>
          <KpiCard titulo="Materiales a entregar" valor={String(kpi.conMats)} color="#7c3aed" icono={<Package size={18} />} detalle="cliente(s) con materiales pagados pendientes" />
        </div>
        <div className="card" style={{ padding: '0.85rem 1rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6 }}>Antigüedad de la deuda</div>
          <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#e2e8f0', marginBottom: 6 }}>
            {TRAMOS_ANTIGUEDAD.map((t) => (totalTramos > 0 ? <div key={t.id} style={{ width: `${(kpi.tramos[t.id] / totalTramos) * 100}%`, background: t.color }} /> : null))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px' }}>
            {TRAMOS_ANTIGUEDAD.map((t) => (
              <button key={t.id} onClick={() => { setTramo(tramo === t.id ? '' : t.id); setFiltro('deuda'); }}
                style={{ display: 'flex', justifyContent: 'space-between', gap: 4, fontSize: '0.7rem', border: 'none', background: tramo === t.id ? '#e8eff7' : 'none', borderRadius: 4, cursor: 'pointer', padding: '1px 3px', color: 'inherit' }}>
                <span style={{ color: t.color, fontWeight: 600 }}>{t.label}</span><span>{ars(kpi.tramos[t.id])}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input style={{ ...inputSt, width: '100%', paddingLeft: 32, boxSizing: 'border-box' }} placeholder="Buscar cliente, CUIT/DNI, teléfono…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          {busqueda && <button onClick={() => setBusqueda('')} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><X size={14} /></button>}
        </div>
        <Seg opciones={[['', 'Todas'], [AYALA, 'Canal 1 · Ayala'], [EULER, 'Canal 2 · Euler']]} valor={empresa} onChange={setEmpresa} />
        <Seg opciones={[['deuda', 'Con deuda'], ['favor', 'Con saldo a favor'], ['materiales', 'Con materiales'], ['todos', 'Todos']]} valor={filtro} onChange={(v) => { setFiltro(v); setTramo(''); }} />
        {tramo && <span onClick={() => setTramo('')} style={{ cursor: 'pointer' }} title="Quitar filtro"><Pill texto={`Antigüedad ${TRAMOS_ANTIGUEDAD.find((t) => t.id === tramo)?.label} ✕`} color="#0D2A4E" bg="#e8eff7" /></span>}
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <button className="btn btn-secondary" onClick={() => setSaldoIni({ cliente: null })} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><PlusCircle size={15} /> Saldo inicial</button>
          <button className="btn btn-secondary" onClick={exportar} disabled={!filtradas.length} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><FileSpreadsheet size={15} /> Excel</button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
            <thead>
              <tr style={thSt}>
                <SortTh label="Cliente" campo="cliente" orden={orden} setOrden={setOrden} />
                <SortTh label="Ayala (C1)" campo="ayala" orden={orden} setOrden={setOrden} align="right" />
                <SortTh label="Euler (C2)" campo="euler" orden={orden} setOrden={setOrden} align="right" />
                <SortTh label={empresa ? 'Saldo empresa' : 'Saldo total'} campo="saldo" orden={orden} setOrden={setOrden} align="right" />
                <SortTh label="Antigüedad" campo="dias" orden={orden} setOrden={setOrden} />
                <SortTh label="Última operación" campo="ultima" orden={orden} setOrden={setOrden} />
                <th style={{ ...cellPad, textAlign: 'left', fontWeight: 600, fontSize: '0.75rem' }}>Materiales</th>
                <th style={{ ...cellPad, textAlign: 'center', fontWeight: 600, fontSize: '0.75rem' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  {filtro === 'deuda' ? 'Ningún cliente con deuda para los filtros elegidos. 🎉' : 'No hay cuentas para los filtros elegidos.'}
                </td></tr>
              ) : filtradas.map((c) => (
                <tr key={c.clave} onClick={() => setDetalle(c.clave)} style={{ borderBottom: '1px solid var(--border-light)', cursor: 'pointer' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-surface-hover, #f8fafc)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}>
                  <td style={cellPad}>
                    <div style={{ fontWeight: 600 }}>{c.nombre || '(sin nombre)'}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{[c.cuit, c.telefono].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td style={{ ...cellPad, textAlign: 'right', whiteSpace: 'nowrap' }}>{saldoCell(c._sAy)}</td>
                  <td style={{ ...cellPad, textAlign: 'right', whiteSpace: 'nowrap' }}>{saldoCell(c._sEu)}</td>
                  <td style={{ ...cellPad, textAlign: 'right', whiteSpace: 'nowrap', fontSize: '0.9rem' }}>
                    <b>{saldoCell(c._saldo)}</b>
                    {c._saldo < -0.009 && <div style={{ fontSize: '0.66rem', color: '#047857' }}>a favor</div>}
                  </td>
                  <td style={cellPad}>
                    {c._tramo ? <span style={{ color: c._tramo.color, fontWeight: 600, fontSize: '0.78rem' }}>{c._dias} días <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>· {c._cantPend} cbte.</span></span> : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                  </td>
                  <td style={{ ...cellPad, whiteSpace: 'nowrap' }}>{fechaAR(c.ultimaFecha)}</td>
                  <td style={cellPad}>{c._mats ? <Pill texto={`${c._unidades} unid. a entregar`} color="#7c3aed" bg="#ede9fe" /> : <span style={{ color: 'var(--text-secondary)' }}>—</span>}</td>
                  <td style={{ ...cellPad, whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <IconBtn title="Nuevo recibo" onClick={() => onNuevoRecibo({ empresaId: empresa || (c._sAy > 0.009 ? AYALA : c._sEu > 0.009 ? EULER : undefined), cliente: clienteDeCuenta(c) })} color="#047857" bg="#d1fae5"><Wallet size={14} /></IconBtn>
                      <IconBtn title={c.telefono ? 'Recordatorio por WhatsApp' : 'Sin teléfono'} onClick={() => whatsapp(c)} disabled={!c.telefono || c._saldo <= 0.009} color="#15803d" bg="#dcfce7"><MessageCircle size={14} /></IconBtn>
                      <IconBtn title="Ver cuenta" onClick={() => setDetalle(c.clave)}><Users size={14} /></IconBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {filtradas.length > 0 && (
              <tfoot>
                <tr style={{ background: 'var(--bg-surface-hover, #f8fafc)', fontWeight: 700 }}>
                  <td style={{ ...cellPad, fontSize: '0.8rem' }}>{filtradas.length} cliente(s)</td>
                  <td style={{ ...cellPad, textAlign: 'right', whiteSpace: 'nowrap' }}>{ars(filtradas.reduce((a, c) => a + c._sAy, 0))}</td>
                  <td style={{ ...cellPad, textAlign: 'right', whiteSpace: 'nowrap' }}>{ars(filtradas.reduce((a, c) => a + c._sEu, 0))}</td>
                  <td style={{ ...cellPad, textAlign: 'right', whiteSpace: 'nowrap' }}>{ars(filtradas.reduce((a, c) => a + c._saldo, 0))}</td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {cuentaDetalle && (
        <CuentaDetalleModal
          cuenta={cuentaDetalle} materiales={matsPor[cuentaDetalle.clave] || []} ventasCfg={ventasCfg}
          onClose={() => setDetalle(null)}
          onNuevoRecibo={onNuevoRecibo} onNuevaFactura={onNuevaFactura} onCobrar={onCobrar}
          onSaldoInicial={(cliente) => setSaldoIni({ cliente })}
        />
      )}
      {saldoIni && <SaldoInicialModal cartera={cartera} clientePreset={saldoIni.cliente} onClose={() => setSaldoIni(null)} />}
    </div>
  );
}
