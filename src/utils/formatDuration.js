/**
 * formatDuration.js
 * Formatea duraciones en minutos a texto legible en español.
 *
 * Dos modos:
 *  - Efectivo  (1 día = 8 hs laborales) → para TCE
 *  - Calendario (1 día = 24 hs)         → para TAP y TDE
 */

/**
 * Formatea una duración efectiva (jornada de 8 hs = 1 día laboral).
 * Usar para el KPI TCE (Tiempo de Cálculo Efectivo).
 *
 * @param {number} totalMinutos
 * @returns {string} Ej: "1 día y 6 horas", "46 minutos", "2 horas y 30 minutos"
 */
export const formatDuracionEfectiva = (totalMinutos) => {
  if (!totalMinutos || totalMinutos <= 0) return '—';

  const MINS_POR_DIA = 8 * 60; // 480 min = 1 día laboral
  const dias    = Math.floor(totalMinutos / MINS_POR_DIA);
  const remaining = totalMinutos % MINS_POR_DIA;
  const horas   = Math.floor(remaining / 60);
  const minutos = Math.round(remaining % 60);

  const parts = [];
  if (dias > 0)   parts.push(`${dias} día${dias !== 1 ? 's' : ''}`);
  if (horas > 0)  parts.push(`${horas} hora${horas !== 1 ? 's' : ''}`);
  if (minutos > 0) parts.push(`${minutos} min`);

  return parts.join(' y ') || '< 1 min';
};

/**
 * Formatea una duración de calendario (1 día = 24 horas).
 * Usar para los KPIs TAP y TDE donde el cliente espera en tiempo real.
 *
 * @param {number} totalMinutos
 * @returns {string} Ej: "1 día y 2 horas", "6 horas y 46 minutos", "27 horas"
 */
export const formatDuracionCalendario = (totalMinutos) => {
  if (!totalMinutos || totalMinutos <= 0) return '—';

  const MINS_POR_DIA = 24 * 60; // 1440 min = 1 día calendario
  const dias    = Math.floor(totalMinutos / MINS_POR_DIA);
  const remaining = totalMinutos % MINS_POR_DIA;
  const horas   = Math.floor(remaining / 60);
  const minutos = Math.round(remaining % 60);

  const parts = [];
  if (dias > 0)   parts.push(`${dias} día${dias !== 1 ? 's' : ''}`);
  if (horas > 0)  parts.push(`${horas} hora${horas !== 1 ? 's' : ''}`);
  if (minutos > 0 && dias === 0) parts.push(`${minutos} min`);

  return parts.join(' y ') || '< 1 min';
};

/**
 * Convierte minutos a horas con un decimal (para promedios).
 * @param {number} totalMinutos
 * @returns {string} Ej: "6.8"
 */
export const minutosAHorasDecimal = (totalMinutos) => {
  if (!totalMinutos || totalMinutos <= 0) return '0.0';
  return (totalMinutos / 60).toFixed(1);
};
