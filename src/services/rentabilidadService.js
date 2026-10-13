/**
 * Rentabilidad por obra (ganancia "bruta": sin costos fijos ni impuestos, todo SIN IVA).
 *
 *   Ingresos  : cotizado (presupuesto aprobado) · facturado neto (Canal 1 sin IVA, Canal 2 importe tal cual) · cobrado.
 *   Costos    :
 *     - Mano de obra por bocas (cañería): Jornadas → bocas finalizadas × valor boca de Sueldos/Paritarias
 *       (obra nueva / refacción, 2 o 3 personas según cuántos empleados produjeron en la obra), por empleado.
 *     - Mano de obra por horas (instalación): Jornadas → horas × valor hora de la categoría del empleado (+ adicional %).
 *     - Materiales del depósito: caños y piezas (consumos_obra), equipos descontados al iniciar etapas
 *       (obra.stockDescontado) y entregas con remito, valorizados al ÚLTIMO PRECIO DE COMPRA (con flete prorrateado).
 *     - Compras puntuales para la obra (líneas de compra con la obra asignada que NO ingresaron a stock).
 *     - Otros gastos de la obra (gastos_obra: subcontratos, alquileres, viáticos…).
 *
 * Las compras que ingresan a stock NO suman a la obra (se cuenta la salida del depósito) → sin doble conteo.
 */
