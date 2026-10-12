import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import {
  Receipt, Plus, Trash2, Search, Loader, FileText, Package, RefreshCw, Download, Wallet, MessageCircle, X,
} from 'lucide-react';
import { db } from '../../services/firebaseConfig';
import { useAuth } from '../../context/AuthContext';
import {
  CONDICIONES_IVA, DOC_TIPOS, CONCEPTOS, letraPorCondicion, condicionIvaDesdeTexto, cuitValido, calcularTotales, emitirComprobanteArca,
} from '../../services/arcaFacturacionService';
import { consultarCuitArca } from '../../services/arcaCuitService';
import { getTipoCambio } from '../../services/tipoCambioService';
import {
  EMPRESA_AYALA, EMPRESA_EULER, emitirComprobanteX, crearMaterialesAFavor, crearClienteRapido, hoyISO,
} from '../../services/cobranzasService';
import { generarPDFFacturaArca } from '../../services/pdfFacturaArca';
import {
  ESTADOS_PRESUPUESTO, empresaDeCanal, fechaPresupuestoISO, totalPresupuesto, ars, fechaAR, abrirWhatsApp,
} from '../../services/listadosService';
import { normalizarNombre, r2 } from '../../services/ventasCalculo';
import {
  inp, card, CONDICIONES_VENTA, precioNetoLista, precioFinalCanal2, lineasDesdePresupuesto, clienteDesdePresupuesto,
} from './ventasHelpers';
import { Modal, Campo, Alerta, Seg } from './ventasUI';
import ClienteSelector from './ClienteSelector';

const CLIENTE_VACIO = { id: null, nombre: '', docTipo: 99, docNro: '', condicionIva: 'Consumidor Final', domicilio: '', telefono: '' };

