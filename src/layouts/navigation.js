/**
 * Navegación del ERP — ÚNICA FUENTE DE VERDAD.
 *
 * Sidebar, buscador (Ctrl+K) y breadcrumb del Header se generan desde acá.
 * Para agregar/renombrar un módulo, modificá solo este archivo.
 *
 * Campos de cada ítem:
 *  - name:        nombre visible (lenguaje simple, sin siglas)
 *  - icon:        componente de lucide-react (único por ítem)
 *  - path:        ruta (puede incluir ?query para pestañas)
 *  - description: qué es y para qué sirve (tooltip)
 *  - keywords:    sinónimos para el buscador
 *  - badge:       etiqueta opcional (ej. 'IA')
 *  - adminOnly:   solo visible para administradores
 *  - isDefault:   en ítems con ?query, se considera activo si la URL no trae ese parámetro
 *  - matchParams: valores alternativos que también marcan el ítem como activo (ej. { tab: ['empresas','bancos'] })
 *  - children:    sub-ítems (submenú desplegable)
 */
import {
  LayoutDashboard, Contact, FileSignature, Receipt, Tag, Layers, Flame, Boxes,
  HardHat, Wrench, Clock, Warehouse, ShoppingCart, Landmark, BookUser, LineChart,
  BookOpen, Scale, Users, Banknote, BarChart3, PieChart, Settings, Building2,
  ShieldCheck, DatabaseZap, Trash2,
} from 'lucide-react';

