import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../services/firebaseConfig', () => ({ db: {}, functions: {}, storage: {}, auth: {} }));
const registrarAprobacion = vi.fn();
vi.mock('../../services/aprobacionesService', () => ({
  registrarAprobacion: (...a) => registrarAprobacion(...a),
  sincronizarJornadas: vi.fn(async () => ({ ok: true })),
  nuevoIdAprobacion: () => 'apr_test',
  buscarObraDePresupuesto: vi.fn(async () => null),
  cargarReservadoPorArticulo: vi.fn(async () => ({ 'L-CAL': 1 })),
}));

const { default: AprobacionModal } = await import('./AprobacionModal');

const presupuesto = {
  id: 'P1', name: 'Flia. Test', presupuestoNumber: 'PRE-2026-1500', canal: 'iva', revision: 0, status: 'seguimiento',
  quoteItems: [
    { id: 'k1', descripcion: 'Caldera mural', tipo: 'material', listaItemId: 'L-CAL', quantity: 1, unitPrice: 2000000 },
    { id: 'r1', descripcion: 'Radiador 600', tipo: 'material', listaItemId: 'L-RAD', quantity: 10, unitPrice: 150000 },
    { id: 'm1', descripcion: 'Instalación de equipos', tipo: 'mano_de_obra', quantity: 1, unitPrice: 800000 },
  ],
};
const lista = [{ id: 'L-CAL', stock: 1 }, { id: 'L-RAD', stock: 2 }];

const montar = (onClose = vi.fn()) => {
  render(<AprobacionModal presupuesto={presupuesto} listaItems={lista} currentUser={{ email: 'a@b' }} modo="mover" onClose={onClose} />);
  return onClose;
};

beforeEach(() => { registrarAprobacion.mockReset(); });

describe('Pop-up «Aprobar Presupuesto» ampliado', () => {
  it('muestra los ítems reales y no permite confirmar con la selección vacía', async () => {
    montar();
    expect(screen.getByText('Caldera mural')).toBeInTheDocument();
    expect(screen.getByText('Radiador 600')).toBeInTheDocument();
    expect(screen.getByText(/no usa stock/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /Confirmar aprobación parcial/ })).toBeDisabled());
  });

  it('«Seleccionar todos los pendientes» → aprobación total; una cantidad parcial → aprobación parcial', async () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: /Seleccionar todos los pendientes/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Confirmar aprobación total/ })).toBeEnabled());
    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.change(inputs[1], { target: { value: '4' } }); // 4 de 10 radiadores
    expect(screen.getByRole('button', { name: /Confirmar aprobación parcial/ })).toBeEnabled();
  });

  it('marca el error y bloquea si la cantidad supera lo pendiente', async () => {
    montar();
    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.change(inputs[1], { target: { value: '11' } });
    expect(screen.getByText('Máximo 10')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /Confirmar aprobación/ })).toBeDisabled());
  });

  it('Cancelar cierra sin registrar nada', async () => {
    const onClose = montar();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalledWith(null);
    expect(registrarAprobacion).not.toHaveBeenCalled();
  });

  it('doble clic en confirmar registra una sola vez, con el mismo id y solo lo elegido', async () => {
    let resolver;
    registrarAprobacion.mockImplementation(() => new Promise((r) => { resolver = r; }));
    montar();
    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.change(inputs[0], { target: { value: '1' } });
    const btn = await screen.findByRole('button', { name: /Confirmar aprobación parcial/ });
    await waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(registrarAprobacion).toHaveBeenCalledTimes(1);
    expect(registrarAprobacion.mock.calls[0][0]).toMatchObject({ presupuestoId: 'P1', aprobacionId: 'apr_test', seleccion: { k1: 1 } });
    resolver({ obraId: 'O1', otNumber: 'OT-1', obraCreada: true, aprobacion: { numero: 1, tipo: 'parcial', importe: 2420000 }, jornadas: { ok: false, error: 'sin red' } });
    expect(await screen.findByText(/No se pudo sincronizar con Euler Jornadas/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reintentar/ })).toBeInTheDocument();
  });

  it('informa el faltante de stock para lo aprobado (sin fingir disponibilidad)', async () => {
    montar();
    await waitFor(() => expect(screen.getAllByText(/Disp\. 0/).length).toBeGreaterThan(0)); // caldera: físico 1, reservado 1
    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.change(inputs[0], { target: { value: '1' } });
    expect(screen.getByText('Faltan 1')).toBeInTheDocument();
  });
});
