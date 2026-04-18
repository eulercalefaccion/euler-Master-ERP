export const mockJornadas = [
  { id: 'jor-1', operario: 'Gabriel', date: '17/04/2026', startTime: '08:00', endTime: '12:00', obra: 'Residencia Altos del Sol', status: 'En Almuerzo', locationType: 'Obra', alert: false },
  { id: 'jor-2', operario: 'Miguel', date: '17/04/2026', startTime: '08:15', endTime: '-', obra: 'Residencia Altos del Sol', status: 'Activa', locationType: 'Obra', alert: false },
  { id: 'jor-3', operario: 'Luis', date: '17/04/2026', startTime: '09:30', endTime: '-', obra: 'Duplex Arq. Benitez', status: 'Activa', locationType: 'Ferretería', alert: true, alertReason: 'Fuera de rango (> 300m)' }
];

export const mockObrasDisponibles = [
  'Oficina Central Euler',
  'Residencia Altos del Sol',
  'Duplex Arq. Benitez',
  'Casa Funes',
  'Estudio Centro'
];
