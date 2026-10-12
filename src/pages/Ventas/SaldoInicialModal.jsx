import React, { useState } from 'react';
import { Loader, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { EMPRESA_AYALA, EMPRESA_EULER, registrarSaldoInicial, crearMaterialesAFavor, hoyISO } from '../../services/cobranzasService';
import { ars } from '../../services/listadosService';
import { inp } from './ventasHelpers';
import { Modal, Campo, Alerta, Seg } from './ventasUI';
import ClienteSelector from './ClienteSelector';

const nuevaLinea = () => ({ key: `l${Date.now()}${Math.random()}`, descripcion: '', cantidad: 1, unidad: 'u', precioUnitario: '' });

/** Carga de saldo inicial (deuda, saldo a favor en dinero o materiales a favor) de un cliente. */
export default function SaldoInicialModal({ onClose, cartera, clientePreset = null, onGuardado }) {
  const { currentUser } = useAuth();
  const [cliente, setCliente] = useState(clientePreset);
  const [empresa, setEmpresa] = useState(EMPRESA_AYALA);
  const [tipo, setTipo] = useState('debe');
  const [importe, setImporte] = useState('');
  const [fecha, setFecha] = useState(hoyISO());
  const [detalle, setDetalle] = useState('Saldo inicial GesDatta');
  const [lineas, setLineas] = useState([nuevaLinea()]);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const setLinea = (key, campo, valor) => setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, [campo]: valor } : l)));

  const guardar = async () => {
    setError('');
    if (!cliente?.nombre) { setError('Elegí el cliente.'); return; }
    setGuardando(true);
    try {
      if (tipo === 'materiales') {
        const ls = lineas.filter((l) => l.descripcion.trim() && Number(l.cantidad) > 0);
        if (!ls.length) throw new Error('Cargá al menos un material con cantidad.');
        await crearMaterialesAFavor({ empresaId: empresa, cliente, comprobante: null, lineas: ls, nota: detalle }, currentUser);
      } else {
        const n = Number(importe);
        if (!(n > 0)) throw new Error('Ingresá un importe mayor a cero.');
        await registrarSaldoInicial({ empresaId: empresa, cliente, importe: tipo === 'debe' ? n : -n, fecha, detalle }, currentUser);
      }
      onGuardado?.();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal titulo="Cargar saldo inicial" subtitulo="Para migrar los saldos de GesDatta o registrar créditos previos del cliente" onClose={onClose} ancho={720}
      pie={(
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={guardar} disabled={guardando} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {guardando && <Loader size={15} className="spin" />} Guardar
          </button>
        </div>
      )}>
      <Campo label="Cliente">
        <ClienteSelector value={cliente} onChange={setCliente} cuentas={Object.values(cartera.cuentas)} autoFocus={!cliente} />
      </Campo>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
        <Campo label="Empresa">
          <Seg opciones={[[EMPRESA_AYALA, 'Ayala Nicolás F. (Canal 1)'], [EMPRESA_EULER, 'Euler Calefacción (Canal 2)']]} valor={empresa} onChange={setEmpresa} />
        </Campo>
        <Campo label="Tipo de saldo">
          <Seg opciones={[['debe', 'El cliente debe'], ['favor', 'Dinero a favor'], ['materiales', 'Materiales a favor']]} valor={tipo} onChange={setTipo} />
        </Campo>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: tipo === 'materiales' ? '1fr' : '160px 180px 1fr', gap: '0.75rem' }}>
        {tipo !== 'materiales' && (
          <>
            <Campo label="Fecha"><input type="date" style={inp} value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo>
            <Campo label="Importe ($)"><input type="number" min="0" step="0.01" style={{ ...inp, textAlign: 'right' }} value={importe} onChange={(e) => setImporte(e.target.value)} /></Campo>
          </>
        )}
        <Campo label="Detalle"><input style={inp} value={detalle} onChange={(e) => setDetalle(e.target.value)} /></Campo>
      </div>

      {tipo === 'materiales' && (
        <div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead><tr style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>
              <th style={{ textAlign: 'left', padding: 4 }}>Material</th><th style={{ width: 80, padding: 4 }}>Cantidad</th><th style={{ width: 70, padding: 4 }}>Unidad</th>
              <th style={{ width: 130, padding: 4 }}>Precio unit. (opcional)</th><th style={{ width: 36 }} />
            </tr></thead>
            <tbody>
              {lineas.map((l) => (
                <tr key={l.key}>
                  <td style={{ padding: 4 }}><input style={inp} value={l.descripcion} onChange={(e) => setLinea(l.key, 'descripcion', e.target.value)} placeholder="Ej: Caldera Baxi Eco 4S 24F" /></td>
                  <td style={{ padding: 4 }}><input type="number" min="0" style={{ ...inp, textAlign: 'right' }} value={l.cantidad} onChange={(e) => setLinea(l.key, 'cantidad', e.target.value)} /></td>
                  <td style={{ padding: 4 }}><input style={inp} value={l.unidad} onChange={(e) => setLinea(l.key, 'unidad', e.target.value)} /></td>
                  <td style={{ padding: 4 }}><input type="number" min="0" style={{ ...inp, textAlign: 'right' }} value={l.precioUnitario} onChange={(e) => setLinea(l.key, 'precioUnitario', e.target.value)} /></td>
                  <td style={{ padding: 4 }}>
                    <button onClick={() => setLineas((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c' }}><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn btn-secondary" onClick={() => setLineas((ls) => [...ls, nuevaLinea()])} style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}><Plus size={14} /> Agregar material</button>
        </div>
      )}

      <Alerta tipo="info">
        {tipo === 'debe' && <>Se suma a la deuda del cliente como un comprobante pendiente “Saldo inicial”, que luego se puede cancelar con un recibo.</>}
        {tipo === 'favor' && <>Queda como crédito del cliente{Number(importe) > 0 ? ` (${ars(importe)})` : ''}; se puede aplicar en un recibo con la forma “Saldo a favor”.</>}
        {tipo === 'materiales' && <>Quedan como materiales pagados pendientes de entrega. Las entregas se registran desde la cuenta corriente. No modifica el saldo en pesos.</>}
        {' '}No genera asiento contable.
      </Alerta>
      {error && <Alerta>{error}</Alerta>}
    </Modal>
  );
}
