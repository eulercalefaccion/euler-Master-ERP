import { db } from './firebaseConfig';
import { collection, getDocs, addDoc, doc, updateDoc, query, where, orderBy, serverTimestamp, increment } from 'firebase/firestore';
import { registrarAsientoContable } from './contabilidadService';

export const MEDIOS_PAGO = [
  { id: 'efectivo', nombre: 'Efectivo', cuentaCodigo: '1.1.01', cuentaNombre: 'Cajas y Bancos - Efectivo ARS' },
  { id: 'banco', nombre: 'Transferencia Bancaria (Santander)', cuentaCodigo: '1.1.02', cuentaNombre: 'Banco Santander Río CC ARS' },
  { id: 'tarjeta', nombre: 'Tarjeta de Crédito / Débito', cuentaCodigo: '1.1.03', cuentaNombre: 'Tarjetas de Crédito a Cobrar' },
  { id: 'cheque_tercero', nombre: 'Cheque de Terceros', cuentaCodigo: '1.1.04', cuentaNombre: 'Cheques de Terceros en Cartera' },
  { id: 'cheque_propio', nombre: 'Cheque Propio Diferido', cuentaCodigo: '2.1.03', cuentaNombre: 'Cheques Propios Diferidos' }
];

/**
 * Registrar Recibo de Cobro (REC) a cliente
 */
export const registrarReciboCobro = async (reciboData) => {
  const {
    gesdattaId = null,
    empresaId = 'euler-calefaccion',
    clienteId,
    clienteNombre,
    numeroRecibo,
    fechaEmision,
    mediosPago = [], // Array of { medioId, monto, banco, numeroCheque, cuotas, retenciones }
    imputaciones = [], // Array of { facturaId, numeroOriginal, montoAplicado }
    observaciones = ''
  } = reciboData;

  let totalRecibo = 0;
  mediosPago.forEach(m => { totalRecibo += Number(m.monto || 0); });
  totalRecibo = Math.round(totalRecibo * 100) / 100;

  const docData = {
    gesdattaId,
    empresaId,
    clienteId,
    clienteNombre,
    tipoComprobante: 'REC',
    numeroRecibo,
    fechaEmision,
    mediosPago,
    imputaciones,
    totalRecibo,
    observaciones,
    createdAt: serverTimestamp()
  };

  const docRef = await addDoc(collection(db, 'recibos'), docData);

  // Actualizar saldo de facturas imputadas
  for (const imp of imputaciones) {
    if (imp.facturaId) {
      try {
        const factRef = doc(db, 'comprobantes_venta', imp.facturaId);
        const montoApp = Number(imp.montoAplicado || 0);
        await updateDoc(factRef, {
          saldoPendiente: increment(-montoApp)
        });
      } catch (e) {
        console.error('Error aplicando cobro a factura:', e);
      }
    }
  }

  // Si incluye tarjetas a cobrar, registrar en colección tarjetas_cobrar
  for (const m of mediosPago) {
    if (m.medioId === 'tarjeta') {
      await addDoc(collection(db, 'tarjetas_cobrar'), {
        empresaId,
        reciboId: docRef.id,
        clienteNombre,
        montoBruto: Number(m.monto),
        comision: Number(m.comision || 0),
        retenciones: Number(m.retenciones || 0),
        montoNetoAcreditar: Number(m.monto) - Number(m.comision || 0) - Number(m.retenciones || 0),
        estado: 'pendiente_acreditacion',
        fechaCobro: fechaEmision,
        createdAt: serverTimestamp()
      });
    }
  }

  // Generar Asiento Contable
  const lineasAsiento = [];
  mediosPago.forEach(m => {
    const configMedio = MEDIOS_PAGO.find(mp => mp.id === m.medioId) || MEDIOS_PAGO[0];
    lineasAsiento.push({
      cuentaCodigo: configMedio.cuentaCodigo,
      cuentaNombre: configMedio.cuentaNombre,
      debe: Number(m.monto),
      haber: 0,
      centroCosto: 'General'
    });
  });

  lineasAsiento.push({
    cuentaCodigo: '1.1.05',
    cuentaNombre: 'Cuentas por Cobrar (Deudores por Ventas)',
    debe: 0,
    haber: totalRecibo,
    centroCosto: 'General'
  });

  await registrarAsientoContable({
    empresaId,
    fecha: fechaEmision,
    concepto: `Cobro Recibo ${numeroRecibo} - ${clienteNombre}`,
    origenDoc: `REC-${docRef.id}`,
    origenId: docRef.id,
    lineas: lineasAsiento
  });

  return { id: docRef.id, ...docData };
};

