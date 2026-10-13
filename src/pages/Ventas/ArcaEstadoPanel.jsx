import React, { useState } from 'react';
import { Loader, RefreshCw } from 'lucide-react';
import { getArcaEstado } from '../../services/arcaFacturacionService';

/** Botón "Probar conexión con ARCA" + diagnóstico (certificados, servidores, autenticación, últimos números). */
export default function ArcaEstadoPanel() {
  const [probando, setProbando] = useState(false);
  const [estado, setEstado] = useState(null);
  const [err, setErr] = useState('');

  const probar = async () => {
    setProbando(true); setErr(''); setEstado(null);
    try { setEstado(await getArcaEstado()); } catch (e) { setErr(e.message); }
    setProbando(false);
  };
  const ok = (b) => (b ? '✅' : '❌');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div>
        <button className="btn btn-secondary" onClick={probar} disabled={probando} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          {probando ? <Loader size={14} className="spin" /> : <RefreshCw size={14} />} {probando ? 'Consultando ARCA…' : 'Probar conexión con ARCA'}
        </button>
      </div>
      {err && <div style={{ color: '#b91c1c', fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>❌ {err}</div>}
      {estado && (
        <div style={{ fontSize: '0.78rem', background: 'var(--bg-surface-hover, #f8fafc)', borderRadius: 8, padding: '0.75rem', lineHeight: 1.7 }}>
          <div><b>Entorno activo:</b> {estado.entorno} · PV {estado.puntoVenta || '—'}</div>
          <div>{ok(estado.certificados?.homologacion?.cargado)} Certificado homologación {estado.certificados?.homologacion?.validoHasta ? `(vence ${estado.certificados.homologacion.validoHasta.slice(0, 10)})` : ''}</div>
          <div>{ok(estado.certificados?.produccion?.cargado)} Certificado producción {estado.certificados?.produccion?.validoHasta ? `(vence ${estado.certificados.produccion.validoHasta.slice(0, 10)})` : ''}</div>
          <div>{ok(estado.servidores?.appServer === 'OK')} Servidores ARCA {estado.servidores?.error || ''}</div>
          <div>{ok(estado.autenticacion?.ok)} Autenticación WSAA {estado.autenticacion?.error ? `– ${estado.autenticacion.error}` : ''}</div>
          {estado.puntosVentaHabilitados?.puntos?.length > 0 && (
            <div>Puntos de venta Web Services: {estado.puntosVentaHabilitados.puntos.map((p) => `${p.nro}${p.bloqueado === 'S' ? ' (bloqueado)' : ''}`).join(', ')}</div>
          )}
          {estado.ultimos && !estado.ultimos.error && (
            <div>Último número autorizado → Factura A: {estado.ultimos.facturaA} · Factura B: {estado.ultimos.facturaB}</div>
          )}
          {estado.ultimos?.error && <div>❌ {estado.ultimos.error}</div>}
        </div>
      )}
    </div>
  );
}
