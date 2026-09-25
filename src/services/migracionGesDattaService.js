import { db } from './firebaseConfig';
import { collection, getDocs, query, where, setDoc, doc, addDoc, serverTimestamp } from 'firebase/firestore';
import { crearComprobanteCompra } from './comprasService';
import { crearComprobanteVenta } from './ventasService';
import { registrarReciboCobro, registrarOrdenPago } from './tesoreriaService';

/**
 * Datos pre-cargados de aceptación del histórico GesDatta para verificación
 */
export const CASOS_ACEPTACION_GESDATTA = [
  {
    tipo: 'compra',
    gesdattaId: '519769',
    empresaId: 'euler-calefaccion',
    proveedorNombre: 'Distribuidora Termomecánica S.A.',
    proveedorCuit: '30-65432109-8',
    tipoComprobante: 'FAA',
    puntoVenta: 15,
    numeroComprobante: 312360,
    fechaEmision: '2026-09-10',
    fechaContable: '2026-09-10',
    lineas: [
      {
        descripcion: 'Materiales y calderas según factura 312360',
        cantidad: 1,
        precioUnitario: 7048415.97,
        alicuotaIva: 0.21,
        cuentaCodigo: '5.1.01',
        cuentaNombre: 'Costo de Mercadería Vendida (CMV)',
        centroCosto: 'COSTO VARIABLE'
      }
    ],
    ingresaStock: false,
    asientoIdGesdatta: '3401228'
  },
  {
    tipo: 'venta_recibo',
    gesdattaVentaId: '1225924',
    gesdattaReciboId: '813232',
    empresaId: 'ayala-nicolas',
    clienteNombre: 'Residencia Los Olivos',
    clienteCuit: '20-28998877-4',
    tipoComprobanteVenta: 'FAA',
    puntoVentaVenta: 6,
    numeroComprobanteVenta: 289,
    fechaEmisionVenta: '2026-09-21',
    lineasVenta: [
      {
        descripcion: 'Instalación sistema de calefacción por radiadores',
        cantidad: 1,
        precioUnitario: 498396.00,
        alicuotaIva: 0.21,
        cuentaCodigo: '4.1.01',
        cuentaNombre: 'Ventas de Equipos e Instalaciones',
        centroCosto: 'General'
      }
    ],
    puntoVentaRecibo: 1,
    numeroRecibo: 214,
    fechaEmisionRecibo: '2026-09-21',
    medioPagoRecibo: 'tarjeta'
  },
  {
    tipo: 'pago_directo',
    gesdattaId: '735129',
    empresaId: 'euler-calefaccion',
    proveedorNombre: 'Expreso Fletes Central',
    tipoComprobanteOPA: 'OPA',
    puntoVentaOPA: 1,
    numeroOPA: 1406,
    fechaEmisionOPA: '2026-09-18',
    imputacionDirecta: {
      concepto: 'Flete materiales varios',
      cuentaCodigo: '5.2.01',
      cuentaNombre: 'Fletes y Acarreos Varios',
      centroCosto: 'COSTO VARIABLE',
      monto: 70000.00
    },
    medioPago: 'banco' // Banco Santander CC
  }
];

/**
 * Ejecutar migración idempotente de lote GesDatta
 */
export const ejecutarMigracionGesDatta = async ({ loteNombre = 'Lote Histórico 2026', registros = CASOS_ACEPTACION_GESDATTA }) => {
  const logResultado = {
    loteNombre,
    fechaEjecucion: new Date().toISOString(),
    totalProcesados: 0,
    comprasCreadas: 0,
    ventasCreadas: 0,
    recibosCreados: 0,
    opasCreadas: 0,
    omitidosDuplicados: 0,
    errores: []
  };

  for (const reg of registros) {
    try {
      logResultado.totalProcesados++;

      if (reg.tipo === 'compra') {
        // Verificar si ya existe por gesdattaId
        const qExist = query(collection(db, 'comprobantes_compra'), where('gesdattaId', '==', reg.gesdattaId));
        const snap = await getDocs(qExist);
        if (!snap.empty) {
          logResultado.omitidosDuplicados++;
          continue;
        }

        await crearComprobanteCompra(reg);
        logResultado.comprasCreadas++;
      }
      else if (reg.tipo === 'venta_recibo') {
        // Verificar Venta
        let ventaId = null;
        const qVenta = query(collection(db, 'comprobantes_venta'), where('gesdattaId', '==', reg.gesdattaVentaId));
        const snapV = await getDocs(qVenta);
        
        if (snapV.empty) {
          const resVenta = await crearComprobanteVenta({
            gesdattaId: reg.gesdattaVentaId,
            empresaId: reg.empresaId,
            clienteNombre: reg.clienteNombre,
            clienteCuit: reg.clienteCuit,
            tipoComprobante: reg.tipoComprobanteVenta,
            puntoVenta: reg.puntoVentaVenta,
            numeroComprobante: reg.numeroComprobanteVenta,
            fechaEmision: reg.fechaEmisionVenta,
            lineas: reg.lineasVenta
          });
          ventaId = resVenta.id;
          logResultado.ventasCreadas++;
        } else {
          ventaId = snapV.docs[0].id;
          logResultado.omitidosDuplicados++;
        }

        // Verificar Recibo
        const qRec = query(collection(db, 'recibos'), where('gesdattaId', '==', reg.gesdattaReciboId));
        const snapR = await getDocs(qRec);

        if (snapR.empty && ventaId) {
          const totalVenta = reg.lineasVenta.reduce((acc, l) => acc + (l.cantidad * l.precioUnitario * 1.21), 0);
          await registrarReciboCobro({
            gesdattaId: reg.gesdattaReciboId,
            empresaId: reg.empresaId,
            clienteNombre: reg.clienteNombre,
            numeroRecibo: `${String(reg.puntoVentaRecibo).padStart(5, '0')}-${String(reg.numeroRecibo).padStart(8, '0')}`,
            fechaEmision: reg.fechaEmisionRecibo,
            mediosPago: [
              { medioId: reg.medioPagoRecibo, monto: totalVenta, comision: 0, retenciones: 0 }
            ],
            imputaciones: [
              { facturaId: ventaId, montoAplicado: totalVenta }
            ]
          });
          logResultado.recibosCreados++;
        }
      }
      else if (reg.tipo === 'pago_directo') {
        const qOpa = query(collection(db, 'ordenes_pago'), where('gesdattaId', '==', reg.gesdattaId));
        const snapO = await getDocs(qOpa);
        if (!snapO.empty) {
          logResultado.omitidosDuplicados++;
          continue;
        }

        await registrarOrdenPago({
          gesdattaId: reg.gesdattaId,
          empresaId: reg.empresaId,
          proveedorNombre: reg.proveedorNombre,
          numeroOPA: `${String(reg.puntoVentaOPA).padStart(5, '0')}-${String(reg.numeroOPA).padStart(8, '0')}`,
          fechaEmision: reg.fechaEmisionOPA,
          imputacionDirecta: reg.imputacionDirecta,
          mediosPago: [
            { medioId: reg.medioPago, monto: reg.imputacionDirecta.monto }
          ]
        });
        logResultado.opasCreadas++;
      }
    } catch (err) {
      console.error(`Error procesando registro ${reg.gesdattaId}:`, err);
      logResultado.errores.push({ id: reg.gesdattaId, mensaje: err.message });
    }
  }

  // Guardar log de migración en Firestore
  await addDoc(collection(db, 'migraciones_gesdatta'), logResultado);

  return logResultado;
};
