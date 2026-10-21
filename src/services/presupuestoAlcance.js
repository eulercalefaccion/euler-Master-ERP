/**
 * Alcance comercial de un presupuesto: aprobaciones parciales por ítem y trazabilidad.
 * Lógica pura (sin Firestore) → se prueba en presupuestoAlcance.test.js.
 *
 * Hechos distintos y relacionados (ninguno implica al otro):
 *  - APROBACIÓN:  presupuesto.aprobaciones[] → ítems, cantidades y precios congelados. Se ACUMULAN.
 *  - FACTURACIÓN: comprobantes con presupuestoId (comprobantes_venta / arca_pruebas). Cada línea puede
 *                 traer presupuestoItemId; si no (facturas ARCA, que la Cloud Function no conserva),
 *                 se usa el vínculo presupuesto.facturacionItems[]. Sin ninguno → "sin asignar a ítems".
 *  - COBRO:       recibos imputados a esos comprobantes. Se aplica a COMPROBANTES, nunca a ítems.
 *  - ENTREGA:     remitos_entrega (factura / materiales a favor) + descuentos directos de stock de la obra.
 *  - RESERVA:     regla vigente de services/reservasStock.js (aprobado+facturado con entrega posterior y cobrado).
 *
 * Presupuestos aprobados ANTES de esta mejora (status 'aprobado' sin aprobaciones[]) = "aprobación histórica":
 * se toma como alcance aprobado el que se copió a la obra al aprobar (obra.quoteItems); si no hay obra,
 * el presupuesto completo (criterio histórico: aprobar era aprobar todo).
 */
import { calcularItemDescuento, getItemCategory } from './descuentosService';
import { esLineaDeStock } from './remitosService';
import { calcularReservas } from './reservasStock';

export const EPS = 0.0001;
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const r4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;
export const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export const esCanalDescuento = (canal) => canal === 'canal2' || canal === 'descuento';

/** Identificador estable de un ítem del presupuesto (los ítems del cotizador siempre tienen id). */
export const claveItem = (it, i) => (it && it.id !== undefined && it.id !== null && it.id !== '' ? String(it.id) : `idx${i}`);

/** Clave del ítem del presupuesto al que corresponde un ítem de la obra. */
const claveItemObra = (o, i) => String(o?.presupuestoItemId ?? claveItem(o, i));

/** Ítem inventariable (material físico de la lista de precios). Mano de obra / servicios / globales: no. */
export const esInventariable = (it) => esLineaDeStock(it || {});

/**
 * Importe final para el cliente de `cantidad` unidades del ítem, con el mismo criterio que totalPresupuesto():
 * canal 1 → con IVA; canal 2 → con descuento comercial (IVA incluido).
 */
export const importeFinalItem = (item, cantidad, canal) => {
  const r = calcularItemDescuento({ ...item, quantity: num(cantidad), unitPrice: num(item?.unitPrice) });
  return esCanalDescuento(canal) ? r.finalConDescuento : r.subtotalConIVA;
};

/** Total cotizado (suma por ítem, mismo criterio para numerador y denominador de la conversión). */
export const cotizadoFinal = (p) => (p?.quoteItems || []).reduce((a, it) => a + importeFinalItem(it, num(it.quantity), p.canal), 0);

export const tieneDetalleAprobacion = (p) => Array.isArray(p?.aprobaciones) && p.aprobaciones.length > 0;
export const esAprobacionHistorica = (p) => p?.status === 'aprobado' && !tieneDetalleAprobacion(p);

const fechaAprobacionHistorica = (p) => {
  const ev = (p?.statusHistory || []).filter((e) => e?.status === 'aprobado').map((e) => e.date).filter(Boolean).sort()[0];
  return ev || null;
};

