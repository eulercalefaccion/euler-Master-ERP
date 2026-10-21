/**
 * Cloud Functions de Facturación Electrónica ARCA.
 *   - arcaEstado         : diagnóstico (certificados, conexión, autenticación, último número).
 *   - arcaEmitirFactura  : emite Factura / Nota de Crédito A o B de una obra Canal 1 y obtiene el CAE.
 *
 * Solo usuarios administradores. La clave privada y los certificados viven en Secret Manager.
 */
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const arca = require('./arca');

const SECRETS = ['ARCA_KEY', 'ARCA_CERT_HOMO', 'ARCA_CERT_PROD'];
const runtime = functions.runWith({ secrets: SECRETS, timeoutSeconds: 120, memory: '256MB' });

const SUPER_ADMINS = ['nicolas@euler.com.ar', 'info@euler.com.ar', 'nfayala@gmail.com'];
const ADMINS = [
  'admin@eulercalefaccion.com', 'cindeaalvarez07@gmail.com',
  'cindea.alvarez@euler.com.ar', 'agustin.ayala@euler.com.ar',
];

const CONFIG_DEFAULT = {
  entorno: 'homologacion',
  cuit: '20316275622',
  razonSocial: 'AYALA NICOLAS FEDERICO',
  domicilio: 'Perez Bulnes 6044 - Rosario - Santa Fe',
  condicionIva: 'IVA Responsable Inscripto',
  ingresosBrutos: '',
  inicioActividades: '',
  puntoVentaHomo: 1,
  puntoVentaProd: null,
  conceptoDefault: 3, // Productos y Servicios
  empresaId: 'ayala-nicolas',
};

const HttpsError = functions.https.HttpsError;

// ─── Helpers ────────────────────────────────────────────────────────────────

async function assertAdmin(context) {
  if (!context.auth) throw new HttpsError('unauthenticated', 'Debés iniciar sesión.');
  const email = context.auth.token?.email || '';
  if (SUPER_ADMINS.includes(email) || ADMINS.includes(email)) return;
  const u = await admin.firestore().collection('users').doc(context.auth.uid).get();
  if (u.exists && u.data().role === 'administrador') return;
  throw new HttpsError('permission-denied', 'Solo un administrador puede emitir comprobantes fiscales.');
}

async function getConfig(db) {
  const snap = await db.collection('configuracion').doc('arca').get();
  const cfg = { ...CONFIG_DEFAULT, ...(snap.exists ? snap.data() : {}) };
  cfg.cuit = String(cfg.cuit).replace(/\D/g, '');
  cfg.puntoVenta = Number(cfg.entorno === 'produccion' ? cfg.puntoVentaProd : cfg.puntoVentaHomo) || null;
  return cfg;
}

function toHttpsError(e) {
  if (e instanceof HttpsError) return e;
  if (e instanceof arca.ArcaError) {
    return new HttpsError('failed-precondition', e.message, { code: e.code, detalles: e.detalles });
  }
  console.error('[ARCA] Error inesperado', e);
  return new HttpsError('internal', `Error comunicando con ARCA: ${e.message}`);
}

function cuitValido(cuit) {
  const c = String(cuit).replace(/\D/g, '');
  if (c.length !== 11) return false;
  const mult = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = mult.reduce((acc, m, i) => acc + m * Number(c[i]), 0);
  let dv = 11 - (sum % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) dv = 9;
  return dv === Number(c[10]);
}

function resumenErrores(r) {
  return [...r.errores, ...r.observaciones].map((x) => `[${x.code}] ${x.msg}`).join(' | ');
}

// ─── arcaEstado ─────────────────────────────────────────────────────────────

