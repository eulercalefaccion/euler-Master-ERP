import React from 'react';
import { X, AlertTriangle, CheckCircle } from 'lucide-react';
import { lbl } from './ventasHelpers';

export function Modal({ titulo, subtitulo, onClose, children, ancho = 900, pie }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 300, overflowY: 'auto', padding: '2rem 1rem' }}>
      <div className="card" style={{ width: ancho, maxWidth: '100%', padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-light)', background: 'var(--bg-surface-hover, #f8fafc)' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>{titulo}</h3>
            {subtitulo && <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>{subtitulo}</div>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={20} /></button>
        </div>
        <div style={{ padding: '1.1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>{children}</div>
        {pie && <div style={{ padding: '0.9rem 1.25rem', borderTop: '1px solid var(--border-light)', background: 'var(--bg-surface-hover, #f8fafc)' }}>{pie}</div>}
      </div>
    </div>
  );
}

export function Campo({ label, children, style }) {
  return (
    <div style={style}>
      <span style={lbl}>{label}</span>
      {children}
    </div>
  );
}

export function Alerta({ tipo = 'error', children }) {
  const ok = tipo === 'ok';
  const info = tipo === 'info';
  return (
    <div style={{
      padding: '0.7rem 0.9rem', borderRadius: 8, fontSize: '0.82rem', display: 'flex', gap: '0.5rem', whiteSpace: 'pre-wrap', alignItems: 'flex-start',
      background: ok ? '#f0fdf4' : info ? '#eff6ff' : '#fef2f2', border: `1px solid ${ok ? '#86efac' : info ? '#bfdbfe' : '#fecaca'}`, color: ok ? '#166534' : info ? '#1e40af' : '#b91c1c',
    }}>
      {ok ? <CheckCircle size={16} style={{ flexShrink: 0 }} /> : <AlertTriangle size={16} style={{ flexShrink: 0 }} />}
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

export function Seg({ opciones, valor, onChange }) {
  return (
    <div style={{ display: 'inline-flex', border: '1px solid var(--border-strong, #cbd5e1)', borderRadius: 8, overflow: 'hidden', flexWrap: 'wrap' }}>
      {opciones.map(([id, label]) => (
        <button key={id} type="button" onClick={() => onChange(id)}
          style={{ padding: '0.45rem 0.8rem', fontSize: '0.8rem', border: 'none', cursor: 'pointer', background: valor === id ? '#0D2A4E' : 'transparent', color: valor === id ? '#fff' : 'inherit', fontWeight: valor === id ? 600 : 400 }}>
          {label}
        </button>
      ))}
    </div>
  );
}