/** Ítems de la aprobación histórica (sin detalle): alcance copiado a la obra o presupuesto completo. */
export const itemsAprobacionHistorica = (p, obra = null) => {
  const usarObra = (obra?.quoteItems || []).length > 0;
  const fuente = usarObra ? obra.quoteItems : (p?.quoteItems || []);
  return {
    fuente: usarObra ? 'obra' : 'presupuesto',
    items: fuente.map((it, i) => {
      const cantidad = num(it.quantity);
      return {
        itemId: usarObra ? claveItemObra(it, i) : claveItem(it, i),
        descripcion: it.descripcion || '', tipo: it.tipo || '', listaItemId: it.listaItemId || null, unidad: it.unidad || '',
        cantidad, precioUnitarioNeto: num(it.unitPrice), importe: importeFinalItem(it, cantidad, p?.canal), inventariable: esInventariable(it),
      };
    }).filter((x) => x.cantidad > EPS),
  };
};

/**
 * Registro sintético que conserva una aprobación anterior a la mejora cuando se agrega la primera aprobación con detalle.
 * No inventa: reproduce el alcance que se copió a la obra al aprobar (o el presupuesto completo si no hay obra).
 */
export const registroAprobacionHistorica = (p, obra = null) => {
  const { fuente, items } = itemsAprobacionHistorica(p, obra);
  return {
    id: 'historica', numero: 0, tipo: 'historica', origen: 'historico', reconstruida: true, fuente,
    fecha: fechaAprobacionHistorica(p), usuario: '', email: '', revision: null, canal: p?.canal || 'iva',
    nota: fuente === 'obra'
      ? 'Aprobación anterior a la mejora (sin detalle por ítem): se conserva el alcance copiado a la obra al aprobar.'
      : 'Aprobación anterior a la mejora (sin detalle por ítem): criterio histórico, presupuesto completo.',
    items, importe: items.reduce((a, x) => a + x.importe, 0), pagoDeclarado: null,
  };
};

/** Aprobaciones efectivas (con la histórica reconstruida si corresponde). */
export const aprobacionesDe = (p, obra = null) => {
  if (tieneDetalleAprobacion(p)) return p.aprobaciones;
  if (esAprobacionHistorica(p)) return [registroAprobacionHistorica(p, obra)];
  return [];
};

/** Cantidad e importe aprobados por ítem. */
export const aprobadoPorItem = (p, obra = null) => {
  const porItem = {};
  aprobacionesDe(p, obra).forEach((a) => (a.items || []).forEach((it) => {
    const k = String(it.itemId);
    const prev = porItem[k] || { cantidad: 0, importe: 0, importeNeto: 0, descripcion: it.descripcion, unidad: it.unidad, tipo: it.tipo, listaItemId: it.listaItemId };
    porItem[k] = {
      ...prev,
      cantidad: r4(prev.cantidad + num(it.cantidad)),
      importe: prev.importe + num(it.importe),
      importeNeto: prev.importeNeto + num(it.cantidad) * num(it.precioUnitarioNeto),
    };
  }));
  Object.values(porItem).forEach((x) => {
    x.precioUnitarioNeto = x.cantidad > EPS ? r2(x.importeNeto / x.cantidad) : 0;
    x.precioUnitarioFinal = x.cantidad > EPS ? x.importe / x.cantidad : 0;
  });
  return { porItem, historica: esAprobacionHistorica(p) };
};

/** Filas del pop-up de aprobación (ítems reales del presupuesto con lo aprobado antes y lo pendiente). */
export const filasAprobacion = (p, obra = null) => {
  const { porItem, historica } = aprobadoPorItem(p, obra);
  return (p?.quoteItems || []).map((it, i) => {
    const key = claveItem(it, i);
    const cotizada = num(it.quantity);
    const aprobadaAntes = r4(porItem[key]?.cantidad || 0);
    const subtotalFinal = importeFinalItem(it, cotizada, p.canal);
    return {
      key, index: i, item: it, descripcion: it.descripcion || '', tipo: it.tipo || '', unidad: it.unidad || '', listaItemId: it.listaItemId || null,
      cotizada, aprobadaAntes, pendiente: Math.max(0, r4(cotizada - aprobadaAntes)),
      precioUnitarioNeto: num(it.unitPrice), precioUnitarioFinal: cotizada > EPS ? subtotalFinal / cotizada : 0, subtotalFinal,
      importeAprobadoAntes: porItem[key]?.importe || 0,
      inventariable: esInventariable(it), categoria: getItemCategory(it), historica,
    };
  });
};

