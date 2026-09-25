import { db } from './firebaseConfig';
import { collection, getDocs, addDoc, doc, updateDoc, query, where, orderBy, serverTimestamp } from 'firebase/firestore';
import { registrarAsientoContable } from './contabilidadService';

export const getVentas = async (empresaId = null) => {
  try {
    const q = empresaId 
      ? query(collection(db, 'comprobantes_venta'), where('empresaId', '==', empresaId), orderBy('fechaEmision', 'desc'))
      : query(collection(db, 'comprobantes_venta'), orderBy('fechaEmision', 'desc'));
    
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('Error cargando ventas:', error);
    return [];
  }
};

export const crearComprobanteVenta = async (ventaData) => {
  const {
    gesdattaId = null,
    empresaId = 'euler-calefaccion',
    clienteId,
    clienteNombre,
    clienteCuit,
    presupuestoId = null,
    obraId = null,
    servicioId = null,
    tipoComprobante = 'FAA', // FAA, FAB, FAX, NCA, NDA
    puntoVenta = 6,
    numeroComprobante,
    cae = null,
    vencimientoCae = null,
    fechaEmision,
    fechaContable = fechaEmision,
    fechaVencimiento = fechaEmision,
    moneda = 'ARS',
    cotizacion = 1,
    lineas = [],
    estado = 'pendiente', // pendiente, parcial, cobrado
    observaciones = ''
  } = ventaData;

  const esNotaCredito = tipoComprobante.includes('NC');

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
    clienteId,
    clienteNombre,
    clienteCuit: clienteCuit || '',
    presupuestoId,
    obraId,
    servicioId,
    tipoComprobante,
    puntoVenta: Number(puntoVenta),
    numeroComprobante,
    numeroOriginal: `${String(puntoVenta).padStart(5, '0')}-${String(numeroComprobante).padStart(8, '0')}`,
    cae,
    vencimientoCae,
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
    esNotaCredito,
    lineas: lineas.map(l => ({
      itemId: l.itemId || null,
      descripcion: l.descripcion || '',
      cantidad: Number(l.cantidad || 1),
      precioUnitario: Number(l.precioUnitario || 0),
      descuento: Number(l.descuento || 0),
      neto: Number(l.neto || (Number(l.cantidad || 1) * Number(l.precioUnitario || 0))),
      alicuotaIva: Number(l.alicuotaIva || 0.21),
      cuentaCodigo: l.cuentaCodigo || '4.1.01',
      cuentaNombre: l.cuentaNombre || 'Ventas de Equipos e Instalaciones',
      centroCosto: l.centroCosto || 'General',
      obraId: l.obraId || obraId
    })),
    estado,
    observaciones,
    createdAt: serverTimestamp()
  };

  const docRef = await addDoc(collection(db, 'comprobantes_venta'), docData);

  // Generar Asiento Contable Automático
  // Si es Factura Venta:
  // DEBE: Cuentas por Cobrar (Clientes) = totalComprobante
  // HABER: Ventas = subtotalNeto, IVA Débito = totalIva
  // Si es Nota de Crédito: invierte las posiciones
  const lineasAsiento = [];

  if (!esNotaCredito) {
    lineasAsiento.push({
      cuentaCodigo: '1.1.05',
      cuentaNombre: 'Cuentas por Cobrar (Deudores por Ventas)',
      debe: totalComprobante,
      haber: 0,
      obraId,
      centroCosto: 'General'
    });

    lineas.forEach(l => {
      const neto = (Number(l.cantidad || 1) * Number(l.precioUnitario || 0)) - Number(l.descuento || 0);
      lineasAsiento.push({
        cuentaCodigo: l.cuentaCodigo || '4.1.01',
        cuentaNombre: l.cuentaNombre || 'Ventas de Equipos e Instalaciones',
        debe: 0,
        haber: neto,
        obraId: l.obraId || obraId,
        centroCosto: l.centroCosto || 'General'
      });
    });

    if (totalIva > 0) {
      lineasAsiento.push({
        cuentaCodigo: '2.1.04',
        cuentaNombre: 'IVA Débito Fiscal',
        debe: 0,
        haber: totalIva,
        centroCosto: 'General'
      });
    }
  } else {
    // NC resta venta
    lineas.forEach(l => {
      const neto = (Number(l.cantidad || 1) * Number(l.precioUnitario || 0)) - Number(l.descuento || 0);
      lineasAsiento.push({
        cuentaCodigo: l.cuentaCodigo || '4.1.01',
        cuentaNombre: l.cuentaNombre || 'Ventas de Equipos e Instalaciones',
        debe: neto,
        haber: 0,
        obraId: l.obraId || obraId,
        centroCosto: l.centroCosto || 'General'
      });
    });

    if (totalIva > 0) {
      lineasAsiento.push({
        cuentaCodigo: '2.1.04',
        cuentaNombre: 'IVA Débito Fiscal',
        debe: totalIva,
        haber: 0,
        centroCosto: 'General'
      });
    }

    lineasAsiento.push({
      cuentaCodigo: '1.1.05',
      cuentaNombre: 'Cuentas por Cobrar (Deudores por Ventas)',
      debe: 0,
      haber: totalComprobante,
      obraId,
      centroCosto: 'General'
    });
  }

  await registrarAsientoContable({
    empresaId,
    fecha: fechaContable,
    concepto: `Venta ${tipoComprobante} ${docData.numeroOriginal} - ${clienteNombre}`,
    origenDoc: `VENTA-${docRef.id}`,
    origenId: docRef.id,
    lineas: lineasAsiento
  });

  return { id: docRef.id, ...docData };
};
