import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { RefreshCw, FileSpreadsheet, TrendingUp, ArrowUpDown } from 'lucide-react';
import { db } from '../../services/firebaseConfig';
import { cargarContextoRentabilidad, calcularRentabilidad, esCanal2, fmt$, fmtPct } from '../../services/rentabilidadService';

const th = { padding: '0.55rem 0.6rem', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border-light)', cursor: 'pointer', userSelect: 'none' };
const td = { padding: '0.5rem 0.6rem', borderBottom: '1px solid var(--border-light)', whiteSpace: 'nowrap' };
const tdR = { ...td, textAlign: 'right' };
const sel = { padding: '0.45rem 0.6rem', border: '1px solid var(--border-strong)', borderRadius: 7, fontSize: '0.82rem', background: 'var(--bg-primary)' };

const fechaObra = (o) => {
  if (o.fechaInicioObra) return String(o.fechaInicioObra).slice(0, 10);
  if (o.createdAt?.toDate) return o.createdAt.toDate().toISOString().slice(0, 10);
  if (o.createdAt) return String(o.createdAt).slice(0, 10);
  return '';
};
const finalizada = (o) => o.estado === 'Instalación Finalizada' || o.estado === 'Finalizada';

const COLUMNAS = [
  { id: 'cotizado', label: 'Cotizado', get: (r) => r.ingresos.cotizado },
  { id: 'facturado', label: 'Facturado', get: (r) => r.ingresos.facturado },
  { id: 'mo', label: 'Mano de obra', get: (r) => r.costos.bocas + r.costos.horas },
  { id: 'mat', label: 'Materiales', get: (r) => r.costos.deposito + r.costos.directas },
  { id: 'gastos', label: 'Otros gastos', get: (r) => r.costos.gastos },
  { id: 'costoTotal', label: 'Costo total', get: (r) => r.costoTotal },
  { id: 'ganancia', label: 'Ganancia', get: (r) => r.ganancia },
  { id: 'margen', label: 'Margen', get: (r) => r.margen, pct: true },
  { id: 'porBoca', label: 'Ganancia/boca', get: (r) => r.porBoca?.ganancia ?? null },
  { id: 'porHora', label: 'Ganancia/hora', get: (r) => r.porHora },
];

