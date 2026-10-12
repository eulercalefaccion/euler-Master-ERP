/**
 * Ventas & Cobranzas – lógica pura (sin Firestore): medios de cobro, claves de cliente,
 * saldos por comprobante, cuenta corriente y número en letras.
 *
 * Reglas:
 *  - Pendiente de una factura = total − notas de crédito asociadas − cobros imputados (recibos no anulados).
 *  - Un recibo puede imputar a facturas y dejar un remanente "a cuenta" (saldo a favor del cliente).
 *  - El medio "saldo_favor" consume ese crédito: no es dinero nuevo (no suma a lo cobrado).
 *  - Saldo de la cuenta = facturado − NC − cobrado (dinero) ± saldos iniciales. Positivo = el cliente debe.
 */

export const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ─── Medios de cobro ────────────────────────────────────────────────────────
export const MEDIOS_COBRO = {
  efectivo:        { label: 'Efectivo',                  corto: 'Efectivo',      cuenta: ['1.1.01', 'Cajas y Bancos - Efectivo en ARS'], campos: [] },
  transferencia:   { label: 'Transferencia bancaria',    corto: 'Transferencia', cuenta: ['1.1.02', 'Bancos - Cuentas Corrientes ARS'], campos: ['cuentaDestino', 'operacion'] },
  cheque:          { label: 'Cheque físico de terceros', corto: 'Cheque',        cuenta: ['1.1.04', 'Cheques de Terceros en Cartera'], campos: ['banco', 'numero', 'fechaPago', 'librador', 'cuitLibrador'] },
  echeq:           { label: 'E-cheq',                    corto: 'E-cheq',        cuenta: ['1.1.04', 'Cheques de Terceros en Cartera'], campos: ['banco', 'numero', 'fechaPago', 'librador', 'cuitLibrador'] },
  tarjeta_credito: { label: 'Tarjeta de crédito',        corto: 'T. crédito',    cuenta: ['1.1.03', 'Tarjetas de Crédito a Cobrar'], campos: ['marca', 'cuotas', 'cupon'] },
  tarjeta_debito:  { label: 'Tarjeta de débito',         corto: 'T. débito',     cuenta: ['1.1.03', 'Tarjetas de Crédito a Cobrar'], campos: ['marca', 'cupon'] },
  mercadopago:     { label: 'Mercado Pago / billetera',  corto: 'Mercado Pago',  cuenta: ['1.1.09', 'Mercado Pago / Billeteras Virtuales'], campos: ['operacion'] },
  dolares:         { label: 'Dólares (USD)',             corto: 'USD',           cuenta: ['1.1.10', 'Caja Moneda Extranjera (USD)'], campos: ['montoUSD', 'cotizacion'] },
  saldo_favor:     { label: 'Saldo a favor del cliente', corto: 'Saldo a favor', cuenta: ['2.1.02', 'Anticipos de Clientes / Señas'], campos: [] },
};

export const CAMPOS_MEDIO = {
  cuentaDestino: { label: 'Cuenta destino', tipo: 'cuenta' },
  operacion: { label: 'N° de operación' },
  banco: { label: 'Banco' },
  numero: { label: 'N° de cheque' },
  fechaPago: { label: 'Fecha de pago', tipo: 'date' },
  librador: { label: 'Librador / firmante' },
  cuitLibrador: { label: 'CUIT librador' },
  marca: { label: 'Tarjeta', tipo: 'marca' },
  cuotas: { label: 'Cuotas', tipo: 'number' },
  cupon: { label: 'Cupón / lote' },
  montoUSD: { label: 'Monto USD', tipo: 'number' },
  cotizacion: { label: 'Cotización', tipo: 'number' },
};

export const MARCAS_TARJETA = ['Visa', 'Mastercard', 'American Express', 'Cabal', 'Naranja', 'Maestro', 'Otra'];

