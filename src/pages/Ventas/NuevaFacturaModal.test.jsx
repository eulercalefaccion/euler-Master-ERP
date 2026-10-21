import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const PRESU = {
  id: 'P1', name: 'Flia. Test', presupuestoNumber: 'PRE-2026-1500', canal: 'iva', revision: 0, status: 'aprobado', clientId: 'C1', cuit: '',
  quoteItems: [
    { id: 'k1', descripcion: 'Caldera mural', tipo: 'material', listaItemId: 'L-CAL', quantity: 1, unitPrice: 2000000 },
    { id: 'r1', descripcion: 'Radiador 600', tipo: 'material', listaItemId: 'L-RAD', quantity: 10, unitPrice: 150000 },
  ],
  aprobaciones: [{
    id: 'a1', numero: 1, tipo: 'parcial', fecha: '2026-10-20', canal: 'iva',
    items: [{ itemId: 'k1', cantidad: 1, precioUnitarioNeto: 2000000, importe: 2420000 }, { itemId: 'r1', cantidad: 4, precioUnitarioNeto: 150000, importe: 726000 }],
    importe: 3146000,
  }],
};

vi.mock('../../services/firebaseConfig', () => ({ db: {}, functions: {}, storage: {}, auth: {} }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ currentUser: { email: 'a@b' } }) }));
vi.mock('firebase/firestore', async (orig) => ({
  ...(await orig()),
  collection: () => ({}), query: () => ({}), where: () => ({}), doc: () => ({}),
  getDocs: async () => ({ docs: [{ id: PRESU.id, data: () => PRESU }], empty: false }),
  updateDoc: vi.fn(),
}));
vi.mock('../../services/aprobacionesService', () => ({
  registrarAprobacion: vi.fn(), nuevoIdAprobacion: () => 'apr_x', vincularFacturacion: vi.fn(),
  cargarEntregasRelacionadas: vi.fn(async () => ({ remitos: [], materiales: [] })),
}));

const { default: NuevaFacturaModal } = await import('./NuevaFacturaModal');

// Ya se facturaron 2 radiadores por Comprobante X (canal 2)
const comprobantes = [{
  id: 'fx1', _col: 'comprobantes_venta', letra: 'X', tipoComprobante: 'FAX', numeroOriginal: '00001-00000001', presupuestoId: 'P1', estado: 'emitido',
  totalComprobante: 320000, lineas: [{ descripcion: 'Radiador', cantidad: 2, precioUnitario: 160000, neto: 320000, presupuestoItemId: 'r1' }],
}];

describe('Nueva factura desde un presupuesto con aprobación parcial', () => {
  it('ofrece solo lo aprobado pendiente de facturar (en ambos canales) y exige decidir la entrega', async () => {
    render(<NuevaFacturaModal preset={{ presupuestoId: 'P1' }} arcaCfg={{ entorno: 'homologacion' }} ventasCfg={{ euler: {} }} cuentas={[]} comprobantes={comprobantes} obras={[]} onClose={() => {}} onCobrar={() => {}} />);
    await waitFor(() => expect(screen.getByDisplayValue('Radiador 600')).toBeInTheDocument());
    // Radiadores: aprobados 4, facturados 2 → sugiere 2; máx. facturable 8 (cotizado − facturado)
    expect(screen.getAllByText((_, el) => el?.tagName === 'DIV' && el?.textContent === 'Aprobado sin facturar: 2 · Máx. facturable: 8')).toHaveLength(1);
    expect(screen.getByText(/Aprobado pendiente de facturar/)).toBeInTheDocument();
    // Pasar a 5 radiadores marca la cantidad sin aprobar
    const cantidades = screen.getAllByRole('spinbutton').filter((i) => i.getAttribute('step') === 'any');
    fireEvent.change(cantidades[1], { target: { value: '5' } });
    expect(screen.getByText(/Sin aprobar: requiere confirmar aprobación/)).toBeInTheDocument();
    // La entrega es una decisión explícita
    expect(screen.getByText('Elegí una opción antes de emitir.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Emitir Factura/ }));
    expect(await screen.findByText(/Indicá si los materiales se entregan AHORA/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Entrega posterior/ }));
    expect(screen.getByText('Queda pendiente')).toBeInTheDocument();
  });
});
