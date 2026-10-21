import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Target, Loader, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';
import {
  filasAprobacion, validarSeleccion, quedaTotal, importeFinalItem, num, EPS,
} from '../../services/presupuestoAlcance';
import {
  registrarAprobacion, sincronizarJornadas, nuevoIdAprobacion, buscarObraDePresupuesto, cargarReservadoPorArticulo,
} from '../../services/aprobacionesService';

const $ = (n) => `$ ${Math.round(Number(n) || 0).toLocaleString('es-AR')}`;
const q = (n) => Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 3 });
const th = { padding: '0.4rem 0.5rem', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.72rem', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border-light)' };
const td = { padding: '0.35rem 0.5rem', borderBottom: '1px solid var(--border-light)', fontSize: '0.8rem' };

/**
 * Pop-up «Aprobar Presupuesto» (ampliado): aprobación por ítem y cantidad, parcial o total.
 * - modo 'mover': se abrió al arrastrar la tarjeta a Aprobado. Cancelar deja la tarjeta donde estaba, sin efectos.
 * - modo 'pendientes': «Aprobar ítems pendientes» desde una tarjeta ya aprobada (misma obra, alcance incremental).
 * Aprobar NO reserva stock ni registra cobros (ver services/aprobacionesService.js).
 */
export default function AprobacionModal({ presupuesto, listaItems = [], currentUser, modo = 'mover', onClose }) {
  const [aprobacionId] = useState(() => nuevoIdAprobacion()); // idempotencia: reintentos / doble clic no duplican
  const [obra, setObra] = useState(null);
  const [obraCargada, setObraCargada] = useState(false);
  const [sel, setSel] = useState({}); // { [key]: cantidad (string) }
  const [paymentStatus, setPaymentStatus] = useState('Pendiente');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [reservadoPor, setReservadoPor] = useState(null);
  const [isApproving, setIsApproving] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);
  const [reintentando, setReintentando] = useState(false);
  const enCurso = useRef(false);

  useEffect(() => {
    let vivo = true;
    // La obra solo hace falta para presupuestos aprobados antes de esta mejora (alcance copiado a la obra)
    buscarObraDePresupuesto(presupuesto.id, presupuesto.obraId).then((o) => { if (vivo) { setObra(o); setObraCargada(true); } })
      .catch(() => { if (vivo) setObraCargada(true); });
    cargarReservadoPorArticulo().then((r) => { if (vivo) setReservadoPor(r); }).catch(() => { if (vivo) setReservadoPor({}); });
    return () => { vivo = false; };
  }, [presupuesto.id, presupuesto.obraId]);

  const filas = useMemo(() => filasAprobacion(presupuesto, obra), [presupuesto, obra]);
  const listaPor = useMemo(() => Object.fromEntries(listaItems.map((i) => [i.id, i])), [listaItems]);
  const canal = presupuesto.canal || 'iva';

  const cantidades = Object.fromEntries(Object.entries(sel).map(([k, v]) => [k, num(v)]));
  const validacion = validarSeleccion(filas, sel);
  const errorFila = (f) => {
    const raw = sel[f.key];
    if (raw === undefined || raw === '') return '';
    const n = Number(String(raw).replace(',', '.'));
    if (!Number.isFinite(n)) return 'Cantidad inválida';
    if (n < 0) return 'No puede ser negativa';
    if (n > f.pendiente + EPS) return `Máximo ${q(f.pendiente)}`;
    return '';
  };
  const importeAhora = filas.reduce((a, f) => a + (cantidades[f.key] > 0 && !errorFila(f) ? importeFinalItem(f.item, cantidades[f.key], canal) : 0), 0);
  const aprobadoPrevio = filas.reduce((a, f) => a + f.importeAprobadoAntes, 0);
  const totalCotizado = filas.reduce((a, f) => a + f.subtotalFinal, 0);
  const pendienteDespues = filas.reduce((a, f) => a + Math.max(0, f.pendiente - (errorFila(f) ? 0 : (cantidades[f.key] || 0))) * f.precioUnitarioFinal, 0);
  const esTotal = quedaTotal(filas, validacion.cantidades);
  const hayPendientes = filas.some((f) => f.pendiente > EPS);
  const historica = filas[0]?.historica;

  const toggle = (f, checked) => setSel((s) => ({ ...s, [f.key]: checked ? String(f.pendiente) : '' }));
  const seleccionarPendientes = () => setSel(Object.fromEntries(filas.filter((f) => f.pendiente > EPS).map((f) => [f.key, String(f.pendiente)])));

  const stockDe = (f) => {
    if (!f.inventariable) return null;
    const art = listaPor[f.listaItemId];
    if (!art) return { sinDato: true };
    const stock = Number(art.stock || 0);
    const reservado = reservadoPor ? Number(reservadoPor[f.listaItemId] || 0) : null;
    const disponible = reservado === null ? null : stock - reservado;
    const pedir = cantidades[f.key] || 0;
    return { stock, reservado, disponible, faltante: disponible === null ? null : Math.max(0, pedir - Math.max(0, disponible)) };
  };
  const faltantes = filas.map((f) => ({ f, s: stockDe(f) })).filter(({ f, s }) => s && s.faltante > EPS && (cantidades[f.key] || 0) > 0);

  const confirmar = async () => {
    if (enCurso.current) return;
    setError('');
    if (!validacion.ok) { setError(validacion.errores.join('\n')); return; }
    enCurso.current = true;
    setIsApproving(true);
    try {
      const monto = paymentAmount ? Math.round(parseFloat(String(paymentAmount).replace(',', '.')) || 0) : null;
      const r = await registrarAprobacion({
        presupuestoId: presupuesto.id, aprobacionId, seleccion: validacion.cantidades, origen: 'crm', user: currentUser,
        pagoDeclarado: paymentStatus !== 'Pendiente' || monto ? { estado: paymentStatus, monto } : null,
      });
      setResultado({ ...r, faltantes });
    } catch (e) {
      setError(e.message);
    }
    enCurso.current = false;
    setIsApproving(false);
  };

  const reintentarJornadas = async () => {
    setReintentando(true);
    const j = await sincronizarJornadas(resultado.obraId);
    setResultado((r) => ({ ...r, jornadas: j }));
    setReintentando(false);
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card" style={{ width: '1120px', maxWidth: '96vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', gap: '1rem', overflow: 'hidden' }}>
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Target size={20} color="var(--success)" /> {modo === 'pendientes' ? 'Aprobar ítems pendientes' : 'Aprobar Presupuesto'}
          <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)' }}>{presupuesto.presupuestoNumber} · {presupuesto.name} · Rev {presupuesto.revision || 0}</span>
        </h3>

        {resultado ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto' }}>
            <div style={{ padding: '0.75rem', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontSize: '0.875rem', display: 'flex', gap: 8 }}>
              <CheckCircle size={18} />
              <div>
                {resultado.duplicado
                  ? 'Esta aprobación ya estaba registrada (no se duplicó).'
                  : <>Aprobación <b>N° {resultado.aprobacion?.numero} ({resultado.aprobacion?.tipo})</b> registrada por {$(resultado.aprobacion?.importe)}.</>}
                <br />Obra {resultado.otNumber} {resultado.obraCreada ? 'creada' : 'actualizada'} en el ERP con el alcance aprobado{resultado.obraCreada ? '' : ' (solo se agregó lo nuevo)'}.
              </div>
            </div>
            {resultado.jornadas?.ok ? (
              <div style={{ fontSize: '0.85rem', color: '#166534' }}>✓ Obra sincronizada con Euler Jornadas.</div>
            ) : (
              <div style={{ padding: '0.75rem', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <AlertTriangle size={16} /> No se pudo sincronizar con Euler Jornadas: {resultado.jornadas?.error}
                <button className="btn btn-secondary" onClick={reintentarJornadas} disabled={reintentando} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {reintentando ? <Loader size={14} className="spin" /> : <RefreshCw size={14} />} Reintentar
                </button>
              </div>
            )}
            {resultado.faltantes?.length > 0 && (
              <div style={{ padding: '0.75rem', borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: '0.82rem' }}>
                Faltante de stock para lo aprobado: {resultado.faltantes.map(({ f, s }) => `${f.descripcion}: faltan ${q(s.faltante)} ${f.unidad || ''}`).join(' · ')}. Revisá compras.
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={() => onClose(resultado)}>Cerrar</button>
            </div>
          </div>
        ) : (
          <>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0 }}>
              Elegí exactamente <strong>qué ítems y qué cantidades</strong> aprobó el cliente. Al aprobar:
              <br />• {obraCargada && obra ? <>Se actualiza la <strong>Obra {obra.otNumber}</strong> agregando solo el alcance nuevo (y se verifica <strong>Euler Jornadas</strong>)</> : <>Se crea la <strong>Obra en el ERP</strong> y en <strong>Euler Jornadas</strong> solo con lo aprobado</>}
              <br />• Aprobar <strong>no reserva stock</strong>: los materiales quedan reservados cuando están aprobados, facturados con entrega posterior y cobrados. Lo no aprobado no es deuda del cliente.
            </p>
            {historica && (
              <div style={{ fontSize: '0.78rem', padding: '0.5rem 0.75rem', borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af' }}>
                Este presupuesto se aprobó antes de esta mejora (sin detalle por ítem). Se toma como aprobado el alcance copiado a la obra en ese momento{obra ? '' : ' (sin obra: el presupuesto completo)'}.
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" style={{ fontSize: '0.8rem' }} onClick={seleccionarPendientes} disabled={!hayPendientes}>Seleccionar todos los pendientes</button>
              <button className="btn btn-secondary" style={{ fontSize: '0.8rem' }} onClick={() => setSel({})}>Limpiar selección</button>
              {!hayPendientes && <span style={{ fontSize: '0.8rem', color: '#047857', fontWeight: 600 }}>No quedan ítems pendientes de aprobación.</span>}
            </div>

            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', border: '1px solid var(--border-light)', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-surface-hover, #f8fafc)', zIndex: 1 }}>
                  <tr>
                    <th style={th} />
                    <th style={{ ...th, textAlign: 'left' }}>Descripción</th>
                    <th style={{ ...th, textAlign: 'right' }}>Presupuestado</th>
                    <th style={{ ...th, textAlign: 'right' }}>Aprobado antes</th>
                    <th style={{ ...th, textAlign: 'right' }}>Aprobar ahora</th>
                    <th style={{ ...th, textAlign: 'right' }}>Precio unit.</th>
                    <th style={{ ...th, textAlign: 'right' }}>Subtotal ahora</th>
                    <th style={{ ...th, textAlign: 'left' }}>Stock (informativo)</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => {
                    const v = sel[f.key] ?? '';
                    const err = errorFila(f);
                    const checked = num(v) > 0;
                    const s = stockDe(f);
                    const sinPend = f.pendiente <= EPS;
                    return (
                      <tr key={f.key} style={{ opacity: sinPend ? 0.5 : 1, background: checked ? '#f0fdf4' : undefined }}>
                        <td style={{ ...td, width: 28 }}><input type="checkbox" checked={checked} disabled={sinPend} onChange={(e) => toggle(f, e.target.checked)} /></td>
                        <td style={td}>
                          {f.descripcion}
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                            {f.inventariable ? 'Material inventariable' : (f.tipo === 'mano_de_obra' || f.tipo === 'servicio' || f.categoria !== 'MATERIAL' ? 'Mano de obra / servicio · no usa stock' : 'No vinculado al stock')}
                          </div>
                        </td>
                        <td style={{ ...td, textAlign: 'right' }}>{q(f.cotizada)} {f.unidad}</td>
                        <td style={{ ...td, textAlign: 'right', color: f.aprobadaAntes > 0 ? '#047857' : 'var(--text-tertiary)' }}>{q(f.aprobadaAntes)}</td>
                        <td style={{ ...td, textAlign: 'right', width: 120 }}>
                          {sinPend ? <span style={{ fontSize: '0.72rem', color: '#047857' }}>Aprobado</span> : (
                            <>
                              <input type="number" min="0" max={f.pendiente} step="any" className="input-field" value={v}
                                onChange={(e) => setSel((st) => ({ ...st, [f.key]: e.target.value }))} onFocus={(e) => e.target.select()}
                                style={{ width: 90, textAlign: 'right', padding: '0.25rem 0.4rem', borderColor: err ? '#dc2626' : undefined }} />
                              <div style={{ fontSize: '0.66rem', color: err ? '#dc2626' : 'var(--text-tertiary)' }}>{err || `pend. ${q(f.pendiente)}`}</div>
                            </>
                          )}
                        </td>
                        <td style={{ ...td, textAlign: 'right' }}>{$(f.precioUnitarioFinal)}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{checked && !err ? $(importeFinalItem(f.item, num(v), canal)) : '—'}</td>
                        <td style={{ ...td, fontSize: '0.7rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                          {!s ? '—' : s.sinDato ? 'Sin dato de stock' : (
                            <>
                              Físico {q(s.stock)} · Res. {s.reservado === null ? '…' : q(s.reservado)} · Disp. {s.disponible === null ? '…' : q(s.disponible)}
                              {s.faltante > EPS && checked && <div style={{ color: '#b91c1c', fontWeight: 700 }}>Faltan {q(s.faltante)}</div>}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
              {[
                ['Aprobado ahora', importeAhora, '#047857'],
                ['Aprobado acumulado', aprobadoPrevio + importeAhora, '#0D2A4E'],
                ['Pendiente de aprobación', pendienteDespues, '#b45309'],
                ['Total presupuestado', totalCotizado, 'var(--text-secondary)'],
              ].map(([t, v, c]) => (
                <div key={t} style={{ border: '1px solid var(--border-light)', borderRadius: 8, padding: '0.5rem 0.75rem' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{t}</div>
                  <div style={{ fontWeight: 800, color: c }}>{$(v)}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', alignItems: 'end' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Estado de pago del alcance aprobado ({$(aprobadoPrevio + importeAhora)} de {$(totalCotizado)}) — declaración manual</label>
                <select className="input-field" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
                  <option value="Pendiente">Pendiente de Pago</option>
                  <option value="Seña Abonada">Seña abonada del alcance aprobado</option>
                  <option value="Pago Completo">Pago completo del alcance aprobado (100%)</option>
                </select>
              </div>
              {paymentStatus !== 'Pendiente' ? (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Monto declarado ($)</label>
                  <input type="text" inputMode="decimal" className="input-field" placeholder="Ej: 500000" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} onFocus={(e) => e.target.select()} />
                </div>
              ) : <div />}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '-0.5rem' }}>
              Es solo una declaración: no genera recibo, factura ni movimiento de caja. Cuando haya cobros registrados, el estado se deriva de los recibos (pestaña «Gestión comercial»).
            </div>

            {error && <div style={{ padding: '0.6rem 0.75rem', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.82rem', whiteSpace: 'pre-wrap' }}>{error}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button className="btn btn-secondary" onClick={() => onClose(null)} disabled={isApproving}>Cancelar</button>
              <button className="btn btn-primary" onClick={confirmar} disabled={isApproving || !validacion.ok || !obraCargada}>
                {isApproving ? 'Procesando...' : (esTotal ? '✓ Confirmar aprobación total' : '✓ Confirmar aprobación parcial')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
