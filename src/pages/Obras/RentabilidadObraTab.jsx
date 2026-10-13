import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, AlertTriangle, Plus, Ban, Link2, ChevronDown, ChevronRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  cargarContextoRentabilidad, calcularRentabilidad, registrarGastoObra, anularGastoObra, vincularObraJornadas, CATEGORIAS_GASTO_OBRA, fmt$, fmtPct,
} from '../../services/rentabilidadService';

const fmtFecha = (f) => (f ? String(f).slice(0, 10).split('-').reverse().join('/') : '');
const fmtNum = (n) => Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });
const hoyISO = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

const th = { padding: '0.45rem 0.6rem', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border-light)' };
const td = { padding: '0.45rem 0.6rem', borderBottom: '1px solid var(--border-light)' };
const tdR = { ...td, textAlign: 'right', whiteSpace: 'nowrap' };
const input = { padding: '0.45rem 0.6rem', border: '1px solid var(--border-strong)', borderRadius: 7, fontSize: '0.82rem', background: 'var(--bg-primary)' };

const Card = ({ titulo, valor, sub, color }) => (
  <div style={{ border: '1px solid var(--border-light)', borderRadius: 10, padding: '0.75rem 0.9rem', minWidth: 150, flex: 1 }}>
    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{titulo}</div>
    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: color || 'var(--text-primary)', marginTop: 2 }}>{valor}</div>
    {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: 2 }}>{sub}</div>}
  </div>
);

