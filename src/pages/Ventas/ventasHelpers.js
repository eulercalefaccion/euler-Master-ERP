/** Helpers (no componentes) del módulo Ventas & Cobranzas. */
import { EMPRESA_AYALA } from '../../services/cobranzasService';
import { getItemCategory, calcularItemDescuento } from '../../services/descuentosService';

export const lbl = { fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem', display: 'block' };
export const inp = {
  width: '100%', padding: '0.45rem 0.6rem', border: '1px solid var(--border-strong, #cbd5e1)', borderRadius: '6px',
  fontSize: '0.83rem', outline: 'none', background: 'var(--bg-primary, #fff)', color: 'inherit', boxSizing: 'border-box',
};
export const card = { border: '1px solid var(--border-light, #e2e8f0)', borderRadius: '10px', padding: '1rem', background: 'var(--bg-primary, #fff)' };
export const thSt = { background: 'var(--bg-surface-hover, #f8fafc)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-light)' };

export const CONDICIONES_VENTA = ['Contado', 'Cuenta corriente', 'Transferencia', 'Efectivo', 'Cheque', 'Tarjeta de crédito', 'Tarjeta de débito', 'Otra'];

/** Datos del emisor para PDFs según la empresa. */
export const emisorDe = (empresaId, arcaCfg = {}, ventasCfg = {}) => (empresaId === EMPRESA_AYALA
  ? {
    fiscal: true, razonSocial: arcaCfg.razonSocial, domicilio: arcaCfg.domicilio, telefono: arcaCfg.telefono, email: arcaCfg.email,
    web: arcaCfg.web, instagram: arcaCfg.instagram, cuit: arcaCfg.cuit, ingresosBrutos: arcaCfg.ingresosBrutos,
    inicioActividades: arcaCfg.inicioActividades, condicionIva: arcaCfg.condicionIva,
  }
  : { fiscal: false, ...(ventasCfg.euler || {}) });

/** Precio neto en pesos de un ítem de la lista de precios (USD × TC). */
export const precioNetoLista = (item, tc) => {
  if (!item || !tc) return 0;
  if (Number(item.precioVentaUSD)) return Math.round(Number(item.precioVentaUSD) * tc);
  if (Number(item.costoUSD) && Number(item.markup)) return Math.round(Number(item.costoUSD) * Number(item.markup) * tc);
  return 0;
};

/** Precio final Canal 2 (IVA incluido con descuento comercial) de una línea neta. */
export const precioFinalCanal2 = (item, netoUnit) => {
  const r = calcularItemDescuento({ ...item, quantity: 1, unitPrice: netoUnit });
  return r.finalConDescuento;
};

/** Líneas a facturar a partir de un presupuesto, según la empresa que emite. */
export const lineasDesdePresupuesto = (p, empresaId) => (p.quoteItems || []).map((it, i) => {
  const cant = Number(it.quantity) || 1;
  const netoUnit = Number(it.unitPrice) || 0;
  let precio = netoUnit;
  if (empresaId !== EMPRESA_AYALA) {
    const r = calcularItemDescuento({ ...it, quantity: cant, unitPrice: netoUnit });
    precio = Math.round((r.finalConDescuento / cant) * 100) / 100;
  }
  return {
    key: `p${i}_${Date.now()}`, incluir: true, descripcion: it.descripcion || '', cantidad: cant, precioUnitario: precio,
    unidad: it.unidad || '', listaItemId: it.listaItemId || null, tipo: it.tipo || '', categoria: getItemCategory(it), entregaPendiente: false,
  };
});

/**
 * Líneas facturables de un presupuesto según su alcance (services/presupuestoAlcance.facturablesPorItem):
 * por defecto, lo APROBADO pendiente de facturar (en ambos canales); lo no aprobado aparece desmarcado y
 * solo se factura con confirmación explícita de aprobación. Usa el precio neto aprobado (congelado).
 */
export const lineasFacturablesDesdePresupuesto = (facturables, empresaId) => facturables.map((f, i) => {
  const it = f.item || {};
  const cant = Number(f.cantidadSugerida) || 0;
  const netoUnit = Number(f.precioUnitarioNeto) || 0;
  let precio = netoUnit;
  if (empresaId !== EMPRESA_AYALA) {
    const base = cant > 0 ? cant : 1;
    const r = calcularItemDescuento({ ...it, quantity: base, unitPrice: netoUnit });
    precio = Math.round((r.finalConDescuento / base) * 100) / 100;
  }
  return {
    key: `p${i}_${Date.now()}`, incluir: !!f.incluir, descripcion: it.descripcion || '', cantidad: cant, precioUnitario: precio,
    unidad: it.unidad || '', listaItemId: it.listaItemId || null, tipo: it.tipo || '', categoria: getItemCategory(it), entregaPendiente: false,
    presupuestoItemId: f.key, maxCantidad: f.maxCantidad, aprobadoPendiente: f.aprobadoPendiente, entregadoSinFacturar: f.entregadaSinFacturar || 0,
  };
});

/** Cliente (para facturar) a partir de un presupuesto. */
export const clienteDesdePresupuesto = (p = {}) => {
  const igual = p.facturacionIgualCliente !== false;
  const nombre = String((igual ? p.name : (p.facturacionNombre || p.name)) || '').trim().toUpperCase();
  const cuit = String((igual ? p.cuit : p.facturacionCuit) || p.cuit || '').replace(/\D/g, '');
  const dni = String((igual ? p.dni : p.facturacionDni) || p.dni || '').replace(/\D/g, '');
  const docNro = cuit.length === 11 ? cuit : (dni || cuit);
  return {
    id: p.clientId || p.clienteId || null,
    nombre,
    docTipo: docNro.length === 11 ? 80 : (docNro ? 96 : 99),
    docNro,
    condicionIva: /^(30|33|34)/.test(cuit) ? 'IVA Responsable Inscripto' : 'Consumidor Final',
    domicilio: (igual ? p.direccionCliente : p.facturacionDireccion) || p.direccionCliente || p.location || '',
    telefono: p.phone || p.telefono || p.contactoTelefono || '',
    email: p.email || '',
  };
};

export const diasDesde = (iso) => {
  if (!iso) return 0;
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
};

export const TRAMOS_ANTIGUEDAD = [
  { id: '0-30', label: '0–30 días', max: 30, color: '#047857' },
  { id: '31-60', label: '31–60 días', max: 60, color: '#b45309' },
  { id: '61-90', label: '61–90 días', max: 90, color: '#c2410c' },
  { id: '90+', label: '+90 días', max: Infinity, color: '#b91c1c' },
];
export const tramoDe = (dias) => TRAMOS_ANTIGUEDAD.find((t) => dias <= t.max) || TRAMOS_ANTIGUEDAD[3];

/** Cliente (formato ReciboModal / NuevaFacturaModal) a partir de una cuenta de calcularCartera. */
export const clienteDeCuenta = (c) => ({
  clave: c.clave, id: c.clienteId, nombre: c.nombre, docNro: c.cuit, telefono: c.telefono, domicilio: c.domicilio, condicionIva: c.condicionIva,
});
