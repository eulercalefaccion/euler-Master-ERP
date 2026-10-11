/** Estilos y helpers (no componentes) compartidos por los listados. */
export const cellPad = { padding: '0.6rem 0.75rem' };
export const inputSt = {
  padding: '0.45rem 0.6rem', border: '1px solid var(--border-strong, #cbd5e1)', borderRadius: 8,
  fontSize: '0.82rem', background: 'var(--bg-primary, #fff)', color: 'inherit', outline: 'none',
};

/** Ordena filas por un campo (numérico o texto). */
export const ordenar = (filas, { campo, dir }, getters = {}) => {
  const get = getters[campo] || ((r) => r[campo]);
  const s = dir === 'asc' ? 1 : -1;
  return [...filas].sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    if (typeof va === 'number' || typeof vb === 'number') return ((Number(va) || 0) - (Number(vb) || 0)) * s;
    return String(va ?? '').localeCompare(String(vb ?? ''), 'es', { numeric: true }) * s;
  });
};
