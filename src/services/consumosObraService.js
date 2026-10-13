/**
 * Consumo real de materiales en obra (caños, accesorios, piezas).
 *
 * En presupuesto y factura la cañería va como un ítem global ("Mano de obra y materiales para cañería PEX"),
 * que no es una pieza del depósito. Las piezas reales se descargan acá:
 *   - 'salida' con ingenieria=true: la lista de materiales de la ingeniería de cañería (al iniciar la obra).
 *   - 'salida': material adicional que sale del depósito hacia la obra (cambios, faltantes).
 *   - 'devolucion': sobrante que vuelve al depósito.
 * Cada movimiento ajusta lista_precios.stock en la misma transacción. Los movimientos no se borran: se anulan
 * (la anulación revierte el stock).
 */
import {
  collection, doc, getDocs, query, where, runTransaction, increment, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebaseConfig';

export const COL_CONSUMOS = 'consumos_obra';
const r2 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;
const quien = (user) => user?.email || user?.uid || 'sistema';
const hoyISO = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

export const TIPOS_MOV = {
  salida: { label: 'Salida a obra', signo: -1 },
  devolucion: { label: 'Devolución al depósito', signo: +1 },
};

/** Artículos de la lista de precios que son piezas físicas (no mano de obra / servicios). */
export const cargarArticulosStock = async () => {
  const s = await getDocs(collection(db, 'lista_precios'));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((a) => !['mano_de_obra', 'servicio', 'gasto'].includes(a.tipo) && a.activo !== false)
    .sort((a, b) => String(a.descripcion || '').localeCompare(String(b.descripcion || '')));
};

/**
 * Registra un movimiento de materiales de obra y ajusta el stock.
 * @param {{ obra: object, tipo: 'salida'|'devolucion', ingenieria?: boolean, etapa?: string, items: Array<{listaItemId, descripcion, unidad, cantidad}>, nota?: string, responsable?: string, fecha?: string }} p
 */
export const registrarConsumo = async ({ obra, tipo, ingenieria = false, etapa = 'obra', items, nota = '', responsable = '', fecha }, user) => {
  if (!TIPOS_MOV[tipo]) throw new Error('Tipo de movimiento inválido.');
  const limpios = (items || [])
    .map((it) => ({ listaItemId: it.listaItemId, descripcion: String(it.descripcion || '').slice(0, 200), unidad: it.unidad || '', cantidad: r2(it.cantidad) }))
    .filter((it) => it.listaItemId && it.cantidad > 0);
  if (!limpios.length) throw new Error('Agregá al menos un material con cantidad.');
  const signo = TIPOS_MOV[tipo].signo;
  const ahora = new Date().toISOString();
  const ref = doc(collection(db, COL_CONSUMOS));
  await runTransaction(db, async (tx) => {
    const porArt = {};
    limpios.forEach((it) => { porArt[it.listaItemId] = r2((porArt[it.listaItemId] || 0) + it.cantidad); });
    Object.entries(porArt).forEach(([id, cant]) => {
      tx.update(doc(db, 'lista_precios', id), { stock: increment(signo * cant), stockActualizadoEn: ahora });
    });
    tx.set(ref, {
      obraId: obra.id, obraNombre: obra.name || '', otNumber: obra.otNumber || '', clienteNombre: obra.clientName || '',
      tipo, ingenieria: tipo === 'salida' && !!ingenieria, etapa,
      items: limpios, nota: String(nota || '').slice(0, 300), responsable: String(responsable || quien(user)).slice(0, 80),
      fecha: fecha || hoyISO(), estado: 'vigente', creadoPor: quien(user), createdAt: serverTimestamp(),
    });
  });
  return ref.id;
};

/** Anula un movimiento y revierte el stock. */
export const anularConsumo = async (c, motivo, user) => {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, COL_CONSUMOS, c.id);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Movimiento inexistente.');
    const d = snap.data();
    if (d.estado !== 'vigente') throw new Error('El movimiento ya está anulado.');
    const signo = -TIPOS_MOV[d.tipo].signo;
    const ahora = new Date().toISOString();
    const porArt = {};
    (d.items || []).forEach((it) => { porArt[it.listaItemId] = r2((porArt[it.listaItemId] || 0) + Number(it.cantidad || 0)); });
    Object.entries(porArt).forEach(([id, cant]) => {
      tx.update(doc(db, 'lista_precios', id), { stock: increment(signo * cant), stockActualizadoEn: ahora });
    });
    tx.update(ref, { estado: 'anulado', anuladoPor: quien(user), anuladoEn: ahora, motivoAnulacion: String(motivo || '').slice(0, 200) });
  });
};

export const consumosDeObraQuery = (obraId) => query(collection(db, COL_CONSUMOS), where('obraId', '==', obraId));

/**
 * Resumen por artículo: ingeniería (planificado), salidas adicionales, devoluciones, consumo neto y diferencia.
 * @returns {Array<{listaItemId, descripcion, unidad, ingenieria, salidas, devoluciones, neto, diferencia}>}
 */
export const resumenConsumos = (consumos) => {
  const m = {};
  (consumos || []).filter((c) => c.estado === 'vigente').forEach((c) => (c.items || []).forEach((it) => {
    const r = m[it.listaItemId] || (m[it.listaItemId] = { listaItemId: it.listaItemId, descripcion: it.descripcion, unidad: it.unidad, ingenieria: 0, salidas: 0, devoluciones: 0 });
    const q = Number(it.cantidad || 0);
    if (c.tipo === 'devolucion') r.devoluciones = r2(r.devoluciones + q);
    else if (c.ingenieria) r.ingenieria = r2(r.ingenieria + q);
    else r.salidas = r2(r.salidas + q);
  }));
  return Object.values(m).map((r) => {
    const neto = r2(r.ingenieria + r.salidas - r.devoluciones);
    return { ...r, neto, diferencia: r2(neto - r.ingenieria) };
  }).sort((a, b) => String(a.descripcion).localeCompare(String(b.descripcion)));
};