export const NAV_SECTIONS = [
  {
    id: 'principal',
    label: 'PRINCIPAL',
    items: [
      { name: 'Dashboard', icon: LayoutDashboard, path: '/', description: 'Resumen del día: indicadores, alertas y pendientes.', keywords: ['inicio', 'panel', 'home', 'resumen'] },
      { name: 'Contactos', icon: Contact, path: '/clientes', description: 'Directorio único de clientes, proveedores y técnicos externos.', keywords: ['cliente', 'clientes', 'proveedor', 'proveedores', 'tecnico', 'cuit', 'agenda', 'directorio'] },
    ],
  },
  {
    id: 'comercial',
    label: 'COMERCIAL',
    items: [
      { name: 'Presupuestos', icon: FileSignature, path: '/presupuestos', description: 'Cotizaciones a clientes: tablero de seguimiento y listado.', keywords: ['cotizacion', 'lead', 'crm', 'oportunidad', 'kanban', 'listado de presupuestos'] },
      { name: 'Ventas y Facturación', icon: Receipt, path: '/facturas', description: 'Emisión de facturas, notas de crédito y comprobantes ARCA.', keywords: ['factura', 'facturar', 'afip', 'arca', 'nota de credito', 'comprobante', 'venta'] },
    ],
  },
  {
    id: 'catalogo',
    label: 'CATÁLOGO',
    items: [
      { name: 'Lista de Precios', icon: Tag, path: '/lista-precios', description: 'Precios de venta y costo de cada artículo.', keywords: ['precio', 'costo', 'tarifa', 'markup', 'dolar'] },
      { name: 'Estándares', icon: Layers, path: '/estandares', description: 'Plantillas predefinidas para cargar rápido en presupuestos.', keywords: ['plantilla', 'kit', 'combo', 'estandar'] },
      { name: 'Balance Térmico', badge: 'IA', icon: Flame, path: '/balance-termico', description: 'Cálculo de calorías y emisores a partir del plano de la obra.', keywords: ['calorias', 'radiadores', 'piso radiante', 'plano', 'balance termico', 'kcal'] },
      { name: 'Artículos', icon: Boxes, path: '/articulos', description: 'Maestro de productos y materiales: código, categoría y unidad.', keywords: ['producto', 'material', 'codigo', 'articulo', 'item'] },
    ],
  },
  {
    id: 'operaciones',
    label: 'OPERACIONES',
    items: [
      { name: 'Obras', icon: HardHat, path: '/obras', description: 'Instalaciones en curso: avance, materiales y documentación.', keywords: ['proyecto', 'instalacion', 'obra'] },
      { name: 'Servicios Técnicos', icon: Wrench, path: '/servicios', description: 'Visitas de mantenimiento, reparaciones y service.', keywords: ['service', 'reparacion', 'visita', 'mantenimiento', 'sstt'] },
      { name: 'Jornadas', icon: Clock, path: '/jornadas', description: 'Fichaje del personal: ingresos, llegadas tarde, incidencias y gastos.', keywords: ['asistencia', 'fichaje', 'horas', 'presentismo', 'llegadas tarde'] },
      { name: 'Stock', icon: Warehouse, path: '/stock', description: 'Existencias, reservas y materiales en depósito.', keywords: ['inventario', 'deposito', 'reserva', 'existencias'] },
    ],
  },
  {
    id: 'compras',
    label: 'COMPRAS',
    items: [
      { name: 'Compras y Gastos', icon: ShoppingCart, path: '/compras', description: 'Facturas de proveedores, gastos y órdenes de compra.', keywords: ['proveedor', 'gasto', 'factura de compra', 'orden de compra', 'ap', 'cuentas a pagar'] },
    ],
  },
  {
    id: 'finanzas',
    label: 'FINANZAS',
    items: [
      { name: 'Tesorería y Bancos', icon: Landmark, path: '/tesoreria', description: 'Cobranzas, pagos, cheques, tarjetas y bancos.', keywords: ['recibo', 'cobro', 'cobranza', 'pago', 'cheque', 'echeq', 'banco', 'tarjeta', 'orden de pago', 'caja'] },
      { name: 'Cuentas Corrientes', icon: BookUser, path: '/cuentas-corrientes', description: 'Saldo de cada cliente: qué facturamos, qué cobró y qué debe.', keywords: ['deuda', 'saldo', 'cta cte', 'cuenta corriente', 'morosos', 'deudores'] },
      { name: 'Flujo de Fondos Proyectado', icon: LineChart, path: '/flujo-fondos', description: 'Proyección de ingresos y egresos de los próximos meses.', keywords: ['cash flow', 'proyeccion', 'flujo de caja'] },
      { name: 'Contabilidad', icon: BookOpen, path: '/contabilidad', description: 'Asientos, plan de cuentas y libro diario.', keywords: ['asiento', 'diario', 'mayor', 'plan de cuentas', 'contable'] },
      { name: 'Balance General', icon: Scale, path: '/balance', description: 'Situación patrimonial: activos, pasivos y resultado.', keywords: ['patrimonio', 'resultado', 'activo', 'pasivo'] },
    ],
  },
  {
    id: 'rrhh',
    label: 'RRHH',
    items: [
      { name: 'Colaboradores', icon: Users, path: '/colaboradores', description: 'Legajos y datos del personal.', keywords: ['empleados', 'personal', 'legajo', 'personas'] },
      { name: 'Sueldos', icon: Banknote, path: '/sueldos', description: 'Liquidación de haberes y recibos de sueldo.', keywords: ['haberes', 'liquidacion', 'nomina', 'salario'] },
    ],
  },
  {
    id: 'analisis',
    label: 'ANÁLISIS',
    items: [
      { name: 'Reportes', badge: 'IA', icon: BarChart3, path: '/reportes', description: 'Informes y consultas asistidas por inteligencia artificial.', keywords: ['informe', 'estadistica', 'reporte', 'ia'] },
      { name: 'Rentabilidad de Obras', icon: PieChart, path: '/rentabilidad-obras', adminOnly: true, description: 'Margen real de cada obra: ingresos contra costos.', keywords: ['margen', 'ganancia', 'rentabilidad'] },
    ],
  },
  {
    id: 'sistema',
    label: 'SISTEMA',
    items: [
      {
        name: 'Configuración', icon: Settings, path: '/configuracion', adminOnly: true,
        description: 'Empresas, bancos, usuarios y migraciones.', keywords: ['ajustes', 'configuracion'],
        children: [
          { name: 'Empresas y Bancos', icon: Building2, path: '/configuracion?tab=empresas', matchParams: { tab: ['empresas', 'bancos'] }, adminOnly: true, description: 'Datos fiscales, puntos de venta, cuentas bancarias y cajas.', keywords: ['empresa', 'cuit', 'punto de venta', 'banco', 'caja'] },
          { name: 'Usuarios y Permisos', icon: ShieldCheck, path: '/configuracion?tab=usuarios', isDefault: true, adminOnly: true, description: 'Alta de usuarios, roles y accesos al sistema.', keywords: ['usuario', 'rol', 'permiso', 'contraseña', 'acceso', 'gestion de usuarios'] },
          { name: 'Migración GesDatta', icon: DatabaseZap, path: '/migracion-gesdatta', adminOnly: true, description: 'Importación de datos desde el sistema anterior (GesDatta).', keywords: ['importar', 'gesdatta', 'migracion'] },
        ],
      },
      { name: 'Papelera', icon: Trash2, path: '/papelera', description: 'Registros eliminados que se pueden restaurar.', keywords: ['borrados', 'restaurar', 'eliminados'] },
    ],
  },
];

