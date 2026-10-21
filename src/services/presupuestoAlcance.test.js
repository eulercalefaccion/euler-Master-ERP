/**
 * Pruebas de la lógica de aprobaciones parciales y trazabilidad (casos de negocio del pedido).
 * Caso: presupuesto llave en mano con cañería, termostato, caldera, radiadores, accesorios y mano de obra.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('./firebaseConfig', () => ({ db: {}, functions: {}, storage: {}, auth: {} }));

const {
  filasAprobacion, validarSeleccion, construirAprobacion, resumenAprobacion, mergeItemsObra, calcularTrazabilidad,
  facturablesPorItem, validarLineasFactura, excesoSinAprobar, planEntregaFactura, aprobacionKPI, importeTarjeta,
  importeFinalItem, cotizadoFinal, registroAprobacionHistorica, esInventariable,
} = await import('./presupuestoAlcance');

const ITEMS = [
  { id: 'c1', descripcion: 'Mano de obra y materiales para cañería PEX', tipo: 'mano_de_obra', quantity: 1, unitPrice: 3000000 },
  { id: 't1', descripcion: 'Termostato ambiente', tipo: 'material', listaItemId: 'L-TER', quantity: 1, unitPrice: 100000 },
  { id: 'k1', descripcion: 'Caldera mural 24kW', tipo: 'material', listaItemId: 'L-CAL', quantity: 1, unitPrice: 2000000 },
  { id: 'r1', descripcion: 'Radiador 600', tipo: 'material', listaItemId: 'L-RAD', quantity: 10, unitPrice: 150000 },
  { id: 'a1', descripcion: 'Accesorios varios', tipo: 'material', listaItemId: 'L-ACC', quantity: 1, unitPrice: 200000 },
  { id: 'm1', descripcion: 'Instalación de equipos', tipo: 'mano_de_obra', quantity: 1, unitPrice: 800000 },
];
const base = (extra = {}) => ({ id: 'P1', presupuestoNumber: 'PRE-2026-1500', canal: 'iva', revision: 2, status: 'seguimiento', quoteItems: ITEMS, ...extra });

/** Aplica una aprobación como lo hace el servicio (acumula). */
const aprobar = (p, cantidades, n) => {
  const filas = filasAprobacion(p);
  const v = validarSeleccion(filas, cantidades);
  if (!v.ok) throw new Error(v.errores.join(' | '));
  const previas = p.aprobaciones || [];
  const rec = construirAprobacion({ p, filas, cantidades: v.cantidades, id: `apr${n}`, numero: n, fecha: `2026-10-2${n}T10:00:00Z`, usuario: 'Test', email: 't@e', previas });
  const aprobaciones = [...previas, rec];
  return { ...p, status: 'aprobado', aprobaciones, aprobacionResumen: resumenAprobacion(p, aprobaciones) };
};

const facturaX = (id, lineas, extra = {}) => ({
  id, _col: 'comprobantes_venta', letra: 'X', tipoComprobante: 'FAX', numeroOriginal: `00001-0000000${id.slice(-1)}`, empresaId: 'euler-calefaccion',
  presupuestoId: 'P1', fechaEmision: '2026-10-22', estado: 'emitido', esNotaCredito: false,
  lineas: lineas.map((l) => ({ ...l, neto: l.cantidad * l.precioUnitario })), totalComprobante: lineas.reduce((a, l) => a + l.cantidad * l.precioUnitario, 0), ...extra,
});
const facturaArca = (id, lineas, extra = {}) => {
  const neto = lineas.reduce((a, l) => a + l.cantidad * l.precioUnitario, 0);
  return {
    id, _col: 'comprobantes_venta', letra: 'B', tipoComprobante: 'FAB', numeroOriginal: `00002-0000000${id.slice(-1)}`, empresaId: 'ayala-nicolas',
    presupuestoId: 'P1', fechaEmision: '2026-10-23', estado: 'pendiente', esNotaCredito: false,
    lineas: lineas.map((l) => ({ descripcion: l.descripcion, cantidad: l.cantidad, precioUnitario: l.precioUnitario, neto: l.cantidad * l.precioUnitario })), // la Cloud Function no guarda el ítem
    totalComprobante: Math.round(neto * 1.21 * 100) / 100, ...extra,
  };
};