/**
 * Valida la selección { [key]: cantidad }. Rechaza selección vacía, negativos, no numéricos y cantidades mayores a lo pendiente.
 * @returns {{ ok: boolean, errores: string[], cantidades: Record<string, number> }}
 */
export const validarSeleccion = (filas, seleccion = {}) => {
  const errores = [];
  const cantidades = {};
  Object.entries(seleccion || {}).forEach(([key, v]) => {
    if (v === '' || v === null || v === undefined || v === false) return;
    const fila = filas.find((f) => f.key === key);
    const raw = String(v).replace(',', '.').trim();
    const q = Number(raw);
    if (!fila) { errores.push(`Ítem inexistente en el presupuesto (${key}).`); return; }
    if (!Number.isFinite(q)) { errores.push(`${fila.descripcion}: cantidad inválida.`); return; }
    if (q < 0) { errores.push(`${fila.descripcion}: la cantidad no puede ser negativa.`); return; }
    if (q > fila.pendiente + EPS) { errores.push(`${fila.descripcion}: ${q} supera lo pendiente de aprobar (${fila.pendiente}).`); return; }
    if (q > EPS) cantidades[key] = r4(q);
  });
  if (!errores.length && !Object.keys(cantidades).length) errores.push('Seleccioná al menos un ítem con cantidad mayor a cero.');
  return { ok: errores.length === 0, errores, cantidades };
};

/** ¿Con estas cantidades queda aprobado todo lo cotizado? */
export const quedaTotal = (filas, cantidades = {}) =>
  filas.length > 0 && filas.every((f) => f.aprobadaAntes + num(cantidades[f.key]) >= f.cotizada - EPS);

/** Arma el registro de una aprobación (se agrega, nunca reemplaza a las anteriores). */
export const construirAprobacion = ({
  p, filas, cantidades, id, numero, fecha, usuario, email, origen = 'crm', pagoDeclarado = null, previas = [],
}) => {
  const items = filas.filter((f) => num(cantidades[f.key]) > EPS).map((f) => {
    const cantidad = num(cantidades[f.key]);
    return {
      itemId: f.key, descripcion: f.descripcion, tipo: f.tipo, listaItemId: f.listaItemId, unidad: f.unidad, categoria: f.categoria,
      cantidad, precioUnitarioNeto: f.precioUnitarioNeto, importe: importeFinalItem(f.item, cantidad, p.canal), inventariable: f.inventariable,
    };
  });
  const importe = items.reduce((a, x) => a + x.importe, 0);
  const importePrevio = previas.reduce((a, x) => a + num(x.importe), 0);
  return {
    id, numero, fecha, usuario, email, origen,
    revision: p.revision || 0, presupuestoNumero: p.presupuestoNumber || '', canal: p.canal || 'iva',
    tipo: quedaTotal(filas, cantidades) ? 'total' : 'parcial',
    items, importe, importeAcumulado: importePrevio + importe,
    importeCotizado: filas.reduce((a, f) => a + f.subtotalFinal, 0),
    pagoDeclarado: pagoDeclarado || null,
  };
};

