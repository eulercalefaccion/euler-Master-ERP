import React, { useState } from 'react';
import { Loader, Save } from 'lucide-react';
import { EMPRESA_AYALA, EMPRESA_EULER, saveVentasConfig, formatoNumero } from '../../services/cobranzasService';
import { inp, card } from './ventasHelpers';
import { Modal, Campo, Alerta } from './ventasUI';

/** Numeraciones (Comprobante X y Recibos), datos de EULER CALEFACCIÓN y cuentas destino de transferencias. */
export default function ConfigVentasModal({ ventasCfg, onClose, onGuardado }) {
  const [cfg, setCfg] = useState(() => JSON.parse(JSON.stringify(ventasCfg)));
  const [cuentasTxt, setCuentasTxt] = useState((ventasCfg.cuentasDestino || []).join('\n'));
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const setNum = (emp, campo, valor) => setCfg((c) => ({ ...c, numeracion: { ...c.numeracion, [emp]: { ...c.numeracion[emp], [campo]: valor } } }));
  const setEuler = (campo, valor) => setCfg((c) => ({ ...c, euler: { ...c.euler, [campo]: valor } }));

  const guardar = async () => {
    setError('');
    const num = {};
    for (const emp of [EMPRESA_AYALA, EMPRESA_EULER]) {
      num[emp] = {};
      for (const [k, v] of Object.entries(cfg.numeracion[emp] || {})) {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 0) { setError(`Valor inválido en la numeración (${k}).`); return; }
        num[emp][k] = n;
      }
    }
    const cambios = [];
    [[EMPRESA_EULER, 'ultimoX', 'Comprobante X'], [EMPRESA_EULER, 'ultimoRec', 'Recibos Euler'], [EMPRESA_AYALA, 'ultimoRec', 'Recibos Ayala']].forEach(([emp, k, nom]) => {
      const antes = Number(ventasCfg.numeracion?.[emp]?.[k] || 0);
      if (num[emp][k] < antes) cambios.push(`${nom}: de ${antes} a ${num[emp][k]}`);
    });
    if (cambios.length && !window.confirm(`Vas a BAJAR la numeración:\n${cambios.join('\n')}\n\nEsto puede generar números repetidos. ¿Continuar?`)) return;
    setGuardando(true);
    try {
      const nuevo = { ...cfg, numeracion: num, cuentasDestino: cuentasTxt.split('\n').map((s) => s.trim()).filter(Boolean) };
      await saveVentasConfig(nuevo);
      onGuardado?.(nuevo);
      onClose();
    } catch (e) {
      setError(e.message.includes('permission') ? 'Solo un administrador puede modificar esta configuración.' : e.message);
    }
    setGuardando(false);
  };

  const nE = cfg.numeracion[EMPRESA_EULER] || {};
  const nA = cfg.numeracion[EMPRESA_AYALA] || {};
  const proximo = (pv, ult) => formatoNumero(Number(pv) || 1, (Number(ult) || 0) + 1);

  return (
    <Modal titulo="Configuración de Ventas y Cobranzas" onClose={onClose} ancho={820}
      pie={(
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={guardar} disabled={guardando} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {guardando ? <Loader size={15} className="spin" /> : <Save size={15} />} Guardar
          </button>
        </div>
      )}>
      <Alerta tipo="info">
        Al migrar desde GesDatta, cargá acá el <b>último número emitido</b> en GesDatta (por ejemplo, último FAX 00001-00000343 → punto de venta 1, último 343). El ERP continuará con el siguiente.
        Las facturas A/B de AYALA las numera ARCA automáticamente.
      </Alerta>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div style={card}>
          <b style={{ fontSize: '0.88rem' }}>EULER CALEFACCIÓN (Canal 2)</b>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: 8 }}>
            <Campo label="Comprobante X – Pto. venta"><input type="number" style={inp} value={nE.ptoVtaX ?? 1} onChange={(e) => setNum(EMPRESA_EULER, 'ptoVtaX', e.target.value)} /></Campo>
            <Campo label="Último X emitido"><input type="number" style={inp} value={nE.ultimoX ?? 0} onChange={(e) => setNum(EMPRESA_EULER, 'ultimoX', e.target.value)} /></Campo>
            <Campo label="Recibo – Pto. venta"><input type="number" style={inp} value={nE.ptoVtaRec ?? 1} onChange={(e) => setNum(EMPRESA_EULER, 'ptoVtaRec', e.target.value)} /></Campo>
            <Campo label="Último recibo emitido"><input type="number" style={inp} value={nE.ultimoRec ?? 0} onChange={(e) => setNum(EMPRESA_EULER, 'ultimoRec', e.target.value)} /></Campo>
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: 6 }}>Próximos: FAX {proximo(nE.ptoVtaX, nE.ultimoX)} · REC {proximo(nE.ptoVtaRec, nE.ultimoRec)}</div>
        </div>
        <div style={card}>
          <b style={{ fontSize: '0.88rem' }}>AYALA NICOLAS FEDERICO (Canal 1)</b>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: 8 }}>
            <Campo label="Recibo – Pto. venta"><input type="number" style={inp} value={nA.ptoVtaRec ?? 1} onChange={(e) => setNum(EMPRESA_AYALA, 'ptoVtaRec', e.target.value)} /></Campo>
            <Campo label="Último recibo emitido"><input type="number" style={inp} value={nA.ultimoRec ?? 0} onChange={(e) => setNum(EMPRESA_AYALA, 'ultimoRec', e.target.value)} /></Campo>
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: 6 }}>Próximo: REC {proximo(nA.ptoVtaRec, nA.ultimoRec)}</div>
        </div>
      </div>

      <div style={card}>
        <b style={{ fontSize: '0.88rem' }}>Datos de EULER CALEFACCIÓN (para Comprobante X y recibos)</b>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginTop: 8 }}>
          <Campo label="Razón social"><input style={inp} value={cfg.euler.razonSocial || ''} onChange={(e) => setEuler('razonSocial', e.target.value)} /></Campo>
          <Campo label="Domicilio comercial" style={{ gridColumn: 'span 2' }}><input style={inp} value={cfg.euler.domicilio || ''} onChange={(e) => setEuler('domicilio', e.target.value)} /></Campo>
          <Campo label="Teléfono"><input style={inp} value={cfg.euler.telefono || ''} onChange={(e) => setEuler('telefono', e.target.value)} /></Campo>
          <Campo label="Email"><input style={inp} value={cfg.euler.email || ''} onChange={(e) => setEuler('email', e.target.value)} /></Campo>
          <Campo label="Web"><input style={inp} value={cfg.euler.web || ''} onChange={(e) => setEuler('web', e.target.value)} /></Campo>
          <Campo label="Instagram"><input style={inp} value={cfg.euler.instagram || ''} onChange={(e) => setEuler('instagram', e.target.value)} /></Campo>
        </div>
      </div>

      <div style={card}>
        <Campo label="Cuentas destino para transferencias (una por línea)">
          <textarea style={{ ...inp, minHeight: 80, fontFamily: 'inherit' }} value={cuentasTxt} onChange={(e) => setCuentasTxt(e.target.value)} placeholder={'Banco Santander\nMercado Pago'} />
        </Campo>
      </div>
      {error && <Alerta>{error}</Alerta>}
    </Modal>
  );
}
