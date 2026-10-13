/**
 * Descuento de stock por etapa de obra.
 *
 * Regla de negocio (Euler):
 *   - Al iniciar la OBRA DE CAÑERÍA se descuentan solo los materiales de cañería PEX (pre-fitting, tubos, fitting).
 *   - El resto (calderas, radiadores, válvulas, etc.) se descuenta al iniciar la INSTALACIÓN DE EQUIPOS.
 *
 * Cada ítem del presupuesto se descuenta una sola vez: lo descontado queda registrado en obra.stockDescontado.
 * Si el material ya estaba facturado con "Entrega pendiente" (materiales_a_favor de la obra), en lugar de un
 * descuento directo se registra la entrega sobre ese registro → genera remito y lo saca de "Reservados".
 */
import {
  collection, doc, getDoc, getDocs, query, where, runTransaction, increment, arrayUnion,
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import { registrarEntrega, esLineaDeStock } from './remitosService';

export const ETAPAS = {
  obra: { id: 'obra', label: 'Obra de cañería', corto: 'Cañería PEX' },
  instalacion: { id: 'instalacion', label: 'Instalación de equipos', corto: 'Equipos / instalación' },
};

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const quien = (user) => user?.email || user?.uid || 'sistema';
const RE_PEX = /fitting\s*pex|\bpex\b|pex-?a\b|pre-?fitting|prefit|pre-?aislad/i;

/** Etapa de la obra según su fase actual. */
export const etapaDeObra = (obra) => (obra?.phase === 'Instalación' ? 'instalacion' : 'obra');

/** Etapa en la que se descuenta un ítem: cañería PEX → 'obra'; todo lo demás → 'instalacion'. */
export const etapaSugerida = (item, articulo) => {
  if (articulo?.etapaStock === 'obra' || articulo?.etapaStock === 'instalacion') return articulo.etapaStock;
  const texto = `${articulo?.categoria || ''} ${articulo?.descripcion || ''} ${item?.descripcion || ''}`;
  return RE_PEX.test(texto) ? 'obra' : 'instalacion';
};

/** Obras iniciadas con la lógica anterior (descontaba todo el presupuesto de una vez). */
export const esDescuentoLegacy = (obra) =>
  !obra?.stockDescontado && (obra?.bitacoraHistory || []).some((e) => /stock descontado/i.test(e?.texto || ''));

/** Cantidad ya descontada por índice de ítem del presupuesto. */
export const descontadoPorItem = (obra) => {
  const m = {};
  (obra?.stockDescontado || []).forEach((d) => { m[d.itemIndex] = r2((m[d.itemIndex] || 0) + Number(d.cantidad || 0)); });
  return m;
};

/**
 * Ítems de stock del presupuesto con lo pendiente de descontar, etapa sugerida y lo cubierto por materiales facturados.
 * @returns {Promise<Array<{itemIndex, descripcion, unidad, listaItemId, cantidad, descontado, pendiente, etapa, categoria, cubiertoFacturado}>>}
 */
export const cargarItemsStockObra = async (obra) => {
  const legacy = esDescuentoLegacy(obra);
  const desc = descontadoPorItem(obra);
  const base = (obra?.quoteItems || [])
    .map((it, itemIndex) => ({ it, itemIndex }))
    .filter(({ it }) => esLineaDeStock(it) && Number(it.quantity) > 0);

  const ids = [...new Set(base.map(({ it }) => it.listaItemId))];
  const arts = {};
  await Promise.all(ids.map(async (id) => {
    try { const s = await getDoc(doc(db, 'lista_precios', id)); if (s.exists()) arts[id] = s.data(); } catch { /* sin acceso */ }
  }));
  const pendFact = await pendientesFacturados(obra);

  return base.map(({ it, itemIndex }) => {
    const cantidad = r2(it.quantity);
    const descontado = legacy ? cantidad : Math.min(cantidad, desc[itemIndex] || 0);
    const art = arts[it.listaItemId];
    return {
      itemIndex, descripcion: it.descripcion || art?.descripcion || '', unidad: it.unidad || art?.unidad || '',
      listaItemId: it.listaItemId, cantidad, descontado, pendiente: r2(cantidad - descontado),
      etapa: etapaSugerida(it, art), categoria: art?.categoria || '', stockActual: art ? Number(art.stock || 0) : null,
      cubiertoFacturado: r2(pendFact[it.listaItemId] || 0),
    };
  });
};

/** Materiales facturados de esta obra pendientes de entrega (no prueba, no anulados). */
const materialesFacturadosObra = async (obraId) => {
  if (!obraId) return [];
  const s = await getDocs(query(collection(db, 'materiales_a_favor'), where('obraId', '==', obraId)));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((m) => !m.prueba && m.estado !== 'anulado' && m.estado !== 'entregado');
};

const pendientesFacturados = async (obra) => {
  const tot = {};
  (await materialesFacturadosObra(obra?.id)).forEach((m) => (m.items || []).forEach((it) => {
    if (!it.listaItemId) return;
    const p = Number(it.cantidad) - Number(it.cantidadEntregada || 0);
    if (p > 0) tot[it.listaItemId] = r2((tot[it.listaItemId] || 0) + p);
  }));
  return tot;
};

/**
 * Descuenta del stock los ítems elegidos de la obra.
 * @param {{ obra: object, etapa: 'obra'|'instalacion', seleccion: Array<{itemIndex:number, cantidad:number}>, entregadoPor?: string, obraUpdates?: object, bitacora?: string }} p
 *   obraUpdates: campos extra a guardar en la obra en la misma operación (p. ej. estado 'En Proceso' al iniciar).
 * @returns {Promise<{ remitos: object[], directos: object[] }>}
 */
export const descontarStockObra = async ({ obra, etapa, seleccion, entregadoPor = '', obraUpdates = {}, bitacora = '' }, user) => {
  const items = obra.quoteItems || [];
  const sel = (seleccion || []).filter((s) => Number(s.cantidad) > 0 && items[s.itemIndex]?.listaItemId);
  const ahora = new Date().toISOString();

  // 1) Lo que ya está facturado con entrega pendiente → entrega sobre materiales_a_favor (genera remito).
  const restante = sel.map((s) => ({ ...s, it: items[s.itemIndex], resto: r2(s.cantidad), viaRemito: [] }));
  const mats = await materialesFacturadosObra(obra.id);
  const remitos = [];
  for (const m of mats) {
    const entregas = {};
    (m.items || []).forEach((mi, i) => {
      let pend = r2(Number(mi.cantidad) - Number(mi.cantidadEntregada || 0));
      if (!mi.listaItemId || pend <= 0) return;
      restante.filter((r) => r.it.listaItemId === mi.listaItemId && r.resto > 0).forEach((r) => {
        const q = r2(Math.min(pend, r.resto));
        if (q <= 0) return;
        entregas[i] = r2((entregas[i] || 0) + q);
        pend = r2(pend - q); r.resto = r2(r.resto - q);
        r.viaRemito.push({ cantidad: q, materialId: m.id });
      });
    });
    if (!Object.keys(entregas).length) continue;
    const rem = await registrarEntrega({
      mat: m, entregas, entregadoPor,
      nota: `${ETAPAS[etapa]?.label || 'Obra'} – ${obra.name || ''}`.trim(),
    }, user);
    remitos.push(rem);
    restante.forEach((r) => r.viaRemito.forEach((v) => { if (v.materialId === m.id && !v.remitoNumero) { v.remitoId = rem.id; v.remitoNumero = rem.numero; } }));
  }

  // 2) Registro en la obra + descuento directo del resto, en una transacción.
  const registros = [];
  const directos = [];
  restante.forEach((r) => {
    const base = { itemIndex: r.itemIndex, listaItemId: r.it.listaItemId, descripcion: String(r.it.descripcion || '').slice(0, 200), etapa, fecha: ahora, usuario: quien(user) };
    r.viaRemito.forEach((v) => registros.push({ ...base, cantidad: v.cantidad, via: 'remito', remitoId: v.remitoId || null, remitoNumero: v.remitoNumero || '' }));
    if (r.resto > 0) { const d = { ...base, cantidad: r.resto, via: 'directo' }; registros.push(d); directos.push(d); }
  });

  await runTransaction(db, async (tx) => {
    const obraRef = doc(db, 'obras', obra.id);
    const snap = await tx.get(obraRef);
    if (!snap.exists()) throw new Error('La obra no existe.');
    const porArt = {};
    directos.forEach((d) => { porArt[d.listaItemId] = r2((porArt[d.listaItemId] || 0) + d.cantidad); });
    Object.entries(porArt).forEach(([id, cant]) => {
      tx.update(doc(db, 'lista_precios', id), { stock: increment(-cant), stockActualizadoEn: ahora });
    });
    const upd = { ...obraUpdates, [`stockEtapas.${etapa}`]: ahora };
    // Obras iniciadas con la lógica anterior: se marca todo como ya descontado para no duplicar.
    const previos = esDescuentoLegacy(snap.data())
      ? (snap.data().quoteItems || []).map((it, i) => ({ it, i })).filter(({ it }) => it.listaItemId && Number(it.quantity) > 0)
        .map(({ it, i }) => ({ itemIndex: i, listaItemId: it.listaItemId, descripcion: String(it.descripcion || '').slice(0, 200), cantidad: r2(it.quantity), etapa: 'legacy', via: 'legacy', fecha: ahora, usuario: 'sistema' }))
      : [];
    const nuevos = [...previos, ...registros];
    if (nuevos.length) upd.stockDescontado = arrayUnion(...nuevos);
    else if (!snap.data().stockDescontado) upd.stockDescontado = [];
    if (bitacora) {
      const entry = { texto: bitacora, fecha: ahora, autor: quien(user) };
      upd.bitacoraPreview = bitacora;
      upd.bitacoraHistory = [entry, ...(snap.data().bitacoraHistory || [])];
    }
    tx.update(obraRef, upd);
  });

  return { remitos, directos };
};
