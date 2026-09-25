import { db } from './firebaseConfig';
import { collection, getDocs, addDoc, doc, updateDoc, query, where, orderBy, serverTimestamp, increment } from 'firebase/firestore';
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
    estado = 'pendiente', // pendiente, parcial, pagado
    adjuntoUrl = null,
    observaciones = ''
  } = compraData;

  // Calcular subtotal, IVA, exentos y total
  let subtotalNeto = 0;
  let totalIva = 0;
  let totalExento = 0;

  lineas.forEach(l => {
    const cant = Number(l.cantidad || 1);
    const precio = Number(l.precioUnitario || 0);
    const desc = Number(l.descuento || 0);
    const netoLinea = (cant * precio) - desc;
    const alicuota = Number(l.alicuotaIva || 0.21);

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
      descuento: Number(l.descuento || 0),
      neto: Number(l.neto || (Number(l.cantidad || 1) * Number(l.precioUnitario || 0))),
      alicuotaIva: Number(l.alicuotaIva || 0.21),
      cuentaCodigo: l.cuentaCodigo || '5.1.01',
      cuentaNombre: l.cuentaNombre || 'Costo de Mercadería Vendida (CMV)',
      centroCosto: l.centroCosto || 'COSTO VARIABLE',
      obraId: l.obraId || null
    })),
    ingresaStock,
    estado,
    adjuntoUrl,
    observaciones,
    createdAt: serverTimestamp()
  };

  // Guardar en Firestore
  const docRef = await addDoc(collection(db, 'comprobantes_compra'), docData);

  // Si ingresa a stock y tiene itemId, actualizar cantidades en lista_precios
  if (ingresaStock) {
    for (const line of lineas) {
      if (line.itemId) {
        try {
          await updateDoc(doc(db, 'lista_precios', line.itemId), {
            stock: increment(Number(line.cantidad || 1)),
            stockActualizadoEn: new Date().toISOString()
          });
        } catch (e) {
          console.error('Error actualizando stock por compra:', e);
        }
      }
    }
  }

  // Generar Asiento Contable Automático
  // Debe: Costo/Stock + IVA Crédito
  // Haber: Proveedores
  const lineasAsiento = [];
  lineas.forEach(l => {
    const neto = (Number(l.cantidad || 1) * Number(l.precioUnitario || 0)) - Number(l.descuento || 0);
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
