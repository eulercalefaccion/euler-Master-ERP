import { db } from './firebaseConfig';
import { collection, getDocs, addDoc, doc, setDoc, query, where, serverTimestamp } from 'firebase/firestore';

export const PLAN_CUENTAS_BASE = [
  // ACTIVO
  { codigo: '1.1.01', nombre: 'Cajas y Bancos - Efectivo en ARS', tipo: 'ACTIVO', imputable: true },
  { codigo: '1.1.02', nombre: 'Banco Santander Río CC ARS', tipo: 'ACTIVO', imputable: true },
  { codigo: '1.1.03', nombre: 'Tarjetas de Crédito a Cobrar', tipo: 'ACTIVO', imputable: true },
  { codigo: '1.1.04', nombre: 'Cheques de Terceros en Cartera', tipo: 'ACTIVO', imputable: true },
  { codigo: '1.1.05', nombre: 'Cuentas por Cobrar (Deudores por Ventas)', tipo: 'ACTIVO', imputable: true },
  { codigo: '1.1.06', nombre: 'Anticipos a Proveedores', tipo: 'ACTIVO', imputable: true },
  { codigo: '1.1.07', nombre: 'Bienes de Cambio / Stock de Mercaderías', tipo: 'ACTIVO', imputable: true },
  { codigo: '1.1.08', nombre: 'IVA Crédito Fiscal', tipo: 'ACTIVO', imputable: true },

  // PASIVO
  { codigo: '2.1.01', nombre: 'Cuentas por Pagar (Proveedores)', tipo: 'PASIVO', imputable: true },
  { codigo: '2.1.02', nombre: 'Anticipos de Clientes / Señas', tipo: 'PASIVO', imputable: true },
  { codigo: '2.1.03', nombre: 'Cheques Propios Diferidos', tipo: 'PASIVO', imputable: true },
  { codigo: '2.1.04', nombre: 'IVA Débito Fiscal', tipo: 'PASIVO', imputable: true },
  { codigo: '2.1.05', nombre: 'Sueldos y Cargas Sociales por Pagar', tipo: 'PASIVO', imputable: true },
  { codigo: '2.1.06', nombre: 'Retenciones y Percepciones por Pagar', tipo: 'PASIVO', imputable: true },

  // PATRIMONIO NETO
  { codigo: '3.1.01', nombre: 'Capital Social / Aportes', tipo: 'PATRIMONIO_NETO', imputable: true },
  { codigo: '3.2.01', nombre: 'Resultados Acumulados', tipo: 'PATRIMONIO_NETO', imputable: true },

  // INGRESOS (VENTAS)
  { codigo: '4.1.01', nombre: 'Ventas de Equipos e Instalaciones', tipo: 'INGRESO', imputable: true },
  { codigo: '4.1.02', nombre: 'Ventas de Servicios Técnicos', tipo: 'INGRESO', imputable: true },
  { codigo: '4.1.03', nombre: 'Otros Ingresos Operativos', tipo: 'INGRESO', imputable: true },

  // EGRESOS / COSTOS / GASTOS
  { codigo: '5.1.01', nombre: 'Costo de Mercadería Vendida (CMV)', tipo: 'EGRESO', imputable: true },
  { codigo: '5.2.01', nombre: 'Fletes y Acarreos Varios', tipo: 'EGRESO', imputable: true },
  { codigo: '5.2.02', nombre: 'Combustible y Movilidad / Peajes', tipo: 'EGRESO', imputable: true },
  { codigo: '5.2.03', nombre: 'Alquileres y Expensas', tipo: 'EGRESO', imputable: true },
  { codigo: '5.2.04', nombre: 'Luz, Gas, Agua y Telecomunicaciones', tipo: 'EGRESO', imputable: true },
  { codigo: '5.2.05', nombre: 'Honorarios Profesionales y Asesoría', tipo: 'EGRESO', imputable: true },
  { codigo: '5.2.06', nombre: 'Herramientas y Insumos Menores', tipo: 'EGRESO', imputable: true },
  { codigo: '5.2.07', nombre: 'Limpieza, Papelería e Insumos', tipo: 'EGRESO', imputable: true },
  { codigo: '5.2.08', nombre: 'Seguros e Impuestos Operativos', tipo: 'EGRESO', imputable: true },
  { codigo: '5.2.09', nombre: 'Sueldos, Jornadas y Cargas Sociales', tipo: 'EGRESO', imputable: true },
  { codigo: '5.2.10', nombre: 'Gastos Bancarios e Intereses', tipo: 'EGRESO', imputable: true },
  { codigo: '5.3.01', nombre: 'Gastos de Aplicación Particular', tipo: 'EGRESO', imputable: true }
];

export const CENTROS_COSTO_BASE = [
  'COSTO FIJO',
  'COSTO VARIABLE',
  'DE APLICACIÓN PARTICULAR',
  'General'
];

export const getPlanCuentas = async () => {
  try {
    const snap = await getDocs(collection(db, 'plan_cuentas'));
    if (snap.empty) {
      for (const cta of PLAN_CUENTAS_BASE) {
        await setDoc(doc(db, 'plan_cuentas', cta.codigo.replace(/\./g, '_')), cta);
      }
      return PLAN_CUENTAS_BASE;
    }
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('Error obteniendo plan de cuentas:', error);
    return PLAN_CUENTAS_BASE;
  }
};

/**
 * Genera y registra un asiento contable automático con doble entrada equilibrada.
 */
export const registrarAsientoContable = async ({
  empresaId = 'euler-calefaccion',
  fecha,
  concepto,
  origenDoc = '', // Ej: 'COMPRA-519769', 'VENTA-1225924', 'OPA-735129'
  origenId = '',
  lineas = [], // Array de { cuentaCodigo, cuentaNombre, debe, haber, obraId, centroCosto }
  asientoOriginalId = null
}) => {
  if (!lineas || lineas.length === 0) {
    console.warn('Asiento sin líneas omitido');
    return null;
  }

  // Verificar partida doble
  let totalDebe = 0;
  let totalHaber = 0;
  lineas.forEach(l => {
    totalDebe += Number(l.debe || 0);
    totalHaber += Number(l.haber || 0);
  });

  const diff = Math.abs(totalDebe - totalHaber);
  if (diff > 0.05) {
    throw new Error(`Asiento desbalanceado: Debe = ${totalDebe.toFixed(2)}, Haber = ${totalHaber.toFixed(2)}`);
  }

  const nuevoAsiento = {
    empresaId,
    fecha: fecha || new Date().toISOString().split('T')[0],
    concepto,
    origenDoc,
    origenId,
    totalDebe: Math.round(totalDebe * 100) / 100,
    totalHaber: Math.round(totalHaber * 100) / 100,
    lineas: lineas.map(l => ({
      cuentaCodigo: l.cuentaCodigo,
      cuentaNombre: l.cuentaNombre || '',
      debe: Math.round(Number(l.debe || 0) * 100) / 100,
      haber: Math.round(Number(l.haber || 0) * 100) / 100,
      obraId: l.obraId || null,
      centroCosto: l.centroCosto || 'General'
    })),
    asientoOriginalId,
    createdAt: serverTimestamp()
  };

  const docRef = await addDoc(collection(db, 'asientos_contables'), nuevoAsiento);
  return { id: docRef.id, ...nuevoAsiento };
};
