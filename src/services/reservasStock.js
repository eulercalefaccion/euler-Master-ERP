/**
 * Reservas de stock (cálculo en vivo, sin contadores).
 *
 * Un material está RESERVADO si y solo si:
 *   - fue FACTURADO con "Entrega pendiente" (colección materiales_a_favor, estado pendiente|parcial), y
 *   - el comprobante está totalmente COBRADO (saldo pendiente 0).
 *   Los materiales a favor cargados manualmente (saldo inicial, sin comprobante) se consideran ya pagados.
 *
 * Lo facturado con entrega pendiente que todavía se debe (total o parcialmente) NO reserva stock:
 * se devuelve aparte en `sinCobrar` solo a título informativo.
 *
 * Disponible = stock físico − reservado. Puede ser NEGATIVO: indica lo que falta comprar.
 */
import { calcularCartera, normalizarNombre, r2 } from './ventasCalculo';

const fechaISO = (v) => {
  if (!v) return '';
  if (typeof v === 'string') return v.slice(0, 10);
  const d = v.toDate ? v.toDate() : (v.seconds ? new Date(v.seconds * 1000) : new Date(v));
  return Number.isNaN(d.getTime()) ? '' : new Date(d.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
};

export const claveArticulo = (r) => (r.articuloId ? r.articuloId : `txt:${normalizarNombre(r.descripcion)}`);

/**
 * Estado de pago del comprobante que originó un doc de materiales_a_favor.
 * @returns {{ pagado: boolean, deuda: number, txt: string }}
 */
const estadoPago = (m, compPor, cartera) => {
  if (!m.comprobanteId) return { pagado: true, deuda: 0, txt: 'Saldo inicial (pagado)' };
  const c = compPor[m.comprobanteId];
  if (!c) return { pagado: false, deuda: 0, txt: 'Comprobante no encontrado' };
  if (c.estado === 'anulado') return null; // comprobante anulado: no cuenta para nada
  const deuda = cartera.pendienteDe(c);
  return deuda <= 0.01 ? { pagado: true, deuda: 0, txt: 'Cobrado' } : { pagado: false, deuda, txt: `Debe ${deuda.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}` };
};

/**
 * @param {{ materiales?: object[], lista?: object[], comprobantes?: object[], recibos?: object[], incluirPruebas?: boolean }} p
 * @returns {{ reservas: object[], sinCobrar: object[], porArticulo: Record<string, object>, reservadoPor: Record<string, number> }}
 */
export const calcularReservas = ({ materiales = [], lista = [], comprobantes = [], recibos = [], incluirPruebas = false } = {}) => {
  const listaPor = Object.fromEntries(lista.map((i) => [i.id, i]));
  const compPor = Object.fromEntries(comprobantes.map((c) => [c.id, c]));
  const cartera = calcularCartera(comprobantes, recibos, []);
  const reservas = [];
  const sinCobrar = [];

  materiales
    .filter((m) => (m.estado === 'pendiente' || m.estado === 'parcial') && (incluirPruebas || !m.prueba))
    .forEach((m) => {
      const pago = estadoPago(m, compPor, cartera);
      if (!pago) return;
      (m.items || []).forEach((it, idx) => {
        const pendiente = r2(Number(it.cantidad || 0) - Number(it.cantidadEntregada || 0));
        if (pendiente <= 0.0001) return;
        const art = it.listaItemId ? listaPor[it.listaItemId] : null;
        (pago.pagado ? reservas : sinCobrar).push({
          key: `m-${m.id}-${idx}`, ref: m, itemIndex: idx,
          articuloId: art ? art.id : null, descripcion: art?.descripcion || it.descripcion, unidad: it.unidad || art?.unidad || 'u',
          cantidad: Number(it.cantidad || 0), entregada: Number(it.cantidadEntregada || 0), pendiente,
          precioUnitario: Number(it.precioUnitario || 0),
          empresaId: m.empresaId, clienteNombre: m.clienteNombre, clienteClave: m.clienteClave, clienteTelefono: m.clienteTelefono,
          comprobanteId: m.comprobanteId, comprobanteColeccion: m.comprobanteColeccion, comprobanteNumero: m.comprobanteNumero || (m.comprobanteId ? '' : 'Saldo inicial'),
          obraId: m.obraId || null, fecha: m.fecha || fechaISO(m.createdAt), prueba: !!m.prueba,
          pago,
        });
      });
    });

  const porArticulo = {};
  const reservadoPor = {};
  reservas.forEach((r) => {
    const k = claveArticulo(r);
    const art = r.articuloId ? listaPor[r.articuloId] : null;
    if (!porArticulo[k]) {
      porArticulo[k] = {
        clave: k, articuloId: r.articuloId, articulo: art, descripcion: r.descripcion, unidad: r.unidad,
        stock: art ? Number(art.stock || 0) : null, reservado: 0, reservas: [], clientes: new Set(), fechaMasVieja: '',
      };
    }
    const a = porArticulo[k];
    a.reservado = r2(a.reservado + r.pendiente);
    a.reservas.push(r);
    a.clientes.add(r.clienteClave || normalizarNombre(r.clienteNombre));
    if (r.fecha && (!a.fechaMasVieja || r.fecha < a.fechaMasVieja)) a.fechaMasVieja = r.fecha;
    if (r.articuloId) reservadoPor[r.articuloId] = r2((reservadoPor[r.articuloId] || 0) + r.pendiente);
  });
  Object.values(porArticulo).forEach((a) => {
    a.cantClientes = a.clientes.size;
    delete a.clientes;
    a.disponible = a.stock === null ? null : r2(a.stock - a.reservado);
    a.faltante = a.disponible === null ? null : Math.max(0, -a.disponible);
  });

  return { reservas, sinCobrar, porArticulo, reservadoPor };
};
