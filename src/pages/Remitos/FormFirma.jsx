import React, { useRef, useState } from 'react';
import { PenLine, Loader } from 'lucide-react';
import FirmaPad from '../../components/FirmaPad/FirmaPad';

const inp = { width: '100%', boxSizing: 'border-box', padding: '0.65rem 0.75rem', fontSize: '1rem', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', color: '#0f172a' };
const lbl = { display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: 4 };

/**
 * Formulario de conformidad: nombre, DNI, firma con el dedo y "recibí conforme".
 * onFirmar({ nombre, dni, imagen }) debe devolver una promesa.
 */
export default function FormFirma({ nombreInicial = '', onFirmar, textoBoton = 'Firmar conforme' }) {
  const pad = useRef(null);
  const [nombre, setNombre] = useState(nombreInicial);
  const [dni, setDni] = useState('');
  const [conforme, setConforme] = useState(false);
  const [hayFirma, setHayFirma] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const enviar = async () => {
    setError('');
    if (!nombre.trim()) { setError('Ingresá nombre y apellido de quien recibe.'); return; }
    const imagen = pad.current?.exportar();
    if (!imagen) { setError('Falta la firma.'); return; }
    if (!conforme) { setError('Confirmá que recibiste los materiales.'); return; }
    setGuardando(true);
    try { await onFirmar({ nombre: nombre.trim(), dni, imagen }); } catch (e) { setError(e.message || 'No se pudo guardar la firma.'); setGuardando(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.7rem' }}>
        <label><span style={lbl}>Nombre y apellido de quien recibe *</span><input style={inp} value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" /></label>
        <label><span style={lbl}>DNI</span><input style={inp} value={dni} onChange={(e) => setDni(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={11} /></label>
      </div>
      <div>
        <span style={lbl}>Firma *</span>
        <FirmaPad ref={pad} alto={190} onCambio={(v) => setHayFirma(!v)} />
      </div>
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: '0.9rem', color: '#0f172a', cursor: 'pointer' }}>
        <input type="checkbox" checked={conforme} onChange={(e) => setConforme(e.target.checked)} style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0 }} />
        <span>Recibí conforme los materiales detallados, en buen estado y en las cantidades indicadas.</span>
      </label>
      {error && <div style={{ padding: '0.6rem 0.8rem', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.85rem' }}>{error}</div>}
      <button type="button" onClick={enviar} disabled={guardando || !hayFirma || !conforme}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0.85rem 1rem', fontSize: '1rem', fontWeight: 700, borderRadius: 10, border: 'none',
          background: guardando || !hayFirma || !conforme ? '#94a3b8' : '#0D2A4E', color: '#fff', cursor: guardando ? 'wait' : 'pointer',
        }}>
        {guardando ? <Loader size={18} className="spin" /> : <PenLine size={18} />} {textoBoton}
      </button>
    </div>
  );
}