describe('1. Aprobación parcial: cañería, termostato y caldera; radiadores pendientes', () => {
  const p = aprobar(base(), { c1: 1, t1: 1, k1: 1 }, 1);
  it('registra solo lo elegido, con importes y tipo parcial', () => {
    const a = p.aprobaciones[0];
    expect(a.tipo).toBe('parcial');
    expect(a.items.map((x) => x.itemId)).toEqual(['c1', 't1', 'k1']);
    expect(a.importe).toBe(importeFinalItem(ITEMS[0], 1, 'iva') + importeFinalItem(ITEMS[1], 1, 'iva') + importeFinalItem(ITEMS[2], 1, 'iva'));
    expect(a.revision).toBe(2);
    expect(p.aprobacionResumen.tipo).toBe('parcial');
  });
  it('los radiadores quedan pendientes de aprobación y no aprobados', () => {
    const r = filasAprobacion(p).find((f) => f.key === 'r1');
    expect(r.aprobadaAntes).toBe(0);
    expect(r.pendiente).toBe(10);
  });
  it('la mano de obra y la cañería global no son inventariables (no reservan ni descuentan stock)', () => {
    expect(esInventariable(ITEMS[0])).toBe(false);
    expect(esInventariable(ITEMS[5])).toBe(false);
    expect(esInventariable(ITEMS[2])).toBe(true);
  });
});

describe('Validaciones del pop-up', () => {
  const filas = filasAprobacion(base());
  it('rechaza selección vacía', () => expect(validarSeleccion(filas, {}).ok).toBe(false));
  it('rechaza cantidades en cero', () => expect(validarSeleccion(filas, { r1: '0' }).ok).toBe(false));
  it('rechaza negativos', () => expect(validarSeleccion(filas, { r1: -1 }).errores[0]).toMatch(/negativa/));
  it('rechaza más de lo pendiente', () => expect(validarSeleccion(filas, { r1: 11 }).errores[0]).toMatch(/supera/));
  it('acepta decimales con coma', () => expect(validarSeleccion(filas, { r1: '2,5' }).cantidades.r1).toBe(2.5));
});

describe('2. Facturar la caldera por un canal y otros ítems por el otro, sin duplicar', () => {
  const p0 = aprobar(base(), { c1: 1, t1: 1, k1: 1 }, 1);
  const fX = facturaX('fx1', [{ descripcion: 'Caldera', cantidad: 1, precioUnitario: 2165000, presupuestoItemId: 'k1', listaItemId: 'L-CAL' }]);
  const fB = facturaArca('fb2', [{ descripcion: 'Termostato', cantidad: 1, precioUnitario: 100000 }, { descripcion: 'Cañería', cantidad: 1, precioUnitario: 3000000 }]);
  const p = { ...p0, facturacionItems: [{ comprobanteId: 'fb2', items: [{ itemId: 't1', cantidad: 1, importe: 121000 }, { itemId: 'c1', cantidad: 1, importe: 3630000 }] }] };
  const t = calcularTrazabilidad({ presupuesto: p, comprobantes: [fX, fB] });
  it('cuenta lo facturado por ítem en ambos canales (línea X con ítem + vínculo de la factura ARCA)', () => {
    const f = Object.fromEntries(t.filas.map((x) => [x.key, x.facturada]));
    expect(f).toMatchObject({ k1: 1, t1: 1, c1: 1, r1: 0 });
    expect(t.resumen.facturadoSinAsignar).toBe(0);
  });
  it('lo ya facturado no vuelve a ofrecerse, cualquiera sea el canal que se elija', () => {
    const fact = facturablesPorItem(t, p);
    expect(fact.find((x) => x.key === 'k1')).toBeUndefined();
    expect(fact.filter((x) => x.incluir)).toHaveLength(0); // nada aprobado queda sin facturar
  });
  it('una línea que intenta volver a facturar la caldera es rechazada', () => {
    const errs = validarLineasFactura([{ descripcion: 'Caldera', cantidad: 1, presupuestoItemId: 'k1', maxCantidad: 0 }]);
    expect(errs[0]).toMatch(/supera lo disponible/);
  });
  it('una factura sin detalle por ítem queda "sin asignar" y genera aviso (no se inventa)', () => {
    const t2 = calcularTrazabilidad({ presupuesto: p0, comprobantes: [fB] });
    expect(t2.resumen.facturadoSinAsignar).toBeGreaterThan(0);
    expect(t2.avisos.join(' ')).toMatch(/sin detalle por ítem/);
  });
});

