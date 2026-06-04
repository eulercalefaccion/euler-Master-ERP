import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebaseConfig";

const TC_DOC_REF = doc(db, "configuracion", "tipo_cambio");
const API_URL = "https://dolarapi.com/v1/dolares/oficial";
const CACHE_HORAS = 2;

// ═══════════════════════════════════════════════════════════════════
// CONSTANTES DE CÁLCULO
// ═══════════════════════════════════════════════════════════════════
export const IVA = 1.21;
export const FACTOR_MAYORISTA = 0.893;

// ═══════════════════════════════════════════════════════════════════
// OBTENER TIPO DE CAMBIO (CON CACHÉ DE 2 HORAS)
// ═══════════════════════════════════════════════════════════════════
export async function getTipoCambio() {
  const snap = await getDoc(TC_DOC_REF);
  const guardado = snap.exists() ? snap.data() : null;

  if (guardado) {
    const ultimaConsulta = guardado.ultimaConsultaApi?.toDate?.() ?? new Date(guardado.ultimaConsultaApi);
    const horasDesdeConsulta = (Date.now() - ultimaConsulta.getTime()) / (1000 * 60 * 60);

    if (horasDesdeConsulta < CACHE_HORAS) {
      return {
        valor: guardado.valor,
        fechaActualizacion: guardado.fechaActualizacion,
        ultimaConsultaApi: guardado.ultimaConsultaApi,
        desactualizado: false,
        errorApi: false,
      };
    }
  }

  // Llamar a la API
  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const nuevoTC = {
      valor: data.venta,
      fuente: "dolarapi",
      fechaActualizacion: data.fechaActualizacion,
      actualizadoPor: "sistema",
      ultimaConsultaApi: new Date().toISOString(),
    };

    await setDoc(TC_DOC_REF, nuevoTC);

    return {
      valor: nuevoTC.valor,
      fechaActualizacion: nuevoTC.fechaActualizacion,
      ultimaConsultaApi: nuevoTC.ultimaConsultaApi,
      desactualizado: false,
      errorApi: false,
    };

  } catch (error) {
    console.error("Error consultando dolarapi:", error);

    if (guardado) {
      const ultimaConsulta = guardado.ultimaConsultaApi?.toDate?.() ?? new Date(guardado.ultimaConsultaApi);
      const horasDesdeConsulta = (Date.now() - ultimaConsulta.getTime()) / (1000 * 60 * 60);
      return {
        valor: guardado.valor,
        fechaActualizacion: guardado.fechaActualizacion,
        ultimaConsultaApi: guardado.ultimaConsultaApi,
        desactualizado: horasDesdeConsulta > 2,
        errorApi: true,
      };
    }

    throw new Error("No hay tipo de cambio disponible. Verificar conexión.");
  }
}

// ═══════════════════════════════════════════════════════════════════
// FORZAR ACTUALIZACIÓN MANUAL
// ═══════════════════════════════════════════════════════════════════
export async function forzarActualizacionTC(usuarioUID) {
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  const nuevoTC = {
    valor: data.venta,
    fuente: "dolarapi",
    fechaActualizacion: data.fechaActualizacion,
    actualizadoPor: usuarioUID ?? "manual",
    ultimaConsultaApi: new Date().toISOString(),
  };

  await setDoc(TC_DOC_REF, nuevoTC);
  return nuevoTC;
}

// ═══════════════════════════════════════════════════════════════════
// CÁLCULO DE PRECIOS
// ═══════════════════════════════════════════════════════════════════

/**
 * Calcula precios en ARS para un ítem de tipo material/kit/servicio.
 */
export function calcularPrecios(costoUSD, markup, tc) {
  if (!costoUSD || !markup || !tc) return null;

  const precioMinoristaNetoPesos = costoUSD * markup * tc;
  const precioMayoristaNetoPesos = precioMinoristaNetoPesos * FACTOR_MAYORISTA;
  const precioMinoristaConIVA = precioMinoristaNetoPesos * IVA;
  const margen = ((precioMinoristaNetoPesos - costoUSD * tc) / precioMinoristaNetoPesos) * 100;

  return {
    minoristaNetoARS: Math.round(precioMinoristaNetoPesos),
    mayoristaNetoARS: Math.round(precioMayoristaNetoPesos),
    minoristaConIVAARS: Math.round(precioMinoristaConIVA),
    margenPorcentaje: Math.round(margen),
  };
}

/**
 * Calcula precios en ARS para ítems de mano de obra / servicio con precio directo.
 */
export function calcularPrecioManoDeObra(precioVentaUSD, tc) {
  if (!precioVentaUSD || !tc) return null;

  return {
    minoristaNetoARS: Math.round(precioVentaUSD * tc),
    minoristaConIVAARS: Math.round(precioVentaUSD * tc * IVA),
    mayoristaNetoARS: null,
    margenPorcentaje: null,
  };
}

// ═══════════════════════════════════════════════════════════════════
// ESTADO DEL TIPO DE CAMBIO
// ═══════════════════════════════════════════════════════════════════
export function getEstadoTC(ultimaConsultaApi, errorApi) {
  if (errorApi) return { label: "Sin conexión — valor anterior", color: "red", nivel: "error" };
  
  if (!ultimaConsultaApi) return { label: "Sin datos", color: "red", nivel: "error" };

  const fecha = typeof ultimaConsultaApi === 'string' ? new Date(ultimaConsultaApi) : ultimaConsultaApi;
  const horas = (Date.now() - fecha.getTime()) / (1000 * 60 * 60);

  if (horas < 2) return { label: "Al día", color: "green", nivel: "ok" };
  if (horas < 24) return { label: "Puede estar desactualizado", color: "yellow", nivel: "warning" };
  return { label: "Desactualizado", color: "red", nivel: "error" };
}