/** Resumen guardado en el presupuesto (para tarjetas y KPIs). */
export const resumenAprobacion = (p, aprobaciones) => {
  const pp = { ...p, aprobaciones };
  const filas = filasAprobacion(pp);
  const reales = aprobaciones.filter((a) => a.tipo !== 'historica');
  const fechas = aprobaciones.map((a) => a.fecha).filter(Boolean).sort();
  return {
    tipo: filas.length && filas.every((f) => f.pendiente <= EPS) ? 'total' : 'parcial',
    importeAprobado: aprobaciones.reduce((a, x) => a + num(x.importe), 0),
    importeCotizado: cotizadoFinal(p),
    cantidadAprobaciones: reales.length,
    primeraFecha: fechas[0] || null,
    ultimaFecha: fechas[fechas.length - 1] || null,
  };
};

/**
 * Agrega el alcance recién aprobado a la obra sin tocar los índices existentes
 * (obraStockService descuenta por itemIndex): suma cantidad si el ítem ya estaba, si no lo agrega al final.
 */
export const mergeItemsObra = (obraItems = [], aprobItems = [], quoteItems = []) => {
  const out = obraItems.map((x) => ({ ...x }));
  aprobItems.forEach((a) => {
    const idx = out.findIndex((o, i) => claveItemObra(o, i) === String(a.itemId));
    if (idx >= 0) {
      const q = r4(num(out[idx].quantity) + num(a.cantidad));
      out[idx] = { ...out[idx], presupuestoItemId: String(a.itemId), quantity: q, subtotal: Math.round(q * num(out[idx].unitPrice)) };
    } else {
      const src = quoteItems.find((it, i) => claveItem(it, i) === String(a.itemId)) || {};
      const q = num(a.cantidad);
      out.push({
        ...src, id: src.id ?? a.itemId, presupuestoItemId: String(a.itemId), descripcion: src.descripcion ?? a.descripcion,
        quantity: q, unitPrice: num(a.precioUnitarioNeto), subtotal: Math.round(q * num(a.precioUnitarioNeto)),
      });
    }
  });
  return out;
};

// ─── Trazabilidad ───────────────────────────────────────────────────────────

const esPrueba = (x) => !!(x?._prueba || x?.prueba || x?.coleccion === 'arca_pruebas' || x?._col === 'arca_pruebas');
const importeFinalLinea = (c, l) => r2(num(l.neto ?? num(l.cantidad) * num(l.precioUnitario)) * (c.letra === 'X' ? 1 : 1.21));

/**
 * Trazabilidad completa del presupuesto (aprobado / facturado / cobrado / entregado / reservado).
 * @param {{ presupuesto, obra?, comprobantes?, recibos?, remitos?, materiales?, incluirPruebas? }} p
 */
