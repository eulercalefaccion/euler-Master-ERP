/**
 * Helper para normalización de CUIT y DNI respetando tipos y valores originales.
 */

export const formatCUIT = (val) => {
  if (!val) return '';
  const clean = val.replace(/\D/g, '');
  if (clean.length === 11) {
    return `${clean.slice(0, 2)}-${clean.slice(2, 10)}-${clean.slice(10, 11)}`;
  }
  return val.trim();
};

export const formatDNI = (val) => {
  if (!val) return '';
  const clean = val.replace(/\D/g, '');
  if (clean.length >= 7 && clean.length <= 8) {
    return clean.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  return val.trim();
};

export const detectarTipoIdentificacion = (val) => {
  if (!val) return 'DESCONOCIDO';
  const clean = val.replace(/\D/g, '');
  if (clean.length === 11) return 'CUIT';
  if (clean.length >= 7 && clean.length <= 8) return 'DNI';
  return 'OTRO';
};
