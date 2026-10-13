import { db } from './firebaseConfig';
import { collection, getDocs, getDoc, addDoc, doc, updateDoc, query, where, orderBy, serverTimestamp, increment } from 'firebase/firestore';
import { registrarAsientoContable } from './contabilidadService';

export const ALICUOTAS_IVA = [
  { val: 0.21, label: '21%' },
  { val: 0.105, label: '10.5%' },
  { val: 0.27, label: '27%' },
  { val: 0.0, label: 'Exento / 0%' }
];

export const getCompras = async (empresaId = null) => {
  try {
    const q = empresaId 
      ? query(collection(db, 'comprobantes_compra'), where('empresaId', '==', empresaId), orderBy('fechaEmision', 'desc'))
      : query(collection(db, 'comprobantes_compra'), orderBy('fechaEmision', 'desc'));
    
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('Error cargando compras:', error);
    return [];
  }
};

/** Línea de la factura que es el flete/transporte (no es mercadería). */
export const RE_FLETE = /\b(flete|fletes|transporte|env[ií]o|encomienda|acarreo)\b/i;
export const esLineaFlete = (l) => !l.itemId && RE_FLETE.test(String(l.descripcion || ''));

/** Precio unitario neto efectivo (con descuento) de una línea de compra. */
export const precioNetoLinea = (l) => {
  const pu = Number(l.precioUnitario || 0);
  if (l.precioConDto !== undefined && l.precioConDto !== null && l.precioConDto !== '' && Number(l.precioConDto) > 0) return Number(l.precioConDto);
  return pu * (1 - Number(l.descuentoPorc || 0) / 100);
};
export const netoLineaCompra = (l) => Math.round(((Number(l.cantidad || 1) * precioNetoLinea(l)) - Number(l.descuento || 0)) * 100) / 100;

/**
 * Costo unitario "puesto en depósito" de cada línea de mercadería: precio neto con descuento + flete prorrateado
 * por importe (flete asignado a la compra + líneas de flete de la misma factura).
 */
export const costosConFlete = (compra) => {
  const lineas = compra.lineas || [];
  // Compras en moneda extranjera: se pasan a pesos con la cotización de la compra
  const tc = compra.moneda && compra.moneda !== 'ARS' ? Number(compra.cotizacion || 1) : 1;
  const merc = lineas.filter((l) => !esLineaFlete(l));
  const netoMerc = merc.reduce((a, l) => a + netoLineaCompra(l), 0) * tc;
  const flete = Number(compra.fleteARS || 0) + lineas.filter(esLineaFlete).reduce((a, l) => a + netoLineaCompra(l), 0) * tc;
  const pct = netoMerc > 0 ? flete / netoMerc : 0;
  return { pctFlete: pct, flete, lineas: merc.map((l) => ({ ...l, costoUnitSinFlete: precioNetoLinea(l) * tc, costoUnit: precioNetoLinea(l) * tc * (1 + pct) })) };
};