describe('3. Aprobar 4 de 10 radiadores y facturar 2', () => {
  const p = aprobar(base(), { r1: 4 }, 1);
  const f = facturaX('fx1', [{ descripcion: 'Radiador', cantidad: 2, precioUnitario: 160000, presupuestoItemId: 'r1', listaItemId: 'L-RAD' }]);
  const t = calcularTrazabilidad({ presupuesto: p, comprobantes: [f] });
  const r = t.filas.find((x) => x.key === 'r1');
  it('quedan 6 sin aprobar y 2 aprobados sin facturar', () => {
    expect(r.sinAprobar).toBe(6);
    expect(r.aprobadaSinFacturar).toBe(2);
  });
  it('la factura sugiere 2 (aprobado sin facturar) y facturar más exige aprobación explícita', () => {
    const fx = facturablesPorItem(t, p).find((x) => x.key === 'r1');
    expect(fx.cantidadSugerida).toBe(2);
    expect(fx.maxCantidad).toBe(8);
    expect(excesoSinAprobar([{ presupuestoItemId: 'r1', cantidad: 5, aprobadoPendiente: 2 }])).toEqual({ r1: 3 });
    expect(excesoSinAprobar([{ presupuestoItemId: 'r1', cantidad: 2, aprobadoPendiente: 2 }])).toEqual({});
  });
});

describe('4. Pagar completo una aprobación parcial', () => {
  // Alcance aprobado: caldera + termostato. Se factura y se cobra todo lo facturado.
  const p = aprobar(base(), { k1: 1, t1: 1 }, 1);
  const f = facturaArca('fb1', [{ descripcion: 'Caldera', cantidad: 1, precioUnitario: 2000000 }, { descripcion: 'Termostato', cantidad: 1, precioUnitario: 100000 }]);
  const pv = { ...p, facturacionItems: [{ comprobanteId: 'fb1', items: [{ itemId: 'k1', cantidad: 1, importe: 2420000 }, { itemId: 't1', cantidad: 1, importe: 121000 }] }] };
  const rec = { id: 'rc1', estado: 'emitido', numeroOriginal: '00001-00000001', fechaEmision: '2026-10-24', totalRecibo: f.totalComprobante, imputaciones: [{ comprobanteId: 'fb1', importe: f.totalComprobante }], mediosPago: [{ tipo: 'transferencia', importe: f.totalComprobante, cuentaDestino: 'Banco Santander' }] };
  const t = calcularTrazabilidad({ presupuesto: pv, comprobantes: [f], recibos: [rec] });
  it('el alcance aprobado queda 100% cobrado', () => {
    expect(t.resumen.cobrosAplicados).toBe(f.totalComprobante);
    expect(t.resumen.saldoPendienteCobro).toBe(0);
    expect(Math.round(t.resumen.porcentajeCobradoAprobado * 100)).toBe(100);
  });
  it('lo no contratado sigue pendiente de aprobación y NO es deuda; el presupuesto sigue parcial', () => {
    expect(t.resumen.pendienteAprobar).toBeGreaterThan(0);
    expect(t.resumen.tipoAprobacion).toBe('parcial');
    expect(t.resumen.saldoPendienteCobro).toBe(0);
  });
  it('el cobro se muestra a nivel recibo / comprobante (no por ítem)', () => {
    expect(t.recibos[0]._imputacionesPresupuesto[0].comprobanteId).toBe('fb1');
  });
});

