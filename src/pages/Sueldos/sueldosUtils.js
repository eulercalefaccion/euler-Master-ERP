/**
 * Utilidades de Sueldos — copiadas de Euler Sueldos
 */
export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export const getISOWeek = (d) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const n = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - n);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil((((t - y) / 86400000) + 1) / 7);
};

export const getWeeksInYear = (year) => year === 2026 ? 53 : 52;

export const getWeekDates = (w, y) => getCustomWeekDates(w, y, 'estandar');

export const getCustomWeekDates = (w, y, type = 'estandar') => {
  const j = new Date(y, 0, 4);
  const d = j.getDay() || 7;
  const m = new Date(j);
  m.setDate(j.getDate() - d + 1);
  const t = new Date(m);
  const offset = type === 'adelantada' ? -3 : 0;
  t.setDate(m.getDate() + (w - 1) * 7 + offset);
  const r = [];
  for (let i = 0; i < 7; i++) {
    const x = new Date(t);
    x.setDate(t.getDate() + i);
    r.push(x);
  }
  return r;
};

export const getMonthName = (w, y) => {
  const d = getWeekDates(w, y);
  const m = {};
  d.forEach(x => {
    const n = x.toLocaleDateString('es-AR', { month: 'long' });
    m[n] = (m[n] || 0) + 1;
  });
  let max = '', mc = 0;
  for (const [k, v] of Object.entries(m)) {
    if (v > mc) { mc = v; max = k; }
  }
  return max.charAt(0).toUpperCase() + max.slice(1);
};

export const getMonthNumber = (w, y) => {
  const d = getWeekDates(w, y);
  return d.length >= 3 ? d[2].getMonth() : 0;
};

export const formatDS = (d) => {
  const n = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  return n[d.getDay()] + ' ' + d.getDate();
};

export const formatDF = (d) => d.toLocaleDateString('es-AR');

export const calcH = (e, s) => {
  if (!e || !s) return 0;
  const [he, me] = e.split(':').map(Number);
  const [hs, ms] = s.split(':').map(Number);
  let h = (hs + ms / 60) - (he + me / 60);
  if (h < 0) h += 24;
  return Math.max(0, h);
};

export const getEmpName = (e) => {
  if (!e) return '';
  if (e.nombre && e.apellido) return e.nombre + ' ' + e.apellido;
  if (e.nombre) return e.nombre;
  if (e.name) return e.name;
  return '';
};
