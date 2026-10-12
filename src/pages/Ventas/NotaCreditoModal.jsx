import React, { useMemo, useState } from 'react';
import { Loader, Undo2, Download, Trash2, Plus } from 'lucide-react';
import { emitirComprobanteArca, calcularTotales, condicionIvaDesdeTexto, CONCEPTOS } from '../../services/arcaFacturacionService';
import { generarPDFFacturaArca } from '../../services/pdfFacturaArca';
import { ars, fechaAR } from '../../services/listadosService';
import { r2 } from '../../services/ventasCalculo';
import { inp } from './ventasHelpers';
import { Modal, Campo, Alerta } from './ventasUI';

/** Nota de crédito fiscal (A/B) sobre una factura emitida en ARCA, con o sin obra. */
export default function NotaCreditoModal({ comprobante: c, arcaCfg, cartera, esProduccion, onClose }) {
  const yaAcreditado = cartera.ncPor[c.id] || 0;
  const maximo = r2(Number(c.totalComprobante || 0) - yaAcreditado);
  const [lineas, setLineas] = useState(() => (c.lineas || []).map((l, i) => ({
    key: `nc${i}`, incluir: true, descripcion: l.descripcion, cantidad: Number(l.cantidad) || 1, precioUnitario: Number(l.precioUnitario) || 0,
  })));
  const [modoImporte, setModoImporte] = useState(yaAcreditado > 0);
  const [importe, setImporte] = useState(yaAcreditado > 0 ? String(maximo) : '');
  const [motivo, setMotivo] = useState('Anulación total');
  const [concepto, setConcepto] = useState(Number(c.concepto) || 3);
  const [error, setError] = useState('');
  const [emitiendo, setEmitiendo] = useState(false);
  const [resultado, setResultado] = useState(null);

  const lineasFinal = useMemo(() => {
    if (modoImporte) {
      const total = Number(importe) || 0;
      const neto = r2(total / 1.21);
      return neto > 0 ? [{ descripcion: `${motivo || 'Acreditación'} s/ Factura ${c.letra} N° ${c.numeroOriginal}`, cantidad: 1, precioUnitario: neto }] : [];
    }
    return lineas.filter((l) => l.incluir && Number(l.cantidad) > 0 && Number(l.precioUnitario) > 0)
      .map((l) => ({ descripcion: l.descripcion, cantidad: Number(l.cantidad), precioUnitario: Number(l.precioUnitario) }));
  }, [modoImporte, importe, motivo, lineas, c]);
  const totales = calcularTotales(lineasFinal);
  const setLinea = (key, campo, valor) => setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, [campo]: valor } : l)));

  const emitir = async () => {
    setError('');
    if (!lineasFinal.length || totales.total <= 0) { setError('Indicá líneas o un importe a acreditar.'); return; }
    if (totales.total > maximo + 0.01) { setError(`La nota de crédito no puede superar ${ars(maximo)} (total de la factura menos NC anteriores).`); return; }
    const tipoTxt = `NOTA DE CRÉDITO ${c.letra}`;
    const aviso = esProduccion
      ? `⚠️ PRODUCCIÓN: se emitirá una ${tipoTxt} REAL ante ARCA por ${ars(totales.total)} sobre la factura ${c.numeroOriginal} de ${c.clienteNombre}.\n\n¿Confirmás?`
      : `Se emitirá una ${tipoTxt} de PRUEBA (homologación) por ${ars(totales.total)}.\n\n¿Continuar?`;
    if (!window.confirm(aviso)) return;
    setEmitiendo(true);
    try {
      const rx = c.receptor || {};
      const res = await emitirComprobanteArca({
        obraId: c.obraId || undefined,
        comprobanteAsociadoId: c.id,
        clienteId: c.clienteId || undefined,
        clienteTelefono: c.clienteTelefono || undefined,
        presupuestoId: c.presupuestoId || undefined,
        presupuestoNumero: c.presupuestoNumero || undefined,
        receptor: {
          nombre: rx.nombre || c.clienteNombre,
          docTipo: Number(rx.docTipo) || (String(c.clienteCuit || '').length === 11 ? 80 : 96),
          docNro: rx.docNro || c.clienteCuit,
          condicionIvaId: Number(rx.condicionIvaId) || condicionIvaDesdeTexto(rx.condicionIva),
          domicilio: rx.domicilio || '',
        },
        lineas: lineasFinal,
        concepto,
        condicionVenta: c.condicionVenta || 'Contado',
        observaciones: `${motivo ? `${motivo}. ` : ''}Acredita ${c.tipoComprobante} ${c.numeroOriginal}`,
        notas: `${motivo || 'Acredita'} – Factura ${c.letra} N° ${c.numeroOriginal}`,
      });
      setResultado(res);
      generarPDFFacturaArca(res, arcaCfg || {}).catch((e) => console.warn('PDF', e));
    } catch (e) {
      setError(e.message);
    }
    setEmitiendo(false);
  };

  if (resultado) {
    return (
      <Modal titulo="Nota de crédito emitida" onClose={onClose} ancho={560}
        pie={<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => generarPDFFacturaArca(resultado, arcaCfg || {})} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Download size={15} /> PDF</button>
          <button className="btn btn-primary" onClick={onClose}>Listo</button>
        </div>}>
        <Alerta tipo="ok">
          {resultado.tipoComprobante} N° {resultado.numeroOriginal} por {ars(resultado.totalComprobante)}{resultado.cae ? ` · CAE ${resultado.cae}` : ''}.
          {'\n'}La factura {c.numeroOriginal} queda acreditada en la cuenta corriente del cliente.
        </Alerta>
      </Modal>
    );
  }

  return (
    <Modal titulo={`Nota de crédito ${c.letra} sobre ${c.tipoComprobante} ${c.numeroOriginal}`} onClose={onClose} ancho={860}
      subtitulo={`${c.clienteNombre} · ${fechaAR(c.fechaEmision)} · Total ${ars(c.totalComprobante)}${yaAcreditado ? ` · Ya acreditado ${ars(yaAcreditado)}` : ''}`}
      pie={(
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontSize: '0.85rem' }}>Neto {ars(totales.neto)} · IVA {ars(totales.iva)} · <b>Total NC {ars(totales.total)}</b> <span style={{ color: 'var(--text-secondary)' }}>(máx. {ars(maximo)})</span></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={emitir} disabled={emitiendo} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#7e22ce', borderColor: '#7e22ce' }}>
              {emitiendo ? <Loader size={15} className="spin" /> : <Undo2 size={15} />} Emitir nota de crédito
            </button>
          </div>
        </div>
      )}>
      {!esProduccion && <Alerta tipo="info">Entorno de homologación: la nota de crédito será de PRUEBA, sin validez fiscal.</Alerta>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: '0.75rem' }}>
        <Campo label="Motivo">
          <input style={inp} value={motivo} onChange={(e) => setMotivo(e.target.value)} list="motivos-nc" />
          <datalist id="motivos-nc">
            {['Anulación total', 'Devolución de mercadería', 'Descuento / bonificación', 'Error en facturación', 'Ajuste de precio'].map((m) => <option key={m} value={m} />)}
          </datalist>
        </Campo>
        <Campo label="Concepto">
          <select style={inp} value={concepto} onChange={(e) => setConcepto(Number(e.target.value))}>
            {CONCEPTOS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </Campo>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', cursor: 'pointer' }}>
        <input type="checkbox" checked={modoImporte} onChange={(e) => setModoImporte(e.target.checked)} /> Acreditar un importe (en lugar de elegir líneas)
      </label>
      {modoImporte ? (
        <Campo label="Importe total a acreditar (IVA incluido)" style={{ maxWidth: 260 }}>
          <input type="number" min="0" step="0.01" style={{ ...inp, textAlign: 'right' }} value={importe} onChange={(e) => setImporte(e.target.value)} />
        </Campo>
      ) : (
        <div style={{ border: '1px solid var(--border-light)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead><tr style={{ background: 'var(--bg-surface-hover, #f8fafc)', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>
              <th style={{ width: 34 }} /><th style={{ textAlign: 'left', padding: 6 }}>Descripción</th><th style={{ width: 90, padding: 6 }}>Cantidad</th>
              <th style={{ width: 130, padding: 6 }}>P. unit. neto</th><th style={{ width: 120, padding: 6, textAlign: 'right' }}>Subtotal</th><th style={{ width: 34 }} />
            </tr></thead>
            <tbody>
              {lineas.map((l) => (
                <tr key={l.key} style={{ borderTop: '1px solid var(--border-light)', opacity: l.incluir ? 1 : 0.5 }}>
                  <td style={{ textAlign: 'center' }}><input type="checkbox" checked={l.incluir} onChange={(e) => setLinea(l.key, 'incluir', e.target.checked)} /></td>
                  <td style={{ padding: 4 }}><input style={inp} value={l.descripcion} onChange={(e) => setLinea(l.key, 'descripcion', e.target.value)} /></td>
                  <td style={{ padding: 4 }}><input type="number" min="0" step="any" style={{ ...inp, textAlign: 'right' }} value={l.cantidad} onChange={(e) => setLinea(l.key, 'cantidad', e.target.value)} /></td>
                  <td style={{ padding: 4 }}><input type="number" min="0" step="0.01" style={{ ...inp, textAlign: 'right' }} value={l.precioUnitario} onChange={(e) => setLinea(l.key, 'precioUnitario', e.target.value)} /></td>
                  <td style={{ padding: 6, textAlign: 'right' }}>{ars((Number(l.cantidad) || 0) * (Number(l.precioUnitario) || 0))}</td>
                  <td><button onClick={() => setLineas((ls) => ls.filter((x) => x.key !== l.key))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c' }}><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: 6, borderTop: '1px solid var(--border-light)' }}>
            <button className="btn btn-secondary" style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 5 }}
              onClick={() => setLineas((ls) => [...ls, { key: `m${Date.now()}`, incluir: true, descripcion: '', cantidad: 1, precioUnitario: 0 }])}><Plus size={13} /> Agregar línea</button>
          </div>
        </div>
      )}
      {error && <Alerta>{error}</Alerta>}
    </Modal>
  );
}
