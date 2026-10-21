/**
 * Ventas & Cobranzas – operaciones en Firestore.
 *   - Comprobante X (EULER CALEFACCIÓN, Canal 2, no fiscal) con numeración propia.
 *   - Recibos de cobro (ambas empresas) con múltiples medios, imputación a facturas y cobro a cuenta.
 *   - Anulaciones (con contra-asiento), materiales a favor del cliente, clientes rápidos.
 * Las numeraciones viven en configuracion/ventas y se incrementan dentro de transacciones.
 */
import {
  collection, doc, getDoc, getDocs, query, where, runTransaction, writeBatch, addDoc, updateDoc, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import { MEDIOS_COBRO, r2, claveBase } from './ventasCalculo';
import { registrarEntrega } from './remitosService';

export const EMPRESA_AYALA = 'ayala-nicolas';
export const EMPRESA_EULER = 'euler-calefaccion';

export const VENTAS_CONFIG_DEFAULT = {
  euler: {
    razonSocial: 'EULER CALEFACCIÓN',
    domicilio: 'Perez Bulnes 6044 - Rosario - Santa Fe',
    telefono: '341 569-5849',
    email: 'info@euler.com.ar',
    web: 'www.euler.com.ar',
    instagram: '@eulercalefaccion',
  },
  numeracion: {
    [EMPRESA_EULER]: { ptoVtaX: 1, ultimoX: 0, ptoVtaRec: 1, ultimoRec: 0, ultimoRecPrueba: 0 },
    [EMPRESA_AYALA]: { ptoVtaRec: 1, ultimoRec: 0, ultimoRecPrueba: 0 },
  },
  cuentasDestino: ['Banco Santander', 'Mercado Pago'],
};

const CFG_REF = () => doc(db, 'configuracion', 'ventas');

const mergeCfg = (data = {}) => ({
  ...VENTAS_CONFIG_DEFAULT,
  ...data,
  euler: { ...VENTAS_CONFIG_DEFAULT.euler, ...(data.euler || {}) },
  numeracion: {
    [EMPRESA_EULER]: { ...VENTAS_CONFIG_DEFAULT.numeracion[EMPRESA_EULER], ...(data.numeracion?.[EMPRESA_EULER] || {}) },
    [EMPRESA_AYALA]: { ...VENTAS_CONFIG_DEFAULT.numeracion[EMPRESA_AYALA], ...(data.numeracion?.[EMPRESA_AYALA] || {}) },
  },
  cuentasDestino: data.cuentasDestino?.length ? data.cuentasDestino : VENTAS_CONFIG_DEFAULT.cuentasDestino,
});

export const getVentasConfig = async () => {
  const s = await getDoc(CFG_REF());
  return mergeCfg(s.exists() ? s.data() : {});
};

export const saveVentasConfig = async (cfg) => {
  await setDoc(CFG_REF(), { ...cfg, updatedAt: new Date().toISOString() }, { merge: true });
};

export const formatoNumero = (pv, nro) => `${String(pv).padStart(5, '0')}-${String(nro).padStart(8, '0')}`;
export const hoyISO = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

const quien = (user) => user?.email || user?.uid || 'sistema';

const asientoDoc = ({ empresaId, fecha, concepto, origenDoc, origenId, lineas, asientoOriginalId = null }) => {
  const lim = lineas.filter((l) => Math.abs(Number(l.debe || 0)) > 0.0001 || Math.abs(Number(l.haber || 0)) > 0.0001)
    .map((l) => ({ cuentaCodigo: l.cuentaCodigo, cuentaNombre: l.cuentaNombre || '', debe: r2(l.debe), haber: r2(l.haber), obraId: l.obraId || null, centroCosto: l.centroCosto || 'General' }));
  const totalDebe = r2(lim.reduce((a, l) => a + l.debe, 0));
  const totalHaber = r2(lim.reduce((a, l) => a + l.haber, 0));
  if (Math.abs(totalDebe - totalHaber) > 0.05) throw new Error(`Asiento desbalanceado (Debe ${totalDebe} / Haber ${totalHaber}).`);
  return { empresaId, fecha, concepto, origenDoc, origenId, totalDebe, totalHaber, lineas: lim, asientoOriginalId, createdAt: serverTimestamp() };
};

const CXC = { cuentaCodigo: '1.1.05', cuentaNombre: 'Cuentas por Cobrar (Deudores por Ventas)' };
const VENTAS = { cuentaCodigo: '4.1.01', cuentaNombre: 'Ventas de Equipos e Instalaciones' };
const ANTICIPOS = { cuentaCodigo: '2.1.02', cuentaNombre: 'Anticipos de Clientes / Señas' };

const datosCliente = (cliente = {}) => {
  const base = {
    clienteId: cliente.id || null,
    clienteNombre: String(cliente.nombre || '').trim().toUpperCase(),
    clienteCuit: String(cliente.docNro || '').replace(/\D/g, ''),
    clienteTelefono: cliente.telefono || '',
    clienteDomicilio: cliente.domicilio || '',
    clienteCondicionIva: cliente.condicionIva || '',
  };
  return { ...base, clienteClave: cliente.clave || claveBase(base) };
};

// ─── Comprobante X (Canal 2 – no fiscal) ────────────────────────────────────

/**
 * @param {object} p { cliente:{id,nombre,docTipo,docNro,condicionIva,domicilio,telefono}, lineas:[{descripcion,cantidad,precioUnitario,entregaPendiente,unidad}],
 *                     presupuestoId?, presupuestoNumero?, obra?:{id,name,otNumber}, condicionVenta, notas, observaciones, fecha? }
 *  Los precios de las líneas son FINALES (el comprobante X no discrimina IVA).
 */
export const emitirComprobanteX = async (p, user) => {
  const lineas = (p.lineas || [])
    .map((l) => ({
      descripcion: String(l.descripcion || '').trim().slice(0, 250),
      cantidad: Number(l.cantidad) || 0,
      precioUnitario: r2(l.precioUnitario),
      unidad: l.unidad || '',
      entregaPendiente: !!l.entregaPendiente,
      listaItemId: l.listaItemId || null,
      // Trazabilidad con el ítem del presupuesto (opcional)
      presupuestoItemId: l.presupuestoItemId ? String(l.presupuestoItemId) : null,
      // Cantidad que queda como material a favor (menor si parte ya se entregó antes sin facturar)
      pendienteEntrega: l.cantidadPendienteEntrega !== undefined && l.cantidadPendienteEntrega !== null ? Number(l.cantidadPendienteEntrega) : null,
    }))
    .filter((l) => l.descripcion && l.cantidad > 0 && l.precioUnitario > 0)
    .map((l) => ({ ...l, neto: r2(l.cantidad * l.precioUnitario) }));
  const pendientesEntrega = lineas
    .filter((l) => l.entregaPendiente)
    .map((l) => ({ ...l, cantidad: l.pendienteEntrega ?? l.cantidad }))
    .filter((l) => l.cantidad > 0);
  lineas.forEach((l) => { delete l.pendienteEntrega; });
  if (!lineas.length) throw new Error('El comprobante no tiene líneas válidas.');
  const cli = datosCliente(p.cliente);
  if (!cli.clienteNombre) throw new Error('Falta el cliente.');
  const total = r2(lineas.reduce((a, l) => a + l.neto, 0));
  const fecha = p.fecha || hoyISO();

  return runTransaction(db, async (tx) => {
    const s = await tx.get(CFG_REF());
    const cfg = mergeCfg(s.exists() ? s.data() : {});
    const num = cfg.numeracion[EMPRESA_EULER];
    const nro = Number(num.ultimoX || 0) + 1;
    const pv = Number(num.ptoVtaX || 1);
    const ref = doc(collection(db, 'comprobantes_venta'));
    const numeroOriginal = formatoNumero(pv, nro);
    const comprobante = {
      origen: 'ERP_X',
      empresaId: EMPRESA_EULER,
      emisorRazonSocial: cfg.euler.razonSocial,
      ...cli,
      receptor: {
        nombre: cli.clienteNombre, docTipo: Number(p.cliente?.docTipo) || (cli.clienteCuit.length === 11 ? 80 : (cli.clienteCuit ? 96 : 99)),
        docNro: cli.clienteCuit, condicionIva: cli.clienteCondicionIva || 'Consumidor Final', domicilio: cli.clienteDomicilio,
      },
      presupuestoId: p.presupuestoId || null,
      presupuestoNumero: p.presupuestoNumero || '',
      obraId: p.obra?.id || null,
      obraNombre: p.obra?.name || '',
      otNumber: p.obra?.otNumber || '',
      tipoComprobante: 'FAX',
      letra: 'X',
      puntoVenta: pv,
      numeroComprobante: nro,
      numeroOriginal,
      fechaEmision: fecha,
      fechaContable: fecha,
      fechaVencimiento: p.fechaVencimiento || fecha,
      moneda: 'ARS',
      cotizacion: 1,
      subtotalNeto: total,
      totalIva: 0,
      totalExento: 0,
      totalComprobante: total,
      saldoPendiente: total,
      esNotaCredito: false,
      lineas,
      estado: 'emitido',
      condicionVenta: p.condicionVenta || 'Contado',
      notas: String(p.notas || '').slice(0, 300),
      observaciones: String(p.observaciones || '').slice(0, 500),
      emitidoPor: quien(user),
      createdAt: serverTimestamp(),
    };
    tx.set(ref, comprobante);
    tx.set(CFG_REF(), { numeracion: { [EMPRESA_EULER]: { ultimoX: nro } } }, { merge: true });
    tx.set(doc(collection(db, 'asientos_contables')), asientoDoc({
      empresaId: EMPRESA_EULER, fecha, concepto: `Venta FAX ${numeroOriginal} - ${cli.clienteNombre}`, origenDoc: `VENTA-${ref.id}`, origenId: ref.id,
      lineas: [{ ...CXC, debe: total, haber: 0, obraId: comprobante.obraId }, { ...VENTAS, debe: 0, haber: total, obraId: comprobante.obraId }],
    }));
    if (pendientesEntrega.length) {
      tx.set(doc(collection(db, 'materiales_a_favor')), materialDoc({
        empresaId: EMPRESA_EULER, cli, comprobanteId: ref.id, comprobanteColeccion: 'comprobantes_venta', comprobanteNumero: `FAX ${numeroOriginal}`, obraId: comprobante.obraId, fecha, lineas: pendientesEntrega, user,
      }));
    }
    return { ...comprobante, id: ref.id, createdAt: null };
  });
};

/** Anula un comprobante X (no fiscal). Requiere que no tenga cobros vigentes. */
export const anularComprobanteX = async (c, motivo, user) => {
  if (c.origen !== 'ERP_X') throw new Error('Solo se anulan así los comprobantes X. Las facturas fiscales se anulan con nota de crédito.');
  const batch = writeBatch(db);
  batch.update(doc(db, 'comprobantes_venta', c.id), { estado: 'anulado', anuladoPor: quien(user), anuladoEn: new Date().toISOString(), motivoAnulacion: motivo || '' });
  const total = Number(c.totalComprobante || 0);
  batch.set(doc(collection(db, 'asientos_contables')), asientoDoc({
    empresaId: c.empresaId, fecha: hoyISO(), concepto: `ANULACIÓN Venta FAX ${c.numeroOriginal} - ${c.clienteNombre}`, origenDoc: `ANUL-VENTA-${c.id}`, origenId: c.id,
    lineas: [{ ...VENTAS, debe: total, haber: 0, obraId: c.obraId }, { ...CXC, debe: 0, haber: total, obraId: c.obraId }],
  }));
  const mats = await getDocs(query(collection(db, 'materiales_a_favor'), where('comprobanteId', '==', c.id)));
  mats.forEach((m) => batch.update(m.ref, { estado: 'anulado' }));
  await batch.commit();
};

// ─── Recibos de cobro ───────────────────────────────────────────────────────

const limpiarMedio = (m) => {
  const def = MEDIOS_COBRO[m.tipo];
  if (!def) throw new Error(`Medio de cobro desconocido: ${m.tipo}`);
  const out = { tipo: m.tipo, importe: r2(m.importe) };
  def.campos.forEach((c) => { if (m[c] !== undefined && m[c] !== '') out[c] = m[c]; });
  return out;
};

/**
 * @param {object} p { empresaId, cliente, imputaciones:[{comprobanteId,coleccion,tipoComprobante,numeroOriginal,fechaEmision,totalComprobante,saldoAnterior,importe,notas}],
 *                     mediosPago:[{tipo,importe,...}], notas, fecha?, prueba?, saldoFavorDisponible? }
 */
export const registrarRecibo = async (p, user) => {
  const empresaId = p.empresaId;
  if (![EMPRESA_AYALA, EMPRESA_EULER].includes(empresaId)) throw new Error('Empresa inválida.');
  const cli = datosCliente(p.cliente);
  if (!cli.clienteNombre) throw new Error('Falta el cliente.');
  const medios = (p.mediosPago || []).filter((m) => Number(m.importe) > 0).map(limpiarMedio);
  if (!medios.length) throw new Error('Cargá al menos una forma de cobro.');
  const imputaciones = (p.imputaciones || []).filter((i) => Number(i.importe) > 0).map((i) => ({
    comprobanteId: i.comprobanteId, coleccion: i.coleccion || 'comprobantes_venta', tipoComprobante: i.tipoComprobante || '',
    numeroOriginal: i.numeroOriginal || '', fechaEmision: i.fechaEmision || '', totalComprobante: r2(i.totalComprobante),
    saldoAnterior: r2(i.saldoAnterior), importe: r2(i.importe), notas: String(i.notas || '').slice(0, 200),
  }));
  imputaciones.forEach((i) => { if (i.importe > i.saldoAnterior + 0.01) throw new Error(`El importe imputado a ${i.numeroOriginal} supera su saldo.`); });

  const total = r2(medios.reduce((a, m) => a + m.importe, 0));
  const imputado = r2(imputaciones.reduce((a, i) => a + i.importe, 0));
  if (imputado > total + 0.01) throw new Error('Lo imputado a comprobantes supera el total cobrado.');
  const aCuenta = r2(total - imputado);
  const usado = r2(medios.filter((m) => m.tipo === 'saldo_favor').reduce((a, m) => a + m.importe, 0));
  if (usado > 0 && usado > Number(p.saldoFavorDisponible || 0) + 0.01) throw new Error('El cliente no tiene saldo a favor suficiente.');
  if (usado > 0 && aCuenta > 0.01) throw new Error('Si usás saldo a favor, todo el recibo debe imputarse a comprobantes.');
  const prueba = !!p.prueba;
  const fecha = p.fecha || hoyISO();

  return runTransaction(db, async (tx) => {
    const s = await tx.get(CFG_REF());
    const cfg = mergeCfg(s.exists() ? s.data() : {});
    const num = cfg.numeracion[empresaId];
    const campo = prueba ? 'ultimoRecPrueba' : 'ultimoRec';
    const nro = Number(num[campo] || 0) + 1;
    const pv = Number(num.ptoVtaRec || 1);
    const numeroOriginal = prueba ? `P-${formatoNumero(pv, nro)}` : formatoNumero(pv, nro);
    const ref = doc(collection(db, 'recibos'));
    const recibo = {
      empresaId,
      tipoComprobante: 'REC',
      puntoVenta: pv,
      numero: nro,
      numeroOriginal,
      numeroRecibo: numeroOriginal,
      fechaEmision: fecha,
      ...cli,
      imputaciones,
      mediosPago: medios,
      totalRecibo: total,
      totalImputado: imputado,
      aCuenta,
      saldoFavorUsado: usado,
      notas: String(p.notas || '').slice(0, 300),
      estado: 'emitido',
      prueba,
      emitidoPor: quien(user),
      createdAt: serverTimestamp(),
    };
    tx.set(ref, recibo);
    tx.set(CFG_REF(), { numeracion: { [empresaId]: { [campo]: nro } } }, { merge: true });

    medios.forEach((m) => {
      if (m.tipo === 'cheque' || m.tipo === 'echeq') {
        tx.set(doc(collection(db, 'cheques')), {
          tipo: 'tercero', formato: m.tipo === 'echeq' ? 'echeq' : 'fisico', empresaId, reciboId: ref.id, reciboNumero: numeroOriginal,
          banco: m.banco || '', numero: m.numero || '', fechaPago: m.fechaPago || '', librador: m.librador || '', cuitLibrador: m.cuitLibrador || '',
          importe: m.importe, clienteNombre: cli.clienteNombre, clienteClave: cli.clienteClave, fechaRecepcion: fecha, estado: 'en_cartera', prueba,
          createdAt: serverTimestamp(),
        });
      }
      if (m.tipo === 'tarjeta_credito' || m.tipo === 'tarjeta_debito') {
        tx.set(doc(collection(db, 'tarjetas_cobrar')), {
          empresaId, reciboId: ref.id, clienteNombre: cli.clienteNombre, marca: m.marca || '', cuotas: Number(m.cuotas || 1), cupon: m.cupon || '',
          tipo: m.tipo, montoBruto: m.importe, comision: 0, retenciones: 0, montoNetoAcreditar: m.importe, estado: 'pendiente_acreditacion',
          fechaCobro: fecha, prueba, createdAt: serverTimestamp(),
        });
      }
    });

    if (!prueba) {
      const lineas = medios.map((m) => {
        const [cuentaCodigo, cuentaNombre] = MEDIOS_COBRO[m.tipo].cuenta;
        return { cuentaCodigo, cuentaNombre, debe: m.importe, haber: 0 };
      });
      lineas.push({ ...CXC, debe: 0, haber: imputado });
      if (aCuenta > 0) lineas.push({ ...ANTICIPOS, debe: 0, haber: aCuenta });
      tx.set(doc(collection(db, 'asientos_contables')), asientoDoc({
        empresaId, fecha, concepto: `Cobro Recibo ${numeroOriginal} - ${cli.clienteNombre}`, origenDoc: `REC-${ref.id}`, origenId: ref.id, lineas,
      }));
    }
    return { ...recibo, id: ref.id, createdAt: null };
  });
};

export const anularRecibo = async (r, motivo, user) => {
  const batch = writeBatch(db);
  batch.update(doc(db, 'recibos', r.id), { estado: 'anulado', anuladoPor: quien(user), anuladoEn: new Date().toISOString(), motivoAnulacion: motivo || '' });
  const cheques = await getDocs(query(collection(db, 'cheques'), where('reciboId', '==', r.id)));
  cheques.forEach((c) => batch.update(c.ref, { estado: 'anulado' }));
  const tarjetas = await getDocs(query(collection(db, 'tarjetas_cobrar'), where('reciboId', '==', r.id)));
  tarjetas.forEach((t) => batch.update(t.ref, { estado: 'anulado' }));
  if (!r.prueba) {
    const lineas = (r.mediosPago || []).map((m) => {
      const [cuentaCodigo, cuentaNombre] = (MEDIOS_COBRO[m.tipo] || MEDIOS_COBRO.efectivo).cuenta;
      return { cuentaCodigo, cuentaNombre, debe: 0, haber: Number(m.importe || 0) };
    });
    lineas.push({ ...CXC, debe: Number(r.totalImputado ?? r.totalRecibo) || 0, haber: 0 });
    if (Number(r.aCuenta) > 0) lineas.push({ ...ANTICIPOS, debe: Number(r.aCuenta), haber: 0 });
    batch.set(doc(collection(db, 'asientos_contables')), asientoDoc({
      empresaId: r.empresaId, fecha: hoyISO(), concepto: `ANULACIÓN Recibo ${r.numeroOriginal} - ${r.clienteNombre}`, origenDoc: `ANUL-REC-${r.id}`, origenId: r.id, lineas,
    }));
  }
  await batch.commit();
};

// ─── Materiales a favor ─────────────────────────────────────────────────────

function materialDoc({ empresaId, cli, comprobanteId = null, comprobanteColeccion = null, comprobanteNumero = '', obraId = null, fecha, lineas, user, nota = '', prueba = false }) {
  return {
    empresaId,
    ...cli,
    comprobanteId,
    comprobanteColeccion,
    comprobanteNumero,
    obraId: obraId || null,
    fecha: fecha || hoyISO(),
    items: lineas.map((l) => ({
      descripcion: l.descripcion, cantidad: Number(l.cantidad) || 0, cantidadEntregada: 0, unidad: l.unidad || '',
      precioUnitario: r2(l.precioUnitario), listaItemId: l.listaItemId || null,
      presupuestoItemId: l.presupuestoItemId ? String(l.presupuestoItemId) : null,
    })),
    entregas: [],
    estado: 'pendiente',
    nota,
    prueba,
    creadoPor: quien(user),
    createdAt: serverTimestamp(),
  };
}

/** Materiales pagados y no entregados de un comprobante fiscal (se llama después de emitir en ARCA). */
export const crearMaterialesAFavor = async ({ empresaId, cliente, comprobante, lineas, nota, prueba }, user) => {
  if (!lineas?.length) return null;
  const cli = datosCliente(cliente);
  const ref = await addDoc(collection(db, 'materiales_a_favor'), materialDoc({
    empresaId, cli, comprobanteId: comprobante?.id || null, comprobanteColeccion: comprobante?.coleccion || null, obraId: comprobante?.obraId || null,
    comprobanteNumero: comprobante ? `${comprobante.tipoComprobante} ${comprobante.numeroOriginal}` : '', fecha: comprobante?.fechaEmision, lineas, user, nota, prueba,
  }));
  return ref.id;
};

/**
 * entregas: { [indiceItem]: cantidad }
 * La entrega saca el material del depósito: descuenta el stock físico de los ítems vinculados a la lista de precios
 * (salvo materiales de prueba) y genera un remito de entrega para la conformidad del cliente.
 * La reserva baja sola porque se calcula en vivo.
 * @returns {Promise<object>} remito creado
 */
export const registrarEntregaMateriales = (mat, entregas, nota, user, { entregadoPor = '' } = {}) =>
  registrarEntrega({ mat, entregas, nota, entregadoPor }, user);

/** Vincula un ítem libre de materiales a favor con un artículo de la lista de precios (para que impacte en stock). */
export const vincularMaterialArticulo = async (mat, idx, articulo) => {
  const items = (mat.items || []).map((it, i) => (i === idx ? { ...it, listaItemId: articulo?.id || null, unidad: it.unidad || articulo?.unidad || '' } : it));
  await updateDoc(doc(db, 'materiales_a_favor', mat.id), { items });
};

// ─── Saldos iniciales (migración GesDatta) ──────────────────────────────────

/** importe: positivo = el cliente debe · negativo = saldo a favor del cliente. */
export const registrarSaldoInicial = async ({ empresaId, cliente, importe, fecha, detalle }, user) => {
  if (![EMPRESA_AYALA, EMPRESA_EULER].includes(empresaId)) throw new Error('Empresa inválida.');
  const cli = datosCliente(cliente);
  if (!cli.clienteNombre) throw new Error('Falta el cliente.');
  const imp = r2(importe);
  if (!imp) throw new Error('El importe no puede ser cero.');
  const ref = await addDoc(collection(db, 'saldos_iniciales'), {
    empresaId, ...cli, importe: imp, fecha: fecha || hoyISO(), detalle: String(detalle || 'Saldo inicial').slice(0, 200),
    estado: 'vigente', creadoPor: quien(user), createdAt: serverTimestamp(),
  });
  return ref.id;
};

export const anularSaldoInicial = async (s, motivo, user) => {
  await updateDoc(doc(db, 'saldos_iniciales', s.id), { estado: 'anulado', anuladoPor: quien(user), anuladoEn: new Date().toISOString(), motivoAnulacion: motivo || '' });
};

// ─── Clientes ───────────────────────────────────────────────────────────────

/** Normaliza un doc de `clientes` a los datos que usa facturación. */
export const clienteParaFacturar = (c = {}) => {
  const igual = c.facturacionIgualCliente !== false;
  const cuit = String((igual ? c.cuit : c.facturacionCuit) || c.cuit || '').replace(/\D/g, '');
  const dni = String((igual ? c.dni : c.facturacionDni) || c.dni || '').replace(/\D/g, '');
  const docNro = cuit.length === 11 ? cuit : (dni || (cuit.length >= 7 ? cuit : ''));
  const docTipo = docNro.length === 11 ? 80 : (docNro ? 96 : 99);
  return {
    id: c.id || null,
    nombre: String((igual ? (c.nombreCompleto || c.nombre || c.name) : (c.facturacionNombre || c.nombre || c.name)) || '').toUpperCase(),
    docTipo,
    docNro,
    condicionIva: c.condicionIva || (/^(30|33|34)/.test(cuit) ? 'IVA Responsable Inscripto' : 'Consumidor Final'),
    domicilio: (igual ? (c.direccionCompleta || c.direccion || c.address) : c.facturacionDireccion) || c.address || '',
    telefono: c.telefono || c.phone || c.telefonoNormalizado || '',
    email: c.email || '',
  };
};

export const crearClienteRapido = async (c) => {
  const nombre = String(c.nombre || '').trim().toUpperCase();
  if (!nombre) throw new Error('Falta el nombre del cliente.');
  const docNro = String(c.docNro || '').replace(/\D/g, '');
  const ref = await addDoc(collection(db, 'clientes'), {
    nombre, name: nombre, nombreCompleto: nombre, nombreBusqueda: nombre.toLowerCase(),
    cuit: docNro.length === 11 ? docNro : '', dni: docNro.length !== 11 ? docNro : '',
    phone: c.telefono || '', telefono: c.telefono || '', email: c.email || '',
    address: c.domicilio || '', direccion: c.domicilio || '', condicionIva: c.condicionIva || '',
    type: 'Cliente', createdAt: new Date().toISOString(), origen: 'facturacion',
  });
  return { ...c, id: ref.id, nombre };
};