exports.arcaEstado = runtime.https.onCall(async (data, context) => {
  await assertAdmin(context);
  const db = admin.firestore();
  const cfg = await getConfig(db);
  const entorno = cfg.entorno;

  const estado = {
    entorno,
    cuit: cfg.cuit,
    puntoVenta: cfg.puntoVenta,
    certificados: {
      homologacion: arca.infoCertificado('homologacion'),
      produccion: arca.infoCertificado('produccion'),
    },
    servidores: null,
    autenticacion: null,
    puntosVentaHabilitados: null,
    ultimos: null,
  };

  try {
    estado.servidores = await arca.feDummy(entorno);
  } catch (e) {
    estado.servidores = { error: e.message };
  }

  try {
    const ticket = await arca.obtenerTicket(db, entorno);
    estado.autenticacion = { ok: true };
    try {
      estado.puntosVentaHabilitados = await arca.puntosDeVenta(entorno, ticket, cfg.cuit);
    } catch (e) {
      estado.puntosVentaHabilitados = { error: e.message };
    }
    if (cfg.puntoVenta) {
      try {
        const [fa, fb] = await Promise.all([
          arca.ultimoAutorizado(entorno, ticket, cfg.cuit, cfg.puntoVenta, arca.CBTE_TIPO.FA),
          arca.ultimoAutorizado(entorno, ticket, cfg.cuit, cfg.puntoVenta, arca.CBTE_TIPO.FB),
        ]);
        estado.ultimos = { facturaA: fa, facturaB: fb };
      } catch (e) {
        estado.ultimos = { error: e.message };
      }
    }
  } catch (e) {
    estado.autenticacion = { ok: false, error: e.message, code: e.code || null };
  }

  return estado;
});

// ─── arcaEmitirFactura ──────────────────────────────────────────────────────

/**
 * data = {
 *   obraId?: string,                        // obra Canal 1 (canal 'iva') – opcional
 *   clienteId?, presupuestoId?, presupuestoNumero?, clienteTelefono?   // si no hay obra
 *   comprobanteAsociadoId?: string,         // si viene => Nota de Crédito sobre ese comprobante
 *   receptor: { nombre, docTipo, docNro, condicionIvaId, domicilio },
 *   lineas: [{ descripcion, cantidad, precioUnitario }],   // precios NETOS (sin IVA)
 *   concepto?: 1|2|3, fchServDesde?: 'YYYY-MM-DD', fchServHasta?, fchVtoPago?,
 *   observaciones?: string
 * }
 */
