/**
 * Reservas de stock (cálculo en vivo, sin contadores).
 *
 * Un material está RESERVADO cuando ya tiene dueño pero todavía no salió del depósito:
 *   1. "pagado": vendido/facturado con "Entrega pendiente" (colección materiales_a_favor, estado pendiente|parcial).
 *   2. "obra":   presupuesto aprobado convertido en obra que todavía no se inició (estado 'Pendiente de Inicio').
 *               Al iniciar la obra el stock físico se descuenta y la reserva desaparece sola.
 *
 * Disponible = stock físico − reservado. Puede ser NEGATIVO: indica lo que falta comprar.
 * Si una obra ya tiene materiales a favor asociados (se facturó con entrega pendiente), no se duplica la reserva.
 */
import { normalizarNombre, r2 } from './ventasCalculo';

export const ESTADO_OBRA_RESERVA = 'Pendiente de Inicio';
const NO_STOCK = ['mano_de_obra', 'servicio', 'gasto'];

const fechaISO = (v) => {
  if (!v) return '';
  if (typeof v === 'string') return v.slice(0, 10);
  const d = v.toDate ? v.toDate() : (v.seconds ? new Date(v.seconds * 1000) : new Date(v));
  return Number.isNaN(d.getTime()) ? '' : new Date(d.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
};

export const claveArticulo = (r) => (r.articuloId ? r.articuloId : `txt:${normalizarNombre(r.descripcion)}`);

/**
 * @returns {{ reservas: object[], porArticulo: Record<string, object>, reservadoPor: Record<string, number> }}
 */
export const calcularReservas = ({ materiales = [], obras = [], lista = [], incluirPruebas = false } = {}) => {
  const listaPor = Object.fromEntries(lista.map((i) => [i.id, i]));
  const reservas = [];
  const matsActivos = materiales.filter((m) => (m.estado === 'pendiente' || m.estado === 'parcial') && (incluirPruebas || !m.prueba));
  const obrasConMats = new Set(matsActivos.filter((m) => m.obraId).map((m) => m.obraId));

  matsActivos.forEach((m) => {
    (m.items || []).forEach((it, idx) => {
      const pendiente = r2(Number(it.cantidad || 0) - Number(it.cantidadEntregada || 0));
      if (pendiente <= 0.0001) return;
      const art = it.listaItemId ? listaPor[it.listaItemId] : null;
      reservas.push({
        key: `m-${m.id}-${idx}`, origen: 'pagado', ref: m, itemIndex: idx,
        articuloId: art ? art.id : null, descripcion: art?.descripcion || it.descripcion, unidad: it.unidad || art?.unidad || 'u',
        cantidad: Number(it.cantidad || 0), entregada: Number(it.cantidadEntregada || 0), pendiente,
        precioUnitario: Number(it.precioUnitario || 0),
        empresaId: m.empresaId, clienteNombre: m.clienteNombre, clienteClave: m.clienteClave, clienteTelefono: m.clienteTelefono,
        comprobanteId: m.comprobanteId, comprobanteColeccion: m.comprobanteColeccion, comprobanteNumero: m.comprobanteNumero || (m.nota ? 'Saldo inicial' : ''),
        obraId: m.obraId || null, fecha: m.fecha || fechaISO(m.createdAt), prueba: !!m.prueba,
      });
    });
  });

  obras.forEach((o) => {
    if (o.deleted || o.estado !== ESTADO_OBRA_RESERVA || obrasConMats.has(o.id)) return;
    (o.quoteItems || []).forEach((q, idx) => {
      if (!q.listaItemId) return;
      const art = listaPor[q.listaItemId];
      if (art && NO_STOCK.includes(art.tipo)) return;
      if (!art && NO_STOCK.includes(q.tipo)) return;
      const cant = Number(q.quantity) || 0;
      if (cant <= 0) return;
      reservas.push({
        key: `o-${o.id}-${idx}`, origen: 'obra', ref: o, itemIndex: idx,
        articuloId: q.listaItemId, descripcion: art?.descripcion || q.descripcion, unidad: art?.unidad || q.unidad || 'u',
        cantidad: cant, entregada: 0, pendiente: cant, precioUnitario: Number(q.unitPrice || 0),
        empresaId: (o.canal === 'canal2' || o.canal === 'descuento') ? 'euler-calefaccion' : 'ayala-nicolas',
        clienteNombre: o.clientName || o.name, clienteClave: null, clienteTelefono: o.telefono || o.clientPhone || o.contactoTelefono || '',
        comprobanteNumero: '', obraId: o.id, otNumber: o.otNumber || '', obraNombre: o.name || '',
        fecha: fechaISO(o.createdAt) || fechaISO(o.fechaAprobacion), prueba: false,
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
        stock: art ? Number(art.stock || 0) : null, reservado: 0, reservadoPagado: 0, reservadoObra: 0, reservas: [], clientes: new Set(), fechaMasVieja: '',
      };
    }
    const a = porArticulo[k];
    a.reservado = r2(a.reservado + r.pendiente);
    if (r.origen === 'pagado') a.reservadoPagado = r2(a.reservadoPagado + r.pendiente);
    else a.reservadoObra = r2(a.reservadoObra + r.pendiente);
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

  return { reservas, porArticulo, reservadoPor };
};
