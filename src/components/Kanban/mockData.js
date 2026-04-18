export const initialData = {
  items: {
    'item-1': { id: 'item-1', name: 'Flia. Martinez', location: 'Fisherton', type: 'Radiadores', canal: 'WhatsApp', date: '14 Abr 2026', amount: null, paymentStatus: 'Pendiente' },
    'item-2': { id: 'item-2', name: 'Arq. Lopez - Casa 34', location: 'Funes Hills', type: 'Piso Radiante', canal: 'Arquitecto-Constructora', date: '12 Abr 2026', amount: 4500000, paymentStatus: 'Pendiente' },
    'item-3': { id: 'item-3', name: 'Gomez, Pedro', location: 'Rosario Centro', type: 'Combinado', canal: 'Llamada', date: '10 Abr 2026', amount: 3200000, paymentStatus: 'Pendiente' },
    'item-4': { id: 'item-4', name: 'Estudio Z', location: 'Puerto Norte', type: 'Piso Radiante', canal: 'BNI', date: '05 Abr 2026', amount: 8000000, paymentStatus: 'Pago Completo' },
  },
  columns: {
    'pendiente': {
      id: 'pendiente',
      title: 'Presupuesto Pendiente',
      itemsIds: ['item-1'],
    },
    'calculo': {
      id: 'calculo',
      title: 'En Cálculo',
      itemsIds: ['item-2'],
    },
    'enviado': {
      id: 'enviado',
      title: 'Enviado al Cliente',
      itemsIds: [],
    },
    'seguimiento': {
      id: 'seguimiento',
      title: 'Seguimiento Activo',
      itemsIds: ['item-3'],
    },
    'aprobado': {
      id: 'aprobado',
      title: 'Aprobado',
      itemsIds: ['item-4'], // Un lead ya completado
    },
    'rechazado': {
      id: 'rechazado',
      title: 'Rechazado / En Espera',
      itemsIds: [],
    },
  },
  columnOrder: ['pendiente', 'calculo', 'enviado', 'seguimiento', 'aprobado', 'rechazado'],
};
