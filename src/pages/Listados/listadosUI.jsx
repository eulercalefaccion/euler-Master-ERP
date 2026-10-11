import React from 'react';
import { ChevronUp, ChevronDown, Search, X } from 'lucide-react';
import { EMPRESAS_LISTADO, PERIODOS } from '../../services/listadosService';
import { cellPad, inputSt } from './listadosHelpers';

export function KpiCard({ titulo, valor, detalle, color = '#0D2A4E', icono }) {
  return (
    <div className="card" style={{ padding: '0.9rem 1rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start', minWidth: 0 }}>
      {icono && (
        <div style={{ background: `${color}14`, color, borderRadius: 10, padding: '0.5rem', display: 'flex' }}>{icono}</div>
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{titulo}</div>
        <div style={{ fontSize: '1.25rem', fontWeight: 700, color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{valor}</div>
        {detalle && <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>{detalle}</div>}
      </div>
    </div>
  );
}

export function Pill({ texto, color, bg, title }) {
  return (
    <span title={title} style={{ display: 'inline-block', padding: '0.18rem 0.55rem', borderRadius: 999, fontSize: '0.7rem', fontWeight: 700, color, background: bg, whiteSpace: 'nowrap' }}>
      {texto}
    </span>
  );
}

export function EmpresaBadge({ empresaId }) {
  const e = EMPRESAS_LISTADO[empresaId] || { corto: empresaId || '—', canal: '', color: '#475569', bg: '#f1f5f9' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
      <span style={{ fontWeight: 600, fontSize: '0.8rem', color: e.color }}>{e.corto}</span>
      <span style={{ fontSize: '0.66rem', color: 'var(--text-secondary)' }}>{e.canal}</span>
    </div>
  );
}

export function SortTh({ label, campo, orden, setOrden, align = 'left', style }) {
  const activo = orden.campo === campo;
  return (
    <th
      onClick={() => setOrden({ campo, dir: activo && orden.dir === 'desc' ? 'asc' : 'desc' })}
      style={{ ...cellPad, textAlign: align, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', fontWeight: 600, fontSize: '0.75rem', ...style }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
        {label}
        {activo ? (orden.dir === 'desc' ? <ChevronDown size={13} /> : <ChevronUp size={13} />) : <span style={{ width: 13 }} />}
      </span>
    </th>
  );
}

export function IconBtn({ title, onClick, color = '#0D2A4E', bg = '#e8eff7', children, disabled }) {
  return (
    <button
      type="button" title={title} onClick={onClick} disabled={disabled}
      style={{
        width: 28, height: 28, borderRadius: 999, border: 'none', background: disabled ? '#f1f5f9' : bg, color: disabled ? '#cbd5e1' : color,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: disabled ? 'default' : 'pointer', flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

/** Barra de filtros común: búsqueda, empresa, período (+ rango personalizado) y extras. */
export function BarraFiltros({ busqueda, setBusqueda, empresa, setEmpresa, periodo, setPeriodo, custom, setCustom, children, placeholder }) {
  return (
    <div className="card" style={{ padding: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
      <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
        <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
        <input
          style={{ ...inputSt, width: '100%', paddingLeft: 32, boxSizing: 'border-box' }}
          placeholder={placeholder} value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
        />
        {busqueda && (
          <button onClick={() => setBusqueda('')} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}>
            <X size={14} />
          </button>
        )}
      </div>
      <div style={{ display: 'flex', border: '1px solid var(--border-strong, #cbd5e1)', borderRadius: 8, overflow: 'hidden' }}>
        {[['', 'Todas'], ['ayala-nicolas', 'Canal 1 · Ayala'], ['euler-calefaccion', 'Canal 2 · Euler']].map(([id, label]) => (
          <button
            key={id} onClick={() => setEmpresa(id)}
            style={{
              padding: '0.42rem 0.7rem', fontSize: '0.78rem', border: 'none', cursor: 'pointer',
              background: empresa === id ? '#0D2A4E' : 'transparent', color: empresa === id ? '#fff' : 'inherit', fontWeight: empresa === id ? 600 : 400,
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <select style={inputSt} value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
        {PERIODOS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      {periodo === 'custom' && (
        <>
          <input type="date" style={inputSt} value={custom.desde || ''} onChange={(e) => setCustom({ ...custom, desde: e.target.value })} />
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>a</span>
          <input type="date" style={inputSt} value={custom.hasta || ''} onChange={(e) => setCustom({ ...custom, hasta: e.target.value })} />
        </>
      )}
      {children}
    </div>
  );
}
