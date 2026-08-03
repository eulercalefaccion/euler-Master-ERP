/**
 * workTimeCalculator.js
 * Calcula el tiempo neto de trabajo entre dos fechas.
 * Excluye: fines de semana, feriados nacionales argentinos.
 * Horario laboral: 8:00 - 16:00 (configurable).
 */

// ─── Feriados Nacionales Argentinos 2025–2026 ─────────────────────────────────
const FERIADOS_AR = new Set([
  // 2025
  '2025-01-01', // Año Nuevo
  '2025-02-24', // Carnaval
  '2025-02-25', // Carnaval
  '2025-03-24', // Día Nacional de la Memoria por la Verdad y la Justicia
  '2025-04-02', // Día del Veterano de Malvinas
  '2025-04-17', // Jueves Santo
  '2025-04-18', // Viernes Santo
  '2025-05-01', // Día Internacional del Trabajador
  '2025-05-25', // Día de la Revolución de Mayo
  '2025-06-16', // Paso a la Inmortalidad del Gral. Martín M. de Güemes
  '2025-06-20', // Paso a la Inmortalidad del Gral. Manuel Belgrano
  '2025-07-09', // Día de la Independencia
  '2025-08-18', // Paso a la Inmortalidad del Gral. José de San Martín
  '2025-10-12', // Día del Respeto a la Diversidad Cultural
  '2025-11-24', // Día de la Soberanía Nacional
  '2025-12-08', // Día de la Inmaculada Concepción de María
  '2025-12-25', // Navidad
  // 2026
  '2026-01-01', // Año Nuevo
  '2026-02-16', // Carnaval
  '2026-02-17', // Carnaval
  '2026-03-24', // Día Nacional de la Memoria por la Verdad y la Justicia
  '2026-04-02', // Día del Veterano de Malvinas
  '2026-04-03', // Viernes Santo
  '2026-05-01', // Día Internacional del Trabajador
  '2026-05-25', // Día de la Revolución de Mayo
  '2026-06-15', // Paso a la Inmortalidad del Gral. Martín M. de Güemes
  '2026-06-20', // Paso a la Inmortalidad del Gral. Manuel Belgrano
  '2026-07-09', // Día de la Independencia
  '2026-08-17', // Paso a la Inmortalidad del Gral. José de San Martín
  '2026-10-12', // Día del Respeto a la Diversidad Cultural
  '2026-11-23', // Día de la Soberanía Nacional
  '2026-12-08', // Día de la Inmaculada Concepción de María
  '2026-12-25', // Navidad
]);

/**
 * Convierte una Date a string YYYY-MM-DD (en hora local argentina UTC-3).
 */
const toLocalDateStr = (date) => {
  const d = new Date(date);
  // Adjust for ART (UTC-3): subtract 3 hours to get local midnight
  const local = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  return local.toISOString().split('T')[0];
};

/**
 * Devuelve true si la fecha es un día laboral (Lun-Vie, no feriado).
 * @param {Date} date
 */
const esDiaLaboral = (date) => {
  const day = date.getDay(); // 0=Domingo, 6=Sábado
  if (day === 0 || day === 6) return false;
  const dateStr = date.toISOString().split('T')[0];
  if (FERIADOS_AR.has(dateStr)) return false;
  return true;
};

/**
 * Calcula los minutos efectivos de trabajo entre dos timestamps.
 * Solo cuenta el tiempo dentro del horario laboral en días hábiles.
 *
 * @param {Date|string} startDate - Inicio del período
 * @param {Date|string} endDate   - Fin del período
 * @param {number} workStart      - Hora de inicio de jornada (default: 8)
 * @param {number} workEnd        - Hora de fin de jornada (default: 16)
 * @returns {number} Minutos efectivos de trabajo
 */
export const calcularMinutosEfectivos = (startDate, endDate, workStart = 8, workEnd = 16) => {
  if (!startDate || !endDate) return 0;

  const start = new Date(startDate);
  const end   = new Date(endDate);

  if (end <= start) return 0;

  let totalMinutes = 0;

  // Iteramos día a día desde la fecha de inicio hasta la de fin
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);

  const endDay = new Date(end);
  endDay.setHours(23, 59, 59, 999);

  while (cursor <= endDay) {
    if (esDiaLaboral(cursor)) {
      // Ventana laboral de este día
      const dayStart = new Date(cursor);
      dayStart.setHours(workStart, 0, 0, 0);

      const dayEnd = new Date(cursor);
      dayEnd.setHours(workEnd, 0, 0, 0);

      // Intersección con el período solicitado
      const effectiveStart = Math.max(start.getTime(), dayStart.getTime());
      const effectiveEnd   = Math.min(end.getTime(),   dayEnd.getTime());

      if (effectiveEnd > effectiveStart) {
        totalMinutes += (effectiveEnd - effectiveStart) / (1000 * 60);
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return Math.round(totalMinutes);
};

/**
 * Calcula los minutos totales transcurridos entre dos timestamps
 * (incluye fines de semana, feriados y fuera de horario).
 * Usar para KPIs donde el cliente espera (TAP y TDE).
 *
 * @param {Date|string} startDate
 * @param {Date|string} endDate
 * @returns {number} Minutos totales
 */
export const calcularMinutosTotales = (startDate, endDate) => {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate);
  const end   = new Date(endDate);
  if (end <= start) return 0;
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60));
};