export const calcularTrazabilidad = ({
  presupuesto: p, obra = null, comprobantes = [], recibos = [], remitos = [], materiales = [], incluirPruebas = false,
}) => {
  const visible = (x) => incluirPruebas || !esPrueba(x);
  const items = p?.quoteItems || [];
  const claves = items.map((it, i) => claveItem(it, i));
  const { porItem: aprob, historica } = aprobadoPorItem(p, obra);
  const aprobaciones = aprobacionesDe(p, obra);
  const avisos = [];

  // Comprobantes del presupuesto (o de su obra) y sus notas de crédito
  const facturasAll = comprobantes.filter((c) => !c.esNotaCredito && visible(c) && (c.presupuestoId === p.id || (obra?.id && c.obraId === obra.id)));
  const idsFact = new Set(facturasAll.map((c) => c.id));
  const ncs = comprobantes.filter((c) => c.esNotaCredito && visible(c) && c.estado !== 'anulado' && idsFact.has(c.comprobanteAsociado?.id));
  const ncPor = {};
  ncs.forEach((n) => { ncPor[n.comprobanteAsociado.id] = r2((ncPor[n.comprobanteAsociado.id] || 0) + num(n.totalComprobante)); });

  // Cobros (a nivel comprobante)
  const cobradoPor = {};
  const recibosRel = [];
  recibos.filter((r) => r.estado !== 'anulado' && visible(r)).forEach((r) => {
    const imps = (r.imputaciones || []).filter((i) => idsFact.has(i.comprobanteId));
    if (!imps.length) return;
    imps.forEach((i) => { cobradoPor[i.comprobanteId] = r2((cobradoPor[i.comprobanteId] || 0) + num(i.importe)); });
    recibosRel.push({ ...r, _imputacionesPresupuesto: imps, _aplicado: r2(imps.reduce((a, i) => a + num(i.importe), 0)) });
  });

  const vinculos = Object.fromEntries((p?.facturacionItems || []).map((v) => [v.comprobanteId, v]));
  const itemsDeFactura = (c) => {
    const lineas = (c.lineas || []).filter((l) => l.presupuestoItemId);
    if (lineas.length) return lineas.map((l) => ({ itemId: String(l.presupuestoItemId), cantidad: num(l.cantidad), importe: importeFinalLinea(c, l) }));
    if (vinculos[c.id]) return (vinculos[c.id].items || []).map((x) => ({ itemId: String(x.itemId), cantidad: num(x.cantidad), importe: num(x.importe) }));
    return null;
  };

  const facturas = facturasAll.map((c) => {
    const total = num(c.totalComprobante);
    const nc = ncPor[c.id] || 0;
    const anulado = c.estado === 'anulado';
    const anuladaPorNC = nc > 0 && nc >= total - 0.01;
    const cobrado = cobradoPor[c.id] || 0;
    const vigente = !anulado && !anuladaPorNC;
    const its = itemsDeFactura(c);
    return {
      ...c, _total: total, _nc: nc, _anulado: anulado, _anuladaPorNC: anuladaPorNC, _ncParcial: nc > 0 && !anuladaPorNC,
      _cobrado: cobrado, _pendiente: anulado ? 0 : Math.max(0, r2(total - nc - cobrado)), _vigente: vigente, _items: its, _prueba: esPrueba(c),
    };
  });
  const facPor = Object.fromEntries(facturas.map((f) => [f.id, f]));

  const facturado = {};
  const docsFactPor = {};
  let facturadoSinAsignar = 0;
  facturas.filter((f) => f._vigente).forEach((f) => {
    if (!f._items) { facturadoSinAsignar += r2(f._total - f._nc); return; }
    f._items.forEach((x) => {
      facturado[x.itemId] = r4((facturado[x.itemId] || 0) + x.cantidad);
      (docsFactPor[x.itemId] = docsFactPor[x.itemId] || []).push(`${f.tipoComprobante || ''} ${f.numeroOriginal || ''}`.trim());
    });
    if (f._ncParcial) avisos.push(`${f.tipoComprobante} ${f.numeroOriginal}: nota de crédito parcial por $ ${f._nc.toLocaleString('es-AR')} (ajuste de importe, no se asigna a ítems).`);
  });
  if (facturadoSinAsignar > 0.01) avisos.push(`Hay $ ${r2(facturadoSinAsignar).toLocaleString('es-AR')} facturados sin detalle por ítem (comprobantes anteriores, por porcentaje o libres). No se asignan a ítems: verificá antes de volver a facturar.`);

  // Entregas
  const mats = materiales.filter((m) => visible(m) && m.estado !== 'anulado' && (idsFact.has(m.comprobanteId) || (obra?.id && m.obraId === obra.id)));
  const matPor = Object.fromEntries(mats.map((m) => [m.id, m]));
  const rems = remitos.filter((r) => visible(r) && (idsFact.has(r.comprobanteId) || matPor[r.materialId] || (obra?.id && r.obraId === obra.id)));
  const claveDeLista = (listaItemId) => {
    if (!listaItemId) return null;
    const ks = items.map((it, i) => (it.listaItemId === listaItemId ? claves[i] : null)).filter(Boolean);
    return ks.length === 1 ? ks[0] : null;
  };
  const entregado = {};
  const docsEntPor = {};
  const sumarEntrega = (k, q, doc) => {
    entregado[k] = r4((entregado[k] || 0) + q);
    if (doc) (docsEntPor[k] = docsEntPor[k] || []).push(doc);
  };
  rems.filter((r) => r.estado !== 'anulado').forEach((r) => (r.items || []).forEach((it) => {
    const k = it.presupuestoItemId
      || (r.materialId && matPor[r.materialId]?.items?.[it.itemIndex]?.presupuestoItemId)
      || claveDeLista(it.listaItemId);
    if (k) sumarEntrega(String(k), num(it.cantidad), `Remito ${r.numero}`);
  }));
  (obra?.stockDescontado || []).filter((d) => d.via === 'directo' || d.via === 'legacy').forEach((d) => {
    const oi = obra.quoteItems?.[d.itemIndex];
    const k = oi ? claveItemObra(oi, d.itemIndex) : null;
    if (k) sumarEntrega(k, num(d.cantidad), d.via === 'legacy' ? 'Obra (descuento histórico)' : `Obra (${d.etapa || 'stock'})`);
  });

  // Reservas: regla vigente (facturado con entrega pendiente + cobrado)
  const { reservas, sinCobrar } = calcularReservas({
    materiales: mats, lista: [], comprobantes: [...facturasAll, ...ncs], recibos: recibos.filter((r) => visible(r)), incluirPruebas,
  });

  // Filas por ítem (incluye ítems aprobados que ya no están en el presupuesto)
  const filas = items.map((it, i) => ({ it, key: claves[i], eliminado: false }));
  Object.keys(aprob).filter((k) => !claves.includes(k)).forEach((k) => filas.push({ it: { descripcion: aprob[k].descripcion, unidad: aprob[k].unidad, tipo: aprob[k].tipo, listaItemId: aprob[k].listaItemId, quantity: 0 }, key: k, eliminado: true }));
  const filasOut = filas.map(({ it, key, eliminado }) => {
    const cotizada = num(it.quantity);
    const aprobada = r4(aprob[key]?.cantidad || 0);
    const fact = r4(facturado[key] || 0);
    const ent = r4(entregado[key] || 0);
    const inventariable = esInventariable(it);
    const unitCot = cotizada > EPS ? importeFinalItem(it, cotizada, p.canal) / cotizada : 0;
    const unitAprob = aprob[key]?.precioUnitarioFinal || unitCot;
    return {
      key, eliminado, descripcion: it.descripcion || '', unidad: it.unidad || '', tipo: it.tipo || '', listaItemId: it.listaItemId || null, inventariable,
      cotizada, aprobada, facturada: fact, entregada: ent,
      sinAprobar: Math.max(0, r4(cotizada - aprobada)),
      aprobadaSinFacturar: Math.max(0, r4(aprobada - fact)),
      facturadaSinEntregar: inventariable ? Math.max(0, r4(fact - ent)) : null,
      entregadaSinFacturar: inventariable ? Math.max(0, r4(ent - fact)) : 0,
      precioUnitarioFinalCotizado: unitCot, precioUnitarioFinalAprobado: unitAprob,
      precioUnitarioNetoAprobado: aprob[key]?.precioUnitarioNeto || 0,
      importeCotizado: eliminado ? 0 : importeFinalItem(it, cotizada, p.canal), importeAprobado: aprob[key]?.importe || 0,
      docsFacturas: docsFactPor[key] || [], docsEntregas: docsEntPor[key] || [],
    };
  });

  const vigentes = facturas.filter((f) => !f._anulado);
  const resumen = {
    totalCotizado: filasOut.reduce((a, f) => a + f.importeCotizado, 0),
    totalAprobado: aprobaciones.reduce((a, x) => a + num(x.importe), 0),
    pendienteAprobar: filasOut.filter((f) => !f.eliminado).reduce((a, f) => a + f.sinAprobar * f.precioUnitarioFinalCotizado, 0),
    aprobadoPendienteFacturar: filasOut.reduce((a, f) => a + f.aprobadaSinFacturar * f.precioUnitarioFinalAprobado, 0),
    facturado: r2(vigentes.reduce((a, f) => a + f._total, 0) - vigentes.reduce((a, f) => a + f._nc, 0)),
    facturadoSinAsignar: r2(facturadoSinAsignar),
    cobrosAplicados: r2(vigentes.reduce((a, f) => a + f._cobrado, 0)),
    saldoPendienteCobro: r2(vigentes.reduce((a, f) => a + f._pendiente, 0)),
    tipoAprobacion: !aprobaciones.length ? null : (historica ? 'historica' : (filasOut.filter((f) => !f.eliminado).every((f) => f.sinAprobar <= EPS) ? 'total' : 'parcial')),
  };
  resumen.porcentajeCobradoAprobado = resumen.totalAprobado > 0 ? resumen.cobrosAplicados / resumen.totalAprobado : null;

  // Historial (más reciente primero)
  const historial = [];
  aprobaciones.forEach((a) => historial.push({ fecha: a.fecha || '', tipo: 'aprobacion', texto: a.tipo === 'historica' ? a.nota : `Aprobación N° ${a.numero} (${a.tipo}) · ${a.items.length} ítem(s) · ${a.usuario || ''}`, importe: a.importe }));
  facturas.forEach((f) => historial.push({ fecha: f.fechaEmision || '', tipo: 'factura', texto: `${f.tipoComprobante || ''} ${f.numeroOriginal || ''}${f._anulado ? ' (anulado)' : ''}${f._prueba ? ' · PRUEBA' : ''}`, importe: f._total }));
  ncs.forEach((n) => historial.push({ fecha: n.fechaEmision || '', tipo: 'nc', texto: `${n.tipoComprobante || 'NC'} ${n.numeroOriginal || ''} sobre ${n.comprobanteAsociado?.numeroOriginal || ''}`, importe: -num(n.totalComprobante) }));
  recibosRel.forEach((r) => historial.push({ fecha: r.fechaEmision || '', tipo: 'cobro', texto: `Recibo ${r.numeroOriginal || ''}`, importe: r._aplicado }));
  rems.forEach((r) => historial.push({ fecha: r.fecha || '', tipo: 'entrega', texto: `Remito ${r.numero || ''}${r.estado === 'anulado' ? ' (anulado)' : ''} · ${(r.items || []).length} ítem(s)` }));
  historial.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

  return {
    historica, aprobaciones, resumen, filas: filasOut, facturas, facPor, notasCredito: ncs, recibos: recibosRel,
    materiales: mats, remitos: rems, reservas, sinCobrar, historial, avisos,
  };
};