describe('5. Facturar equipos para entrega posterior', () => {
  it('no genera entrega: todo queda pendiente (acopio)', () => {
    const plan = planEntregaFactura([{ key: 'l1', descripcion: 'Caldera', cantidad: 1, listaItemId: 'L-CAL', tipo: 'material', entregaPendiente: true, presupuestoItemId: 'k1' }]);
    expect(plan[0]).toMatchObject({ entregaAhora: 0, quedaPendiente: 1, yaEntregado: 0 });
  });
  it('no repite la salida de stock de lo ya entregado por la obra / remito', () => {
    const plan = planEntregaFactura([{ key: 'l1', descripcion: 'Radiador', cantidad: 4, listaItemId: 'L-RAD', tipo: 'material', entregaPendiente: false, presupuestoItemId: 'r1', entregadoSinFacturar: 3 }]);
    expect(plan[0]).toMatchObject({ yaEntregado: 3, entregaAhora: 1, quedaPendiente: 0 });
  });
  it('la mano de obra nunca genera entrega de stock', () => {
    const plan = planEntregaFactura([{ key: 'l1', descripcion: 'Instalación', cantidad: 1, tipo: 'mano_de_obra', entregaPendiente: false }]);
    expect(plan[0]).toMatchObject({ stock: false, entregaAhora: 0 });
  });
});

describe('6. Aprobar lo pendiente después: misma obra, alcance incremental', () => {
  const p1 = aprobar(base(), { c1: 1, k1: 1, r1: 4 }, 1);
  const obra1 = mergeItemsObra([], p1.aprobaciones[0].items, ITEMS);
  const p2 = aprobar(p1, { r1: 6, t1: 1, a1: 1, m1: 1 }, 2);
  const obra2 = mergeItemsObra(obra1, p2.aprobaciones[1].items, ITEMS);
  it('la obra inicial solo tiene lo aprobado', () => {
    expect(obra1.map((x) => [x.presupuestoItemId, x.quantity])).toEqual([['c1', 1], ['k1', 1], ['r1', 4]]);
  });
  it('la segunda aprobación conserva índices, suma cantidades y agrega al final lo nuevo', () => {
    expect(obra2.slice(0, 3).map((x) => [x.presupuestoItemId, x.quantity])).toEqual([['c1', 1], ['k1', 1], ['r1', 10]]);
    expect(obra2.slice(3).map((x) => x.presupuestoItemId)).toEqual(['t1', 'a1', 'm1']);
  });
  it('acumula sin sobrescribir y queda total', () => {
    expect(p2.aprobaciones).toHaveLength(2);
    expect(p2.aprobaciones[1].tipo).toBe('total');
    expect(p2.aprobacionResumen.tipo).toBe('total');
    expect(p2.aprobacionResumen.importeAprobado).toBe(cotizadoFinal(base()));
  });
  it('los precios aprobados quedan congelados aunque cambie la cotización', () => {
    const cambiado = { ...p2, quoteItems: ITEMS.map((it) => (it.id === 'k1' ? { ...it, unitPrice: 9999999 } : it)) };
    expect(resumenAprobacion(cambiado, cambiado.aprobaciones).importeAprobado).toBe(p2.aprobacionResumen.importeAprobado);
  });
});