/** Texto corto de detalle de un medio de cobro (para listados y PDF). */
export const detalleMedio = (m = {}) => {
  switch (m.tipo) {
    case 'transferencia': return [m.cuentaDestino, m.operacion && `Op. ${m.operacion}`].filter(Boolean).join(' · ');
    case 'cheque':
    case 'echeq': return [m.banco, m.numero && `N° ${m.numero}`, m.fechaPago && `Pago ${String(m.fechaPago).split('-').reverse().join('/')}`].filter(Boolean).join(' · ');
    case 'tarjeta_credito': return [m.marca, m.cuotas && `${m.cuotas} cuota(s)`, m.cupon && `Cupón ${m.cupon}`].filter(Boolean).join(' · ');
    case 'tarjeta_debito': return [m.marca, m.cupon && `Cupón ${m.cupon}`].filter(Boolean).join(' · ');
    case 'mercadopago': return m.operacion ? `Op. ${m.operacion}` : '';
    case 'dolares': return m.montoUSD ? `USD ${Number(m.montoUSD).toLocaleString('es-AR')} × ${Number(m.cotizacion || 0).toLocaleString('es-AR')}` : '';
    case 'saldo_favor': return 'Aplicación de saldo a favor';
    default: return '';
  }
};

// ─── Claves de cliente ──────────────────────────────────────────────────────
export const normalizarNombre = (s) => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const docDe = (x) => {
  const d = String(x.clienteCuit || x.receptor?.docNro || '').replace(/\D/g, '');
  return d.length >= 7 && d !== '0' ? d : '';
};

/** Clave base de un comprobante / recibo / saldo inicial. */
export const claveBase = (x = {}) => {
  if (x.clienteClave) return x.clienteClave;
  if (x.clienteId) return `id:${x.clienteId}`;
  const d = docDe(x);
  if (d) return `doc:${d}`;
  const n = normalizarNombre(x.clienteNombre || x.receptor?.nombre);
  return n ? `nom:${n}` : 'sin-cliente';
};

/** Une claves que pertenecen al mismo cliente (id ↔ documento ↔ nombre). */
export const construirAlias = (docs = []) => {
  const alias = {};
  docs.forEach((x) => {
    const base = claveBase(x);
    if (!base.startsWith('id:')) return;
    const d = docDe(x);
    if (d && !alias[`doc:${d}`]) alias[`doc:${d}`] = base;
    const n = normalizarNombre(x.clienteNombre || x.receptor?.nombre);
    if (n && !alias[`nom:${n}`]) alias[`nom:${n}`] = base;
  });
  docs.forEach((x) => {
    const base = claveBase(x);
    if (!base.startsWith('doc:') || alias[base]) return;
    const n = normalizarNombre(x.clienteNombre || x.receptor?.nombre);
    if (n && !alias[`nom:${n}`]) alias[`nom:${n}`] = base;
  });
  return (x) => {
    const b = claveBase(x);
    return alias[b] || b;
  };
};

// ─── Saldos ─────────────────────────────────────────────────────────────────
const activo = (x) => x.estado !== 'anulado';
const empresaDe = (x) => x.empresaId || 'ayala-nicolas';

/**
 * Calcula todo lo necesario para listados, recibos y cuentas corrientes.
 * @param {object[]} comprobantes  facturas / NC / X (con _col y _prueba opcionales)
 * @param {object[]} recibos
 * @param {object[]} saldosIniciales  { importe (+ debe / − a favor), empresaId, cliente… }
 */
