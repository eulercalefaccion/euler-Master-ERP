/**
 * Aprobaciones de presupuestos (parciales o totales, por ítem y cantidad) → obra ERP + obra Euler Jornadas.
 *
 *  - Cada aprobación es un registro nuevo en presupuesto.aprobaciones[] (fecha, usuario, revisión, ítems, cantidades,
 *    precios e importes congelados). Nunca reemplaza a las anteriores.
 *  - Primera aprobación: crea la obra (mismos campos que el flujo anterior) SOLO con el alcance aprobado.
 *  - Siguientes: actualiza la MISMA obra agregando únicamente el alcance nuevo (sin tocar índices existentes).
 *  - Idempotente: el id de la aprobación se genera al abrir el formulario; reintentos / doble clic no duplican.
 *  - Aprobar NO reserva stock ni registra cobros: la reserva sigue la regla vigente de services/reservasStock.js
 *    (aprobado + facturado con entrega posterior + cobrado). El estado de pago elegido es una DECLARACIÓN manual.
 *  - Euler Jornadas: se sincroniza aparte; si falla, queda obra.jornadasSync.estado = 'error' y se puede reintentar.
 */
import {
  collection, doc, getDoc, getDocs, query, where, runTransaction, updateDoc, setDoc, arrayUnion, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import { dbJornadas } from './firebaseJornadas';
import { getNextSequenceValue, formatObraNumber } from '../utils/sequenceGenerator';
import { calcularReservas } from './reservasStock';
import {
  filasAprobacion, validarSeleccion, construirAprobacion, resumenAprobacion, mergeItemsObra,
  tieneDetalleAprobacion, esAprobacionHistorica, registroAprobacionHistorica,
} from './presupuestoAlcance';

export const nuevoIdAprobacion = () => `apr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const nombreDe = (user) => user?.name || user?.displayName || user?.email || 'Desconocido';
const ars = (n) => `$ ${Math.round(Number(n) || 0).toLocaleString('es-AR')}`;

/** Obra vinculada al presupuesto (por presupuesto.obraId o por obras.presupuestoId). */
export const buscarObraDePresupuesto = async (presupuestoId, obraId = null) => {
  if (obraId) {
    const s = await getDoc(doc(db, 'obras', obraId));
    if (s.exists() && !s.data().deleted) return { id: s.id, ...s.data() };
  }
  const s = await getDocs(query(collection(db, 'obras'), where('presupuestoId', '==', presupuestoId)));
  return s.docs.map((d) => ({ id: d.id, ...d.data() })).find((o) => !o.deleted) || null;
};

/** Documento de obra nuevo (mismos campos que creaba KanbanBoard.confirmApproval). */
export const obraDesdePresupuesto = ({ item, presupuestoId, otNumber, jornadasObraId, quoteItems, tipoAprobacion }) => {
  const obraNombre = `${item.name} — ${item.paramSistema || 'Instalación'}`;
  return {
    otNumber,
    name: obraNombre,
    location: item.direccionObra || item.location || 'S/D',
    clientId: item.clientId || '',
    clientName: item.name || 'S/D',
    system: item.paramSistema || 'S/D',
    phase: 'Obra',
    estado: 'Pendiente de Inicio',
    progress: 0,
    operarios: '',
    personal: [],
    quoteItems, // solo el alcance APROBADO
    presupuestoId,
    presupuestoNum: item.presupuestoNumber || '',
    presupuestoOrigen: item.presupuestoNumber || '',
    canal: item.canal || 'iva',
    jornadasObraId,
    jornadasSync: { estado: 'pendiente', fecha: new Date().toISOString() },
    bitacoraPreview: `Vinculado al Presupuesto: ${item.presupuestoNumber || 'S/N'}. Aprobado (${tipoAprobacion}).`,
    bitacoraHistory: [{ texto: `Obra creada desde Presupuesto ${item.presupuestoNumber || ''}. Aprobación ${tipoAprobacion} el ${new Date().toLocaleDateString('es-AR')}. OT generada: ${otNumber}`, fecha: new Date().toISOString() }],
    fechaInicio: '',
    fechaFinEstimada: '',
    fechaFinReal: '',
    archivos: (item.archivos || []).map((a) => ({ ...a, subidoEn: new Date().toISOString() })),
    createdAt: serverTimestamp(),
    tipoCliente: item.tipoCliente || 'consumidor_final',
    email: item.email || '',
    telefono: item.telefono || '',
    dni: item.dni || '',
    cuit: item.cuit || '',
    direccionCliente: item.direccionCliente || '',
    contactoNombre: item.contactoNombre || '',
    contactoTelefono: item.contactoTelefono || '',
    arquitectos: item.arquitectos || [],
    direccionObra: item.direccionObra || '',
    tipoObra: item.tipoObra || 'VIVIENDA UNIFAMILIAR',
    estadoObra: item.estadoObra || 'OBRA NUEVA',
    tipoProyecto: item.tipoProyecto || 'LLAVE EN MANO (CAÑERIA+EQUIPOS+MANO DE OBRA)',
    facturacionIgualCliente: item.facturacionIgualCliente !== false,
    facturacionNombre: item.facturacionNombre || '',
    facturacionCuit: item.facturacionCuit || '',
    facturacionDni: item.facturacionDni || '',
    facturacionDireccion: item.facturacionDireccion || '',
  };
};

/**
 * Registra una aprobación (parcial o total).
 * @param {{ presupuestoId: string, aprobacionId: string, seleccion: Record<string, number|string>,
 *           pagoDeclarado?: { estado: string, monto?: number|null } | null, origen?: 'crm'|'facturacion', user: object }} p
 * @returns {Promise<{ duplicado?: boolean, obraId: string, otNumber: string, obraCreada: boolean, aprobacion: object|null, jornadas: object }>}
 */
export const registrarAprobacion = async ({ presupuestoId, aprobacionId, seleccion, pagoDeclarado = null, origen = 'crm', user }) => {
  if (!aprobacionId) throw new Error('Falta el identificador de la aprobación.');
  const presRef = doc(db, 'presupuestos', presupuestoId);
  const pre = await getDoc(presRef);
  if (!pre.exists()) throw new Error('El presupuesto no existe.');
  const p0 = { id: pre.id, ...pre.data() };
  if ((p0.aprobaciones || []).some((a) => a.id === aprobacionId)) {
    return { duplicado: true, obraId: p0.obraId || null, otNumber: '', obraCreada: false, aprobacion: null, jornadas: { ok: true } };
  }

  const obra0 = await buscarObraDePresupuesto(presupuestoId, p0.obraId);
  let otNumber = obra0?.otNumber || '';
  if (!obra0) {
    try { otNumber = formatObraNumber(await getNextSequenceValue('obrasSeq')); } catch (e) {
      console.error('Error generando OT sequence:', e);
      otNumber = `OT-${new Date().getFullYear()}-FALLBACK-${Math.floor(Math.random() * 1000)}`;
    }
  }
  const obraRef = obra0 ? doc(db, 'obras', obra0.id) : doc(collection(db, 'obras'));
  const jornadasObraId = obra0?.jornadasObraId || `ob_erp_${Date.now()}`;
  const ahora = new Date().toISOString();
  const nombre = nombreDe(user);
  const email = user?.email || 'Desconocido';

  const res = await runTransaction(db, async (tx) => {
    const ps = await tx.get(presRef);
    const os = obra0 ? await tx.get(obraRef) : null;
    if (!ps.exists()) throw new Error('El presupuesto no existe.');
    const p = { id: ps.id, ...ps.data() };
    if ((p.aprobaciones || []).some((a) => a.id === aprobacionId)) return { duplicado: true };
    const obraActual = os?.exists() ? { id: os.id, ...os.data() } : null;

    const filas = filasAprobacion(p, obraActual);
    const v = validarSeleccion(filas, seleccion);
    if (!v.ok) throw new Error(v.errores.join('\n'));

    // Aprobación anterior a la mejora: se conserva como registro (reconstruido desde la obra) antes de agregar la nueva.
    const previas = tieneDetalleAprobacion(p) ? p.aprobaciones : (esAprobacionHistorica(p) ? [registroAprobacionHistorica(p, obraActual)] : []);
    const numero = previas.filter((a) => a.tipo !== 'historica').length + 1;
    const rec = construirAprobacion({
      p, filas, cantidades: v.cantidades, id: aprobacionId, numero, fecha: ahora, usuario: nombre, email, origen,
      pagoDeclarado: pagoDeclarado ? { ...pagoDeclarado, manual: true, alcance: 'aprobado_acumulado' } : null, previas,
    });
    const aprobaciones = [...previas, rec];
    const resumen = resumenAprobacion(p, aprobaciones);
    const primera = p.status !== 'aprobado';
    const textoAprob = `Aprobación N° ${numero} (${rec.tipo}): ${rec.items.length} ítem(s) por ${ars(rec.importe)} — acumulado ${ars(resumen.importeAprobado)} de ${ars(resumen.importeCotizado)}`;

    if (!obraActual) {
      tx.set(obraRef, obraDesdePresupuesto({
        item: p, presupuestoId, otNumber, jornadasObraId, quoteItems: mergeItemsObra([], rec.items, p.quoteItems || []), tipoAprobacion: rec.tipo,
      }));
    } else {
      const texto = `${textoAprob}. Se incorporó a la obra solo el alcance nuevo (por ${nombre}).`;
      tx.update(obraRef, {
        quoteItems: mergeItemsObra(obraActual.quoteItems || [], rec.items, p.quoteItems || []),
        bitacoraPreview: texto,
        bitacoraHistory: [{ texto, fecha: ahora }, ...(obraActual.bitacoraHistory || [])],
      });
    }

    const upd = {
      status: 'aprobado',
      aprobaciones,
      aprobacionResumen: resumen,
      obraId: obraRef.id,
      bitacora: arrayUnion({
        tipo: 'aprobado', icono: '🏆', fecha: ahora, usuario: nombre, email,
        descripcion: primera ? `Presupuesto aprobado (${rec.tipo}) y convertido en Obra por ${nombre}. ${textoAprob}` : `${textoAprob} — por ${nombre}`,
      }),
    };
    if (primera) upd.statusHistory = arrayUnion({ status: 'aprobado', date: ahora, user: email, displayName: nombre });
    // Declaración manual de pago (no crea recibo, factura ni movimiento de caja). No toca `amount`.
    if (pagoDeclarado?.estado) upd.paymentStatus = pagoDeclarado.estado;
    tx.update(presRef, upd);
    return { duplicado: false, aprobacion: rec };
  });

  if (res.duplicado) return { duplicado: true, obraId: obraRef.id, otNumber, obraCreada: false, aprobacion: null, jornadas: { ok: true } };
  const jornadas = await sincronizarJornadas(obraRef.id);
  return { duplicado: false, obraId: obraRef.id, otNumber, obraCreada: !obra0, aprobacion: res.aprobacion, jornadas };
};

/**
 * Crea (o vincula) la obra en Euler Jornadas. Idempotente: usa obra.jornadasObraId y no pisa datos cargados en Jornadas.
 * @returns {Promise<{ ok: boolean, jornadasObraId?: string, error?: string }>}
 */
export const sincronizarJornadas = async (obraId) => {
  const ref = doc(db, 'obras', obraId);
  const s = await getDoc(ref);
  if (!s.exists()) return { ok: false, error: 'La obra no existe.' };
  const o = s.data();
  const jId = o.jornadasObraId || `ob_erp_${Date.now()}`;
  const fecha = new Date().toISOString();
  try {
    const jRef = doc(dbJornadas, 'obras', jId);
    const js = await getDoc(jRef);
    if (!js.exists()) {
      await setDoc(jRef, {
        id: jId, nombre: o.name || '', activa: true, lat: null, lng: null, radio: 200, radioTolerancia: 50,
        erpObraId: obraId, creadaDesdeERP: true, creadaEn: fecha,
      });
    } else if (js.data().erpObraId !== obraId) {
      await updateDoc(jRef, { erpObraId: obraId });
    }
    await updateDoc(ref, { jornadasObraId: jId, jornadasSync: { estado: 'ok', fecha } });
    return { ok: true, jornadasObraId: jId };
  } catch (e) {
    const error = e?.message || String(e);
    console.warn('Error al sincronizar la obra con Euler Jornadas:', e);
    await updateDoc(ref, { jornadasObraId: jId, jornadasSync: { estado: 'error', error: error.slice(0, 300), fecha } }).catch(() => {});
    return { ok: false, jornadasObraId: jId, error };
  }
};

/** Vincula un comprobante emitido con los ítems del presupuesto que factura (necesario para facturas ARCA). */
export const vincularFacturacion = async (presupuestoId, vinculo) => {
  await updateDoc(doc(db, 'presupuestos', presupuestoId), { facturacionItems: arrayUnion({ ...vinculo, registradoEn: new Date().toISOString() }) });
};

/** Reservado por artículo según la regla vigente (para mostrar disponible / faltante; no reserva nada). */
export const cargarReservadoPorArticulo = async () => {
  const [m, c, r] = await Promise.all([
    getDocs(collection(db, 'materiales_a_favor')), getDocs(collection(db, 'comprobantes_venta')), getDocs(collection(db, 'recibos')),
  ]);
  const map = (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }));
  return calcularReservas({ materiales: map(m), comprobantes: map(c), recibos: map(r) }).reservadoPor;
};

/** Remitos y materiales a favor relacionados con una obra / comprobantes (para no repetir salidas de stock). */
export const cargarEntregasRelacionadas = async ({ obraId = null, comprobanteIds = [] }) => {
  const map = (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }));
  const porId = (arr) => Object.values(Object.fromEntries(arr.map((x) => [x.id, x])));
  const consultas = [];
  if (obraId) {
    consultas.push(getDocs(query(collection(db, 'remitos_entrega'), where('obraId', '==', obraId))).then((s) => ['r', map(s)]));
    consultas.push(getDocs(query(collection(db, 'materiales_a_favor'), where('obraId', '==', obraId))).then((s) => ['m', map(s)]));
  }
  for (let i = 0; i < comprobanteIds.length; i += 10) {
    const lote = comprobanteIds.slice(i, i + 10);
    consultas.push(getDocs(query(collection(db, 'remitos_entrega'), where('comprobanteId', 'in', lote))).then((s) => ['r', map(s)]));
    consultas.push(getDocs(query(collection(db, 'materiales_a_favor'), where('comprobanteId', 'in', lote))).then((s) => ['m', map(s)]));
  }
  const res = await Promise.all(consultas);
  const materiales = porId(res.filter(([t]) => t === 'm').flatMap(([, x]) => x));
  const matIds = materiales.map((m) => m.id);
  const extra = [];
  for (let i = 0; i < matIds.length; i += 10) {
    extra.push(getDocs(query(collection(db, 'remitos_entrega'), where('materialId', 'in', matIds.slice(i, i + 10)))).then(map));
  }
  const remitos = porId([...res.filter(([t]) => t === 'r').flatMap(([, x]) => x), ...(await Promise.all(extra)).flat()]);
  return { remitos, materiales };
};
