import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const DATA = {
  comprobantes_venta: [
    { id: 'fx1', letra: 'X', tipoComprobante: 'FAX', numeroOriginal: '00001-00000007', empresaId: 'euler-calefaccion', presupuestoId: 'P1', estado: 'emitido', fechaEmision: '2026-10-22', totalComprobante: 2165000, clienteNombre: 'FLIA TEST', lineas: [{ descripcion: 'Caldera', cantidad: 1, precioUnitario: 2165000, neto: 2165000, presupuestoItemId: 'k1', entregaPendiente: true }] },
    { id: 'fb9', letra: 'B', tipoComprobante: 'FAB', numeroOriginal: '00002-00000003', empresaId: 'ayala-nicolas', obraId: 'O1', estado: 'pendiente', fechaEmision: '2026-10-23', totalComprobante: 121000, clienteNombre: 'FLIA TEST', lineas: [{ descripcion: 'Termostato', cantidad: 1, precioUnitario: 100000, neto: 100000 }] },
  ],
  arca_pruebas: [],
  recibos: [{ id: 'rc1', estado: 'emitido', numeroOriginal: '00001-00000020', fechaEmision: '2026-10-24', clienteNombre: 'FLIA TEST', totalRecibo: 2165000, aCuenta: 0, imputaciones: [{ comprobanteId: 'fx1', importe: 2165000, tipoComprobante: 'FAX', numeroOriginal: '00001-00000007' }], mediosPago: [{ tipo: 'transferencia', importe: 2165000, cuentaDestino: 'Banco Santander' }], empresaId: 'euler-calefaccion' }],
  saldos_iniciales: [],
  materiales_a_favor: [{ id: 'M1', comprobanteId: 'fx1', comprobanteNumero: 'FAX 00001-00000007', estado: 'pendiente', empresaId: 'euler-calefaccion', clienteNombre: 'FLIA TEST', items: [{ descripcion: 'Caldera', cantidad: 1, cantidadEntregada: 0, listaItemId: 'L-CAL', presupuestoItemId: 'k1' }] }],
  remitos_entrega: [],
  obras: [{ id: 'O1', presupuestoId: 'P1', otNumber: 'OT-2026-000401', quoteItems: [], jornadasSync: { estado: 'error', error: 'sin red' } }],
};

vi.mock('../../services/firebaseConfig', () => ({ db: {}, functions: {}, storage: {}, auth: {} }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ currentUser: { email: 'a@b' } }) }));
vi.mock('firebase/firestore', async (orig) => ({
  ...(await orig()),
  collection: (_db, name) => ({ name }),
  doc: () => ({}),
  onSnapshot: (c, cb) => { cb({ docs: (DATA[c.name] || []).map((d) => ({ id: d.id, data: () => d })) }); return () => {}; },
}));
vi.mock('../../services/arcaFacturacionService', async (orig) => ({ ...(await orig()), getArcaConfig: async () => ({ entorno: 'produccion' }) }));
vi.mock('../../services/aprobacionesService', () => ({ sincronizarJornadas: vi.fn(async () => ({ ok: true })) }));

const { default: GestionComercialTab } = await import('./GestionComercialTab');

const p = {
  id: 'P1', name: 'Flia. Test', presupuestoNumber: 'PRE-2026-1500', canal: 'canal2', status: 'aprobado', obraId: 'O1', paymentStatus: 'Pago Completo',
  quoteItems: [
    { id: 'k1', descripcion: 'Caldera mural', tipo: 'material', listaItemId: 'L-CAL', quantity: 1, unitPrice: 2000000 },
    { id: 't1', descripcion: 'Termostato', tipo: 'material', listaItemId: 'L-TER', quantity: 1, unitPrice: 100000 },
    { id: 'r1', descripcion: 'Radiador 600', tipo: 'material', listaItemId: 'L-RAD', quantity: 10, unitPrice: 150000 },
  ],
  aprobaciones: [{ id: 'a1', numero: 1, tipo: 'parcial', fecha: '2026-10-20', usuario: 'Vendedor', items: [{ itemId: 'k1', cantidad: 1, precioUnitarioNeto: 2000000, importe: 2165000 }], importe: 2165000 }],
};

describe('Pestaña «Gestión comercial»', () => {
  it('muestra resumen, comprobantes de cualquier módulo, cobranzas, reservas y avisos sin inventar asignaciones', async () => {
    render(<MemoryRouter><GestionComercialTab presupuesto={p} onAprobarPendientes={() => {}} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Total aprobado')).toBeInTheDocument());
    expect(screen.getByText('Comprobante X (interno)')).toBeInTheDocument();
    expect(screen.getByText('Factura B (fiscal)')).toBeInTheDocument(); // emitida desde la obra
    expect(screen.getByText('Sin detalle por ítem')).toBeInTheDocument();
    expect(screen.getByText(/aplicadas a comprobantes, no a ítems/)).toBeInTheDocument();
    expect(screen.getByText('Reservado (cobrado)')).toBeInTheDocument(); // aprobado + facturado con entrega posterior + cobrado
    expect(screen.getByText(/declaración, no es un registro de cobro/)).toBeInTheDocument();
    expect(screen.getByText(/no se sincronizó con Euler Jornadas/)).toBeInTheDocument();
    expect(screen.getByText(/Alcance no contratado: NO es deuda/)).toBeInTheDocument();
  });
});