export default function NuevaFacturaModal({ onClose, onCobrar, arcaCfg, ventasCfg, cuentas, comprobantes, obras, preset = {} }) {
  const { currentUser } = useAuth();
  const [empresa, setEmpresa] = useState(preset.empresaId || EMPRESA_AYALA);
  const [origen, setOrigen] = useState(preset.presupuestoId ? 'presupuesto' : 'libre');
  const [cliente, setCliente] = useState(() => (preset.cliente ? { ...CLIENTE_VACIO, ...preset.cliente, docTipo: String(preset.cliente.docNro || '').length === 11 ? 80 : (preset.cliente.docNro ? 96 : 99) } : CLIENTE_VACIO));
  const [condIvaId, setCondIvaId] = useState(() => (preset.cliente?.condicionIva ? condicionIvaDesdeTexto(preset.cliente.condicionIva) : 5));
  const [guardarCliente, setGuardarCliente] = useState(true);
  const [presupuestos, setPresupuestos] = useState(null);
  const [presu, setPresu] = useState(null);
  const [busPresu, setBusPresu] = useState('');
  const [ambosCanales, setAmbosCanales] = useState(false);
  const [obraId, setObraId] = useState('');
  const [lineas, setLineas] = useState([]);
  const [porcentaje, setPorcentaje] = useState('');
  const [concepto, setConcepto] = useState(Number(arcaCfg?.conceptoDefault) || 3);
  const [fchServDesde, setFchServDesde] = useState(hoyISO());
  const [fchServHasta, setFchServHasta] = useState(hoyISO());
  const [fchVto, setFchVto] = useState(hoyISO());
  const [condicionVenta, setCondicionVenta] = useState('Contado');
  const [notas, setNotas] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [error, setError] = useState('');
  const [emitiendo, setEmitiendo] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [buscandoPadron, setBuscandoPadron] = useState(false);

  const esAyala = empresa === EMPRESA_AYALA;
  const esProduccion = arcaCfg?.entorno === 'produccion';
  const letra = esAyala ? letraPorCondicion(condIvaId) : 'X';

  // ── Presupuestos (carga perezosa) ──
  useEffect(() => {
    if (origen !== 'presupuesto' || presupuestos) return;
    getDocs(collection(db, 'presupuestos')).then((s) => {
      const lista = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => !p.deleted && (p.quoteItems || []).length);
      lista.sort((a, b) => fechaPresupuestoISO(b).localeCompare(fechaPresupuestoISO(a)));
      setPresupuestos(lista);
    }).catch((e) => setError(e.message));
  }, [origen, presupuestos]);

  const facturadoPorPresupuesto = useMemo(() => {
    const m = {};
    (comprobantes || []).forEach((c) => {
      if (!c.presupuestoId || c.estado === 'anulado') return;
      m[c.presupuestoId] = (m[c.presupuestoId] || 0) + (c.esNotaCredito ? -1 : 1) * Number(c.totalComprobante || 0);
    });
    return m;
  }, [comprobantes]);

  const elegirPresupuesto = (p) => {
    setPresu(p);
    const emp = empresaDeCanal(p.canal);
    setEmpresa(emp);
    const cli = clienteDesdePresupuesto(p);
    setCliente(cli);
    setCondIvaId(condicionIvaDesdeTexto(cli.condicionIva));
    setLineas(lineasDesdePresupuesto(p, emp));
    const obra = (obras || []).find((o) => o.presupuestoId === p.id && !o.deleted);
    setObraId(obra?.id || '');
    setNotas(`Presupuesto ${p.presupuestoNumber || ''}`.trim());
    setPorcentaje('');
    setError('');
  };

  // Preset por deep link (/facturas?nueva=1&presupuesto=ID)
  const presetAplicado = useRef(false);
  useEffect(() => {
    if (presetAplicado.current || !preset.presupuestoId || !presupuestos) return;
    presetAplicado.current = true;
    const p = presupuestos.find((x) => x.id === preset.presupuestoId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (p) elegirPresupuesto(p);
  }, [presupuestos, preset.presupuestoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const presuFiltrados = useMemo(() => {
    if (!presupuestos) return [];
    const t = normalizarNombre(busPresu);
    return presupuestos.filter((p) => {
      if (!ambosCanales && empresaDeCanal(p.canal) !== empresa) return false;
      if (!t) return true;
      return normalizarNombre(`${p.presupuestoNumber} ${p.name} ${p.facturacionNombre} ${p.location}`).includes(t);
    }).slice(0, 40);
  }, [presupuestos, busPresu, ambosCanales, empresa]);

  // ── Cambio de empresa: recalcula precios de las líneas del presupuesto ──
  const cambiarEmpresa = (emp) => {
    setEmpresa(emp);
    if (presu) setLineas(lineasDesdePresupuesto(presu, emp));
    else setLineas([]);
    setObraId('');
  };

  // ── Lista de precios ──
  const [lista, setLista] = useState(null);
  const [tc, setTc] = useState(null);
  const [busItem, setBusItem] = useState('');
  const [verLista, setVerLista] = useState(false);
  useEffect(() => {
    if (!verLista || lista) return;
    Promise.all([getDocs(collection(db, 'lista_precios')), getTipoCambio().catch(() => null)]).then(([s, t]) => {
      setLista(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((i) => i.activo !== false));
      setTc(t?.valor || null);
    }).catch((e) => setError(e.message));
  }, [verLista, lista]);
  const itemsFiltrados = useMemo(() => {
    if (!lista) return [];
    const t = normalizarNombre(busItem);
    if (!t) return lista.slice(0, 12);
    return lista.filter((i) => normalizarNombre(`${i.descripcion} ${i.categoria} ${i.proveedor}`).includes(t)).slice(0, 25);
  }, [lista, busItem]);
  const precioItem = (i) => {
    const neto = precioNetoLista(i, tc);
    return esAyala ? neto : precioFinalCanal2(i, neto);
  };
  const agregarItemLista = (i) => {
    setLineas((ls) => [...ls, {
      key: `l${Date.now()}`, incluir: true, descripcion: i.descripcion, cantidad: 1, precioUnitario: precioItem(i), unidad: i.unidad || '',
      listaItemId: i.id, tipo: i.tipo || '', entregaPendiente: false,
    }]);
    setBusItem('');
  };

  // ── Líneas ──
  const upd = (key, campo, valor) => setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, [campo]: valor } : l)));
  const agregarLinea = () => setLineas((ls) => [...ls, { key: `m${Date.now()}`, incluir: true, descripcion: '', cantidad: 1, precioUnitario: 0, entregaPendiente: false }]);
  const quitar = (key) => setLineas((ls) => ls.filter((l) => l.key !== key));
  const incluidas = lineas.filter((l) => l.incluir);
  const totales = esAyala
    ? calcularTotales(incluidas)
    : (() => { const t = r2(incluidas.reduce((a, l) => a + r2((Number(l.cantidad) || 0) * (Number(l.precioUnitario) || 0)), 0)); return { neto: t, iva: 0, total: t }; })();

  const totalPresu = presu ? totalPresupuesto(presu) : 0;
  const yaFacturado = presu ? (facturadoPorPresupuesto[presu.id] || 0) : 0;

  const aplicarPorcentaje = () => {
    const p = Number(porcentaje);
    if (!presu || !(p > 0 && p <= 100)) return;
    const base = lineasDesdePresupuesto(presu, empresa).reduce((a, l) => a + l.cantidad * l.precioUnitario, 0);
    setLineas([{
      key: `pct${Date.now()}`, incluir: true, cantidad: 1, precioUnitario: Math.round(base * p) / 100, entregaPendiente: false,
      descripcion: `${p === 100 ? 'Total' : `Anticipo ${p}%`} s/ Presupuesto ${presu.presupuestoNumber || ''}`.trim(),
    }]);
  };

  const buscarPadron = async () => {
    if (!cuitValido(cliente.docNro)) { setError('Ingresá un CUIT válido para consultar el padrón.'); return; }
    setBuscandoPadron(true); setError('');
    try {
      const r = await consultarCuitArca(cliente.docNro);
      setCliente((c) => ({ ...c, nombre: (r.name || c.nombre).toUpperCase(), domicilio: r.address ? [r.address, r.location].filter(Boolean).join(', ') : c.domicilio, condicionIva: r.condicionIva || c.condicionIva }));
      setCondIvaId(condicionIvaDesdeTexto(r.condicionIva));
    } catch (e) { setError(`Padrón: ${e.message}`); }
    setBuscandoPadron(false);
  };

  const elegirCliente = (c) => {
    setCliente({ ...CLIENTE_VACIO, ...c });
    setCondIvaId(condicionIvaDesdeTexto(c.condicionIva));
  };

  const obrasCanal = useMemo(() => {
    const canalOk = (o) => (esAyala ? (o.canal || 'iva') === 'iva' : ['canal2', 'descuento'].includes(o.canal));
    const n = normalizarNombre(cliente.nombre);
    return (obras || []).filter((o) => !o.deleted && canalOk(o))
      .map((o) => ({ o, match: n && normalizarNombre(o.clientName).includes(n.split(' ')[0]) }))
      .sort((a, b) => Number(b.match) - Number(a.match) || String(a.o.name || '').localeCompare(String(b.o.name || '')))
      .map((x) => x.o);
  }, [obras, esAyala, cliente.nombre]);
  const obraSel = (obras || []).find((o) => o.id === obraId);

  // ── Emitir ──
  const emitir = async () => {
    setError('');
    if (!cliente.nombre.trim()) { setError('Elegí o cargá el cliente.'); return; }
    if (!incluidas.length || totales.total <= 0) { setError('Agregá al menos un ítem con importe.'); return; }
    if (incluidas.some((l) => !String(l.descripcion).trim())) { setError('Todos los ítems deben tener descripción.'); return; }
    const docTipo = Number(cliente.docTipo);
    if (esAyala && letra === 'A' && (docTipo !== 80 || !cuitValido(cliente.docNro))) { setError('Para Factura A el cliente necesita un CUIT válido.'); return; }
    const tipoTxt = esAyala ? `FACTURA ${letra}` : 'COMPROBANTE X';
    const aviso = esAyala
      ? (esProduccion
        ? `⚠️ PRODUCCIÓN: se emitirá una ${tipoTxt} REAL ante ARCA por ${ars(totales.total)} a nombre de ${cliente.nombre}.\n\nUna vez autorizada no se puede borrar (solo anular con nota de crédito).\n\n¿Confirmás?`
        : `Se emitirá una ${tipoTxt} de PRUEBA (homologación, sin validez fiscal) por ${ars(totales.total)}.\n\n¿Continuar?`)
      : `Se emitirá el ${tipoTxt} de EULER CALEFACCIÓN por ${ars(totales.total)} a nombre de ${cliente.nombre}.\n\n¿Confirmás?`;
    if (!window.confirm(aviso)) return;

    setEmitiendo(true);
    try {
      let cli = { ...cliente, condicionIva: esAyala ? (CONDICIONES_IVA.find((c) => c.id === Number(condIvaId))?.label || cliente.condicionIva) : cliente.condicionIva };
      if (!cli.id && guardarCliente) {
        try { cli = { ...cli, ...(await crearClienteRapido(cli)) }; } catch (e) { console.warn('No se pudo guardar el cliente', e); }
      }
      const pendientes = incluidas.filter((l) => l.entregaPendiente);
      let res;
      if (esAyala) {
        res = await emitirComprobanteArca({
          obraId: obraId || undefined,
          clienteId: cli.id || undefined,
          presupuestoId: presu?.id || undefined,
          presupuestoNumero: presu?.presupuestoNumber || undefined,
          clienteTelefono: cli.telefono || undefined,
          receptor: { nombre: cli.nombre, docTipo: Number(cli.docTipo) || 99, docNro: cli.docNro, condicionIvaId: Number(condIvaId), domicilio: cli.domicilio },
          lineas: incluidas.map((l) => ({ descripcion: l.descripcion, cantidad: Number(l.cantidad), precioUnitario: Number(l.precioUnitario), entregaPendiente: !!l.entregaPendiente })),
          concepto, fchServDesde, fchServHasta, fchVtoPago: fchVto, observaciones, condicionVenta, notas,
        });
        if (pendientes.length) {
          await crearMaterialesAFavor({
            empresaId: EMPRESA_AYALA, cliente: cli, comprobante: res, prueba: res.coleccion === 'arca_pruebas',
            lineas: pendientes.map((l) => ({ ...l, precioUnitario: r2(Number(l.precioUnitario) * 1.21) })),
          }, currentUser).catch((e) => console.warn('Materiales a favor', e));
        }
        generarPDFFacturaArca(res, arcaCfg).catch((e) => console.warn('PDF', e));
      } else {
        res = await emitirComprobanteX({
          cliente: cli, lineas: incluidas, presupuestoId: presu?.id, presupuestoNumero: presu?.presupuestoNumber,
          obra: obraSel, condicionVenta, notas, observaciones, fechaVencimiento: fchVto,
        }, currentUser);
        res.coleccion = 'comprobantes_venta';
        generarPDFFacturaArca(res, ventasCfg.euler).catch((e) => console.warn('PDF', e));
      }
      setResultado({ ...res, _cliente: cli });
    } catch (e) {
      setError(e.message);
    }
    setEmitiendo(false);
  };

  // ── Vista de resultado ──
  if (resultado) {
    const r = resultado;
    const esX = r.letra === 'X';
    const nombreCbte = esX ? 'Comprobante X' : `Factura ${r.letra}`;
    return (
      <Modal titulo={`${nombreCbte} ${r.numeroOriginal} emitido`} onClose={onClose} ancho={620}>
        <Alerta tipo="ok">
          <b>{nombreCbte} N° {r.numeroOriginal}</b> · {r.clienteNombre} · <b>{ars(r.totalComprobante)}</b>
          {!esX && <><br />CAE {r.cae} (vence {fechaAR(r.vencimientoCae)}){r.coleccion === 'arca_pruebas' ? ' · PRUEBA sin validez fiscal' : ''}</>}
        </Alerta>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => generarPDFFacturaArca(r, esX ? ventasCfg.euler : arcaCfg)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Download size={15} /> Descargar PDF</button>
          <button className="btn btn-primary" onClick={() => onCobrar(r)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Wallet size={15} /> Cobrar ahora (recibo)</button>
          <button className="btn btn-secondary" onClick={() => abrirWhatsApp(r._cliente?.telefono, `Hola ${(r.clienteNombre || '').split(' ')[0]}, te enviamos el ${nombreCbte} N° ${r.numeroOriginal} por ${ars(r.totalComprobante)}.${r.qrUrl ? `\nVerificalo en ARCA: ${r.qrUrl}` : ''}\n\nEuler Calefacción`)}
            disabled={!r._cliente?.telefono} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MessageCircle size={15} /> WhatsApp</button>
          <button className="btn btn-secondary" onClick={onClose} style={{ marginLeft: 'auto' }}>Cerrar</button>
        </div>
      </Modal>
    );
  }

  const pie = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', maxWidth: 380 }}>
        {esAyala
          ? (letra === 'A' ? 'Factura A: IVA 21% discriminado. Precios unitarios NETOS (sin IVA).' : 'Factura B: se imprime con IVA incluido. Precios unitarios NETOS (sin IVA).')
          : 'Comprobante X (no fiscal): precios FINALES, sin discriminar IVA.'}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
        <div style={{ textAlign: 'right', fontSize: '0.82rem', lineHeight: 1.6 }}>
          {esAyala && <div>Neto: <b>{ars(totales.neto)}</b> · IVA 21%: <b>{ars(totales.iva)}</b></div>}
          <div style={{ fontSize: '1.05rem' }}>Total: <b>{ars(totales.total)}</b></div>
        </div>
        <button className="btn btn-primary" disabled={emitiendo} onClick={emitir}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.65rem 1.1rem', background: esAyala && esProduccion ? '#15803d' : undefined }}>
          {emitiendo ? <Loader size={16} className="spin" /> : <Receipt size={16} />}
          {emitiendo ? (esAyala ? 'Autorizando en ARCA…' : 'Emitiendo…') : (esAyala ? `Emitir Factura ${letra}` : 'Emitir Comprobante X')}
        </button>
      </div>
    </div>
  );

  return (
    <Modal titulo="Nueva factura" subtitulo="Traé un presupuesto realizado o facturá directamente ítems sin presupuesto." onClose={onClose} ancho={1040} pie={pie}>
      {/* Empresa y origen */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Campo label="Empresa que emite">
          <Seg valor={empresa} onChange={cambiarEmpresa} opciones={[[EMPRESA_AYALA, 'Ayala Nicolás F. · Factura A/B (ARCA)'], [EMPRESA_EULER, 'Euler Calefacción · Comprobante X']]} />
        </Campo>
        <Campo label="Origen">
          <Seg valor={origen} onChange={(o) => { setOrigen(o); if (o === 'libre') setPresu(null); }} opciones={[['presupuesto', 'Desde un presupuesto'], ['libre', 'Factura directa (sin presupuesto)']]} />
        </Campo>
        {esAyala && (
          <span style={{ marginLeft: 'auto', padding: '0.3rem 0.7rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, background: esProduccion ? '#dcfce7' : '#fef3c7', color: esProduccion ? '#15803d' : '#92400e' }}>
            ARCA {esProduccion ? 'PRODUCCIÓN' : 'HOMOLOGACIÓN (pruebas)'}
          </span>
        )}
      </div>

      {error && <Alerta>{error}</Alerta>}

      {/* Buscador de presupuestos */}
      {origen === 'presupuesto' && !presu && (
        <div style={card}>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input style={{ ...inp, paddingLeft: 32 }} autoFocus placeholder="Buscar presupuesto por número, cliente o dirección…" value={busPresu} onChange={(e) => setBusPresu(e.target.value)} />
            </div>
            <label style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={ambosCanales} onChange={(e) => setAmbosCanales(e.target.checked)} /> Mostrar de ambos canales
            </label>
          </div>
          {!presupuestos ? <div style={{ padding: '1rem', textAlign: 'center' }}><Loader size={18} className="spin" /></div> : (
            <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: 8 }}>
              {presuFiltrados.length === 0 && <div style={{ padding: '1rem', fontSize: '0.82rem', color: 'var(--text-secondary)', textAlign: 'center' }}>No hay presupuestos que coincidan.</div>}
              {presuFiltrados.map((p) => {
                const est = ESTADOS_PRESUPUESTO[p.status];
                const fac = facturadoPorPresupuesto[p.id] || 0;
                return (
                  <div key={p.id} onClick={() => elegirPresupuesto(p)} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 120px 130px 130px', gap: '0.5rem', alignItems: 'center', padding: '0.55rem 0.75rem', borderBottom: '1px solid var(--border-light)', cursor: 'pointer', fontSize: '0.8rem' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-surface-hover, #f8fafc)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}>
                    <div><b>{p.presupuestoNumber}</b><div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{fechaAR(fechaPresupuestoISO(p))}</div></div>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}<div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.location}</div></div>
                    <div>{est && <span style={{ padding: '0.15rem 0.5rem', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700, color: est.color, background: est.bg }}>{est.label}</span>}</div>
                    <div style={{ textAlign: 'right', fontWeight: 700 }}>{ars(totalPresupuesto(p))}</div>
                    <div style={{ textAlign: 'right', fontSize: '0.72rem', color: fac > 0 ? '#7c3aed' : 'var(--text-secondary)' }}>{fac > 0 ? `Facturado ${ars(fac)}` : 'Sin facturar'}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Presupuesto elegido */}
      {presu && (
        <div style={{ ...card, background: '#f5f3ff', borderColor: '#ddd6fe', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <FileText size={18} color="#7c3aed" />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{presu.presupuestoNumber} · {presu.name}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Total presupuesto {ars(totalPresu)} · Ya facturado {ars(yaFacturado)} · <b style={{ color: '#7c3aed' }}>Pendiente {ars(Math.max(0, totalPresu - yaFacturado))}</b>
            </div>
          </div>
          <input style={{ ...inp, width: 70 }} placeholder="%" value={porcentaje} onChange={(e) => setPorcentaje(e.target.value.replace(/[^\d.]/g, ''))} />
          <button className="btn btn-secondary" style={{ fontSize: '0.75rem' }} onClick={aplicarPorcentaje}>Facturar %</button>
          <button className="btn btn-secondary" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => setLineas(lineasDesdePresupuesto(presu, empresa))}><RefreshCw size={12} /> Restaurar ítems</button>
          <button className="btn btn-secondary" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => { setPresu(null); setLineas([]); setNotas(''); }}><X size={12} /> Cambiar</button>
        </div>
      )}

      {/* Cliente */}
      {(origen === 'libre' || presu) && (
        <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <b style={{ fontSize: '0.88rem' }}>Cliente</b>
            {esAyala && (
              <span style={{ fontSize: '0.78rem' }}>Comprobante:{' '}
                <span style={{ padding: '0.15rem 0.55rem', borderRadius: 6, background: letra === 'A' ? '#dbeafe' : '#ede9fe', color: letra === 'A' ? '#1d4ed8' : '#6d28d9', fontWeight: 800 }}>Factura {letra}</span>
              </span>
            )}
          </div>
          <ClienteSelector value={cliente} onChange={elegirCliente} cuentas={Object.values(cuentas || {})} autoFocus={origen === 'libre'} />
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.9fr 1.3fr 1.5fr', gap: '0.6rem' }}>
            <Campo label="Nombre / Razón social"><input style={inp} value={cliente.nombre} onChange={(e) => setCliente({ ...cliente, nombre: e.target.value.toUpperCase() })} /></Campo>
            <Campo label="Documento">
              <select style={inp} value={cliente.docTipo} onChange={(e) => setCliente({ ...cliente, docTipo: Number(e.target.value) })}>
                {DOC_TIPOS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </Campo>
            <Campo label="Número">
              <div style={{ display: 'flex', gap: 4 }}>
                <input style={inp} value={cliente.docNro} disabled={Number(cliente.docTipo) === 99} onChange={(e) => setCliente({ ...cliente, docNro: e.target.value.replace(/\D/g, '') })} />
                {Number(cliente.docTipo) === 80 && (
                  <button title="Completar desde el padrón de ARCA" className="btn btn-secondary" style={{ padding: '0 0.5rem' }} onClick={buscarPadron} disabled={buscandoPadron}>
                    {buscandoPadron ? <Loader size={14} className="spin" /> : <Search size={14} />}
                  </button>
                )}
              </div>
            </Campo>
            <Campo label="Condición frente al IVA">
              {esAyala ? (
                <select style={inp} value={condIvaId} onChange={(e) => setCondIvaId(Number(e.target.value))}>
                  {CONDICIONES_IVA.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              ) : (
                <select style={inp} value={cliente.condicionIva} onChange={(e) => setCliente({ ...cliente, condicionIva: e.target.value })}>
                  {CONDICIONES_IVA.map((c) => <option key={c.id} value={c.label}>{c.label}</option>)}
                </select>
              )}
            </Campo>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.6fr', gap: '0.6rem', alignItems: 'end' }}>
            <Campo label="Domicilio"><input style={inp} value={cliente.domicilio} onChange={(e) => setCliente({ ...cliente, domicilio: e.target.value })} /></Campo>
            <Campo label="Teléfono (WhatsApp)"><input style={inp} value={cliente.telefono} onChange={(e) => setCliente({ ...cliente, telefono: e.target.value })} /></Campo>
            <Campo label="Obra (opcional)">
              <select style={inp} value={obraId} onChange={(e) => setObraId(e.target.value)}>
                <option value="">— Sin obra —</option>
                {obrasCanal.map((o) => <option key={o.id} value={o.id}>{[o.otNumber, o.name, o.clientName && `(${o.clientName})`].filter(Boolean).join(' ')}</option>)}
              </select>
            </Campo>
          </div>
          {!cliente.id && cliente.nombre && (
            <label style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={guardarCliente} onChange={(e) => setGuardarCliente(e.target.checked)} /> Guardar como cliente nuevo en Contactos
            </label>
          )}
        </div>
      )}

      {/* Ítems */}
      {(origen === 'libre' || presu) && (
        <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <b style={{ fontSize: '0.88rem' }}>Ítems a facturar</b>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button className="btn btn-secondary" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => setVerLista((v) => !v)}><Package size={13} /> Desde lista de precios</button>
              <button className="btn btn-secondary" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }} onClick={agregarLinea}><Plus size={13} /> Ítem libre</button>
            </div>
          </div>
          {verLista && (
            <div style={{ border: '1px dashed var(--border-strong)', borderRadius: 8, padding: '0.6rem' }}>
              <input style={inp} autoFocus placeholder="Buscar en la lista de precios (caldera, radiador, servicio…)" value={busItem} onChange={(e) => setBusItem(e.target.value)} />
              {!lista ? <div style={{ padding: '0.6rem', textAlign: 'center' }}><Loader size={16} className="spin" /></div> : (
                <div style={{ maxHeight: 200, overflowY: 'auto', marginTop: 6 }}>
                  {!tc && <div style={{ fontSize: '0.72rem', color: '#b45309', padding: '0.3rem' }}>Sin tipo de cambio: los precios quedan en 0, cargalos a mano.</div>}
                  {itemsFiltrados.map((i) => (
                    <div key={i.id} onClick={() => agregarItemLista(i)} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', padding: '0.4rem 0.5rem', fontSize: '0.8rem', cursor: 'pointer', borderBottom: '1px solid var(--border-light)' }}>
                      <span>{i.descripcion} <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>{i.categoria}</span></span>
                      <b style={{ whiteSpace: 'nowrap' }}>{ars(precioItem(i))}</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface-hover)' }}>
                  {['', 'Descripción', 'Cant.', esAyala ? 'P. unit. neto' : 'P. unit. final', 'Subtotal', 'Entrega pendiente', ''].map((h, i) => (
                    <th key={i} style={{ padding: '0.45rem', textAlign: i >= 2 && i <= 4 ? 'right' : (i === 5 ? 'center' : 'left'), fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lineas.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Agregá ítems desde la lista de precios o como ítem libre.</td></tr>
                )}
                {lineas.map((l) => (
                  <tr key={l.key} style={{ borderBottom: '1px solid var(--border-light)', opacity: l.incluir ? 1 : 0.45 }}>
                    <td style={{ padding: '0.3rem', width: 26 }}><input type="checkbox" checked={l.incluir} onChange={(e) => upd(l.key, 'incluir', e.target.checked)} /></td>
                    <td style={{ padding: '0.3rem' }}><input style={inp} value={l.descripcion} onChange={(e) => upd(l.key, 'descripcion', e.target.value)} /></td>
                    <td style={{ padding: '0.3rem', width: 80 }}><input style={{ ...inp, textAlign: 'right' }} type="number" min="0" step="any" value={l.cantidad} onChange={(e) => upd(l.key, 'cantidad', e.target.value)} /></td>
                    <td style={{ padding: '0.3rem', width: 140 }}><input style={{ ...inp, textAlign: 'right' }} type="number" min="0" step="0.01" value={l.precioUnitario} onChange={(e) => upd(l.key, 'precioUnitario', e.target.value)} /></td>
                    <td style={{ padding: '0.3rem', width: 130, textAlign: 'right', fontWeight: 600 }}>{ars((Number(l.cantidad) || 0) * (Number(l.precioUnitario) || 0))}</td>
                    <td style={{ padding: '0.3rem', width: 90, textAlign: 'center' }} title="El cliente pagó este ítem pero todavía no se le entregó: queda como material a favor en su cuenta">
                      <input type="checkbox" checked={!!l.entregaPendiente} onChange={(e) => upd(l.key, 'entregaPendiente', e.target.checked)} />
                    </td>
                    <td style={{ padding: '0.3rem', width: 30 }}><button onClick={() => quitar(l.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}><Trash2 size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {lineas.some((l) => l.entregaPendiente && l.incluir) && (
            <Alerta tipo="info">Los ítems marcados con “Entrega pendiente” quedan registrados como <b>materiales a favor</b> del cliente hasta que registres la entrega en su cuenta corriente.</Alerta>
          )}
        </div>
      )}

      {/* Condiciones */}
      {(origen === 'libre' || presu) && (
        <div style={{ display: 'grid', gridTemplateColumns: esAyala ? 'repeat(5, 1fr)' : '1fr 1fr', gap: '0.6rem' }}>
          {esAyala && (
            <>
              <Campo label="Concepto">
                <select style={inp} value={concepto} onChange={(e) => setConcepto(Number(e.target.value))}>
                  {CONCEPTOS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </Campo>
              {concepto !== 1 && <Campo label="Servicio desde"><input type="date" style={inp} value={fchServDesde} onChange={(e) => setFchServDesde(e.target.value)} /></Campo>}
              {concepto !== 1 && <Campo label="Servicio hasta"><input type="date" style={inp} value={fchServHasta} onChange={(e) => setFchServHasta(e.target.value)} /></Campo>}
            </>
          )}
          <Campo label="Vencimiento de pago"><input type="date" style={inp} value={fchVto} onChange={(e) => setFchVto(e.target.value)} /></Campo>
          <Campo label="Condición de venta">
            <select style={inp} value={condicionVenta} onChange={(e) => setCondicionVenta(e.target.value)}>
              {CONDICIONES_VENTA.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Campo>
          <Campo label="Notas (se imprimen)" style={{ gridColumn: esAyala ? 'span 3' : 'span 1' }}>
            <input style={inp} value={notas} maxLength={300} onChange={(e) => setNotas(e.target.value)} placeholder="Ej: Presupuesto 0001-00000193 / Servicio técnico del 10/10" />
          </Campo>
          <Campo label="Observaciones internas (no se imprimen)" style={{ gridColumn: esAyala ? 'span 2' : 'span 1' }}>
            <input style={inp} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
          </Campo>
        </div>
      )}
    </Modal>
  );
}