import {
  collection, getDocs, getDoc, doc, query, where, addDoc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import { dbJornadas, ensureJornadasAuth } from './firebaseJornadas';
import { calcularDescuentosPresupuesto } from './descuentosService';
import { costosConFlete, netoLineaCompra } from './comprasService';
import { RE_ITEM_GLOBAL, TIPOS_SIN_STOCK } from './remitosService';
import { getTipoCambio } from './tipoCambioService';

/** Formato pesos sin decimales / porcentaje (para la UI de rentabilidad). */
export const fmt$ = (n) => (n === null || n === undefined || Number.isNaN(Number(n)) ? '—'
  : `$ ${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`);
export const fmtPct = (n) => (n === null || n === undefined ? '—' : `${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 1 })} %`);

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const quien = (user) => user?.email || user?.uid || 'sistema';
const EMPRESA_EULER = 'euler-calefaccion';

export const CATEGORIAS_GASTO_OBRA = ['Subcontrato', 'Alquiler de equipos / herramientas', 'Viáticos / combustible', 'Fletes / envíos a obra', 'Otros'];
export const COL_GASTOS_OBRA = 'gastos_obra';

// ─── Carga de datos ─────────────────────────────────────────────────────────

const todos = async (col, ...cond) => {
  const s = await getDocs(cond.length ? query(collection(db, col), ...cond) : collection(db, col));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
};

/**
 * Carga todo lo necesario para calcular la rentabilidad. Si se pasa obraId, filtra lo que se puede filtrar.
 * @returns {Promise<object>} contexto para calcularRentabilidad()
 */
export const cargarContextoRentabilidad = async ({ obraId = null } = {}) => {
  const porObra = (col) => (obraId ? todos(col, where('obraId', '==', obraId)) : todos(col));
  const [comprobantes, recibos, consumos, remitos, gastos, compras, lista, sueldosSnap, tc] = await Promise.all([
    porObra('comprobantes_venta'),
    todos('recibos'),
    porObra('consumos_obra'),
    porObra('remitos_entrega'),
    porObra(COL_GASTOS_OBRA),
    todos('comprobantes_compra'),
    todos('lista_precios'),
    getDoc(doc(db, 'eulerData', 'mainData')).catch(() => null),
    getTipoCambio().catch(() => null),
  ]);

  let jObras = []; let jornadas = []; let empleados = []; let errorJornadas = '';
  try {
    await ensureJornadasAuth();
    const [o, j, e] = await Promise.all([
      getDocs(collection(dbJornadas, 'obras')), getDocs(collection(dbJornadas, 'jornadas')), getDocs(collection(dbJornadas, 'empleados')),
    ]);
    jObras = o.docs.map((d) => ({ id: d.id, ...d.data() }));
    jornadas = j.docs.map((d) => ({ id: d.id, ...d.data() }));
    empleados = e.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    errorJornadas = `No se pudieron leer las Jornadas: ${e.message}`;
  }

  const sueldos = sueldosSnap?.exists?.() ? sueldosSnap.data() : {};
  return {
    comprobantes, recibos, consumos, remitos, gastos, compras, lista, tc: Number(tc?.valor || 0),
    jObras, jornadas, empleados, errorJornadas,
    globalRates: sueldos.globalRates || {}, paritarias: sueldos.paritariasHistory || [],
    costos: costosUnitarios(compras, lista, Number(tc?.valor || 0)),
  };
};

// ─── Costo unitario: último precio de compra ────────────────────────────────

/** Mapa listaItemId → { costo, fuente, fecha, proveedor }: último precio de compra (con descuento + flete prorrateado). */
export const costosUnitarios = (compras = [], lista = [], tc = 0) => {
  const m = {};
  const ordenadas = [...compras].filter((c) => c.estado !== 'anulado')
    .sort((a, b) => String(a.fechaEmision || '').localeCompare(String(b.fechaEmision || '')) || (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  ordenadas.forEach((c) => {
    if (/^NC/i.test(c.tipoComprobante || '')) return;
    costosConFlete(c).lineas.forEach((l) => {
      if (!l.itemId || !(l.costoUnit > 0)) return;
      m[l.itemId] = { costo: r2(l.costoUnit), fuente: 'compra', fecha: c.fechaEmision, proveedor: c.proveedorNombre || '' };
    });
  });
  lista.forEach((a) => {
    if (m[a.id]) return;
    if (Number(a.ultimoCostoARS) > 0) m[a.id] = { costo: r2(a.ultimoCostoARS), fuente: 'compra', fecha: a.ultimaCompraFecha || '', proveedor: a.ultimaCompraProveedor || '' };
    else if (Number(a.costoARS) > 0) m[a.id] = { costo: r2(a.costoARS), fuente: 'lista', fecha: '', proveedor: a.proveedor || '' };
    else if (Number(a.costoUSD) > 0 && tc > 0) m[a.id] = { costo: r2(Number(a.costoUSD) * tc), fuente: 'lista_usd', fecha: '', proveedor: a.proveedor || '' };
  });
  return m;
};

// ─── Mano de obra (Jornadas + Sueldos) ──────────────────────────────────────

const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
const ymDe = (txt) => {
  const s = String(txt || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const mes = Object.keys(MESES).find((k) => s.includes(k));
  const anio = (s.match(/(20\d\d)/) || [])[1];
  return mes && anio ? `${anio}-${String(MESES[mes]).padStart(2, '0')}` : '';
};

/** Valores de paritaria vigentes en una fecha (YYYY-MM-DD). */
export const paritariaVigente = (fecha, paritarias = [], globalRates = {}) => {
  const ym = String(fecha || '').slice(0, 7);
  const lista = paritarias.map((p) => ({ ...p, _ym: ymDe(p.mesVigente) })).filter((p) => p._ym).sort((a, b) => b._ym.localeCompare(a._ym));
  if (!lista.length) return globalRates;
  return lista.find((p) => p._ym <= ym) || lista[lista.length - 1];
};

const valorHora = (rates, categoria) => {
  const c = String(categoria || '').toLowerCase();
  if (c.includes('especializ')) return Number(rates.hourlyRate || 0);
  if (c.includes('medio')) return Number(rates.hourlyRateMedio || 0);
  if (c.includes('oficial')) return Number(rates.hourlyRateOficial || 0);
  return Number(rates.hourlyRateOficial || rates.hourlyRate || 0);
};

const horasDe = (j) => {
  const [h1, m1] = String(j.horaIngreso || '').split(':').map(Number);
  const [h2, m2] = String(j.horaSalida || '').split(':').map(Number);
  if ([h1, m1, h2, m2].some((x) => Number.isNaN(x))) return 0;
  let min = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (min < 0) min += 1440;
  return r2(min / 60);
};

/** Obras de Jornadas vinculadas a una obra del ERP. */
export const obrasJornadasDe = (obra, jObras = []) =>
  jObras.filter((o) => (obra.jornadasObraId && o.id === obra.jornadasObraId) || o.erpObraId === obra.id);

const manoDeObra = (obra, ctx) => {
  const vinculadas = obrasJornadasDe(obra, ctx.jObras);
  const nombres = new Set(vinculadas.map((o) => o.nombre).filter(Boolean));
  const js = (ctx.jornadas || []).filter((j) => !j.eliminada && nombres.has(j.obraDetectada));
  const empDe = (id) => (ctx.empleados || []).find((e) => e.id === id) || {};
  const refaccion = /REFACC/i.test(obra.estadoObra || '');
  const productores = new Set(js.filter((j) => j.metodoPago === 'produccion').map((j) => j.empleadoId));
  const cuadrilla = productores.size >= 3 ? 3 : 2;
  const claveBoca = `boca${refaccion ? 'Refaccion' : 'ObraNueva'}${cuadrilla}p`;

  const detalle = [];
  let costoBocas = 0; let costoHoras = 0; let bocas = 0; let horas = 0; let horasProduccion = 0; let bocasSinFinalizar = 0; let jornadasAbiertas = 0;
  js.forEach((j) => {
    const emp = empDe(j.empleadoId);
    const nombre = emp.nombre || emp.name || j.empleadoNombre || j.empleadoId;
    const rates = paritariaVigente(j.fechaIngreso, ctx.paritarias, ctx.globalRates);
    const h = horasDe(j);
    if (!j.horaSalida) jornadasAbiertas += 1;
    if (j.metodoPago === 'produccion') {
      horasProduccion += h;
      const b = Number(j.cantidadBocas || 0);
      if (b > 0 && j.produccionFinalizada) {
        const valor = Number(rates[claveBoca] || 0);
        const costo = r2(b * valor);
        bocas += b; costoBocas += costo;
        detalle.push({ tipo: 'bocas', fecha: j.fechaIngreso, empleado: nombre, cantidad: b, valor, costo });
      } else if (b > 0) bocasSinFinalizar += b;
    } else if (h > 0) {
      const adicional = Number(emp.adicionalPct ?? emp.percentage ?? 0);
      const valor = r2(valorHora(rates, emp.categoriaBase) * (1 + adicional / 100));
      const costo = r2(h * valor);
      horas += h; costoHoras += costo;
      detalle.push({ tipo: 'horas', fecha: j.fechaIngreso, empleado: nombre, categoria: emp.categoriaBase || '', cantidad: h, valor, costo });
    }
  });
  detalle.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  return {
    vinculadas, costoBocas: r2(costoBocas), costoHoras: r2(costoHoras), bocas, horas: r2(horas), horasProduccion: r2(horasProduccion),
    bocasSinFinalizar, jornadasAbiertas, cuadrilla, tipoBoca: refaccion ? 'refacción' : 'obra nueva', detalle,
  };
};

// ─── Materiales ─────────────────────────────────────────────────────────────

const materiales = (obra, ctx) => {
  const arts = Object.fromEntries((ctx.lista || []).map((a) => [a.id, a]));
  const esStock = (id, desc) => id && !TIPOS_SIN_STOCK.includes(arts[id]?.tipo) && !RE_ITEM_GLOBAL.test(desc || '');
  const movs = [];
  const push = (origen, fecha, it, signo) => {
    if (!esStock(it.listaItemId, it.descripcion)) return;
    const c = ctx.costos[it.listaItemId];
    const cant = Number(it.cantidad || 0) * signo;
    movs.push({
      origen, fecha, listaItemId: it.listaItemId, descripcion: it.descripcion || arts[it.listaItemId]?.descripcion || '',
      unidad: it.unidad || arts[it.listaItemId]?.unidad || '', cantidad: cant, costoUnit: c?.costo || 0, sinCosto: !c, costo: r2(cant * (c?.costo || 0)),
    });
  };
  (ctx.consumos || []).filter((c) => c.obraId === obra.id && c.estado === 'vigente').forEach((c) => (c.items || []).forEach((it) =>
    push(c.tipo === 'devolucion' ? 'Devolución al depósito' : c.ingenieria ? 'Ingeniería de cañería' : 'Salida adicional', c.fecha, it, c.tipo === 'devolucion' ? -1 : 1)));
  (obra.stockDescontado || []).filter((d) => d.via === 'directo' || d.via === 'legacy').forEach((d) =>
    push(d.etapa === 'instalacion' ? 'Inicio instalación' : d.etapa === 'legacy' ? 'Inicio de obra (sistema anterior)' : 'Inicio de obra', String(d.fecha || '').slice(0, 10), d, 1));
  (ctx.remitos || []).filter((r) => r.obraId === obra.id && r.estado === 'vigente' && !r.prueba && r.descuentaStock !== false).forEach((r) => (r.items || []).forEach((it) =>
    push(`Remito ${r.numero}`, r.fecha, it, 1)));

  // Compras puntuales para la obra (no ingresaron a stock)
  const directas = [];
  (ctx.compras || []).filter((c) => !c.ingresaStock && c.estado !== 'anulado').forEach((c) => {
    const signo = /^NC/i.test(c.tipoComprobante || '') ? -1 : 1;
    const tcC = c.moneda && c.moneda !== 'ARS' ? Number(c.cotizacion || 1) : 1;
    (c.lineas || []).filter((l) => l.obraId === obra.id).forEach((l) => directas.push({
      fecha: c.fechaEmision, proveedor: c.proveedorNombre, comprobante: `${c.tipoComprobante} ${c.numeroOriginal}`, descripcion: l.descripcion, costo: r2(signo * netoLineaCompra(l) * tcC),
    }));
  });

  movs.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  return {
    movs, directas,
    costoDeposito: r2(movs.reduce((a, m) => a + m.costo, 0)),
    costoDirectas: r2(directas.reduce((a, m) => a + m.costo, 0)),
    sinCosto: [...new Set(movs.filter((m) => m.sinCosto).map((m) => m.descripcion))],
  };
};

// ─── Ingresos ───────────────────────────────────────────────────────────────

export const esCanal2 = (obra) => obra.canal === 'canal2' || obra.canal === 'descuento';

const ingresos = (obra, ctx) => {
  const items = obra.quoteItems || [];
  const canal2 = esCanal2(obra);
  const calc = items.length ? calcularDescuentosPresupuesto(items, canal2) : null;
  const cotizado = calc ? r2(canal2 ? calc.montoFinalPresupuesto : calc.subtotalNeto) : 0;
  const comps = (ctx.comprobantes || []).filter((c) => c.obraId === obra.id && c.estado !== 'anulado' && !c.prueba);
  let facturado = 0; let facturadoTotal = 0;
  const detalle = comps.map((c) => {
    const signo = c.esNotaCredito ? -1 : 1;
    const total = Number(c.totalComprobante || 0);
    const neto = c.empresaId === EMPRESA_EULER ? total : Number(c.subtotalNeto ?? total / 1.21);
    facturado += signo * neto; facturadoTotal += signo * total;
    return { id: c.id, fecha: c.fechaEmision, comprobante: `${c.tipoComprobante || ''} ${c.numeroOriginal || ''}`.trim(), neto: r2(signo * neto), total: r2(signo * total) };
  }).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  const ids = new Set(comps.map((c) => c.id));
  let cobrado = 0;
  (ctx.recibos || []).filter((r) => r.estado !== 'anulado').forEach((r) => (r.imputaciones || []).forEach((i) => { if (ids.has(i.comprobanteId)) cobrado += Number(i.importe || 0); }));
  return { cotizado, facturado: r2(facturado), facturadoTotal: r2(facturadoTotal), cobrado: r2(cobrado), comprobantes: detalle, canal2 };
};

// ─── Cálculo principal ──────────────────────────────────────────────────────

/** Rentabilidad de una obra a partir del contexto cargado. */
export const calcularRentabilidad = (obra, ctx) => {
  const ing = ingresos(obra, ctx);
  const mo = manoDeObra(obra, ctx);
  const mat = materiales(obra, ctx);
  const gastos = (ctx.gastos || []).filter((g) => g.obraId === obra.id && g.estado !== 'anulado')
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  const costoGastos = r2(gastos.reduce((a, g) => a + Number(g.monto || 0), 0));
  const costos = {
    bocas: mo.costoBocas, horas: mo.costoHoras, deposito: mat.costoDeposito, directas: mat.costoDirectas, gastos: costoGastos,
  };
  const costoTotal = r2(Object.values(costos).reduce((a, v) => a + v, 0));
  const base = ing.facturado > 0 ? ing.facturado : ing.cotizado;
  const ganancia = r2(base - costoTotal);
  const gananciaProyectada = r2(ing.cotizado - costoTotal);
  return {
    obra, ingresos: ing, manoDeObra: mo, materiales: mat, gastos, costos, costoTotal,
    base, baseEs: ing.facturado > 0 ? 'facturado' : 'cotizado',
    ganancia, margen: base > 0 ? r2((ganancia / base) * 100) : null,
    gananciaProyectada, margenProyectado: ing.cotizado > 0 ? r2((gananciaProyectada / ing.cotizado) * 100) : null,
    porBoca: mo.bocas > 0 ? { costoMO: r2(mo.costoBocas / mo.bocas), ganancia: r2(ganancia / mo.bocas) } : null,
    porHora: (mo.horas + mo.horasProduccion) > 0 ? r2(ganancia / (mo.horas + mo.horasProduccion)) : null,
  };
};

// ─── Gastos de obra ─────────────────────────────────────────────────────────

export const registrarGastoObra = async ({ obra, fecha, categoria, descripcion, proveedor, monto }, user) => {
  const m = r2(String(monto).replace(',', '.'));
  if (!(m > 0)) throw new Error('Ingresá un importe mayor a cero.');
  await addDoc(collection(db, COL_GASTOS_OBRA), {
    obraId: obra.id, obraNombre: obra.name || '', otNumber: obra.otNumber || '',
    fecha, categoria, descripcion: String(descripcion || '').slice(0, 200), proveedor: String(proveedor || '').slice(0, 120), monto: m,
    estado: 'vigente', creadoPor: quien(user), createdAt: serverTimestamp(),
  });
};

export const anularGastoObra = async (g, motivo, user) => {
  await updateDoc(doc(db, COL_GASTOS_OBRA, g.id), { estado: 'anulado', anuladoPor: quien(user), anuladoEn: new Date().toISOString(), motivoAnulacion: String(motivo || '').slice(0, 200) });
};

/** Vincula una obra de Jornadas (creada a mano) con la obra del ERP. */
export const vincularObraJornadas = async (jObraId, obra) => {
  await ensureJornadasAuth();
  await updateDoc(doc(dbJornadas, 'obras', jObraId), { erpObraId: obra.id });
};