// ─── Facturación desde el presupuesto ───────────────────────────────────────

/**
 * Cantidades facturables por ítem: lo aprobado pendiente de facturar (por defecto) y, con confirmación explícita
 * de aprobación, hasta lo cotizado. Considera lo ya facturado en AMBOS canales.
 */
export const facturablesPorItem = (traza, p) => {
  const sinAprobaciones = !traza.aprobaciones.length;
  return traza.filas.filter((f) => !f.eliminado).map((f) => {
    const maxCantidad = Math.max(0, r4(Math.max(f.cotizada, f.aprobada) - f.facturada));
    const aprobadoPendiente = f.aprobadaSinFacturar;
    const it = (p.quoteItems || []).find((x, i) => claveItem(x, i) === f.key) || {};
    return {
      key: f.key, item: it, maxCantidad, aprobadoPendiente, sinAprobaciones,
      cantidadSugerida: aprobadoPendiente > EPS ? aprobadoPendiente : maxCantidad,
      incluir: aprobadoPendiente > EPS || sinAprobaciones,
      precioUnitarioNeto: f.aprobada > EPS && f.precioUnitarioNetoAprobado ? f.precioUnitarioNetoAprobado : num(it.unitPrice),
      entregadaSinFacturar: f.entregadaSinFacturar,
    };
  }).filter((x) => x.maxCantidad > EPS);
};

