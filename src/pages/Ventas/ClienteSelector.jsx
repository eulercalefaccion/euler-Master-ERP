import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { Search, UserPlus, User, Loader } from 'lucide-react';
import { db } from '../../services/firebaseConfig';
import { clienteParaFacturar } from '../../services/cobranzasService';
import { normalizarNombre } from '../../services/ventasCalculo';
import { ars } from '../../services/listadosService';
import { inp } from './ventasHelpers';

let cacheClientes = null;

/**
 * Buscador de clientes: primero cuentas corrientes existentes (con saldo), después la base de Contactos.
 * onChange recibe { id, nombre, docTipo, docNro, condicionIva, domicilio, telefono, clave? , nuevo? }
 */
export default function ClienteSelector({ value, onChange, cuentas = [], placeholder = 'Buscar cliente por nombre, CUIT/DNI o teléfono…', autoFocus }) {
  const [clientes, setClientes] = useState(cacheClientes || []);
  const [cargando, setCargando] = useState(!cacheClientes);
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (cacheClientes) return undefined;
    let vivo = true;
    getDocs(collection(db, 'clientes')).then((s) => {
      cacheClientes = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => !c.deleted);
      if (vivo) { setClientes(cacheClientes); setCargando(false); }
    }).catch(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    const cerrar = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false); };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, []);

  const resultados = useMemo(() => {
    const t = normalizarNombre(texto);
    const dig = texto.replace(/\D/g, '');
    if (!t && !dig) return { ctas: cuentas.filter((c) => Math.abs(c.saldo) > 0.01).slice(0, 6), cls: [] };
    const match = (nombre, docs = [], tels = []) => (t && normalizarNombre(nombre).includes(t))
      || (dig.length >= 4 && [...docs, ...tels].some((d) => String(d || '').replace(/\D/g, '').includes(dig)));
    const ctas = cuentas.filter((c) => match(c.nombre, [c.cuit], [c.telefono])).slice(0, 6);
    const idsCtas = new Set(ctas.map((c) => c.clienteId).filter(Boolean));
    const cls = clientes
      .filter((c) => !idsCtas.has(c.id) && match(c.nombreCompleto || c.nombre || c.name, [c.cuit, c.dni, c.facturacionCuit], [c.phone, c.telefono, c.telefonoNormalizado]))
      .slice(0, 10);
    return { ctas, cls };
  }, [texto, cuentas, clientes]);

  const elegirCuenta = (c) => {
    onChange({
      id: c.clienteId || null, clave: c.clave, nombre: c.nombre, docTipo: c.cuit?.length === 11 ? 80 : (c.cuit ? 96 : 99), docNro: c.cuit || '',
      condicionIva: c.condicionIva || 'Consumidor Final', domicilio: c.domicilio || '', telefono: c.telefono || '',
    });
    setTexto(''); setAbierto(false);
  };
  const elegirCliente = (c) => { onChange(clienteParaFacturar(c)); setTexto(''); setAbierto(false); };
  const nuevo = () => {
    onChange({ id: null, nombre: texto.trim().toUpperCase(), docTipo: 99, docNro: '', condicionIva: 'Consumidor Final', domicilio: '', telefono: '', nuevo: true });
    setTexto(''); setAbierto(false);
  };

  const filaSt = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.7rem', cursor: 'pointer', fontSize: '0.82rem', borderBottom: '1px solid var(--border-light)' };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
        <input
          style={{ ...inp, paddingLeft: 32 }} value={texto} autoFocus={autoFocus}
          placeholder={value?.nombre ? `${value.nombre} — escribí para cambiar` : placeholder}
          onChange={(e) => { setTexto(e.target.value); setAbierto(true); }} onFocus={() => setAbierto(true)}
        />
        {cargando && <Loader size={14} className="spin" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />}
      </div>
      {abierto && (resultados.ctas.length > 0 || resultados.cls.length > 0 || texto.trim()) && (
        <div style={{ position: 'absolute', zIndex: 50, top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--bg-primary, #fff)', border: '1px solid var(--border-strong, #cbd5e1)', borderRadius: 8, boxShadow: '0 10px 25px rgba(0,0,0,0.12)', maxHeight: 340, overflowY: 'auto' }}>
          {resultados.ctas.length > 0 && <div style={{ padding: '0.35rem 0.7rem', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)', background: 'var(--bg-surface-hover, #f8fafc)' }}>CUENTAS CORRIENTES</div>}
          {resultados.ctas.map((c) => (
            <div key={c.clave} style={filaSt} onMouseDown={() => elegirCuenta(c)}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><User size={13} color="#64748b" /> <b>{c.nombre}</b> <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>{c.cuit}</span></span>
              <span style={{ fontWeight: 700, fontSize: '0.78rem', color: c.saldo > 0.01 ? '#b45309' : c.saldo < -0.01 ? '#047857' : 'var(--text-secondary)' }}>
                {c.saldo > 0.01 ? `Debe ${ars(c.saldo)}` : c.saldo < -0.01 ? `A favor ${ars(-c.saldo)}` : 'Al día'}
              </span>
            </div>
          ))}
          {resultados.cls.length > 0 && <div style={{ padding: '0.35rem 0.7rem', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)', background: 'var(--bg-surface-hover, #f8fafc)' }}>CONTACTOS</div>}
          {resultados.cls.map((c) => (
            <div key={c.id} style={filaSt} onMouseDown={() => elegirCliente(c)}>
              <span><b>{c.nombreCompleto || c.nombre || c.name}</b> <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>{c.cuit || c.dni || ''}</span></span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>{c.phone || c.telefono || ''}</span>
            </div>
          ))}
          {texto.trim() && (
            <div style={{ ...filaSt, color: 'var(--primary-600, #1d4ed8)', fontWeight: 600, borderBottom: 'none' }} onMouseDown={nuevo}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><UserPlus size={14} /> Cliente nuevo: “{texto.trim().toUpperCase()}”</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