/** Comparativo de rentabilidad entre obras (solo administradores). */
export default function RentabilidadObras() {
  const navigate = useNavigate();
  const [obras, setObras] = useState([]);
  const [ctx, setCtx] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [f, setF] = useState({ anio: 'Todos', estado: 'Todas', canal: 'Todos', tipo: 'Todos', soloConDatos: true, texto: '' });
  const [orden, setOrden] = useState({ col: 'margen', dir: 'desc' });

  const cargar = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([getDocs(collection(db, 'obras')), cargarContextoRentabilidad()]);
      setObras(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((o) => !o.deleted));
      setCtx(c); setError('');
    } catch (e) { setError(e.message); }
    setCargando(false);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  const recargar = () => { setCargando(true); cargar(); };

  const filas = useMemo(() => (ctx ? obras.map((o) => calcularRentabilidad(o, ctx)) : []), [obras, ctx]);
  const anios = useMemo(() => [...new Set(obras.map((o) => fechaObra(o).slice(0, 4)).filter(Boolean))].sort().reverse(), [obras]);
  const tipos = useMemo(() => [...new Set(obras.map((o) => o.tipoProyecto).filter(Boolean))].sort(), [obras]);

  const visibles = useMemo(() => {
    const t = f.texto.toLowerCase();
    const out = filas.filter(({ obra: o, ingresos: ing, costoTotal }) => {
      if (f.anio !== 'Todos' && fechaObra(o).slice(0, 4) !== f.anio) return false;
      if (f.estado === 'Finalizadas' && !finalizada(o)) return false;
      if (f.estado === 'En curso' && finalizada(o)) return false;
      if (f.canal === 'Canal 1' && esCanal2(o)) return false;
      if (f.canal === 'Canal 2' && !esCanal2(o)) return false;
      if (f.tipo !== 'Todos' && o.tipoProyecto !== f.tipo) return false;
      if (f.soloConDatos && !(costoTotal > 0 || ing.facturado > 0)) return false;
      if (t && !`${o.name || ''} ${o.clientName || ''} ${o.otNumber || ''}`.toLowerCase().includes(t)) return false;
      return true;
    });
    const col = COLUMNAS.find((c) => c.id === orden.col);
    const val = (r) => (col ? col.get(r) : (orden.col === 'fecha' ? fechaObra(r.obra) : String(r.obra.name || '')));
    return out.sort((a, b) => {
      const va = val(a); const vb = val(b);
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      const c = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
      return orden.dir === 'asc' ? c : -c;
    });
  }, [filas, f, orden]);

  const tot = useMemo(() => {
    const s = (fn) => visibles.reduce((a, r) => a + (fn(r) || 0), 0);
    const base = s((r) => r.base); const ganancia = s((r) => r.ganancia);
    return {
      cotizado: s((r) => r.ingresos.cotizado), facturado: s((r) => r.ingresos.facturado), mo: s((r) => r.costos.bocas + r.costos.horas),
      mat: s((r) => r.costos.deposito + r.costos.directas), gastos: s((r) => r.costos.gastos), costoTotal: s((r) => r.costoTotal),
      ganancia, margen: base > 0 ? (ganancia / base) * 100 : null,
    };
  }, [visibles]);

  const ordenar = (col) => setOrden((o) => ({ col, dir: o.col === col && o.dir === 'desc' ? 'asc' : 'desc' }));

  const exportar = async () => {
    const XLSX = await import('xlsx');
    const data = visibles.map((r) => ({
      Obra: r.obra.name || '', Cliente: r.obra.clientName || '', OT: r.obra.otNumber || '', Fecha: fechaObra(r.obra), Canal: esCanal2(r.obra) ? 'Canal 2' : 'Canal 1',
      Tipo: r.obra.tipoProyecto || '', Estado: r.obra.estado || '', Cotizado: r.ingresos.cotizado, Facturado: r.ingresos.facturado, Cobrado: r.ingresos.cobrado,
      'MO bocas': r.costos.bocas, 'MO horas': r.costos.horas, 'Materiales deposito': r.costos.deposito, 'Compras puntuales': r.costos.directas, 'Otros gastos': r.costos.gastos,
      'Costo total': r.costoTotal, Ganancia: r.ganancia, 'Margen %': r.margen, 'Base margen': r.baseEs, Bocas: r.manoDeObra.bocas, Horas: r.manoDeObra.horas,
      'Ganancia/boca': r.porBoca?.ganancia ?? '', 'Ganancia/hora': r.porHora ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rentabilidad');
    XLSX.writeFile(wb, `Rentabilidad_obras_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const flecha = (col) => (orden.col === col ? (orden.dir === 'desc' ? ' ↓' : ' ↑') : '');
  const colorG = (v) => (v === null || v === undefined ? undefined : v >= 0 ? '#166534' : '#b91c1c');

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: 8 }}><TrendingUp size={22} /> Rentabilidad de Obras</h1>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>
            Ganancia bruta sin IVA (sin costos fijos ni impuestos). El margen se calcula sobre lo facturado; si todavía no se facturó, sobre lo cotizado.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-secondary" onClick={recargar} disabled={cargando} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.82rem' }}><RefreshCw size={15} /> {cargando ? 'Calculando…' : 'Actualizar'}</button>
          <button className="btn btn-secondary" onClick={exportar} disabled={!visibles.length} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.82rem' }}><FileSpreadsheet size={15} /> Excel</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input placeholder="Buscar obra / cliente / OT" value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} style={{ ...sel, minWidth: 220 }} />
        <select value={f.anio} onChange={(e) => setF({ ...f, anio: e.target.value })} style={sel}><option>Todos</option>{anios.map((a) => <option key={a}>{a}</option>)}</select>
        <select value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value })} style={sel}>{['Todas', 'En curso', 'Finalizadas'].map((x) => <option key={x}>{x}</option>)}</select>
        <select value={f.canal} onChange={(e) => setF({ ...f, canal: e.target.value })} style={sel}>{['Todos', 'Canal 1', 'Canal 2'].map((x) => <option key={x}>{x}</option>)}</select>
        <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} style={sel}><option value="Todos">Todos los tipos</option>{tipos.map((x) => <option key={x}>{x}</option>)}</select>
        <label style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 5 }}>
          <input type="checkbox" checked={f.soloConDatos} onChange={(e) => setF({ ...f, soloConDatos: e.target.checked })} /> Solo obras con costos o facturación
        </label>
      </div>

      {ctx?.errorJornadas && <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '0.6rem 0.8rem', fontSize: '0.8rem', color: '#92400e' }}>{ctx.errorJornadas} (la mano de obra figura en $0)</div>}
      {error && <div style={{ color: '#b91c1c' }}>Error: {error}</div>}

      {cargando && !ctx ? <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Calculando la rentabilidad de todas las obras…</div> : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border-light)', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface-hover)' }}>
                <th style={th} onClick={() => ordenar('obra')}>Obra{flecha('obra')}</th>
                <th style={th} onClick={() => ordenar('fecha')}>Fecha{flecha('fecha')}</th>
                {COLUMNAS.map((c) => <th key={c.id} style={{ ...th, textAlign: 'right' }} onClick={() => ordenar(c.id)}>{c.label}{flecha(c.id) || <ArrowUpDown size={11} style={{ marginLeft: 3, opacity: 0.35 }} />}</th>)}
              </tr>
            </thead>
            <tbody>
              {visibles.length === 0 && <tr><td colSpan={COLUMNAS.length + 2} style={{ ...td, textAlign: 'center', color: 'var(--text-tertiary)', padding: '1.5rem' }}>No hay obras con estos filtros.</td></tr>}
              {visibles.map((r) => (
                <tr key={r.obra.id} onClick={() => navigate(`/obras?obra=${r.obra.id}&tab=rentabilidad`)} style={{ cursor: 'pointer' }} title="Ver detalle">
                  <td style={{ ...td, whiteSpace: 'normal', minWidth: 200 }}>
                    <div style={{ fontWeight: 600 }}>{r.obra.name || '(sin nombre)'}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                      {[r.obra.clientName, esCanal2(r.obra) ? 'Canal 2' : 'Canal 1', r.obra.tipoProyecto, finalizada(r.obra) ? 'Finalizada' : r.obra.estado].filter(Boolean).join(' · ')}
                    </div>
                  </td>
                  <td style={td}>{fechaObra(r.obra).split('-').reverse().join('/')}</td>
                  {COLUMNAS.map((c) => {
                    const v = c.get(r);
                    const color = ['ganancia', 'margen', 'porBoca', 'porHora'].includes(c.id) ? colorG(v) : undefined;
                    return <td key={c.id} style={{ ...tdR, color, fontWeight: c.id === 'ganancia' || c.id === 'margen' ? 700 : 400 }}>{c.pct ? fmtPct(v) : fmt$(v)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
            {visibles.length > 0 && (
              <tfoot>
                <tr style={{ background: 'var(--bg-surface-hover)', fontWeight: 700 }}>
                  <td style={td}>Total ({visibles.length} obras)</td><td style={td} />
                  <td style={tdR}>{fmt$(tot.cotizado)}</td><td style={tdR}>{fmt$(tot.facturado)}</td><td style={tdR}>{fmt$(tot.mo)}</td>
                  <td style={tdR}>{fmt$(tot.mat)}</td><td style={tdR}>{fmt$(tot.gastos)}</td><td style={tdR}>{fmt$(tot.costoTotal)}</td>
                  <td style={{ ...tdR, color: colorG(tot.ganancia) }}>{fmt$(tot.ganancia)}</td><td style={{ ...tdR, color: colorG(tot.margen) }}>{fmtPct(tot.margen)}</td>
                  <td style={td} /><td style={td} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
