/**
 * Remitos de entrega de materiales (constancia de entrega + conformidad del cliente).
 *
 * Cada salida de material al cliente genera un remito y descuenta el stock físico de los ítems vinculados a la lista de precios:
 *   - origen 'factura': ítems facturados que se entregan en el momento (sin "Entrega pendiente").
 *   - origen 'entrega': entrega posterior de materiales a favor (pagados y pendientes de entrega).
 *
 * Conformidad ("recibí conforme"):
 *   - 'papel':      se imprime el PDF, el cliente firma en papel y se marca como firmado.
 *   - 'link':       el cliente abre /remito/:id en su celular y firma con el dedo (página pública).
 *   - 'presencial': quien entrega le pasa su celular/tablet al cliente y firma en pantalla.
 *
 * El ID del documento (aleatorio, 20 caracteres) funciona como token del link público.
 */
import {
  collection, doc, getDoc, runTransaction, updateDoc, serverTimestamp, arrayUnion, increment,
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import { getArcaConfig } from './arcaFacturacionService';

export const COL_REMITOS = 'remitos_entrega';
export const TIPOS_SIN_STOCK = ['mano_de_obra', 'servicio', 'gasto'];
/** Ítems "globales" como "Mano de obra y materiales para cañería PEX": no son una pieza del depósito.
 *  Los caños y accesorios reales se descargan como consumo de obra (services/consumosObraService.js). */
export const RE_ITEM_GLOBAL = /mano\s+de\s+obra/i;
/** Línea (de factura o presupuesto) que representa material físico de la lista de precios. */
export const esLineaDeStock = (l) => !!l.listaItemId && !TIPOS_SIN_STOCK.includes(l.tipo) && !RE_ITEM_GLOBAL.test(l.descripcion || '');

const CFG_REF = () => doc(db, 'configuracion', 'ventas');
const EULER_DEFAULT = {
  razonSocial: 'EULER CALEFACCIÓN', domicilio: 'Perez Bulnes 6044 - Rosario - Santa Fe', telefono: '341 569-5849', email: 'info@euler.com.ar', web: 'www.euler.com.ar',
};
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const hoyISO = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const quien = (user) => user?.email || user?.uid || 'sistema';
const formatoNumero = (pv, nro) => `${String(pv).padStart(5, '0')}-${String(nro).padStart(8, '0')}`;

export const linkFirmaRemito = (id) => `${window.location.origin}/remito/${id}`;

/** Datos del emisor que quedan "congelados" en el remito (la página pública no puede leer la configuración). */
const emisorDe = async (empresaId) => {
  const pick = (c) => ({
    razonSocial: c.razonSocial || '', cuit: c.cuit || '', domicilio: c.domicilio || '', condicionIva: c.condicionIva || '',
    telefono: c.telefono || '', email: c.email || '', web: c.web || '',
  });
  if (empresaId === 'ayala-nicolas') return pick(await getArcaConfig());
  const s = await getDoc(CFG_REF());
  return pick({ ...EULER_DEFAULT, ...(s.exists() ? s.data().euler || {} : {}) });
};

/** Reserva el próximo número de remito dentro de la transacción (configuracion/ventas → numeracion[empresa].ultimoRem). */
const reservarNumero = (tx, cfgSnap, empresaId, prueba) => {
  const num = (cfgSnap.exists() ? cfgSnap.data().numeracion?.[empresaId] : null) || {};
  const campo = prueba ? 'ultimoRemPrueba' : 'ultimoRem';
  const nro = Number(num[campo] || 0) + 1;
  const pv = Number(num.ptoVtaRem || 1);
  tx.set(CFG_REF(), { numeracion: { [empresaId]: { [campo]: nro } } }, { merge: true });
  return { puntoVenta: pv, numeroRemito: nro, numero: `${prueba ? 'PRUEBA ' : ''}${formatoNumero(pv, nro)}` };
};

const descontarStock = (tx, items, signo = -1) => {
  const porArticulo = {};
  items.forEach((it) => { if (it.listaItemId) porArticulo[it.listaItemId] = r2((porArticulo[it.listaItemId] || 0) + Number(it.cantidad || 0)); });
  Object.entries(porArticulo).forEach(([id, cant]) => {
    tx.update(doc(db, 'lista_precios', id), { stock: increment(signo * cant), stockActualizadoEn: new Date().toISOString() });
  });
};

const remitoDoc = ({ num, empresaId, emisor, origen, cli, comprobante, materialId, obraId, items, nota, entregadoPor, prueba, user }) => ({
  ...num,
  empresaId,
  emisor,
  origen,
  clienteId: cli.clienteId || null,
  clienteNombre: cli.clienteNombre || '',
  clienteCuit: cli.clienteCuit || '',
  clienteTelefono: cli.clienteTelefono || '',
  clienteDomicilio: cli.clienteDomicilio || '',
  clienteClave: cli.clienteClave || null,
  comprobanteId: comprobante?.id || null,
  comprobanteColeccion: comprobante?.coleccion || null,
  comprobanteNumero: comprobante?.numero || '',
  materialId: materialId || null,
  obraId: obraId || null,
  items: items.map((it) => ({
    descripcion: String(it.descripcion || '').slice(0, 250), cantidad: r2(it.cantidad), unidad: it.unidad || '',
    listaItemId: it.listaItemId || null, itemIndex: it.itemIndex ?? null,
  })),
  fecha: hoyISO(),
  nota: String(nota || '').slice(0, 300),
  entregadoPor: String(entregadoPor || quien(user)).slice(0, 80),
  descuentaStock: !prueba,
  prueba: !!prueba,
  estado: 'vigente',
  estadoFirma: 'pendiente',
  firma: null,
  firmadoEn: null,
  creadoPor: quien(user),
  createdAt: serverTimestamp(),
});

/**
 * Entrega (total o parcial) de materiales a favor. entregas: { [indiceItem]: cantidad }.
 * Actualiza el doc de materiales_a_favor, descuenta stock y genera el remito, todo en una transacción.
 * @returns {Promise<object>} remito creado (con id)
 */
export const registrarEntrega = async ({ mat, entregas, nota = '', entregadoPor = '' }, user) => {
  const emisor = await emisorDe(mat.empresaId);
  return runTransaction(db, async (tx) => {
    const matRef = doc(db, 'materiales_a_favor', mat.id);
    const cfgSnap = await tx.get(CFG_REF());
    const matSnap = await tx.get(matRef);
    if (!matSnap.exists()) throw new Error('No se encontró el registro de materiales.');
    const m = { id: mat.id, ...matSnap.data() };
    if (m.estado === 'anulado') throw new Error('Ese comprobante está anulado.');
    const items = (m.items || []).map((it, i) => {
      const cant = Number(entregas[i] || 0);
      const pendiente = Number(it.cantidad) - Number(it.cantidadEntregada || 0);
      if (cant < 0 || cant > pendiente + 0.0001) throw new Error(`Cantidad inválida para ${it.descripcion} (pendiente ${r2(pendiente)}).`);
      return { ...it, cantidadEntregada: r2(Number(it.cantidadEntregada || 0) + cant) };
    });
    const detalle = (m.items || []).map((it, i) => ({
      descripcion: it.descripcion, cantidad: Number(entregas[i] || 0), unidad: it.unidad || '', listaItemId: it.listaItemId || null, itemIndex: i,
    })).filter((x) => x.cantidad > 0);
    if (!detalle.length) throw new Error('Indicá al menos una cantidad a entregar.');
    const completo = items.every((it) => it.cantidadEntregada >= Number(it.cantidad) - 0.0001);

    const num = reservarNumero(tx, cfgSnap, m.empresaId, m.prueba);
    const remRef = doc(collection(db, COL_REMITOS));
    tx.update(matRef, {
      items,
      estado: completo ? 'entregado' : 'parcial',
      entregas: arrayUnion({
        fecha: new Date().toISOString(), items: detalle, nota: nota || '', usuario: quien(user), descuentaStock: !m.prueba,
        remitoId: remRef.id, remitoNumero: num.numero,
      }),
    });
    if (!m.prueba) descontarStock(tx, detalle);
    const rem = remitoDoc({
      num, empresaId: m.empresaId, emisor, origen: 'entrega', cli: m,
      comprobante: m.comprobanteId ? { id: m.comprobanteId, coleccion: m.comprobanteColeccion, numero: m.comprobanteNumero } : null,
      materialId: m.id, obraId: m.obraId, items: detalle, nota, entregadoPor, prueba: m.prueba, user,
    });
    tx.set(remRef, rem);
    return { ...rem, id: remRef.id, createdAt: null };
  });
};

/**
 * Ítems facturados que se entregan en el momento: descuenta stock y genera el remito.
 * @param {{ empresaId: string, cli: object, comprobante: object, lineas: object[], prueba?: boolean, entregadoPor?: string }} p
 *   cli: datos de cliente con forma { clienteNombre, clienteCuit, ... } (como los guarda el comprobante)
 */
export const registrarEntregaInmediata = async ({ empresaId, cli, comprobante, lineas, prueba = false, entregadoPor = '' }, user) => {
  const items = (lineas || []).filter((l) => Number(l.cantidad) > 0).map((l) => ({
    descripcion: l.descripcion, cantidad: Number(l.cantidad), unidad: l.unidad || '', listaItemId: l.listaItemId || null,
  }));
  if (!items.length) return null;
  const emisor = await emisorDe(empresaId);
  return runTransaction(db, async (tx) => {
    const cfgSnap = await tx.get(CFG_REF());
    const num = reservarNumero(tx, cfgSnap, empresaId, prueba);
    const remRef = doc(collection(db, COL_REMITOS));
    if (!prueba) descontarStock(tx, items);
    const rem = remitoDoc({
      num, empresaId, emisor, origen: 'factura', cli,
      comprobante: comprobante ? { id: comprobante.id, coleccion: comprobante.coleccion, numero: `${comprobante.tipoComprobante || ''} ${comprobante.numeroOriginal || ''}`.trim() } : null,
      obraId: comprobante?.obraId, items, nota: 'Entrega en el momento de la venta', entregadoPor, prueba, user,
    });
    tx.set(remRef, rem);
    return { ...rem, id: remRef.id, createdAt: null };
  });
};

/**
 * Registra la conformidad del cliente. metodo: 'link' (página pública) | 'presencial' (dispositivo de Euler).
 * Para 'link' la regla de Firestore solo permite tocar estadoFirma / firma / firmadoEn.
 */
export const firmarRemito = async (id, { nombre, dni, imagen, metodo }, user = null) => {
  if (!String(nombre || '').trim()) throw new Error('Ingresá nombre y apellido de quien recibe.');
  if (!imagen) throw new Error('Falta la firma.');
  const ahora = new Date().toISOString();
  await updateDoc(doc(db, COL_REMITOS, id), {
    estadoFirma: 'firmado',
    firmadoEn: ahora,
    firma: {
      metodo, nombre: String(nombre).trim().slice(0, 80), dni: String(dni || '').replace(/\D/g, '').slice(0, 11), imagen, fecha: ahora,
      dispositivo: (typeof navigator !== 'undefined' ? navigator.userAgent : '').slice(0, 200),
      registradoPor: user ? quien(user) : null,
    },
  });
};

/** El cliente firmó el remito impreso. */
export const marcarFirmadoEnPapel = async (id, { nombre = '', dni = '' } = {}, user) => {
  const ahora = new Date().toISOString();
  await updateDoc(doc(db, COL_REMITOS, id), {
    estadoFirma: 'firmado', firmadoEn: ahora,
    firma: { metodo: 'papel', nombre: String(nombre).trim().slice(0, 80), dni: String(dni).replace(/\D/g, '').slice(0, 11), imagen: null, fecha: ahora, registradoPor: quien(user) },
  });
};

/**
 * Anula un remito: devuelve el stock y, si vino de materiales a favor, vuelve a dejar pendiente lo entregado.
 */
export const anularRemito = async (rem, motivo, user) => {
  await runTransaction(db, async (tx) => {
    const remRef = doc(db, COL_REMITOS, rem.id);
    const remSnap = await tx.get(remRef);
    if (!remSnap.exists()) throw new Error('Remito inexistente.');
    const r = remSnap.data();
    if (r.estado === 'anulado') throw new Error('El remito ya está anulado.');
    let matSnap = null;
    if (r.materialId) matSnap = await tx.get(doc(db, 'materiales_a_favor', r.materialId));
    if (matSnap?.exists()) {
      const m = matSnap.data();
      const items = (m.items || []).map((it, i) => {
        const dev = (r.items || []).filter((x) => x.itemIndex === i).reduce((a, x) => a + Number(x.cantidad || 0), 0);
        return dev ? { ...it, cantidadEntregada: Math.max(0, r2(Number(it.cantidadEntregada || 0) - dev)) } : it;
      });
      const algo = items.some((it) => Number(it.cantidadEntregada || 0) > 0.0001);
      tx.update(matSnap.ref, {
        items,
        estado: m.estado === 'anulado' ? 'anulado' : (algo ? 'parcial' : 'pendiente'),
        entregas: arrayUnion({ fecha: new Date().toISOString(), items: [], nota: `Anulación remito ${r.numero}${motivo ? ` – ${motivo}` : ''}`, usuario: quien(user), remitoId: rem.id, anulacion: true }),
      });
    }
    if (r.descuentaStock) descontarStock(tx, r.items || [], +1);
    tx.update(remRef, { estado: 'anulado', anuladoPor: quien(user), anuladoEn: new Date().toISOString(), motivoAnulacion: String(motivo || '').slice(0, 200) });
  });
};