exports.arcaEmitirFactura = runtime.https.onCall(async (data, context) => {
  await assertAdmin(context);
  const db = admin.firestore();
  const cfg = await getConfig(db);
  const entorno = cfg.entorno;
  const esProduccion = entorno === 'produccion';
  const coleccion = esProduccion ? 'comprobantes_venta' : 'arca_pruebas';
  const campoObra = esProduccion ? 'facturasArca' : 'facturasArcaPrueba';

  try {
    if (!cfg.puntoVenta) {
      throw new HttpsError('failed-precondition', `No hay punto de venta configurado para ${entorno}.`);
    }

    // 1. Obra (opcional: también se factura desde un presupuesto o con ítems libres) ──
    const obraId = String(data?.obraId || '');
    let obra = null;
    if (obraId) {
      const obraSnap = await db.collection('obras').doc(obraId).get();
      if (!obraSnap.exists) throw new HttpsError('not-found', 'La obra no existe.');
      obra = obraSnap.data();
      const canal = obra.canal || 'iva';
      if (canal !== 'iva') {
        throw new HttpsError('failed-precondition', 'Esta obra no es Canal 1 (con factura). No se puede facturar en ARCA.');
      }
    }

    // 2. Comprobante asociado (Nota de Crédito) ───────────────────────────────
    let asociado = null;
    if (data?.comprobanteAsociadoId) {
      const aSnap = await db.collection(coleccion).doc(String(data.comprobanteAsociadoId)).get();
      if (!aSnap.exists) throw new HttpsError('not-found', 'No se encontró el comprobante a anular/acreditar.');
      asociado = { id: aSnap.id, ...aSnap.data() };
      if ((asociado.obraId || '') !== obraId) throw new HttpsError('invalid-argument', 'El comprobante asociado no pertenece a esta obra.');
      if (asociado.esNotaCredito) throw new HttpsError('invalid-argument', 'No se puede hacer una nota de crédito sobre otra nota de crédito.');
    }

    // 3. Receptor ─────────────────────────────────────────────────────────────
    const rx = data?.receptor || {};
    const nombre = String(rx.nombre || '').trim();
    const condicionIvaId = Number(rx.condicionIvaId);
    let docTipo = Number(rx.docTipo);
    let docNro = String(rx.docNro || '').replace(/\D/g, '');
    if (!nombre) throw new HttpsError('invalid-argument', 'Falta el nombre / razón social del receptor.');
    if (!arca.CONDICION_IVA[condicionIvaId]) throw new HttpsError('invalid-argument', 'Condición frente al IVA del receptor inválida.');

    const letra = asociado ? asociado.letra : (arca.CONDICIONES_CLASE_A.includes(condicionIvaId) ? 'A' : 'B');
    if (letra === 'A') {
      if (docTipo !== arca.DOC_TIPO.CUIT || !cuitValido(docNro)) {
        throw new HttpsError('invalid-argument', 'Para Factura A el receptor debe tener un CUIT válido.');
      }
    } else {
      if (docTipo === arca.DOC_TIPO.SIN_ID || !docNro) {
        docTipo = arca.DOC_TIPO.SIN_ID;
        docNro = '0';
      } else if ([arca.DOC_TIPO.CUIT, arca.DOC_TIPO.CUIL].includes(docTipo) && !cuitValido(docNro)) {
        throw new HttpsError('invalid-argument', 'El CUIT/CUIL del receptor no es válido.');
      } else if (docTipo === arca.DOC_TIPO.DNI && (docNro.length < 7 || docNro.length > 8)) {
        throw new HttpsError('invalid-argument', 'El DNI del receptor no es válido.');
      }
    }

    const cbteTipo = asociado
      ? (letra === 'A' ? arca.CBTE_TIPO.NCA : arca.CBTE_TIPO.NCB)
      : (letra === 'A' ? arca.CBTE_TIPO.FA : arca.CBTE_TIPO.FB);

    // 4. Líneas e importes (se recalculan SIEMPRE en el servidor) ────────────
    const lineas = (Array.isArray(data?.lineas) ? data.lineas : [])
      .map((l) => ({
        descripcion: String(l.descripcion || '').trim().slice(0, 250),
        cantidad: Number(l.cantidad),
        precioUnitario: arca.round2(Number(l.precioUnitario)),
        entregaPendiente: !!l.entregaPendiente,
        // Trazabilidad opcional con el ítem del presupuesto y el artículo de la lista de precios
        presupuestoItemId: l.presupuestoItemId ? String(l.presupuestoItemId).slice(0, 80) : null,
        listaItemId: l.listaItemId ? String(l.listaItemId).slice(0, 80) : null,
      }))
      .filter((l) => l.descripcion && l.cantidad > 0 && l.precioUnitario > 0);
    if (!lineas.length) throw new HttpsError('invalid-argument', 'El comprobante no tiene líneas válidas.');
    lineas.forEach((l) => { l.neto = arca.round2(l.cantidad * l.precioUnitario); });

    const impNeto = arca.round2(lineas.reduce((a, l) => a + l.neto, 0));
    const impIva = arca.round2(impNeto * 0.21);
    const impTotal = arca.round2(impNeto + impIva);
    if (asociado && impTotal > Number(asociado.totalComprobante) + 0.01) {
      throw new HttpsError('invalid-argument', 'La nota de crédito no puede superar el total del comprobante original.');
    }

    // 5. Fechas ───────────────────────────────────────────────────────────────
    const hoy = arca.fechaAR();
    const concepto = [1, 2, 3].includes(Number(data?.concepto)) ? Number(data.concepto) : Number(cfg.conceptoDefault) || 3;
    const fchServDesde = arca.isoToYyyymmdd(data?.fchServDesde) || hoy.yyyymmdd;
    const fchServHasta = arca.isoToYyyymmdd(data?.fchServHasta) || hoy.yyyymmdd;
    let fchVtoPago = arca.isoToYyyymmdd(data?.fchVtoPago) || hoy.yyyymmdd;
    if (fchVtoPago < hoy.yyyymmdd) fchVtoPago = hoy.yyyymmdd;
    if (concepto !== 1 && fchServHasta < fchServDesde) {
      throw new HttpsError('invalid-argument', 'La fecha "servicio hasta" no puede ser anterior a "servicio desde".');
    }

    // 6. Lock de numeración ───────────────────────────────────────────────────
    const lockRef = db.collection('arca_locks').doc(`${entorno}_${cfg.puntoVenta}_${cbteTipo}`);
    const lockOwner = `${context.auth.uid}_${Date.now()}`;
    const lockData = await db.runTransaction(async (tx) => {
      const s = await tx.get(lockRef);
      const d = s.exists ? s.data() : {};
      if (d.lockedUntil && d.lockedUntil.toMillis() > Date.now()) {
        throw new HttpsError('aborted', 'Hay otro comprobante del mismo tipo emitiéndose en este momento. Reintentá en unos segundos.');
      }
      tx.set(lockRef, { lockedUntil: admin.firestore.Timestamp.fromMillis(Date.now() + 90 * 1000), owner: lockOwner }, { merge: true });
      return d;
    });

    const liberarLock = (extra = {}) => lockRef.set({ lockedUntil: null, owner: null, ...extra }, { merge: true });

    try {
      const ticket = await arca.obtenerTicket(db, entorno);

      // 6.b Recuperar una emisión que quedó interrumpida (timeout / caída) ─────
      if (lockData.pendiente) {
        const p = lockData.pendiente;
        const existente = await arca.consultarComprobante(entorno, ticket, cfg.cuit, cfg.puntoVenta, cbteTipo, p.nro);
        if (existente && existente.CodAutorizacion && existente.Resultado === 'A') {
          await persistir(db, { ...p.contexto, cae: existente.CodAutorizacion, caeVto: existente.FchVto, observacionesArca: [], recuperado: true });
        }
        await lockRef.set({ pendiente: admin.firestore.FieldValue.delete() }, { merge: true });
      }

      // 7. Número y solicitud de CAE ──────────────────────────────────────────
      const ultimo = await arca.ultimoAutorizado(entorno, ticket, cfg.cuit, cfg.puntoVenta, cbteTipo);
      const nro = ultimo + 1;

      const contexto = {
        coleccion, campoObra, entorno, cfg: { cuit: cfg.cuit, razonSocial: cfg.razonSocial, empresaId: cfg.empresaId },
        obraId: obraId || null, obraNombre: obra?.name || '', otNumber: obra?.otNumber || '',
        presupuestoId: obra?.presupuestoId || (data?.presupuestoId ? String(data.presupuestoId) : null),
        presupuestoNumero: String(data?.presupuestoNumero || obra?.presupuestoNum || '').slice(0, 60),
        clienteId: obra?.clientId || (data?.clienteId ? String(data.clienteId) : null),
        clienteTelefono: String(data?.clienteTelefono || '').slice(0, 40),
        cbteTipo, letra, ptoVta: cfg.puntoVenta, nro, fecha: hoy.yyyymmdd, concepto,
        fchServDesde: concepto === 1 ? null : fchServDesde,
        fchServHasta: concepto === 1 ? null : fchServHasta,
        fchVtoPago: concepto === 1 ? null : fchVtoPago,
        receptor: {
          nombre, docTipo, docNro, condicionIvaId,
          condicionIva: arca.CONDICION_IVA[condicionIvaId],
          domicilio: String(rx.domicilio || '').trim(),
        },
        lineas, impNeto, impIva, impTotal,
        asociado: asociado ? { id: asociado.id, cbteTipo: asociado.cbteTipo, ptoVta: asociado.puntoVenta, nro: asociado.numeroComprobante, fecha: arca.isoToYyyymmdd(asociado.fechaEmision), numeroOriginal: asociado.numeroOriginal } : null,
        observaciones: String(data?.observaciones || '').slice(0, 500),
        condicionVenta: String(data?.condicionVenta || 'Contado').slice(0, 60),
        notas: String(data?.notas || '').slice(0, 300),
        emitidoPor: context.auth.token?.email || context.auth.uid,
      };

      await lockRef.set({ pendiente: { nro, contexto } }, { merge: true });

      const r = await arca.solicitarCAE(entorno, ticket, cfg.cuit, {
        ptoVta: cfg.puntoVenta, cbteTipo, concepto, docTipo, docNro, nro, fecha: hoy.yyyymmdd,
        impTotal, impNeto, impIva,
        fchServDesde, fchServHasta, fchVtoPago,
        condicionIvaReceptor: condicionIvaId,
        cbteAsoc: contexto.asociado ? { tipo: contexto.asociado.cbteTipo, ptoVta: contexto.asociado.ptoVta, nro: contexto.asociado.nro, fecha: contexto.asociado.fecha } : null,
      });

      if (r.resultado !== 'A' || !r.cae) {
        await liberarLock({ pendiente: admin.firestore.FieldValue.delete() });
        throw new HttpsError('failed-precondition', `ARCA rechazó el comprobante: ${resumenErrores(r) || 'sin detalle'}`, { errores: r.errores, observaciones: r.observaciones });
      }

      const guardado = await persistir(db, { ...contexto, cae: r.cae, caeVto: r.caeVto, observacionesArca: r.observaciones });
      await liberarLock({ pendiente: admin.firestore.FieldValue.delete(), ultimoNro: nro });
      return guardado;
    } catch (e) {
      // Si el error fue de red DESPUÉS de pedir el CAE, el "pendiente" queda guardado y
      // se resuelve automáticamente en el próximo intento. Solo liberamos el lock.
      await liberarLock().catch(() => {});
      throw e;
    }
  } catch (e) {
    throw toHttpsError(e);
  }
});