/**
 * Registrar Orden de Pago (OPA) a proveedor o Pago de Imputación Directa
 */
export const registrarOrdenPago = async (opaData) => {
  const {
    gesdattaId = null,
    empresaId = 'euler-calefaccion',
    proveedorId = null,
    proveedorNombre,
    numeroOPA,
    fechaEmision,
    mediosPago = [], // Array of { medioId, monto, banco, chequeNum }
    imputaciones = [], // Array of { facturaId, numeroOriginal, montoAplicado }
    imputacionDirecta = null, // { cuentaCodigo, cuentaNombre, centroCosto, obraId, concepto, monto }
    observaciones = ''
  } = opaData;

  let totalOPA = 0;
  mediosPago.forEach(m => { totalOPA += Number(m.monto || 0); });
  if (totalOPA === 0 && imputacionDirecta) {
    totalOPA = Number(imputacionDirecta.monto || 0);
  }
  totalOPA = Math.round(totalOPA * 100) / 100;

  const docData = {
    gesdattaId,
    empresaId,
    proveedorId,
    proveedorNombre,
    tipoComprobante: 'OPA',
    numeroOPA,
    fechaEmision,
    mediosPago,
    imputaciones,
    imputacionDirecta,
    totalOPA,
    observaciones,
    createdAt: serverTimestamp()
  };

  const docRef = await addDoc(collection(db, 'ordenes_pago'), docData);

  // Actualizar saldo de facturas de compra imputadas
  for (const imp of imputaciones) {
    if (imp.facturaId) {
      try {
        const factRef = doc(db, 'comprobantes_compra', imp.facturaId);
        const montoApp = Number(imp.montoAplicado || 0);
        await updateDoc(factRef, {
          saldoPendiente: increment(-montoApp)
        });
      } catch (e) {
        console.error('Error aplicando pago a compra:', e);
      }
    }
  }

  // Generar Asiento Contable
  const lineasAsiento = [];

  if (imputacionDirecta) {
    // Pago de imputación directa (ej. Flete, Gasto sin factura de compras)
    lineasAsiento.push({
      cuentaCodigo: imputacionDirecta.cuentaCodigo || '5.2.01',
      cuentaNombre: imputacionDirecta.cuentaNombre || 'Fletes y Acarreos Varios',
      debe: totalOPA,
      haber: 0,
      obraId: imputacionDirecta.obraId || null,
      centroCosto: imputacionDirecta.centroCosto || 'COSTO VARIABLE'
    });
  } else {
    // Cancela Cuentas por Pagar Proveedores
    lineasAsiento.push({
      cuentaCodigo: '2.1.01',
      cuentaNombre: 'Cuentas por Pagar (Proveedores)',
      debe: totalOPA,
      haber: 0,
      centroCosto: 'General'
    });
  }

  mediosPago.forEach(m => {
    const configMedio = MEDIOS_PAGO.find(mp => mp.id === m.medioId) || MEDIOS_PAGO[1];
    lineasAsiento.push({
      cuentaCodigo: configMedio.cuentaCodigo,
      cuentaNombre: configMedio.cuentaNombre,
      debe: 0,
      haber: Number(m.monto),
      centroCosto: 'General'
    });
  });

  await registrarAsientoContable({
    empresaId,
    fecha: fechaEmision,
    concepto: `Pago OPA ${numeroOPA} - ${proveedorNombre} ${imputacionDirecta ? `(${imputacionDirecta.concepto})` : ''}`,
    origenDoc: `OPA-${docRef.id}`,
    origenId: docRef.id,
    lineas: lineasAsiento
  });

  return { id: docRef.id, ...docData };
};