export const calcularCartera = (comprobantes = [], recibos = [], saldosIniciales = []) => {
  const comps = comprobantes.filter(activo);
  const recs = recibos.filter(activo);
  const sis = saldosIniciales.filter(activo);
  const claveDe = construirAlias([...comps, ...recs, ...sis]);

  // Notas de crédito y cobros por comprobante
  const ncPor = {};
  comps.forEach((c) => {
    if (c.esNotaCredito && c.comprobanteAsociado?.id) ncPor[c.comprobanteAsociado.id] = r2((ncPor[c.comprobanteAsociado.id] || 0) + Number(c.totalComprobante || 0));
  });
  const cobradoPor = {};
  const recibosPor = {};
  recs.forEach((r) => (r.imputaciones || []).forEach((i) => {
    cobradoPor[i.comprobanteId] = r2((cobradoPor[i.comprobanteId] || 0) + Number(i.importe || 0));
    (recibosPor[i.comprobanteId] = recibosPor[i.comprobanteId] || []).push({ id: r.id, numero: r.numeroOriginal, fecha: r.fechaEmision, importe: Number(i.importe || 0) });
  }));

  const pendienteDe = (c) => {
    if (c.esNotaCredito) return 0;
    return r2(Number(c.totalComprobante || 0) - (ncPor[c.id] || 0) - (cobradoPor[c.id] || 0));
  };

  // Cuentas por cliente
  const cuentas = {};
  const cuenta = (x) => {
    const k = claveDe(x);
    if (!cuentas[k]) {
      cuentas[k] = {
        clave: k, clienteId: x.clienteId || null, nombre: '', cuit: '', telefono: '', domicilio: '', condicionIva: '',
        porEmpresa: {}, movimientos: [], pendientes: [], ultimaFecha: '',
      };
    }
    const cta = cuentas[k];
    if (!cta.clienteId && x.clienteId) cta.clienteId = x.clienteId;
    if (!cta.nombre) cta.nombre = x.clienteNombre || x.receptor?.nombre || '';
    if (!cta.cuit) cta.cuit = docDe(x);
    if (!cta.telefono) cta.telefono = x.clienteTelefono || '';
    if (!cta.domicilio) cta.domicilio = x.receptor?.domicilio || x.clienteDomicilio || '';
    if (!cta.condicionIva) cta.condicionIva = x.receptor?.condicionIva || x.clienteCondicionIva || '';
    const fecha = x.fechaEmision || x.fecha || '';
    if (fecha > cta.ultimaFecha) cta.ultimaFecha = fecha;
    return cta;
  };
  const tot = (cta, emp) => {
    if (!cta.porEmpresa[emp]) cta.porEmpresa[emp] = { facturado: 0, notasCredito: 0, cobrado: 0, inicial: 0, creditoSinAplicar: 0, deudaFacturas: 0, saldo: 0 };
    return cta.porEmpresa[emp];
  };

  comps.forEach((c) => {
    const cta = cuenta(c);
    const emp = empresaDe(c);
    const t = tot(cta, emp);
    const total = Number(c.totalComprobante || 0);
    if (c.esNotaCredito) {
      t.notasCredito = r2(t.notasCredito + total);
      cta.movimientos.push({ tipo: 'nc', fecha: c.fechaEmision, empresaId: emp, ref: c, concepto: `${c.tipoComprobante} ${c.numeroOriginal}`, detalle: c.comprobanteAsociado?.numeroOriginal ? `Acredita ${c.comprobanteAsociado.numeroOriginal}` : (c.notas || ''), debe: 0, haber: total });
    } else {
      t.facturado = r2(t.facturado + total);
      const pend = pendienteDe(c);
      if (pend > 0.009) {
        t.deudaFacturas = r2(t.deudaFacturas + pend);
        cta.pendientes.push({ ...c, _pendiente: pend, _cobrado: cobradoPor[c.id] || 0, _nc: ncPor[c.id] || 0 });
      }
      cta.movimientos.push({ tipo: 'factura', fecha: c.fechaEmision, empresaId: emp, ref: c, concepto: `${c.tipoComprobante} ${c.numeroOriginal}`, detalle: c.notas || c.obraNombre || '', debe: total, haber: 0 });
    }
  });

  sis.forEach((s) => {
    const cta = cuenta(s);
    const emp = empresaDe(s);
    const t = tot(cta, emp);
    const imp = Number(s.importe || 0);
    t.inicial = r2(t.inicial + imp);
    if (imp > 0) {
      const pend = r2(imp - (cobradoPor[s.id] || 0));
      if (pend > 0.009) {
        t.deudaFacturas = r2(t.deudaFacturas + pend);
        cta.pendientes.push({
          ...s, _col: 'saldos_iniciales', tipoComprobante: 'SI', numeroOriginal: s.detalle || 'Saldo inicial', fechaEmision: s.fecha,
          totalComprobante: imp, _pendiente: pend, _cobrado: cobradoPor[s.id] || 0, _nc: 0,
        });
      }
    } else {
      t.creditoSinAplicar = r2(t.creditoSinAplicar - imp);
    }
    cta.movimientos.push({ tipo: 'inicial', fecha: s.fecha, empresaId: emp, ref: s, concepto: 'Saldo inicial', detalle: s.detalle || '', debe: imp > 0 ? imp : 0, haber: imp < 0 ? -imp : 0 });
  });

  recs.forEach((r) => {
    const cta = cuenta(r);
    const emp = empresaDe(r);
    const t = tot(cta, emp);
    const usado = r2((r.mediosPago || []).filter((m) => m.tipo === 'saldo_favor').reduce((a, m) => a + Number(m.importe || 0), 0));
    const dinero = r2(Number(r.totalRecibo || 0) - usado);
    t.cobrado = r2(t.cobrado + dinero);
    t.creditoSinAplicar = r2(t.creditoSinAplicar + Number(r.aCuenta || 0) - usado);
    const detalle = (r.mediosPago || []).filter((m) => m.tipo !== 'saldo_favor').map((m) => MEDIOS_COBRO[m.tipo]?.corto || m.tipo).join(' + ');
    cta.movimientos.push({
      tipo: 'recibo', fecha: r.fechaEmision, empresaId: emp, ref: r, concepto: `REC ${r.numeroOriginal || ''}`,
      detalle: [detalle, Number(r.aCuenta) > 0.009 ? `a cuenta $${Number(r.aCuenta).toLocaleString('es-AR')}` : '', usado > 0 ? 'aplica saldo a favor' : ''].filter(Boolean).join(' · '),
      debe: 0, haber: dinero,
    });
  });

  // Totales y saldo corrido
  Object.values(cuentas).forEach((cta) => {
    let saldoTotal = 0;
    Object.values(cta.porEmpresa).forEach((t) => {
      t.saldo = r2(t.facturado - t.notasCredito - t.cobrado + t.inicial);
      saldoTotal += t.saldo;
    });
    cta.saldo = r2(saldoTotal);
    cta.deudaFacturas = r2(Object.values(cta.porEmpresa).reduce((a, t) => a + t.deudaFacturas, 0));
    cta.creditoSinAplicar = r2(Object.values(cta.porEmpresa).reduce((a, t) => a + t.creditoSinAplicar, 0));
    cta.movimientos.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || orden(a) - orden(b));
    cta.pendientes.sort((a, b) => (a.fechaEmision || '').localeCompare(b.fechaEmision || ''));
  });

  return { cuentas, claveDe, pendienteDe, ncPor, cobradoPor, recibosPor };
};

