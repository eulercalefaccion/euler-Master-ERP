/**
 * Servicio de Cálculo de Descuentos Comerciales sobre Presupuestos - Euler
 * 
 * Reglas Comerciales:
 * 1. Los precios unitarios y subtotales en el cotizador están expresados en NETO (SIN IVA).
 * 2. Los descuentos comerciales se calculan SIEMPRE sobre el precio IVA INCLUIDO (Neto * 1.21).
 * 3. MATERIAL: Descuento comercial del 10,5% sobre valor con IVA (Factor: 0.895).
 * 4. MANO DE OBRA: Descuento comercial del 21,0% sobre valor con IVA (Factor: 0.79).
 * 5. MIXTO CAÑERÍA: 50% Materiales (-10,5%) y 50% Mano de Obra (-21%).
 *    Factor equivalente = (0.895 + 0.79) / 2 = 0.8425.
 */

export const IVA_TASA = 0.21;
export const FACTOR_IVA = 1.21;

export const FACTOR_DESC_MATERIAL = 0.895;     // 1 - 0.105 (descuento 10.5%)
export const FACTOR_DESC_MANO_OBRA = 0.79;     // 1 - 0.210 (descuento 21.0%)
export const FACTOR_DESC_MIXTO = (FACTOR_DESC_MATERIAL + FACTOR_DESC_MANO_OBRA) / 2; // 0.8425

/**
 * Determina la categoría de cálculo para un ítem del presupuesto.
 * Categorías: 'MIXTO_50_50' | 'MANO_DE_OBRA' | 'MATERIAL'
 */
export const getItemCategory = (item) => {
  if (!item) return 'MATERIAL';
  
  if (item.categoriaCalculo) {
    const cat = String(item.categoriaCalculo).toUpperCase();
    if (cat === 'MIXTO_50_50' || cat === 'MIXTO') return 'MIXTO_50_50';
    if (cat === 'MANO_DE_OBRA') return 'MANO_DE_OBRA';
    if (cat === 'MATERIAL') return 'MATERIAL';
  }

  const desc = (item.descripcion || '').toLowerCase();
  
  // Ítem mixto: "Mano de obra y Materiales para cañería de calefacción por agua en sistema pressfitting de polietileno reticulado"
  const hasPressfitting = desc.includes('pressfitting');
  const hasManoDeObra = desc.includes('mano de obra') || desc.includes('m.o.');
  const hasMaterial = desc.includes('material') || desc.includes('materiales');
  const hasCaneria = desc.includes('cañería') || desc.includes('caneria') || desc.includes('cañeria');

  if (
    (hasPressfitting && (hasCaneria || hasManoDeObra)) ||
    (hasManoDeObra && hasMaterial && hasCaneria) ||
    desc.includes('mano de obra y materiales para cañería') ||
    desc.includes('mano de obra y materiales para caneria')
  ) {
    return 'MIXTO_50_50';
  }

  // Mano de obra o servicios exclusivos
  const tipo = (item.tipo || '').toLowerCase();
  if (tipo === 'mano_de_obra' || tipo === 'servicio') {
    return 'MANO_DE_OBRA';
  }

  // Por defecto es Material / Equipamiento
  return 'MATERIAL';
};

/**
 * Calcula los importes de un ítem individual con y sin descuento.
 */
export const calcularItemDescuento = (item) => {
  const qty = parseFloat(item.quantity) || 0;
  const unitPrice = parseFloat(item.unitPrice) || 0;
  const subtotalNeto = Math.round(qty * unitPrice);

  const subtotalConIVA = Math.round(subtotalNeto * FACTOR_IVA);
  const categoria = getItemCategory(item);

  let finalConDescuento = subtotalConIVA;
  let parteMatConIVA = 0;
  let parteMatFinal = 0;
  let parteMoConIVA = 0;
  let parteMoFinal = 0;

  if (categoria === 'MATERIAL') {
    finalConDescuento = Math.round(subtotalConIVA * FACTOR_DESC_MATERIAL);
  } else if (categoria === 'MANO_DE_OBRA') {
    finalConDescuento = Math.round(subtotalConIVA * FACTOR_DESC_MANO_OBRA);
  } else if (categoria === 'MIXTO_50_50') {
    parteMatConIVA = Math.round(subtotalConIVA / 2);
    parteMoConIVA = subtotalConIVA - parteMatConIVA; // Garantiza suma exacta sin pérdida por redondeo

    parteMatFinal = Math.round(parteMatConIVA * FACTOR_DESC_MATERIAL);
    parteMoFinal = Math.round(parteMoConIVA * FACTOR_DESC_MANO_OBRA);
    finalConDescuento = parteMatFinal + parteMoFinal;
  }

  const descuentoARS = subtotalConIVA - finalConDescuento;

  return {
    subtotalNeto,
    subtotalConIVA,
    categoria,
    finalConDescuento,
    descuentoARS,
    parteMatFinal,
    parteMoFinal,
  };
};

/**
 * Calcula el presupuesto completo según la modalidad seleccionada.
 * 
 * @param {Array} quoteItems - Lista de ítems del presupuesto
 * @param {boolean} conDescuentoComercial - Si está activo el modo Descuento Comercial
 * @returns {Object} Resumen completo con métricas globales y desglose por categoría
 */