/** Valida las líneas vinculadas al presupuesto. @returns {string[]} errores */
export const validarLineasFactura = (lineas) => {
  const errores = [];
  const porItem = {};
  lineas.forEach((l) => {
    const q = Number(String(l.cantidad).replace(',', '.'));
    if (!Number.isFinite(q) || q < 0) errores.push(`${l.descripcion || 'Ítem'}: cantidad inválida.`);
    if (l.presupuestoItemId) porItem[l.presupuestoItemId] = { q: (porItem[l.presupuestoItemId]?.q || 0) + (Number.isFinite(q) ? q : 0), l };
  });
  Object.values(porItem).forEach(({ q, l }) => {
    if (l.maxCantidad !== undefined && q > num(l.maxCantidad) + EPS) {
      errores.push(`${l.descripcion}: ${q} supera lo disponible para facturar (${r4(l.maxCantidad)} = cotizado − ya facturado en ambos canales).`);
    }
  });
  return errores;
};

/** Cantidades que se facturarían sin estar aprobadas → requieren confirmación explícita y registro de aprobación. */
export const excesoSinAprobar = (lineas) => {
  const out = {};
  lineas.forEach((l) => {
    if (!l.presupuestoItemId) return;
    const exceso = r4(num(l.cantidad) - num(l.aprobadoPendiente));
    if (exceso > EPS) out[l.presupuestoItemId] = r4((out[l.presupuestoItemId] || 0) + exceso);
  });
  return out;
};

