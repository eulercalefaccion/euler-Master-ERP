/**
 * Facturación electrónica ARCA – lado cliente.
 * La comunicación con ARCA ocurre SOLO en Cloud Functions (arcaEstado / arcaEmitirFactura).
 */
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, functions } from './firebaseConfig';

export const CONDICIONES_IVA = [
  { id: 1, label: 'IVA Responsable Inscripto' },
  { id: 6, label: 'Responsable Monotributo' },
  { id: 5, label: 'Consumidor Final' },
  { id: 4, label: 'IVA Sujeto Exento' },
  { id: 13, label: 'Monotributista Social' },
  { id: 16, label: 'Monotributo Trabajador Indep. Promovido' },
  { id: 7, label: 'Sujeto No Categorizado' },
  { id: 15, label: 'IVA No Alcanzado' },
];
export const CONDICIONES_CLASE_A = [1, 6, 13, 16];

export const DOC_TIPOS = [
  { id: 80, label: 'CUIT' },
  { id: 86, label: 'CUIL' },
  { id: 96, label: 'DNI' },
  { id: 99, label: 'Sin identificar' },
];

export const CONCEPTOS = [
  { id: 3, label: 'Productos y Servicios' },
  { id: 1, label: 'Productos' },
  { id: 2, label: 'Servicios' },
];

export const letraPorCondicion = (condicionIvaId) =>
  CONDICIONES_CLASE_A.includes(Number(condicionIvaId)) ? 'A' : 'B';

/** Mapea el texto de condición IVA (padrón / clientes) al código ARCA. */
export const condicionIvaDesdeTexto = (txt = '') => {
  const t = String(txt).toLowerCase();
  if (t.includes('inscripto')) return 1;
  if (t.includes('monotrib')) return 6;
  if (t.includes('exento')) return 4;
  return 5;
};

export const cuitValido = (cuit) => {
  const c = String(cuit || '').replace(/\D/g, '');
  if (c.length !== 11) return false;
  const mult = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = mult.reduce((acc, m, i) => acc + m * Number(c[i]), 0);
  let dv = 11 - (sum % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) dv = 9;
  return dv === Number(c[10]);
};

/** Receptor sugerido a partir de los datos de facturación de la obra. */
export const receptorDesdeObra = (obra = {}) => {
  const igual = obra.facturacionIgualCliente !== false;
  const nombre = igual ? obra.clientName : (obra.facturacionNombre || obra.clientName);
  const cuit = String((igual ? obra.cuit : obra.facturacionCuit) || '').replace(/\D/g, '');
  const dni = String((igual ? obra.dni : obra.facturacionDni) || '').replace(/\D/g, '');
  const domicilio = (igual ? obra.direccionCliente : obra.facturacionDireccion) || obra.direccionCliente || '';

  let docTipo = 99;
  let docNro = '';
  if (cuit.length === 11) { docTipo = 80; docNro = cuit; } else if (dni) { docTipo = 96; docNro = dni; }

  const esJuridica = /^(30|33|34)/.test(cuit);
  const tipo = obra.tipoCliente || 'consumidor_final';
  const condicionIvaId = obra.condicionIvaId
    || (esJuridica || ['constructora', 'desarrolladora'].includes(tipo) ? 1 : 5);

  return { nombre: (nombre || '').toUpperCase(), docTipo, docNro, condicionIvaId, domicilio };
};

/** Líneas sugeridas: ítems del presupuesto aprobado (precios NETOS, sin IVA). */
export const lineasDesdeObra = (obra = {}) =>
  (obra.quoteItems || []).map((it, idx) => ({
    key: `q${idx}`,
    incluir: true,
    descripcion: it.descripcion || '',
    cantidad: Number(it.quantity) || 1,
    precioUnitario: Math.round((Number(it.unitPrice) || 0) * 100) / 100,
    tipo: it.tipo || '',
  }));

export const calcularTotales = (lineas = []) => {
  const neto = Math.round(lineas.reduce((a, l) =>
    a + Math.round((Number(l.cantidad) || 0) * (Number(l.precioUnitario) || 0) * 100) / 100, 0) * 100) / 100;
  const iva = Math.round(neto * 0.21 * 100) / 100;
  return { neto, iva, total: Math.round((neto + iva) * 100) / 100 };
};

// ─── Configuración ──────────────────────────────────────────────────────────

export const ARCA_CONFIG_DEFAULT = {
  entorno: 'homologacion',
  cuit: '20316275622',
  razonSocial: 'AYALA NICOLAS FEDERICO',
  domicilio: 'San Marcos 2760 M:24, Roldán, Santa Fe',
  condicionIva: 'IVA Responsable Inscripto',
  ingresosBrutos: '',
  inicioActividades: '',
  puntoVentaHomo: 1,
  puntoVentaProd: null,
  conceptoDefault: 3,
  empresaId: 'ayala-nicolas',
};

export const getArcaConfig = async () => {
  const snap = await getDoc(doc(db, 'configuracion', 'arca'));
  return { ...ARCA_CONFIG_DEFAULT, ...(snap.exists() ? snap.data() : {}) };
};

export const saveArcaConfig = async (cfg) => {
  await setDoc(doc(db, 'configuracion', 'arca'), { ...cfg, updatedAt: new Date().toISOString() }, { merge: true });
};

// ─── Cloud Functions ────────────────────────────────────────────────────────

const mensajeError = (e) => e?.message?.replace(/^FirebaseError:\s*/, '') || 'Error desconocido';

export const getArcaEstado = async () => {
  try {
    const fn = httpsCallable(functions, 'arcaEstado', { timeout: 120000 });
    return (await fn({})).data;
  } catch (e) {
    throw new Error(mensajeError(e));
  }
};

export const emitirComprobanteArca = async (payload) => {
  try {
    const fn = httpsCallable(functions, 'arcaEmitirFactura', { timeout: 120000 });
    return (await fn(payload)).data;
  } catch (e) {
    throw new Error(mensajeError(e));
  }
};