/** Guarda el comprobante autorizado, el asiento contable (solo producción) y lo vincula a la obra. */
async function persistir(db, c) {
  const docRef = db.collection(c.coleccion).doc();
  const esNC = c.cbteTipo === arca.CBTE_TIPO.NCA || c.cbteTipo === arca.CBTE_TIPO.NCB;
  const numeroOriginal = `${String(c.ptoVta).padStart(5, '0')}-${String(c.nro).padStart(8, '0')}`;
  const fechaIso = arca.yyyymmddToIso(c.fecha);
  const qrUrl = arca.urlQR({
    fechaIso, cuit: c.cfg.cuit, ptoVta: c.ptoVta, cbteTipo: c.cbteTipo, nro: c.nro,
    impTotal: c.impTotal, docTipo: c.receptor.docTipo, docNro: c.receptor.docNro, cae: c.cae,
  });

  const comprobante = {
    origen: 'ARCA_WS',
    entornoArca: c.entorno,
    empresaId: c.cfg.empresaId,
    emisorCuit: c.cfg.cuit,
    emisorRazonSocial: c.cfg.razonSocial,
    clienteId: c.clienteId,
    clienteNombre: c.receptor.nombre,
    clienteCuit: c.receptor.docTipo === arca.DOC_TIPO.SIN_ID ? '' : c.receptor.docNro,
    receptor: c.receptor,
    presupuestoId: c.presupuestoId,
    presupuestoNumero: c.presupuestoNumero || '',
    clienteTelefono: c.clienteTelefono || '',
    obraId: c.obraId,
    obraNombre: c.obraNombre,
    otNumber: c.otNumber,
    tipoComprobante: arca.CBTE_SIGLA[c.cbteTipo],
    cbteTipo: c.cbteTipo,
    letra: c.letra,
    puntoVenta: c.ptoVta,
    numeroComprobante: c.nro,
    numeroOriginal,
    cae: String(c.cae),
    vencimientoCae: arca.yyyymmddToIso(c.caeVto),
    qrUrl,
    concepto: c.concepto,
    fchServDesde: arca.yyyymmddToIso(c.fchServDesde),
    fchServHasta: arca.yyyymmddToIso(c.fchServHasta),
    fechaEmision: fechaIso,
    fechaContable: fechaIso,
    fechaVencimiento: arca.yyyymmddToIso(c.fchVtoPago) || fechaIso,
    moneda: 'ARS',
    cotizacion: 1,
    subtotalNeto: c.impNeto,
    totalIva: c.impIva,
    totalExento: 0,
    totalComprobante: c.impTotal,
    saldoPendiente: esNC ? 0 : c.impTotal,
    esNotaCredito: esNC,
    comprobanteAsociado: c.asociado,
    lineas: c.lineas.map((l) => ({
      itemId: null,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      precioUnitario: l.precioUnitario,
      descuento: 0,
      neto: l.neto,
      alicuotaIva: 0.21,
      cuentaCodigo: '4.1.01',
      cuentaNombre: 'Ventas de Equipos e Instalaciones',
      centroCosto: 'General',
      obraId: c.obraId,
      entregaPendiente: !!l.entregaPendiente,
      presupuestoItemId: l.presupuestoItemId || null,
      listaItemId: l.listaItemId || null,
    })),
    estado: esNC ? 'aplicada' : 'pendiente',
    observaciones: c.observaciones,
    condicionVenta: c.condicionVenta || 'Contado',
    notas: c.notas || '',
    observacionesArca: c.observacionesArca || [],
    recuperado: !!c.recuperado,
    emitidoPor: c.emitidoPor,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const batch = db.batch();
  batch.set(docRef, comprobante);

  // Asiento contable (mismo esquema que ventasService.crearComprobanteVenta) – solo comprobantes reales
  if (c.entorno === 'produccion') {
    const cxc = { cuentaCodigo: '1.1.05', cuentaNombre: 'Cuentas por Cobrar (Deudores por Ventas)', obraId: c.obraId, centroCosto: 'General' };
    const ventas = { cuentaCodigo: '4.1.01', cuentaNombre: 'Ventas de Equipos e Instalaciones', obraId: c.obraId, centroCosto: 'General' };
    const iva = { cuentaCodigo: '2.1.04', cuentaNombre: 'IVA Débito Fiscal', obraId: null, centroCosto: 'General' };
    const lineasAsiento = esNC
      ? [{ ...ventas, debe: c.impNeto, haber: 0 }, { ...iva, debe: c.impIva, haber: 0 }, { ...cxc, debe: 0, haber: c.impTotal }]
      : [{ ...cxc, debe: c.impTotal, haber: 0 }, { ...ventas, debe: 0, haber: c.impNeto }, { ...iva, debe: 0, haber: c.impIva }];
    batch.set(db.collection('asientos_contables').doc(), {
      empresaId: c.cfg.empresaId,
      fecha: fechaIso,
      concepto: `Venta ${comprobante.tipoComprobante} ${numeroOriginal} - ${c.receptor.nombre}`,
      origenDoc: `VENTA-${docRef.id}`,
      origenId: docRef.id,
      totalDebe: c.impTotal,
      totalHaber: c.impTotal,
      lineas: lineasAsiento,
      asientoOriginalId: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    if (esNC && c.asociado?.id) {
      batch.update(db.collection(c.coleccion).doc(c.asociado.id), {
        saldoPendiente: admin.firestore.FieldValue.increment(-c.impTotal),
      });
    }
  }

  const resumen = {
    id: docRef.id,
    tipoComprobante: comprobante.tipoComprobante,
    letra: c.letra,
    numeroOriginal,
    fechaEmision: fechaIso,
    total: c.impTotal,
    cae: String(c.cae),
    esNotaCredito: esNC,
    asociadoId: c.asociado?.id || null,
    receptor: c.receptor.nombre,
  };
  if (c.obraId) {
    const etiqueta = `${esNC ? 'Nota de Crédito' : 'Factura'} ${c.letra} ${numeroOriginal}`;
    const textoBitacora = `${c.entorno === 'produccion' ? '' : '[PRUEBA ARCA] '}${etiqueta} emitida en ARCA por $ ${c.impTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })} – CAE ${c.cae}`;
    const obraRef = db.collection('obras').doc(c.obraId);
    const obraActual = (await obraRef.get()).data() || {};
    batch.update(obraRef, {
      [c.campoObra]: admin.firestore.FieldValue.arrayUnion(resumen),
      bitacoraPreview: textoBitacora,
      bitacoraHistory: [
        { texto: textoBitacora, fecha: new Date().toISOString(), autor: c.emitidoPor },
        ...(obraActual.bitacoraHistory || []),
      ],
    });
  }

  await batch.commit();
  return { ...comprobante, id: docRef.id, coleccion: c.coleccion, createdAt: null };
}