/** Quita acentos y pasa a minúsculas para comparar textos. */
export const normalizar = (s = '') => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const parsePath = (path) => {
  const [pathname, qs = ''] = path.split('?');
  return { pathname, params: new URLSearchParams(qs) };
};

/**
 * Puntaje de coincidencia de un ítem con la ubicación actual (0 = no coincide).
 * Exacto > con parámetros > prefijo (rutas de detalle, ej. /clientes/123).
 */
export const matchScore = (item, location) => {
  const { pathname, params } = parsePath(item.path);
  const locParams = new URLSearchParams(location.search || '');
  let score = 0;
  if (location.pathname === pathname) score = 10;
  else if (pathname !== '/' && location.pathname.startsWith(pathname + '/')) score = 5;
  else return 0;
  for (const [k, v] of params.entries()) {
    const actual = locParams.get(k);
    const aceptados = item.matchParams?.[k] || [v];
    if (actual != null && aceptados.includes(actual)) score += 3;
    else if (actual == null && item.isDefault) score += 1;
    else return 0;
  }
  return score;
};

/** Filtra ítems según permisos del usuario. */
export const filtrarPorRol = (sections, isAdmin) => sections
  .map((s) => ({
    ...s,
    items: s.items
      .filter((i) => isAdmin || !i.adminOnly)
      .map((i) => (i.children ? { ...i, children: i.children.filter((c) => isAdmin || !c.adminOnly) } : i)),
  }))
  .filter((s) => s.items.length > 0);

/** Lista plana de todos los ítems navegables con su sección y padre. */
export const aplanar = (sections) => sections.flatMap((section) => section.items.flatMap((item) => (
  item.children
    ? item.children.map((child) => ({ item: child, section, parent: item }))
    : [{ item, section, parent: null }]
)));

/** Ítem activo (el de mayor puntaje) para la ubicación actual. */
export const findNavByLocation = (location, sections = NAV_SECTIONS) => {
  let best = null;
  let bestScore = 0;
  for (const entry of aplanar(sections)) {
    const sc = matchScore(entry.item, location);
    if (sc > bestScore) { best = entry; bestScore = sc; }
  }
  // Rutas propias del padre (ej. /configuracion sin ?tab) caen en su hijo por defecto
  return best;
};

/** Búsqueda por nombre, descripción, sinónimos y área. */
export const searchNav = (term, sections = NAV_SECTIONS) => {
  const t = normalizar(term);
  if (!t) return [];
  const palabras = t.split(/\s+/);
  return aplanar(sections)
    .map((entry) => {
      const { item, section, parent } = entry;
      const nombre = normalizar(item.name);
      const texto = normalizar([item.name, item.description, section.label, parent?.name, ...(item.keywords || [])].join(' '));
      if (!palabras.every((p) => texto.includes(p))) return null;
      let score = 1;
      if (nombre.startsWith(t)) score = 4;
      else if (nombre.includes(t)) score = 3;
      else if ((item.keywords || []).some((k) => normalizar(k).startsWith(t))) score = 2;
      return { ...entry, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
};
