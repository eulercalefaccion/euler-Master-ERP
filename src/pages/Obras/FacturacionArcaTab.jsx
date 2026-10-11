import React, { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import {
  Receipt, Plus, Trash2, Download, Settings, AlertTriangle, CheckCircle, Loader, RefreshCw, Search, X, Undo2,
} from 'lucide-react';
import { db } from '../../services/firebaseConfig';
import { useAuth } from '../../context/AuthContext';
import {
  CONDICIONES_IVA, DOC_TIPOS, CONCEPTOS, letraPorCondicion, condicionIvaDesdeTexto, cuitValido,
  receptorDesdeObra, lineasDesdeObra, calcularTotales, getArcaConfig, saveArcaConfig,
  getArcaEstado, emitirComprobanteArca,
} from '../../services/arcaFacturacionService';
import { generarPDFFacturaArca } from '../../services/pdfFacturaArca';
import { consultarCuitArca } from '../../services/arcaCuitService';

const ars = (n) => `$ ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hoyISO = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const inp = {
  width: '100%', padding: '0.45rem 0.6rem', border: '1px solid var(--border-strong)', borderRadius: '6px',
  fontSize: '0.83rem', outline: 'none', background: 'var(--bg-primary)', boxSizing: 'border-box',
};
const lbl = { fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem', display: 'block' };
const card = { border: '1px solid var(--border-light)', borderRadius: '10px', padding: '1rem', background: 'var(--bg-primary)' };

export default function FacturacionArcaTab({ obra }) {
  const { currentUser } = useAuth();
  const esAdmin = currentUser?.role === 'administrador';

  const [cfg, setCfg] = useState(null);
  const [showConfig, setShowConfig] = useState(false);
  const [modo, setModo] = useState(null); // null | 'factura' | { nc: resumenFactura }
  const [emitiendo, setEmitiendo] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState(null);

  // Formulario
  const [receptor, setReceptor] = useState(() => receptorDesdeObra(obra));
  const [lineas, setLineas] = useState(() => lineasDesdeObra(obra));
  const [concepto, setConcepto] = useState(3);
  const [fchServDesde, setFchServDesde] = useState(hoyISO());
  const [fchServHasta, setFchServHasta] = useState(hoyISO());
  const [fchVtoPago, setFchVtoPago] = useState(hoyISO());
  const [observaciones, setObservaciones] = useState('');
  const [porcentaje, setPorcentaje] = useState('');
  const [buscandoPadron, setBuscandoPadron] = useState(false);

  useEffect(() => {
    getArcaConfig().then((c) => { setCfg(c); setConcepto(Number(c.conceptoDefault) || 3); }).catch((e) => setError(e.message));
  }, []);

  const esProduccion = cfg?.entorno === 'produccion';
  const coleccion = esProduccion ? 'comprobantes_venta' : 'arca_pruebas';
  const comprobantes = useMemo(
    () => [...((esProduccion ? obra.facturasArca : obra.facturasArcaPrueba) || [])]
      .sort((a, b) => (b.fechaEmision || '').localeCompare(a.fechaEmision || '') || (b.numeroOriginal || '').localeCompare(a.numeroOriginal || '')),
    [obra, esProduccion],
  );

  const totalPresupuesto = useMemo(() => calcularTotales(lineasDesdeObra(obra)).total, [obra]);
  const totalFacturado = comprobantes.reduce((a, c) => a + (c.esNotaCredito ? -c.total : c.total), 0);

  const lineasIncluidas = lineas.filter((l) => l.incluir);
  const totales = calcularTotales(lineasIncluidas);
  const esNC = modo && typeof modo === 'object' && modo.nc;
  const letra = esNC ? modo.nc.letra : letraPorCondicion(receptor.condicionIvaId);

  // ── Acciones de formulario ────────────────────────────────────────────────
  const abrirFactura = () => {
    setReceptor(receptorDesdeObra(obra));
    setLineas(lineasDesdeObra(obra));
    setObservaciones('');
    setPorcentaje('');
    setError('');
    setExito(null);
    setModo('factura');
  };

  const abrirNotaCredito = async (resumen) => {
    setError('');
    setExito(null);
    try {
      const snap = await getDoc(doc(db, coleccion, resumen.id));
      if (!snap.exists()) throw new Error('No se encontró el comprobante original.');
      const orig = snap.data();
      setReceptor({ ...orig.receptor });
      setLineas((orig.lineas || []).map((l, i) => ({
        key: `nc${i}`, incluir: true, descripcion: l.descripcion, cantidad: l.cantidad, precioUnitario: l.precioUnitario,
      })));
      setConcepto(orig.concepto || 3);
      setObservaciones(`Anula/acredita ${orig.tipoComprobante} ${orig.numeroOriginal}`);
      setModo({ nc: { ...resumen, letra: orig.letra } });
    } catch (e) {
      setError(e.message);
    }
  };

  const updLinea = (key, campo, valor) => setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, [campo]: valor } : l)));
  const agregarLinea = () => setLineas((ls) => [...ls, { key: `m${Date.now()}`, incluir: true, descripcion: '', cantidad: 1, precioUnitario: 0 }]);
  const quitarLinea = (key) => setLineas((ls) => ls.filter((l) => l.key !== key));

  const aplicarPorcentaje = () => {
    const p = Number(porcentaje);
    if (!(p > 0 && p <= 100)) return;
    const base = calcularTotales(lineasDesdeObra(obra)).neto;
    const neto = Math.round(base * p) / 100;
    setLineas([{
      key: `p${Date.now()}`, incluir: true, cantidad: 1, precioUnitario: neto,
      descripcion: `${p === 100 ? 'Saldo' : `Anticipo ${p}%`} s/ Presupuesto ${obra.presupuestoNum || ''} – ${obra.name || ''}`.trim(),
    }]);
  };

  const buscarPadron = async () => {
    if (!cuitValido(receptor.docNro)) { setError('Ingresá un CUIT válido para consultar.'); return; }
    setBuscandoPadron(true);
    setError('');
    try {
      const r = await consultarCuitArca(receptor.docNro);
      setReceptor((rx) => ({
        ...rx,
        nombre: r.name || rx.nombre,
        domicilio: r.address ? [r.address, r.location].filter(Boolean).join(', ') : rx.domicilio,
        condicionIvaId: condicionIvaDesdeTexto(r.condicionIva),
      }));
    } catch (e) {
      setError(`Padrón: ${e.message}`);
    }
    setBuscandoPadron(false);
  };

  const emitir = async () => {
    setError('');
    if (!lineasIncluidas.length || totales.total <= 0) { setError('Seleccioná al menos una línea con importe.'); return; }
    if (lineasIncluidas.some((l) => !String(l.descripcion).trim())) { setError('Todas las líneas deben tener descripción.'); return; }
    if (letra === 'A' && (Number(receptor.docTipo) !== 80 || !cuitValido(receptor.docNro))) {
      setError('Para Factura A el receptor necesita CUIT válido.'); return;
    }
    const tipoTxt = `${esNC ? 'NOTA DE CRÉDITO' : 'FACTURA'} ${letra}`;
    const aviso = esProduccion
      ? `⚠️ PRODUCCIÓN: se emitirá una ${tipoTxt} REAL ante ARCA por ${ars(totales.total)} a nombre de ${receptor.nombre}.\n\nUna vez autorizada no se puede borrar (solo anular con nota de crédito).\n\n¿Confirmás?`
      : `Se emitirá una ${tipoTxt} de PRUEBA (homologación, sin validez fiscal) por ${ars(totales.total)}.\n\n¿Continuar?`;
    if (!window.confirm(aviso)) return;

    setEmitiendo(true);
    try {
      const res = await emitirComprobanteArca({
        obraId: obra.id,
        comprobanteAsociadoId: esNC ? modo.nc.id : undefined,
        receptor: {
          nombre: receptor.nombre,
          docTipo: Number(receptor.docTipo),
          docNro: receptor.docNro,
          condicionIvaId: Number(receptor.condicionIvaId),
          domicilio: receptor.domicilio,
        },
        lineas: lineasIncluidas.map((l) => ({ descripcion: l.descripcion, cantidad: Number(l.cantidad), precioUnitario: Number(l.precioUnitario) })),
        concepto,
        fchServDesde, fchServHasta, fchVtoPago,
        observaciones,
      });
      setExito(res);
      setModo(null);
      generarPDFFacturaArca(res, cfg).catch((e) => console.warn('PDF', e));
    } catch (e) {
      setError(e.message);
    }
    setEmitiendo(false);
  };

  const descargarPDF = async (resumen) => {
    try {
      const snap = await getDoc(doc(db, coleccion, resumen.id));
      if (!snap.exists()) throw new Error('Comprobante no encontrado.');
      await generarPDFFacturaArca({ id: snap.id, ...snap.data() }, cfg);
    } catch (e) {
      setError(e.message);
    }
  };

  if (!cfg) return <div style={{ padding: '2rem', textAlign: 'center' }}><Loader size={20} className="spin" /> Cargando…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Encabezado / entorno */}
      <div style={{
        ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap',
        background: esProduccion ? '#f0fdf4' : '#fffbeb', borderColor: esProduccion ? '#86efac' : '#fcd34d',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Receipt size={20} color={esProduccion ? '#15803d' : '#b45309'} />
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: esProduccion ? '#15803d' : '#92400e' }}>
              Facturación electrónica ARCA – {esProduccion ? 'PRODUCCIÓN' : 'HOMOLOGACIÓN (pruebas sin validez fiscal)'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Emisor {cfg.razonSocial} · CUIT {cfg.cuit} · Punto de venta {(esProduccion ? cfg.puntoVentaProd : cfg.puntoVentaHomo) || '—'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {esAdmin && (
            <button className="btn btn-secondary" onClick={() => setShowConfig(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}>
              <Settings size={14} /> Configuración ARCA
            </button>
          )}
          {esAdmin && !modo && (
            <button className="btn btn-primary" onClick={abrirFactura} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}>
              <Plus size={14} /> Nueva factura
            </button>
          )}
        </div>
      </div>

      {/* Resumen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
        {[
          ['Presupuesto (c/IVA)', totalPresupuesto],
          ['Facturado neto de NC', totalFacturado],
          ['Pendiente de facturar', Math.max(0, totalPresupuesto - totalFacturado)],
        ].map(([t, v]) => (
          <div key={t} style={card}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{t}</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>{ars(v)}</div>
          </div>
        ))}
      </div>

      {error && (
        <div style={{ padding: '0.75rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c', fontSize: '0.83rem', display: 'flex', gap: '0.5rem', whiteSpace: 'pre-wrap' }}>
          <AlertTriangle size={16} style={{ flexShrink: 0 }} /> {error}
        </div>
      )}
      {exito && (
        <div style={{ padding: '0.75rem 1rem', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, color: '#166534', fontSize: '0.83rem', display: 'flex', gap: '0.5rem' }}>
          <CheckCircle size={16} style={{ flexShrink: 0 }} />
          {exito.esNotaCredito ? 'Nota de crédito' : 'Factura'} {exito.letra} {exito.numeroOriginal} autorizada · CAE {exito.cae} (vence {exito.vencimientoCae}) · {ars(exito.totalComprobante)}
        </div>
      )}

      {/* Formulario de emisión */}
      {modo && (
        <div style={{ ...card, borderColor: 'var(--primary-600)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0, fontSize: '0.95rem' }}>
              {esNC ? `Nota de Crédito ${letra} sobre ${modo.nc.numeroOriginal}` : 'Nueva factura'}
              <span style={{ marginLeft: '0.6rem', padding: '0.15rem 0.55rem', borderRadius: 6, background: letra === 'A' ? '#dbeafe' : '#ede9fe', color: letra === 'A' ? '#1d4ed8' : '#6d28d9', fontWeight: 800 }}>
                {letra}
              </span>
            </h4>
            <button onClick={() => setModo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
          </div>

          {/* Receptor */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.3fr 1.6fr', gap: '0.6rem' }}>
            <div>
              <span style={lbl}>Nombre / Razón social</span>
              <input style={inp} value={receptor.nombre} disabled={!!esNC} onChange={(e) => setReceptor({ ...receptor, nombre: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <span style={lbl}>Documento</span>
              <select style={inp} value={receptor.docTipo} disabled={!!esNC} onChange={(e) => setReceptor({ ...receptor, docTipo: Number(e.target.value) })}>
                {DOC_TIPOS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </div>
            <div>
              <span style={lbl}>Número</span>
              <div style={{ display: 'flex', gap: '0.3rem' }}>
                <input style={inp} value={receptor.docNro} disabled={!!esNC || Number(receptor.docTipo) === 99} onChange={(e) => setReceptor({ ...receptor, docNro: e.target.value.replace(/\D/g, '') })} />
                {!esNC && Number(receptor.docTipo) === 80 && (
                  <button title="Completar desde padrón" className="btn btn-secondary" style={{ padding: '0 0.5rem' }} onClick={buscarPadron} disabled={buscandoPadron}>
                    {buscandoPadron ? <Loader size={14} /> : <Search size={14} />}
                  </button>
                )}
              </div>
            </div>
            <div>
              <span style={lbl}>Condición frente al IVA</span>
              <select style={inp} value={receptor.condicionIvaId} disabled={!!esNC} onChange={(e) => setReceptor({ ...receptor, condicionIvaId: Number(e.target.value) })}>
                {CONDICIONES_IVA.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1fr 1fr 1fr', gap: '0.6rem' }}>
            <div>
              <span style={lbl}>Domicilio del receptor</span>
              <input style={inp} value={receptor.domicilio} disabled={!!esNC} onChange={(e) => setReceptor({ ...receptor, domicilio: e.target.value })} />
            </div>
            <div>
              <span style={lbl}>Concepto</span>
              <select style={inp} value={concepto} onChange={(e) => setConcepto(Number(e.target.value))}>
                {CONCEPTOS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            {concepto !== 1 && (<>
              <div><span style={lbl}>Servicio desde</span><input type="date" style={inp} value={fchServDesde} onChange={(e) => setFchServDesde(e.target.value)} /></div>
              <div><span style={lbl}>Servicio hasta</span><input type="date" style={inp} value={fchServHasta} onChange={(e) => setFchServHasta(e.target.value)} /></div>
              <div><span style={lbl}>Vto. de pago</span><input type="date" style={inp} value={fchVtoPago} onChange={(e) => setFchVtoPago(e.target.value)} /></div>
            </>)}
          </div>

          {/* Líneas */}
          {!esNC && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Elegí qué ítems del presupuesto facturar, editá montos o usá un porcentaje:</span>
              <input style={{ ...inp, width: 70 }} placeholder="%" value={porcentaje} onChange={(e) => setPorcentaje(e.target.value.replace(/[^\d.]/g, ''))} />
              <button className="btn btn-secondary" style={{ fontSize: '0.75rem' }} onClick={aplicarPorcentaje}>Facturar % del presupuesto</button>
              <button className="btn btn-secondary" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }} onClick={() => setLineas(lineasDesdeObra(obra))}>
                <RefreshCw size={12} /> Restaurar ítems
              </button>
            </div>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface-hover)' }}>
                  {['', 'Descripción', 'Cant.', 'P. Unit. neto', 'Subtotal neto', ''].map((h, i) => (
                    <th key={i} style={{ padding: '0.45rem', textAlign: i >= 2 && i <= 4 ? 'right' : 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => (
                  <tr key={l.key} style={{ borderBottom: '1px solid var(--border-light)', opacity: l.incluir ? 1 : 0.45 }}>
                    <td style={{ padding: '0.3rem', width: 26 }}><input type="checkbox" checked={l.incluir} onChange={(e) => updLinea(l.key, 'incluir', e.target.checked)} /></td>
                    <td style={{ padding: '0.3rem' }}><input style={inp} value={l.descripcion} onChange={(e) => updLinea(l.key, 'descripcion', e.target.value)} /></td>
                    <td style={{ padding: '0.3rem', width: 80 }}><input style={{ ...inp, textAlign: 'right' }} type="number" min="0" step="any" value={l.cantidad} onChange={(e) => updLinea(l.key, 'cantidad', e.target.value)} /></td>
                    <td style={{ padding: '0.3rem', width: 140 }}><input style={{ ...inp, textAlign: 'right' }} type="number" min="0" step="0.01" value={l.precioUnitario} onChange={(e) => updLinea(l.key, 'precioUnitario', e.target.value)} /></td>
                    <td style={{ padding: '0.3rem', width: 130, textAlign: 'right', fontWeight: 600 }}>{ars((Number(l.cantidad) || 0) * (Number(l.precioUnitario) || 0))}</td>
                    <td style={{ padding: '0.3rem', width: 30 }}>
                      <button onClick={() => quitarLinea(l.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn btn-secondary" style={{ marginTop: '0.5rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }} onClick={agregarLinea}>
              <Plus size={12} /> Agregar línea
            </button>
          </div>

          <div>
            <span style={lbl}>Observaciones internas</span>
            <input style={inp} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
          </div>

          {/* Totales + emitir */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', maxWidth: 420 }}>
              {letra === 'A'
                ? 'Factura A: IVA 21% discriminado.'
                : 'Factura B: se imprime con IVA incluido y leyenda de IVA contenido (Ley 27.743).'}
              {letra === 'B' && Number(receptor.docTipo) === 99 && ' Montos altos a consumidor final requieren DNI/CUIT.'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
              <div style={{ textAlign: 'right', fontSize: '0.82rem', lineHeight: 1.6 }}>
                <div>Neto gravado: <b>{ars(totales.neto)}</b></div>
                <div>IVA 21%: <b>{ars(totales.iva)}</b></div>
                <div style={{ fontSize: '1rem' }}>Total: <b>{ars(totales.total)}</b></div>
              </div>
              <button className="btn btn-primary" disabled={emitiendo} onClick={emitir}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.65rem 1.1rem', background: esProduccion ? '#15803d' : undefined }}>
                {emitiendo ? <Loader size={16} /> : <Receipt size={16} />}
                {emitiendo ? 'Autorizando en ARCA…' : `Emitir ${esNC ? 'NC' : 'Factura'} ${letra}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comprobantes emitidos */}
      <div style={card}>
        <h4 style={{ margin: '0 0 0.6rem', fontSize: '0.9rem' }}>Comprobantes emitidos {esProduccion ? '' : '(pruebas)'}</h4>
        {comprobantes.length === 0 ? (
          <div style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', padding: '0.75rem 0' }}>Todavía no se emitieron comprobantes para esta obra.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface-hover)' }}>
                {['Comprobante', 'Fecha', 'Receptor', 'Total', 'CAE', ''].map((h) => (
                  <th key={h} style={{ padding: '0.45rem', textAlign: h === 'Total' ? 'right' : 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comprobantes.map((c) => {
                const anulada = !c.esNotaCredito && comprobantes.some((x) => x.esNotaCredito && x.asociadoId === c.id);
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '0.45rem', fontWeight: 600, color: c.esNotaCredito ? '#b91c1c' : undefined }}>
                      {c.esNotaCredito ? 'NC' : 'FC'} {c.letra} {c.numeroOriginal}{anulada ? ' (acreditada)' : ''}
                    </td>
                    <td style={{ padding: '0.45rem' }}>{(c.fechaEmision || '').split('-').reverse().join('/')}</td>
                    <td style={{ padding: '0.45rem' }}>{c.receptor}</td>
                    <td style={{ padding: '0.45rem', textAlign: 'right', fontWeight: 600 }}>{c.esNotaCredito ? '-' : ''}{ars(c.total)}</td>
                    <td style={{ padding: '0.45rem', fontFamily: 'monospace' }}>{c.cae}</td>
                    <td style={{ padding: '0.45rem', whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <button className="btn btn-secondary" title="Descargar PDF" style={{ padding: '0.25rem 0.5rem', marginRight: 4 }} onClick={() => descargarPDF(c)}><Download size={13} /></button>
                      {esAdmin && !c.esNotaCredito && !modo && (
                        <button className="btn btn-secondary" title="Emitir nota de crédito" style={{ padding: '0.25rem 0.5rem' }} onClick={() => abrirNotaCredito(c)}><Undo2 size={13} /></button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showConfig && <ArcaConfigModal cfg={cfg} onClose={() => setShowConfig(false)} onSaved={(c) => { setCfg(c); setShowConfig(false); }} />}
    </div>
  );
}

// ─── Modal de configuración y diagnóstico ───────────────────────────────────

function ArcaConfigModal({ cfg, onClose, onSaved }) {
  const [form, setForm] = useState({ ...cfg });
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [estado, setEstado] = useState(null);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const guardar = async () => {
    if (form.entorno === 'produccion' && !Number(form.puntoVentaProd)) { setErr('Para producción tenés que indicar el punto de venta.'); return; }
    if (form.entorno === 'produccion' && cfg.entorno !== 'produccion'
      && !window.confirm('Vas a pasar a PRODUCCIÓN: desde ahora las facturas serán REALES ante ARCA. ¿Confirmás?')) return;
    setGuardando(true);
    try {
      const limpio = {
        ...form,
        cuit: String(form.cuit).replace(/\D/g, ''),
        puntoVentaHomo: Number(form.puntoVentaHomo) || 1,
        puntoVentaProd: Number(form.puntoVentaProd) || null,
        conceptoDefault: Number(form.conceptoDefault) || 3,
      };
      await saveArcaConfig(limpio);
      onSaved(limpio);
    } catch (e) {
      setErr(e.message);
    }
    setGuardando(false);
  };

  const probar = async () => {
    setProbando(true);
    setErr('');
    setEstado(null);
    try {
      setEstado(await getArcaEstado());
    } catch (e) {
      setErr(e.message);
    }
    setProbando(false);
  };

  const ok = (b) => (b ? '✅' : '❌');

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
      <div className="card" style={{ width: 640, maxHeight: '90vh', overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Configuración de facturación ARCA</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
          <div>
            <span style={lbl}>Entorno</span>
            <select style={inp} value={form.entorno} onChange={(e) => set('entorno', e.target.value)}>
              <option value="homologacion">Homologación (pruebas)</option>
              <option value="produccion">Producción (facturas reales)</option>
            </select>
          </div>
          <div><span style={lbl}>CUIT emisor</span><input style={inp} value={form.cuit} onChange={(e) => set('cuit', e.target.value)} /></div>
          <div><span style={lbl}>Punto de venta homologación</span><input style={inp} type="number" value={form.puntoVentaHomo || ''} onChange={(e) => set('puntoVentaHomo', e.target.value)} /></div>
          <div><span style={lbl}>Punto de venta producción (Web Services)</span><input style={inp} type="number" value={form.puntoVentaProd || ''} onChange={(e) => set('puntoVentaProd', e.target.value)} /></div>
          <div style={{ gridColumn: '1 / -1' }}><span style={lbl}>Razón social</span><input style={inp} value={form.razonSocial} onChange={(e) => set('razonSocial', e.target.value)} /></div>
          <div style={{ gridColumn: '1 / -1' }}><span style={lbl}>Domicilio comercial</span><input style={inp} value={form.domicilio} onChange={(e) => set('domicilio', e.target.value)} /></div>
          <div><span style={lbl}>Ingresos Brutos (N°)</span><input style={inp} value={form.ingresosBrutos} onChange={(e) => set('ingresosBrutos', e.target.value)} /></div>
          <div><span style={lbl}>Inicio de actividades</span><input style={inp} type="date" value={form.inicioActividades} onChange={(e) => set('inicioActividades', e.target.value)} /></div>
        </div>

        {err && <div style={{ color: '#b91c1c', fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>{err}</div>}

        {estado && (
          <div style={{ fontSize: '0.78rem', background: 'var(--bg-surface-hover)', borderRadius: 8, padding: '0.75rem', lineHeight: 1.7 }}>
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

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={probar} disabled={probando} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            {probando ? <Loader size={14} /> : <RefreshCw size={14} />} Probar conexión con ARCA
          </button>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