describe('9. Trazabilidad con documentos generados desde cualquier módulo', () => {
  const p = { ...aprobar(base(), { k1: 1, r1: 2 }, 1), obraId: 'O1' };
  const obra = { id: 'O1', quoteItems: mergeItemsObra([], p.aprobaciones[0].items, ITEMS), stockDescontado: [{ itemIndex: 1, cantidad: 2, via: 'directo', etapa: 'instalacion' }] };
  const desdeObra = facturaArca('fb9', [{ descripcion: 'Caldera', cantidad: 1, precioUnitario: 2000000 }], { presupuestoId: null, obraId: 'O1' });
  const nc = { id: 'nc1', esNotaCredito: true, estado: 'aplicada', tipoComprobante: 'NCB', totalComprobante: desdeObra.totalComprobante, comprobanteAsociado: { id: 'fb9', numeroOriginal: desdeObra.numeroOriginal }, fechaEmision: '2026-10-25' };
  const prueba = facturaArca('fp1', [{ descripcion: 'Prueba', cantidad: 1, precioUnitario: 1 }], { _col: 'arca_pruebas', _prueba: true });
  const mat = { id: 'M1', comprobanteId: 'fx1', estado: 'parcial', items: [{ descripcion: 'Caldera', cantidad: 1, cantidadEntregada: 1, listaItemId: 'L-CAL', presupuestoItemId: 'k1' }] };
  const rem = { id: 'R1', numero: '00001-00000010', materialId: 'M1', estado: 'vigente', fecha: '2026-10-26', items: [{ descripcion: 'Caldera', cantidad: 1, listaItemId: 'L-CAL', itemIndex: 0 }] };
  const fx1 = facturaX('fx1', [{ descripcion: 'Caldera', cantidad: 1, precioUnitario: 2165000, presupuestoItemId: 'k1', entregaPendiente: true }]);
  const t = calcularTrazabilidad({ presupuesto: p, obra, comprobantes: [desdeObra, nc, prueba, fx1], remitos: [rem], materiales: [mat] });
  it('incluye la factura emitida desde la obra y su nota de crédito total la anula', () => {
    const f = t.facturas.find((x) => x.id === 'fb9');
    expect(f._anuladaPorNC).toBe(true);
    expect(t.notasCredito).toHaveLength(1);
  });
  it('excluye los comprobantes de homologación de los indicadores productivos', () => {
    expect(t.facturas.find((x) => x.id === 'fp1')).toBeUndefined();
    const conPruebas = calcularTrazabilidad({ presupuesto: p, obra, comprobantes: [prueba], incluirPruebas: true });
    expect(conPruebas.facturas).toHaveLength(1);
  });
  it('cuenta entregas por remito de materiales a favor y por descuento directo de la obra', () => {
    const e = Object.fromEntries(t.filas.map((x) => [x.key, x.entregada]));
    expect(e.k1).toBe(1);
    expect(e.r1).toBe(2);
    expect(t.historial.some((h) => h.tipo === 'entrega')).toBe(true);
  });
});

describe('10. Histórico y KPIs', () => {
  const historico = base({ status: 'aprobado', statusHistory: [{ status: 'aprobado', date: '2026-01-10T12:00:00Z' }] });
  it('un aprobado sin detalle conserva el criterio histórico (total) en KPIs', () => {
    expect(aprobacionKPI(historico, 1234)).toEqual({ aprobado: true, tipo: 'historica', importeAprobado: 1234, importeCotizado: 1234 });
  });
  it('con detalle, el KPI usa lo efectivamente aprobado y distingue parcial / total', () => {
    const p = aprobar(base(), { k1: 1 }, 1);
    const k = aprobacionKPI(p);
    expect(k.tipo).toBe('parcial');
    expect(k.importeAprobado).toBe(importeFinalItem(ITEMS[2], 1, 'iva'));
    expect(k.importeCotizado).toBe(cotizadoFinal(base()));
  });
  it('no aprobado → 0 aprobado, cuenta como cotizado', () => {
    expect(aprobacionKPI(base()).importeAprobado).toBe(0);
  });
  it('la tarjeta muestra lo aprobado solo cuando hay detalle', () => {
    expect(importeTarjeta({ status: 'aprobado', amount: 100, aprobacionResumen: { importeAprobado: 40 } })).toBe(40);
    expect(importeTarjeta({ status: 'aprobado', amount: 100 })).toBe(100);
    expect(importeTarjeta({ status: 'enviado', amount: 100, aprobacionResumen: { importeAprobado: 40 } })).toBe(100);
  });
  it('la aprobación histórica se reconstruye desde la obra (sin inventar) al agregar la primera con detalle', () => {
    const obra = { quoteItems: ITEMS.slice(0, 3).map((x) => ({ ...x })) };
    const h = registroAprobacionHistorica(historico, obra);
    expect(h.fuente).toBe('obra');
    expect(h.items.map((x) => x.itemId)).toEqual(['c1', 't1', 'k1']);
    const filas = filasAprobacion(historico, obra);
    expect(filas.find((f) => f.key === 'r1').pendiente).toBe(10);
    expect(filas.find((f) => f.key === 'k1').pendiente).toBe(0);
  });
  it('canal 2 usa el mismo criterio que el total del presupuesto (con descuento comercial)', () => {
    const p2 = base({ canal: 'canal2' });
    expect(importeFinalItem(ITEMS[2], 1, 'canal2')).toBe(Math.round(Math.round(2000000 * 1.21) * 0.895));
    expect(cotizadoFinal(p2)).toBeLessThan(cotizadoFinal(base()));
  });
});
