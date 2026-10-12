/**
 * Utilidades compartidas por los listados de Facturas y Presupuestos.
 * Empresa: Canal 1 (fiscal) = AYALA NICOLAS FEDERICO · Canal 2 (no fiscal) = EULER CALEFACCIÓN.
 */
import { calcularDescuentosPresupuesto } from './descuentosService';

export const EMPRESAS_LISTADO = {
  'ayala-nicolas': {
    id: 'ayala-nicolas', nombre: 'AYALA NICOLAS FEDERICO', corto: 'Ayala Nicolás F.',
    canal: 'Canal 1 · Fiscal', color: '#1d4ed8', bg: '#dbeafe',
  },
  'euler-calefaccion': {
    id: 'euler-calefaccion', nombre: 'EULER CALEFACCIÓN', corto: 'Euler Calefacción',
    canal: 'Canal 2 · No fiscal', color: '#b45309', bg: '#fef3c7',
  },
};

export const empresaDeCanal = (canal) =>
  (canal === 'canal2' || canal === 'descuento' ? 'euler-calefaccion' : 'ayala-nicolas');

// ─── Presupuestos ───────────────────────────────────────────────────────────

export const ESTADOS_PRESUPUESTO = {
  pendiente:         { label: 'Pendiente',         color: '#92400e', bg: '#fef3c7' },
  en_calculo:        { label: 'En cálculo',        color: '#5b21b6', bg: '#ede9fe' },
  listo_para_enviar: { label: 'Listo para enviar', color: '#0e7490', bg: '#cffafe' },
  enviado:           { label: 'Enviado',           color: '#1d4ed8', bg: '#dbeafe' },
  seguimiento:       { label: 'En seguimiento',    color: '#9a3412', bg: '#ffedd5' },
  aprobado:          { label: 'Aprobado',          color: '#047857', bg: '#d1fae5' },
  rechazado:         { label: 'Rechazado',         color: '#b91c1c', bg: '#fee2e2' },
};

const toDate = (v) => {
  if (!v) return null;
  const d = v.toDate ? v.toDate() : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Fecha ISO (YYYY-MM-DD) del presupuesto: última revisión guardada o creación. */
export const fechaPresupuestoISO = (p) => {
  const d = toDate(p.revisionSavedAt) || toDate(p.savedAt) || toDate(p.createdAt);
  if (d) return new Date(d.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const m = String(p.date || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
};

/** Total final que ve el cliente (con IVA en canal 1, con descuento comercial en canal 2). */
export const totalPresupuesto = (p) => {
  const items = p.quoteItems || [];
  if (!items.length) return Number(p.total || 0);
  const desc = p.canal === 'canal2' || p.canal === 'descuento';
  const r = calcularDescuentosPresupuesto(items, desc);
  return desc ? r.montoFinalPresupuesto : r.totalOriginalConIVA;
};

// ─── Facturas ───────────────────────────────────────────────────────────────

export const SIGLA_LABEL = {
  FAA: 'Factura A', FAB: 'Factura B', FAX: 'Factura X', NCA: 'Nota de crédito A', NCB: 'Nota de crédito B', NDA: 'Nota de débito A',
};

export const ESTADOS_FACTURA = {
  pendiente: { label: 'Pendiente de cobro', color: '#92400e', bg: '#fef3c7' },
  parcial:   { label: 'Cobro parcial',      color: '#1d4ed8', bg: '#dbeafe' },
  cobrada:   { label: 'Cobrada',            color: '#047857', bg: '#d1fae5' },
  anulada:   { label: 'Anulada (NC)',       color: '#b91c1c', bg: '#fee2e2' },
  nc_parcial:{ label: 'NC parcial',         color: '#9a3412', bg: '#ffedd5' },
  nota_credito: { label: 'Nota de crédito', color: '#6b21a8', bg: '#f3e8ff' },
};

/** Estado de una factura teniendo en cuenta las notas de crédito que la referencian. */
export const estadoFactura = (f, ncPorFactura) => {
  if (f.esNotaCredito) return 'nota_credito';
  const acreditado = ncPorFactura[f.id] || 0;
  if (acreditado >= Number(f.totalComprobante || 0) - 0.01 && acreditado > 0) return 'anulada';
  if (acreditado > 0) return 'nc_parcial';
  return Number(f.saldoPendiente ?? f.totalComprobante) <= 0.01 ? 'cobrada' : 'pendiente';
};

// ─── Períodos ───────────────────────────────────────────────────────────────

const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export const PERIODOS = [
  { id: 'mes', label: 'Este mes' },
  { id: 'mes_anterior', label: 'Mes anterior' },
  { id: '90d', label: 'Últimos 90 días' },
  { id: 'anio', label: 'Este año' },
  { id: '12m', label: 'Últimos 12 meses' },
  { id: 'todo', label: 'Todo' },
  { id: 'custom', label: 'Personalizado…' },
];

/** Devuelve [desde, hasta] en ISO (inclusive) o ['', ''] para "todo". */
export const rangoPeriodo = (id, custom = {}) => {
  const hoy = new Date();
  const y = hoy.getFullYear();
  const m = hoy.getMonth();
  switch (id) {
    case 'mes': return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
    case 'mes_anterior': return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
    case '90d': return [iso(new Date(y, m, hoy.getDate() - 89)), iso(hoy)];
    case 'anio': return [`${y}-01-01`, `${y}-12-31`];
    case '12m': return [iso(new Date(y, m - 11, 1)), iso(new Date(y, m + 1, 0))];
    case 'custom': return [custom.desde || '', custom.hasta || ''];
    default: return ['', ''];
  }
};

export const enRango = (fechaIso, [desde, hasta]) =>
  (!desde || (fechaIso || '') >= desde) && (!hasta || (fechaIso || '') <= hasta);

// ─── Formato / acciones ─────────────────────────────────────────────────────

export const ars = (n) => `$ ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fechaAR = (isoStr) => (isoStr ? String(isoStr).slice(0, 10).split('-').reverse().join('/') : '—');

/** Normaliza un teléfono argentino para wa.me (549 + característica + número). */
export const telefonoWhatsApp = (tel) => {
  let d = String(tel || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('54')) d = d.slice(2);
  if (d.startsWith('9')) d = d.slice(1);
  if (d.startsWith('0')) d = d.slice(1);
  d = d.replace(/^(\d{2,4})15(\d{6,8})$/, '$1$2'); // quita el 15 de celulares
  return d.length >= 10 ? `549${d}` : '';
};

export const abrirWhatsApp = (tel, texto) => {
  const n = telefonoWhatsApp(tel);
  window.open(`https://wa.me/${n}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
};

/** Exporta filas a Excel (.xlsx). `columnas`: [{ titulo, valor: (row) => any }] */
export const exportarExcel = async (filas, columnas, nombreArchivo, hoja = 'Listado') => {
  const XLSX = await import('xlsx');
  const data = filas.map((r) => Object.fromEntries(columnas.map((c) => [c.titulo, c.valor(r)])));
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = columnas.map((c) => ({ wch: c.ancho || 16 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, hoja);
  XLSX.writeFile(wb, nombreArchivo);
};