export const calcularDescuentosPresupuesto = (quoteItems = [], conDescuentoComercial = false) => {
  let subtotalNeto = 0;

  // Acumuladores por categoría
  const desglose = {
    materiales: {
      neto: 0,
      conIVA: 0,
      descuento: 0,
      totalFinal: 0,
      tasaDescuento: 0.105,
      itemsCount: 0,
    },
    manoDeObra: {
      neto: 0,
      conIVA: 0,
      descuento: 0,
      totalFinal: 0,
      tasaDescuento: 0.21,
      itemsCount: 0,
    },
    mixto: {
      neto: 0,
      conIVA: 0,
      parteMatConIVA: 0,
      parteMatFinal: 0,
      parteMoConIVA: 0,
      parteMoFinal: 0,
      descuento: 0,
      totalFinal: 0,
      itemsCount: 0,
    },
  };

  (quoteItems || []).forEach((item) => {
    const qty = parseFloat(item.quantity) || 0;
    const unitPrice = parseFloat(item.unitPrice) || 0;
    const itemNeto = Math.round(qty * unitPrice);
    subtotalNeto += itemNeto;

    const cat = getItemCategory(item);
    const itemConIVA = Math.round(itemNeto * FACTOR_IVA);

    if (cat === 'MATERIAL') {
      const itemFinal = Math.round(itemConIVA * FACTOR_DESC_MATERIAL);
      const itemDesc = itemConIVA - itemFinal;

      desglose.materiales.neto += itemNeto;
      desglose.materiales.conIVA += itemConIVA;
      desglose.materiales.descuento += itemDesc;
      desglose.materiales.totalFinal += conDescuentoComercial ? itemFinal : itemConIVA;
      desglose.materiales.itemsCount += 1;
    } else if (cat === 'MANO_DE_OBRA') {
      const itemFinal = Math.round(itemConIVA * FACTOR_DESC_MANO_OBRA);
      const itemDesc = itemConIVA - itemFinal;

      desglose.manoDeObra.neto += itemNeto;
      desglose.manoDeObra.conIVA += itemConIVA;
      desglose.manoDeObra.descuento += itemDesc;
      desglose.manoDeObra.totalFinal += conDescuentoComercial ? itemFinal : itemConIVA;
      desglose.manoDeObra.itemsCount += 1;
    } else if (cat === 'MIXTO_50_50') {
      const mitadMat = Math.round(itemConIVA / 2);
      const mitadMo = itemConIVA - mitadMat;

      const matFinal = Math.round(mitadMat * FACTOR_DESC_MATERIAL);
      const moFinal = Math.round(mitadMo * FACTOR_DESC_MANO_OBRA);
      const itemFinal = matFinal + moFinal;
      const itemDesc = itemConIVA - itemFinal;

      desglose.mixto.neto += itemNeto;
      desglose.mixto.conIVA += itemConIVA;
      desglose.mixto.parteMatConIVA += mitadMat;
      desglose.mixto.parteMoConIVA += mitadMo;
      desglose.mixto.parteMatFinal += conDescuentoComercial ? matFinal : mitadMat;
      desglose.mixto.parteMoFinal += conDescuentoComercial ? moFinal : mitadMo;
      desglose.mixto.descuento += itemDesc;
      desglose.mixto.totalFinal += conDescuentoComercial ? itemFinal : itemConIVA;
      desglose.mixto.itemsCount += 1;
    }
  });

  const ivaOriginal = Math.round(subtotalNeto * IVA_TASA);
  const totalOriginalConIVA = subtotalNeto + ivaOriginal;

  const totalFinalConDescuento =
    desglose.materiales.totalFinal +
    desglose.manoDeObra.totalFinal +
    desglose.mixto.totalFinal;

  const descuentoTotalARS = conDescuentoComercial
    ? desglose.materiales.descuento + desglose.manoDeObra.descuento + desglose.mixto.descuento
    : 0;

  const descuentoPorcentaje =
    totalOriginalConIVA > 0 && conDescuentoComercial
      ? ((descuentoTotalARS / totalOriginalConIVA) * 100)
      : 0;

  // Monto final a cobrar / presentar según el modo activo
  const montoFinalPresupuesto = conDescuentoComercial
    ? totalFinalConDescuento
    : totalOriginalConIVA;

  return {
    conDescuentoComercial,
    subtotalNeto,
    ivaOriginal,
    totalOriginalConIVA,
    descuentoTotalARS,
    descuentoPorcentaje: Math.round(descuentoPorcentaje * 100) / 100, // 2 decimales
    totalFinalConDescuento,
    montoFinalPresupuesto,
    desglose,
  };
};

/**
 * Test de verificación con el caso de control provisto por Euler:
 * - Materiales netos: $8.643.200
 * - Mano de obra neta: $1.231.650
 * - Cañería mixta neta: $4.284.000
 * Esperado: ~$14.904.704 (con redondeos a enteros).
 */
export const testControlCalculo = () => {
  const itemsPrueba = [
    {
      id: 'item-mat',
      descripcion: 'Radiadores y accesorios varios',
      tipo: 'material',
      quantity: 1,
      unitPrice: 8643200,
    },
    {
      id: 'item-mo',
      descripcion: 'Instalación general y montaje',
      tipo: 'mano_de_obra',
      quantity: 1,
      unitPrice: 1231650,
    },
    {
      id: 'item-mixto',
      descripcion: 'Mano de obra y Materiales para cañería de calefacción por agua en sistema pressfitting de polietileno reticulado',
      tipo: 'mano_de_obra',
      quantity: 1,
      unitPrice: 4284000,
    },
  ];

  const resultado = calcularDescuentosPresupuesto(itemsPrueba, true);
  return resultado;
};