const ORDEN_MOV = { inicial: 0, factura: 1, nc: 2, recibo: 3 };
const orden = (m) => ORDEN_MOV[m.tipo] ?? 9;

/** Agrega saldo corrido a una lista de movimientos (ya filtrada por empresa si corresponde). */
export const conSaldoCorrido = (movs = []) => {
  let s = 0;
  return movs.map((m) => {
    s = r2(s + Number(m.debe || 0) - Number(m.haber || 0));
    return { ...m, saldo: s };
  });
};

/** Totales de una cuenta filtrando por empresa ('' = todas). */
export const totalesCuenta = (cta, empresaId = '') => {
  const lista = empresaId ? [cta.porEmpresa[empresaId]].filter(Boolean) : Object.values(cta.porEmpresa);
  const sum = (k) => r2(lista.reduce((a, t) => a + Number(t[k] || 0), 0));
  return {
    facturado: sum('facturado'), notasCredito: sum('notasCredito'), cobrado: sum('cobrado'), inicial: sum('inicial'),
    deudaFacturas: sum('deudaFacturas'), creditoSinAplicar: sum('creditoSinAplicar'), saldo: sum('saldo'),
  };
};

// ─── Número en letras (para el recibo) ──────────────────────────────────────
const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

const menorMil = (n) => {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100);
  const r = n % 100;
  let txt = CENTENAS[c];
  if (r) {
    const dec = r < 30 ? UNIDADES[r] : `${DECENAS[Math.floor(r / 10)]}${r % 10 ? ` Y ${UNIDADES[r % 10]}` : ''}`;
    txt = txt ? `${txt} ${dec}` : dec;
  }
  return txt;
};

const enteroALetras = (n) => {
  if (n === 0) return 'CERO';
  const partes = [];
  const millones = Math.floor(n / 1e6);
  const miles = Math.floor((n % 1e6) / 1000);
  const resto = n % 1000;
  const apocope = (t) => t.replace(/VEINTIUNO$/, 'VEINTIÚN').replace(/UNO$/, 'UN');
  if (millones) partes.push(millones === 1 ? 'UN MILLÓN' : `${apocope(enteroALetras(millones))} MILLONES`);
  if (miles) partes.push(miles === 1 ? 'MIL' : `${apocope(menorMil(miles))} MIL`);
  if (resto) partes.push(menorMil(resto));
  return partes.join(' ');
};

/** 4923869.94 → "PESOS CUATRO MILLONES NOVECIENTOS VEINTITRÉS MIL OCHOCIENTOS SESENTA Y NUEVE CON 94/100" */
export const numeroALetras = (importe, moneda = 'PESOS') => {
  const n = Math.round(Math.abs(Number(importe) || 0) * 100);
  const entero = Math.floor(n / 100);
  const cent = String(n % 100).padStart(2, '0');
  return `${moneda} ${enteroALetras(entero)} CON ${cent}/100`;
};
