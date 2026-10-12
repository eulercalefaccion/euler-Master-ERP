import React, { useMemo, useState } from 'react';
import { Wallet, Plus, Trash2, Loader, Download, MessageCircle, Wand2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { EMPRESA_AYALA, EMPRESA_EULER, registrarRecibo, hoyISO } from '../../services/cobranzasService';
import { MEDIOS_COBRO, CAMPOS_MEDIO, MARCAS_TARJETA, totalesCuenta, r2 } from '../../services/ventasCalculo';
import { generarPDFRecibo } from '../../services/pdfRecibo';
import { ars, fechaAR, abrirWhatsApp } from '../../services/listadosService';
import { inp, card, emisorDe } from './ventasHelpers';
import { Modal, Campo, Alerta, Seg } from './ventasUI';
import ClienteSelector from './ClienteSelector';

const empresaDe = (x) => x.empresaId || EMPRESA_AYALA;
const nuevoMedio = (tipo, importe = '') => ({ key: `m${Date.now()}${Math.random()}`, tipo, importe });

/**
 * preset: { empresaId, cliente: {clave, id, nombre, ...}, comprobanteIds: [], comprobante: objeto recién emitido }
 */
export default function ReciboModal({ onClose, arcaCfg, ventasCfg, cartera, preset = {} }) {
  const { currentUser } = useAuth();
  const [empresa, setEmpresa] = useState(preset.empresaId || EMPRESA_AYALA);
  const [cliente, setCliente] = useState(preset.cliente || null);
  const [seleccion, setSeleccion] = useState(() => Object.fromEntries((preset.comprobanteIds || []).map((id) => [id, null])));
  const [medios, setMedios] = useState(() => [nuevoMedio('efectivo', preset.importeInicial || '')]);
  const [autoImporte, setAutoImporte] = useState(true);
  const [fecha, setFecha] = useState(hoyISO());
  const [notas, setNotas] = useState('');
  const [error, setError] = useState('');
  const [emitiendo, setEmitiendo] = useState(false);
  const [resultado, setResultado] = useState(null);

  const cuenta = useMemo(() => {
    if (!cliente) return null;
    if (cliente.clave && cartera.cuentas[cliente.clave]) return cartera.cuentas[cliente.clave];
    const k = cartera.claveDe({ clienteId: cliente.id, clienteCuit: cliente.docNro, clienteNombre: cliente.nombre });
    return cartera.cuentas[k] || null;
  }, [cliente, cartera]);

  const pendientes = useMemo(() => {
    const lista = (cuenta?.pendientes || []).filter((p) => empresaDe(p) === empresa);
    const pc = preset.comprobante;
    if (pc && empresaDe(pc) === empresa && !lista.some((p) => p.id === pc.id) && !pc.esNotaCredito) {
      lista.push({ ...pc, _col: pc.coleccion || 'comprobantes_venta', _prueba: pc.coleccion === 'arca_pruebas', _pendiente: Number(pc.totalComprobante || 0) });
    }
    return lista;
  }, [cuenta, empresa, preset.comprobante]);

  const tot = cuenta ? totalesCuenta(cuenta, empresa) : null;
  const creditoDisp = tot?.creditoSinAplicar || 0;

  const importeSel = (p) => (seleccion[p.id] === null || seleccion[p.id] === undefined ? p._pendiente : Number(seleccion[p.id]) || 0);
  const seleccionados = pendientes.filter((p) => p.id in seleccion);
  const totalImputado = r2(seleccionados.reduce((a, p) => a + importeSel(p), 0));
  const importeMedio = (m) => (m.tipo === 'dolares' ? r2((Number(m.montoUSD) || 0) * (Number(m.cotizacion) || 0)) : Number(m.importe) || 0);
  const totalMedios = r2(medios.reduce((a, m) => a + importeMedio(m), 0));
  const usado = r2(medios.filter((m) => m.tipo === 'saldo_favor').reduce((a, m) => a + importeMedio(m), 0));
  const aCuenta = r2(totalMedios - totalImputado);
  const hayPrueba = seleccionados.some((p) => p._prueba);
  const hayReal = seleccionados.some((p) => !p._prueba);

  // Auto-completa el importe del único medio con lo imputado
  const syncAuto = (nuevaSel) => {
    if (!autoImporte || medios.length !== 1 || medios[0].tipo === 'dolares') return;
    const t = r2(pendientes.filter((p) => p.id in nuevaSel).reduce((a, p) => a + (nuevaSel[p.id] === null ? p._pendiente : Number(nuevaSel[p.id]) || 0), 0));
    setMedios([{ ...medios[0], importe: t || '' }]);
  };
  const toggle = (p) => {
    const n = { ...seleccion };
    if (p.id in n) delete n[p.id]; else n[p.id] = null;
    setSeleccion(n); syncAuto(n);
  };
  const setImporteSel = (p, v) => { const n = { ...seleccion, [p.id]: v }; setSeleccion(n); syncAuto(n); };

  const updMedio = (key, campo, valor) => {
    if (campo === 'importe') setAutoImporte(false);
    setMedios((ms) => ms.map((m) => (m.key === key ? { ...m, [campo]: valor } : m)));
  };
  const agregarMedio = (tipo) => {
    setAutoImporte(false);
    const falta = r2(totalImputado - totalMedios);
    const base = tipo === 'saldo_favor' ? Math.min(creditoDisp, Math.max(0, falta)) : Math.max(0, falta);
    setMedios((ms) => [...ms, { ...nuevoMedio(tipo, base || ''), ...(tipo === 'transferencia' ? { cuentaDestino: ventasCfg?.cuentasDestino?.[0] || '' } : {}) }]);
  };

  /** Distribuye lo cobrado entre los comprobantes (más antiguos primero). */
  const ajustarImputacion = () => {
    let resto = totalMedios;
    const n = {};
    pendientes.forEach((p) => {
      if (resto <= 0.009) return;
      const imp = Math.min(p._pendiente, resto);
      n[p.id] = r2(imp);
      resto = r2(resto - imp);
    });
    setSeleccion(n);
  };

  const emitir = async () => {
    setError('');
    if (!cliente?.nombre) { setError('Elegí el cliente.'); return; }
    if (totalMedios <= 0) { setError('Cargá el importe cobrado en al menos una forma de cobro.'); return; }
    if (hayPrueba && hayReal) { setError('No mezcles comprobantes de prueba (homologación) con comprobantes reales en el mismo recibo.'); return; }
    if (aCuenta < -0.009) { setError(`Lo imputado supera lo cobrado en ${ars(-aCuenta)}. Ajustá los importes o usá “Ajustar imputación”.`); return; }
    if (usado > creditoDisp + 0.01) { setError(`El cliente tiene ${ars(creditoDisp)} de saldo a favor disponible.`); return; }
    for (const m of medios) {
      if ((m.tipo === 'cheque' || m.tipo === 'echeq') && importeMedio(m) > 0 && (!m.banco || !m.numero || !m.fechaPago)) { setError('Completá banco, número y fecha de pago de cada cheque.'); return; }
    }
    const msg = `Se emitirá el recibo de ${empresa === EMPRESA_AYALA ? 'AYALA NICOLAS FEDERICO' : 'EULER CALEFACCIÓN'} por ${ars(totalMedios)} a ${cliente.nombre}.${aCuenta > 0.009 ? `\n\n${ars(aCuenta)} quedan A CUENTA (saldo a favor del cliente).` : ''}${hayPrueba ? '\n\n(Recibo de PRUEBA: imputa comprobantes de homologación.)' : ''}\n\n¿Confirmás?`;
    if (!window.confirm(msg)) return;
    setEmitiendo(true);
    try {
      const rec = await registrarRecibo({
        empresaId: empresa,
        cliente: { ...cliente, clave: cuenta?.clave || cliente.clave },
        imputaciones: seleccionados.map((p) => ({
          comprobanteId: p.id, coleccion: p._col || 'comprobantes_venta', tipoComprobante: p.tipoComprobante, numeroOriginal: p.numeroOriginal,
          fechaEmision: p.fechaEmision, totalComprobante: p.totalComprobante, saldoAnterior: p._pendiente, importe: importeSel(p),
          notas: p.notas || p.presupuestoNumero || '',
        })),
        mediosPago: medios.map((m) => ({ ...m, importe: importeMedio(m) })),
        notas, fecha, prueba: hayPrueba, saldoFavorDisponible: creditoDisp,
      }, currentUser);
      const saldoPosterior = r2((tot?.saldo || 0) - (totalMedios - usado));
      const emisor = emisorDe(empresa, arcaCfg, ventasCfg);
      generarPDFRecibo(rec, emisor, { saldoPosterior }).catch((e) => console.warn('PDF', e));
      setResultado({ rec, saldoPosterior, emisor });
    } catch (e) {
      setError(e.message);
    }
    setEmitiendo(false);
  };

  if (resultado) {
    const { rec, saldoPosterior, emisor } = resultado;
    return (
      <Modal titulo={`Recibo ${rec.numeroOriginal} emitido`} onClose={onClose} ancho={600}>
        <Alerta tipo="ok">
          <b>Recibo N° {rec.numeroOriginal}</b> · {rec.clienteNombre} · <b>{ars(rec.totalRecibo)}</b>
          {rec.aCuenta > 0.009 && <><br />{ars(rec.aCuenta)} quedaron a cuenta (saldo a favor).</>}
          <br />{Math.abs(saldoPosterior) < 0.01 ? 'Cuenta corriente al día.' : saldoPosterior > 0 ? `Saldo pendiente: ${ars(saldoPosterior)}` : `Saldo a favor: ${ars(-saldoPosterior)}`}
        </Alerta>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => generarPDFRecibo(rec, emisor, { saldoPosterior })} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Download size={15} /> Descargar PDF</button>
          <button className="btn btn-secondary" disabled={!cliente?.telefono && !cuenta?.telefono}
            onClick={() => abrirWhatsApp(cliente?.telefono || cuenta?.telefono, `Hola ${(rec.clienteNombre || '').split(' ')[0]}, te confirmamos la recepción de tu pago por ${ars(rec.totalRecibo)} (Recibo N° ${rec.numeroOriginal}). ¡Muchas gracias!\n\nEuler Calefacción`)}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MessageCircle size={15} /> WhatsApp</button>
          <button className="btn btn-primary" onClick={onClose} style={{ marginLeft: 'auto' }}>Listo</button>
        </div>
      </Modal>
    );
  }

  const pie = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
      <div style={{ fontSize: '0.8rem', lineHeight: 1.6 }}>
        <div>Cobrado: <b>{ars(totalMedios)}</b> · Imputado a comprobantes: <b>{ars(totalImputado)}</b></div>
        {aCuenta > 0.009 && <div style={{ color: '#047857' }}>A cuenta (queda como saldo a favor): <b>{ars(aCuenta)}</b></div>}
        {aCuenta < -0.009 && <div style={{ color: '#b91c1c' }}>Faltan {ars(-aCuenta)} para cubrir lo imputado</div>}
      </div>
      <button className="btn btn-primary" onClick={emitir} disabled={emitiendo} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.65rem 1.1rem' }}>
        {emitiendo ? <Loader size={16} className="spin" /> : <Wallet size={16} />} {emitiendo ? 'Registrando…' : `Emitir recibo ${ars(totalMedios)}`}
      </button>
    </div>
  );

  return (
    <Modal titulo="Recibo de cobro" subtitulo="Elegí qué comprobantes cancela y cómo te pagaron. Lo que sobre queda a cuenta del cliente." onClose={onClose} ancho={980} pie={pie}>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Campo label="Empresa que cobra">
          <Seg valor={empresa} onChange={(e) => { setEmpresa(e); setSeleccion({}); }} opciones={[[EMPRESA_AYALA, 'Ayala Nicolás F. (Canal 1)'], [EMPRESA_EULER, 'Euler Calefacción (Canal 2)']]} />
        </Campo>
        <Campo label="Fecha"><input type="date" style={{ ...inp, width: 160 }} value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo>
      </div>

      <Campo label="Cliente">
        <ClienteSelector value={cliente} onChange={(c) => { setCliente(c); setSeleccion({}); }} cuentas={Object.values(cartera.cuentas)} autoFocus={!cliente} />
      </Campo>

      {error && <Alerta>{error}</Alerta>}

      {cliente && (
        <>
          {/* Resumen de la cuenta */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
            {[
              ['Deuda en comprobantes', tot?.deudaFacturas || 0, '#b45309'],
              ['Saldo a favor disponible', creditoDisp, '#047857'],
              ['Saldo de la cuenta', tot?.saldo || 0, (tot?.saldo || 0) > 0 ? '#b45309' : '#047857'],
            ].map(([t, v, c]) => (
              <div key={t} style={{ ...card, padding: '0.6rem 0.8rem' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{t}</div>
                <div style={{ fontWeight: 700, color: c }}>{ars(v)}</div>
              </div>
            ))}
          </div>

          {/* Comprobantes pendientes */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <b style={{ fontSize: '0.88rem' }}>Comprobantes pendientes</b>
              {pendientes.length > 0 && totalMedios > 0 && (
                <button className="btn btn-secondary" style={{ fontSize: '0.74rem', display: 'flex', alignItems: 'center', gap: 4 }} onClick={ajustarImputacion} title="Reparte lo cobrado empezando por los comprobantes más antiguos">
                  <Wand2 size={13} /> Ajustar imputación a lo cobrado
                </button>
              )}
            </div>
            {pendientes.length === 0 ? (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>El cliente no tiene comprobantes pendientes en esta empresa. Todo lo que cobres quedará <b>a cuenta</b> (anticipo / saldo a favor).</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead><tr style={{ background: 'var(--bg-surface-hover)' }}>
                  {['', 'Comprobante', 'Fecha', 'Detalle', 'Total', 'Saldo', 'Importe a cobrar'].map((h, i) => (
                    <th key={i} style={{ padding: '0.4rem', textAlign: i >= 4 ? 'right' : 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {pendientes.map((p) => {
                    const sel = p.id in seleccion;
                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border-light)', background: sel ? '#f0f9ff' : undefined }}>
                        <td style={{ padding: '0.35rem', width: 26 }}><input type="checkbox" checked={sel} onChange={() => toggle(p)} /></td>
                        <td style={{ padding: '0.35rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {p.tipoComprobante} {p.numeroOriginal}
                          {p._prueba && <span style={{ marginLeft: 6, fontSize: '0.64rem', color: '#b91c1c', fontWeight: 700 }}>PRUEBA</span>}
                        </td>
                        <td style={{ padding: '0.35rem' }}>{fechaAR(p.fechaEmision)}</td>
                        <td style={{ padding: '0.35rem', color: 'var(--text-secondary)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.notas || p.obraNombre || ''}</td>
                        <td style={{ padding: '0.35rem', textAlign: 'right' }}>{ars(p.totalComprobante)}</td>
                        <td style={{ padding: '0.35rem', textAlign: 'right', fontWeight: 600, color: '#b45309' }}>{ars(p._pendiente)}</td>
                        <td style={{ padding: '0.35rem', textAlign: 'right', width: 150 }}>
                          {sel && <input style={{ ...inp, textAlign: 'right' }} type="number" step="0.01" min="0" max={p._pendiente} value={seleccion[p.id] ?? p._pendiente} onChange={(e) => setImporteSel(p, e.target.value)} />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Formas de cobro */}
          <div style={card}>
            <b style={{ fontSize: '0.88rem' }}>Formas de cobro</b>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
              {medios.map((m) => {
                const def = MEDIOS_COBRO[m.tipo];
                return (
                  <div key={m.key} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap', padding: '0.5rem', borderRadius: 8, background: 'var(--bg-surface-hover, #f8fafc)' }}>
                    <Campo label="Forma" style={{ width: 200 }}>
                      <select style={inp} value={m.tipo} onChange={(e) => updMedio(m.key, 'tipo', e.target.value)}>
                        {Object.entries(MEDIOS_COBRO).filter(([id]) => id !== 'saldo_favor' || creditoDisp > 0 || m.tipo === 'saldo_favor').map(([id, d]) => <option key={id} value={id}>{d.label}</option>)}
                      </select>
                    </Campo>
                    {def.campos.map((c) => {
                      const cd = CAMPOS_MEDIO[c];
                      const val = m[c] ?? '';
                      let control;
                      if (cd.tipo === 'cuenta') {
                        control = (
                          <select style={inp} value={val} onChange={(e) => updMedio(m.key, c, e.target.value)}>
                            <option value="">—</option>
                            {(ventasCfg?.cuentasDestino || []).map((x) => <option key={x} value={x}>{x}</option>)}
                          </select>
                        );
                      } else if (cd.tipo === 'marca') {
                        control = (
                          <select style={inp} value={val} onChange={(e) => updMedio(m.key, c, e.target.value)}>
                            <option value="">—</option>
                            {MARCAS_TARJETA.map((x) => <option key={x} value={x}>{x}</option>)}
                          </select>
                        );
                      } else {
                        control = <input style={inp} type={cd.tipo === 'date' ? 'date' : (cd.tipo === 'number' ? 'number' : 'text')} value={val} onChange={(e) => updMedio(m.key, c, e.target.value)} />;
                      }
                      return <Campo key={c} label={cd.label} style={{ width: c === 'librador' ? 190 : (cd.tipo === 'number' ? 100 : 150) }}>{control}</Campo>;
                    })}
                    <Campo label={m.tipo === 'dolares' ? 'Equivale a $' : 'Importe $'} style={{ width: 150, marginLeft: 'auto' }}>
                      {m.tipo === 'dolares'
                        ? <input style={{ ...inp, textAlign: 'right', fontWeight: 700 }} readOnly value={importeMedio(m).toLocaleString('es-AR', { minimumFractionDigits: 2 })} />
                        : <input style={{ ...inp, textAlign: 'right', fontWeight: 700 }} type="number" step="0.01" min="0" value={m.importe} onChange={(e) => updMedio(m.key, 'importe', e.target.value)} />}
                    </Campo>
                    <button onClick={() => setMedios((ms) => ms.filter((x) => x.key !== m.key))} disabled={medios.length === 1} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', paddingBottom: 8 }}><Trash2 size={15} /></button>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
              {Object.entries(MEDIOS_COBRO).filter(([id]) => id !== 'saldo_favor' || creditoDisp > 0).map(([id, d]) => (
                <button key={id} className="btn btn-secondary" onClick={() => agregarMedio(id)} style={{ fontSize: '0.72rem', padding: '0.3rem 0.6rem', display: 'flex', alignItems: 'center', gap: 4, ...(id === 'saldo_favor' ? { color: '#047857', borderColor: '#86efac' } : {}) }}>
                  <Plus size={12} /> {d.corto}{id === 'saldo_favor' ? ` (${ars(creditoDisp)})` : ''}
                </button>
              ))}
            </div>
          </div>

          <Campo label="Notas (se imprimen en el recibo)">
            <input style={inp} value={notas} maxLength={300} onChange={(e) => setNotas(e.target.value)} placeholder="Ej: Anticipo obra / Pago saldo presupuesto 0001-00000193" />
          </Campo>
        </>
      )}
    </Modal>
  );
}