export const crearComprobanteCompra = async (compraData) => {
  const {
    gesdattaId = null,
    empresaId = 'euler-calefaccion',
    proveedorId,
    proveedorNombre,
    proveedorCuit,
    tipoComprobante = 'FAA', // FAA, FAB, FAC, TICKET, NCA, NDA, GASTO_DIRECTO
    puntoVenta = 1,
    numeroComprobante,
    fechaEmision,
    fechaContable = fechaEmision,
    fechaVencimiento = fechaEmision,
    moneda = 'ARS',
    cotizacion = 1,
    lineas = [],
    ingresaStock = false,
    fleteARS = 0,
    estado = 'pendiente', // pendiente, parcial, pagado
    adjuntoUrl = null,
    observaciones = ''
  } = compraData;

  // Calcular subtotal, IVA, exentos y total (respeta el % de descuento / precio con descuento de cada línea)
  let subtotalNeto = 0;
  let totalIva = 0;
  let totalExento = 0;

  lineas.forEach(l => {
    const netoLinea = netoLineaCompra(l);
    const alicuota = Number(l.alicuotaIva ?? 0.21);

    subtotalNeto += netoLinea;
    if (alicuota > 0) {
      totalIva += (netoLinea * alicuota);
    } else {
      totalExento += netoLinea;
    }
  });

  const totalComprobante = Math.round((subtotalNeto + totalIva) * 100) / 100;

  const docData = {
    gesdattaId,
    empresaId,
    proveedorId,
    proveedorNombre,
    proveedorCuit: proveedorCuit || '',
    tipoComprobante,
    puntoVenta: Number(puntoVenta),
    numeroComprobante,
    numeroOriginal: `${String(puntoVenta).padStart(5, '0')}-${String(numeroComprobante).padStart(8, '0')}`,
    fechaEmision,
    fechaContable,
    fechaVencimiento,
    moneda,
    cotizacion: Number(cotizacion),
    subtotalNeto: Math.round(subtotalNeto * 100) / 100,
    totalIva: Math.round(totalIva * 100) / 100,
    totalExento: Math.round(totalExento * 100) / 100,
    totalComprobante,
    saldoPendiente: totalComprobante,
    lineas: lineas.map(l => ({
      itemId: l.itemId || null,
      descripcion: l.descripcion || '',
      cantidad: Number(l.cantidad || 1),
      unidad: l.unidad || 'unidades',
      precioUnitario: Number(l.precioUnitario || 0),
      descuentoPorc: Number(l.descuentoPorc || 0),
      precioConDto: Math.round(precioNetoLinea(l) * 100) / 100,
      descuento: Number(l.descuento || 0),
      neto: netoLineaCompra(l),
      alicuotaIva: Number(l.alicuotaIva ?? 0.21),
      cuentaCodigo: l.cuentaCodigo || '5.1.01',
      cuentaNombre: l.cuentaNombre || 'Costo de Mercadería Vendida (CMV)',
      centroCosto: l.centroCosto || 'COSTO VARIABLE',
      obraId: l.obraId || null
    })),
    ingresaStock,
    // Flete de traslado (p. ej. Bs. As. → Rosario) asignado a esta compra para el costo; no suma al total de esta factura.
    fleteARS: Math.round(Number(fleteARS || 0) * 100) / 100,
    estado,
    adjuntoUrl,
    observaciones,
    createdAt: serverTimestamp()
  };

  // Guardar en Firestore
  const docRef = await addDoc(collection(db, 'comprobantes_compra'), docData);

  // Si ingresa a stock y tiene itemId: suma stock y registra el último costo de compra (con flete prorrateado)
  if (ingresaStock) {
    const { lineas: conCosto } = costosConFlete(docData);
    for (const line of conCosto) {
      if (line.itemId) {
        try {
          await updateDoc(doc(db, 'lista_precios', line.itemId), {
            stock: increment(Number(line.cantidad || 1)),
            stockActualizadoEn: new Date().toISOString()
          });
        } catch (e) {
          console.error('Error actualizando stock por compra:', e);
        }
        try {
          await updateDoc(doc(db, 'lista_precios', line.itemId), {
            ultimoCostoARS: Math.round(line.costoUnit * 100) / 100,
            ultimoCostoSinFleteARS: Math.round(line.costoUnitSinFlete * 100) / 100,
            ultimaCompraFecha: fechaEmision || new Date().toISOString().slice(0, 10),
            ultimaCompraProveedor: proveedorNombre || '',
            ultimaCompraId: docRef.id,
          });
        } catch (e) {
          console.warn('No se pudo registrar el último costo de compra:', e);
        }
      }
    }
  }

  // Generar Asiento Contable Automático
  // Debe: Costo/Stock + IVA Crédito
  // Haber: Proveedores
  const lineasAsiento = [];
  lineas.forEach(l => {
    const neto = netoLineaCompra(l);
    lineasAsiento.push({
      cuentaCodigo: l.cuentaCodigo || (ingresaStock ? '1.1.07' : '5.1.01'),
      cuentaNombre: l.cuentaNombre || (ingresaStock ? 'Bienes de Cambio / Stock' : 'Costo de Mercadería Vendida'),
      debe: neto,
      haber: 0,
      obraId: l.obraId || null,
      centroCosto: l.centroCosto || 'COSTO VARIABLE'
    });
  });

  if (totalIva > 0) {
    lineasAsiento.push({
      cuentaCodigo: '1.1.08',
      cuentaNombre: 'IVA Crédito Fiscal',
      debe: totalIva,
      haber: 0,
      centroCosto: 'General'
    });
  }

  lineasAsiento.push({
    cuentaCodigo: '2.1.01',
    cuentaNombre: 'Cuentas por Pagar (Proveedores)',
    debe: 0,
    haber: totalComprobante,
    centroCosto: 'General'
  });

  await registrarAsientoContable({
    empresaId,
    fecha: fechaContable,
    concepto: `Compra ${tipoComprobante} ${docData.numeroOriginal} - ${proveedorNombre}`,
    origenDoc: `COMPRA-${docRef.id}`,
    origenId: docRef.id,
    lineas: lineasAsiento
  });

  return { id: docRef.id, ...docData };
};

/**
 * Asigna (o corrige) el flete de traslado de una compra ya cargada — p. ej. cuando llega después la factura del transporte.
 * Actualiza el último costo de los artículos cuya última compra es esta.
 */
export const asignarFleteCompra = async (compra, fleteARS) => {
  const monto = Math.round(Number(fleteARS || 0) * 100) / 100;
  if (monto < 0) throw new Error('El flete no puede ser negativo.');
  await updateDoc(doc(db, 'comprobantes_compra', compra.id), { fleteARS: monto });
  if (!compra.ingresaStock) return;
  const { lineas } = costosConFlete({ ...compra, fleteARS: monto });
  for (const l of lineas) {
    if (!l.itemId) continue;
    try {
      const s = await getDoc(doc(db, 'lista_precios', l.itemId));
      if (s.exists() && s.data().ultimaCompraId === compra.id) {
        await updateDoc(doc(db, 'lista_precios', l.itemId), { ultimoCostoARS: Math.round(l.costoUnit * 100) / 100 });
      }
    } catch (e) {
      console.warn('No se pudo actualizar el costo con flete:', e);
    }
  }
};
