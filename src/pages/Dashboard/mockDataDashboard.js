export const dashboardData = {
  obrasActivas: [
    { id: 'o-1', name: 'Residencia Altos del Sol', status: 'Obra', progress: 40, capataz: 'Gabriel' },
    { id: 'o-2', name: 'Duplex Arq. Benitez', status: 'Instalación', progress: 85, capataz: 'Gabriel' },
    { id: 'o-3', name: 'Casa Funes', status: 'Obra', progress: 15, capataz: 'Gabriel' }
  ],
  jornadasHoy: [
    { id: 'j-1', operario: 'Gabriel', location: 'Residencia Altos del Sol', status: 'En Zona', statusColor: 'var(--success)', tiempo: '3h 45m' },
    { id: 'j-2', operario: 'Miguel', location: 'Residencia Altos del Sol', status: 'En Zona', statusColor: 'var(--success)', tiempo: '3h 40m' },
    { id: 'j-3', operario: 'Luis', location: 'Desconocido', status: 'Fuera de Zona', statusColor: 'var(--danger)', tiempo: '0h 0m' }
  ],
  alertasSSTT: [
    { id: 'st-1', cliente: 'Edificio Roma', problema: 'Caldera pierde agua', dias: 2 },
    { id: 'st-2', cliente: 'Hector Peralta', problema: 'Termostato error E04', dias: 1 }
  ],
  metricasKpi: {
    rentabilidadMesGloba: 34.5,
    presupuestosEnviados: 8,
    obrasEnAprobacion: 2,
    ventasMesActual: 18500000 // Valor mock en ARS
  },
  ventasAnuales: [
    { name: 'Ene', ventas: 12000000 },
    { name: 'Feb', ventas: 14500000 },
    { name: 'Mar', ventas: 11000000 },
    { name: 'Abr', ventas: 18500000 },
    { name: 'May', ventas: 0 },
    { name: 'Jun', ventas: 0 },
    { name: 'Jul', ventas: 0 },
    { name: 'Ago', ventas: 0 },
    { name: 'Sep', ventas: 0 },
    { name: 'Oct', ventas: 0 },
    { name: 'Nov', ventas: 0 },
    { name: 'Dic', ventas: 0 }
  ]
};