/**
 * Plan de entrega al facturar: qué sale ahora (remito, descuenta stock), qué queda como material a favor y qué ya fue
 * entregado antes sin facturar (obra / remito) y por lo tanto NO vuelve a salir del depósito.
 */
export const planEntregaFactura = (lineas, esStock = esLineaDeStock) => {
  const cubiertoUsado = {};
  return lineas.map((l) => {
    const cant = num(l.cantidad);
    const stock = esStock(l);
    let cubierto = 0;
    if (stock && l.presupuestoItemId) {
      const disp = Math.max(0, num(l.entregadoSinFacturar) - (cubiertoUsado[l.presupuestoItemId] || 0));
      cubierto = Math.min(cant, disp);
      cubiertoUsado[l.presupuestoItemId] = (cubiertoUsado[l.presupuestoItemId] || 0) + cubierto;
    }
    const resto = r4(cant - cubierto);
    return {
      linea: l, stock, cantidad: cant, yaEntregado: r4(cubierto),
      entregaAhora: stock && !l.entregaPendiente ? resto : 0,
      quedaPendiente: l.entregaPendiente ? resto : 0,
    };
  });
};

// ─── KPIs ───────────────────────────────────────────────────────────────────

/**
 * Aprobación de un presupuesto para KPIs.
 *  - Con detalle: importe = suma de lo efectivamente aprobado; tipo total | parcial.
 *  - Histórico (sin detalle): se conserva el criterio anterior (presupuesto completo).
 */
export const aprobacionKPI = (p, totalHistorico = null) => {
  if (tieneDetalleAprobacion(p)) {
    const r = resumenAprobacion(p, p.aprobaciones);
    return { aprobado: true, tipo: r.tipo, importeAprobado: r.importeAprobado, importeCotizado: r.importeCotizado };
  }
  const cot = cotizadoFinal(p);
  if (p?.status === 'aprobado') return { aprobado: true, tipo: 'historica', importeAprobado: totalHistorico ?? cot, importeCotizado: totalHistorico ?? cot };
  return { aprobado: false, tipo: null, importeAprobado: 0, importeCotizado: cot };
};

/** Importe a mostrar en la tarjeta / columna: lo aprobado si hay detalle, si no el monto de siempre. */
export const importeTarjeta = (item) => (item?.status === 'aprobado' && item?.aprobacionResumen
  ? Number(item.aprobacionResumen.importeAprobado) || 0
  : Number(item?.amount) || 0);