const Seccion = ({ titulo, total, children, abierta: abiertaIni = false }) => {
  const [abierta, setAbierta] = useState(abiertaIni);
  return (
    <div style={{ border: '1px solid var(--border-light)', borderRadius: 10 }}>
      <button onClick={() => setAbierta(!abierta)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.9rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{abierta ? <ChevronDown size={15} /> : <ChevronRight size={15} />}{titulo}</span>
        <span>{total}</span>
      </button>
      {abierta && <div style={{ padding: '0 0.9rem 0.9rem', overflowX: 'auto' }}>{children}</div>}
    </div>
  );
};

const Vacio = ({ children }) => <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', padding: '0.4rem 0' }}>{children}</div>;

/** Pestaña "Rentabilidad" de la obra (solo administradores). Ganancia bruta, todo sin IVA. */
export default function RentabilidadObraTab({ obra }) {
  const { currentUser } = useAuth();
  const [ctx, setCtx] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [gasto, setGasto] = useState({ fecha: hoyISO(), categoria: CATEGORIAS_GASTO_OBRA[0], descripcion: '', proveedor: '', monto: '' });
  const [guardando, setGuardando] = useState(false);
  const [jSel, setJSel] = useState('');

  const cargar = useCallback(async () => {
    try { const c = await cargarContextoRentabilidad({ obraId: obra.id }); setCtx(c); setError(''); } catch (e) { setError(e.message); }
    setCargando(false);
  }, [obra.id]);

  useEffect(() => {
    let vivo = true;
    cargarContextoRentabilidad({ obraId: obra.id })
      .then((c) => { if (vivo) { setCtx(c); setError(''); } })
      .catch((e) => { if (vivo) setError(e.message); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [obra.id]);
  const recargar = () => { setCargando(true); cargar(); };

  const r = useMemo(() => (ctx ? calcularRentabilidad(obra, ctx) : null), [ctx, obra]);
  const jLibres = useMemo(() => (ctx?.jObras || []).filter((o) => !o.erpObraId).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre))), [ctx]);

  const guardarGasto = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      await registrarGastoObra({ obra, ...gasto }, currentUser);
      setGasto({ ...gasto, descripcion: '', proveedor: '', monto: '' });
      await cargar();
    } catch (err) { alert(err.message); }
    setGuardando(false);
  };

  const anular = async (g) => {
    const motivo = window.prompt(`Anular gasto "${g.descripcion || g.categoria}" por ${fmt$(g.monto)}.\nMotivo:`);
    if (motivo === null) return;
    try { await anularGastoObra(g, motivo, currentUser); await cargar(); } catch (err) { alert(err.message); }
  };

  const vincular = async () => {
    if (!jSel) return;
    try { await vincularObraJornadas(jSel, obra); setJSel(''); await cargar(); } catch (err) { alert(err.message); }
  };

  if (cargando && !ctx) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Calculando rentabilidad…</div>;
  if (error) return <div style={{ color: '#b91c1c', padding: '1rem' }}>Error: {error}</div>;
  if (!r) return null;

  const { ingresos: ing, manoDeObra: mo, materiales: mat } = r;
  const colorG = r.ganancia >= 0 ? '#166534' : '#b91c1c';
  const avisos = [];
  if (ctx.errorJornadas) avisos.push(ctx.errorJornadas);
  if (!mo.vinculadas.length) avisos.push('Esta obra no está vinculada a ninguna obra de Jornadas: no se puede calcular la mano de obra.');
  if (mo.bocasSinFinalizar > 0) avisos.push(`Hay ${mo.bocasSinFinalizar} bocas cargadas en Jornadas sin "producción finalizada": todavía no se cuentan.`);
  if (mo.jornadasAbiertas > 0) avisos.push(`Hay ${mo.jornadasAbiertas} jornada(s) sin hora de salida: no suman horas.`);
  if (mat.sinCosto.length) avisos.push(`Sin precio de compra cargado (se valorizan en $0): ${mat.sinCosto.join(', ')}.`);
  if (!ing.cotizado) avisos.push('No se encontró el detalle del presupuesto aprobado (cotizado = $0).');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          Ganancia bruta <b>sin IVA</b> (sin costos fijos ni impuestos). {ing.canal2 ? 'Canal 2: importes tal cual.' : 'Canal 1: importes netos de IVA.'}
        </div>
        <button className="btn btn-secondary" onClick={recargar} disabled={cargando} style={{ fontSize: '0.78rem', padding: '0.35rem 0.7rem', display: 'flex', alignItems: 'center', gap: 5 }}>
          <RefreshCw size={14} /> {cargando ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <Card titulo="Cotizado" valor={fmt$(ing.cotizado)} sub="Presupuesto aprobado" />
        <Card titulo="Facturado" valor={fmt$(ing.facturado)} sub={ing.canal2 ? `${ing.comprobantes.length} comprobante(s)` : `Con IVA: ${fmt$(ing.facturadoTotal)}`} />
        <Card titulo="Cobrado" valor={fmt$(ing.cobrado)} sub="Con IVA, según recibos" />
        <Card titulo="Costos" valor={fmt$(r.costoTotal)} color="#b45309" />
        <Card titulo="Ganancia" valor={fmt$(r.ganancia)} color={colorG} sub={`Margen ${fmtPct(r.margen)} sobre lo ${r.baseEs}`} />
        <Card titulo="Proyectada" valor={fmt$(r.gananciaProyectada)} sub={`Cotizado − costos · ${fmtPct(r.margenProyectado)}`} />
      </div>

      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', fontSize: '0.8rem' }}>
        {[
          ['Mano de obra por bocas', r.costos.bocas, `${mo.bocas} bocas · ${mo.tipoBoca}, ${mo.cuadrilla} personas`],
          ['Mano de obra por horas', r.costos.horas, `${fmtNum(mo.horas)} h`],
          ['Materiales del depósito', r.costos.deposito, `${mat.movs.length} movimientos`],
          ['Compras puntuales', r.costos.directas, `${mat.directas.length} líneas`],
          ['Otros gastos', r.costos.gastos, `${r.gastos.length} gastos`],
        ].map(([t, v, s]) => (
          <div key={t} style={{ flex: 1, minWidth: 150, background: 'var(--bg-surface-hover)', borderRadius: 8, padding: '0.55rem 0.75rem' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>{t}</div>
            <div style={{ fontWeight: 700 }}>{fmt$(v)}</div>
            <div style={{ color: 'var(--text-tertiary)', fontSize: '0.7rem' }}>{s}{r.costoTotal > 0 ? ` · ${fmtPct((v / r.costoTotal) * 100)}` : ''}</div>
          </div>
        ))}
      </div>

      {(r.porBoca || r.porHora !== null) && (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          {r.porBoca && <>Ganancia por boca: <b>{fmt$(r.porBoca.ganancia)}</b> · Costo MO por boca: <b>{fmt$(r.porBoca.costoMO)}</b> · </>}
          {r.porHora !== null && <>Ganancia por hora trabajada: <b>{fmt$(r.porHora)}</b></>}
        </div>
      )}

      {avisos.length > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '0.7rem 0.9rem', fontSize: '0.78rem', color: '#92400e', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {avisos.map((a) => <div key={a} style={{ display: 'flex', gap: 6 }}><AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />{a}</div>)}
          {!mo.vinculadas.length && !ctx.errorJornadas && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
              <select value={jSel} onChange={(e) => setJSel(e.target.value)} style={{ ...input, minWidth: 260 }}>
                <option value="">Elegir obra de Jornadas sin vincular…</option>
                {jLibres.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
              </select>
              <button className="btn btn-primary" disabled={!jSel} onClick={vincular} style={{ fontSize: '0.78rem', padding: '0.35rem 0.7rem', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Link2 size={14} /> Vincular
              </button>
            </div>
          )}
        </div>
      )}

      <Seccion titulo="Mano de obra (Jornadas)" total={fmt$(r.costos.bocas + r.costos.horas)}>
        {mo.vinculadas.length > 0 && <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: 6 }}>Obra en Jornadas: {mo.vinculadas.map((o) => o.nombre).join(', ')}</div>}
        {mo.detalle.length === 0 ? <Vacio>Sin jornadas valorizables.</Vacio> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead><tr><th style={th}>Fecha</th><th style={th}>Empleado</th><th style={th}>Tipo</th><th style={{ ...th, textAlign: 'right' }}>Cantidad</th><th style={{ ...th, textAlign: 'right' }}>Valor</th><th style={{ ...th, textAlign: 'right' }}>Costo</th></tr></thead>
            <tbody>
              {mo.detalle.map((d, i) => (
                <tr key={i}>
                  <td style={td}>{fmtFecha(d.fecha)}</td><td style={td}>{d.empleado}</td>
                  <td style={td}>{d.tipo === 'bocas' ? 'Bocas' : `Horas${d.categoria ? ` (${d.categoria})` : ''}`}</td>
                  <td style={tdR}>{d.tipo === 'bocas' ? d.cantidad : `${fmtNum(d.cantidad)} h`}</td>
                  <td style={tdR}>{fmt$(d.valor)}</td><td style={tdR}>{fmt$(d.costo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Seccion>

      <Seccion titulo="Materiales del depósito (último precio de compra + flete)" total={fmt$(r.costos.deposito)}>
        {mat.movs.length === 0 ? <Vacio>No salieron materiales del depósito para esta obra.</Vacio> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead><tr><th style={th}>Fecha</th><th style={th}>Origen</th><th style={th}>Material</th><th style={{ ...th, textAlign: 'right' }}>Cant.</th><th style={{ ...th, textAlign: 'right' }}>Costo unit.</th><th style={{ ...th, textAlign: 'right' }}>Costo</th></tr></thead>
            <tbody>
              {mat.movs.map((m, i) => (
                <tr key={i} style={{ background: m.sinCosto ? '#fef2f2' : undefined }}>
                  <td style={td}>{fmtFecha(m.fecha)}</td><td style={td}>{m.origen}</td>
                  <td style={td}>{m.descripcion} <span style={{ color: 'var(--text-tertiary)', fontSize: '0.7rem' }}>{m.unidad}</span></td>
                  <td style={tdR}>{fmtNum(m.cantidad)}</td>
                  <td style={tdR}>{m.sinCosto ? <span style={{ color: '#b91c1c' }}>sin costo</span> : fmt$(m.costoUnit)}</td>
                  <td style={tdR}>{fmt$(m.costo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Seccion>

      <Seccion titulo="Compras puntuales para la obra" total={fmt$(r.costos.directas)}>
        {mat.directas.length === 0 ? <Vacio>Ninguna. (Se cargan en Compras, sin ingresar a stock, asignando la obra a la línea.)</Vacio> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead><tr><th style={th}>Fecha</th><th style={th}>Proveedor</th><th style={th}>Comprobante</th><th style={th}>Detalle</th><th style={{ ...th, textAlign: 'right' }}>Neto</th></tr></thead>
            <tbody>
              {mat.directas.map((d, i) => (
                <tr key={i}><td style={td}>{fmtFecha(d.fecha)}</td><td style={td}>{d.proveedor}</td><td style={td}>{d.comprobante}</td><td style={td}>{d.descripcion}</td><td style={tdR}>{fmt$(d.costo)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Seccion>

      <Seccion titulo="Otros gastos de la obra" total={fmt$(r.costos.gastos)} abierta>
        <form onSubmit={guardarGasto} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
          <input type="date" value={gasto.fecha} onChange={(e) => setGasto({ ...gasto, fecha: e.target.value })} style={input} required />
          <select value={gasto.categoria} onChange={(e) => setGasto({ ...gasto, categoria: e.target.value })} style={input}>
            {CATEGORIAS_GASTO_OBRA.map((c) => <option key={c}>{c}</option>)}
          </select>
          <input placeholder="Descripción" value={gasto.descripcion} onChange={(e) => setGasto({ ...gasto, descripcion: e.target.value })} style={{ ...input, flex: 1, minWidth: 160 }} />
          <input placeholder="Proveedor (opcional)" value={gasto.proveedor} onChange={(e) => setGasto({ ...gasto, proveedor: e.target.value })} style={{ ...input, width: 160 }} />
          <input placeholder="$ neto" inputMode="decimal" value={gasto.monto} onChange={(e) => setGasto({ ...gasto, monto: e.target.value })} style={{ ...input, width: 110 }} required />
          <button className="btn btn-primary" disabled={guardando} style={{ fontSize: '0.78rem', padding: '0.4rem 0.7rem', display: 'flex', alignItems: 'center', gap: 5 }}><Plus size={14} /> Agregar</button>
        </form>
        {r.gastos.length === 0 ? <Vacio>Sin gastos cargados (subcontratos, alquileres, viáticos…).</Vacio> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <tbody>
              {r.gastos.map((g) => (
                <tr key={g.id}>
                  <td style={td}>{fmtFecha(g.fecha)}</td><td style={td}>{g.categoria}</td><td style={td}>{g.descripcion}</td><td style={td}>{g.proveedor}</td>
                  <td style={tdR}>{fmt$(g.monto)}</td>
                  <td style={{ ...td, width: 30 }}>
                    <button onClick={() => anular(g)} title="Anular" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c' }}><Ban size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Seccion>

      <Seccion titulo="Comprobantes de venta" total={fmt$(ing.facturado)}>
        {ing.comprobantes.length === 0 ? <Vacio>Todavía no hay comprobantes asociados a la obra.</Vacio> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead><tr><th style={th}>Fecha</th><th style={th}>Comprobante</th><th style={{ ...th, textAlign: 'right' }}>Neto</th><th style={{ ...th, textAlign: 'right' }}>Total</th></tr></thead>
            <tbody>
              {ing.comprobantes.map((c) => (
                <tr key={c.id}><td style={td}>{fmtFecha(c.fecha)}</td><td style={td}>{c.comprobante}</td><td style={tdR}>{fmt$(c.neto)}</td><td style={tdR}>{fmt$(c.total)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Seccion>
    </div>
  );
}
