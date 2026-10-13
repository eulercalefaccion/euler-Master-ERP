import React, { useState } from 'react';
import { PackageCheck, Loader } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { registrarEntregaMateriales } from '../../services/cobranzasService';
import { Modal, Alerta, Campo } from '../Ventas/ventasUI';
import { inp } from '../Ventas/ventasHelpers';
import RemitoModal from './RemitoModal';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const pendienteDe = (it) => Math.max(0, r2(Number(it.cantidad) - Number(it.cantidadEntregada || 0)));

/**
 * Registrar la entrega de materiales a favor → genera el remito y abre sus opciones de conformidad.
 * @param {{ mat: object, itemInicial?: number|null, aviso?: string, onClose: Function }} props
 */
export default function EntregaModal({ mat, itemInicial = null, aviso = '', onClose }) {
  const { currentUser } = useAuth();
  const items = mat.items || [];
  const [cant, setCant] = useState(() => Object.fromEntries(items.map((it, i) => [i, itemInicial === null || itemInicial === i ? pendienteDe(it) : 0])));
  const [entregadoPor, setEntregadoPor] = useState(currentUser?.displayName || currentUser?.name || currentUser?.email || '');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [remito, setRemito] = useState(null);

  if (remito) return <RemitoModal remito={remito} onClose={onClose} />;

  const total = Object.values(cant).reduce((a, v) => a + (Number(v) || 0), 0);
  const confirmar = async () => {
    setError(''); setGuardando(true);
    try {
      const rem = await registrarEntregaMateriales(mat, cant, nota, currentUser, { entregadoPor });
      setRemito(rem);
    } catch (e) { setError(e.message); setGuardando(false); }
  };

  return (
    <Modal titulo="Registrar entrega de materiales" subtitulo={`${mat.clienteNombre} · ${mat.comprobanteNumero || 'Saldo inicial'}`} onClose={onClose} ancho={720}
      pie={(
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={guardando || total <= 0} onClick={confirmar} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {guardando ? <Loader size={15} className="spin" /> : <PackageCheck size={15} />} Entregar y generar remito
          </button>
        </div>
      )}>
      {aviso && <Alerta>{aviso}</Alerta>}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
        <thead>
          <tr style={{ background: 'var(--bg-surface-hover, #f8fafc)', textAlign: 'left' }}>
            <th style={{ padding: '0.45rem 0.6rem' }}>Material</th>
            <th style={{ padding: '0.45rem 0.6rem', textAlign: 'right' }}>Pendiente</th>
            <th style={{ padding: '0.45rem 0.6rem', textAlign: 'right', width: 120 }}>Entregar ahora</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => {
            const pend = pendienteDe(it);
            return (
              <tr key={i} style={{ borderTop: '1px solid var(--border-light)', opacity: pend > 0 ? 1 : 0.5 }}>
                <td style={{ padding: '0.45rem 0.6rem' }}>{it.descripcion}{!it.listaItemId && <div style={{ fontSize: '0.7rem', color: '#b91c1c' }}>Sin vincular al stock: no descuenta</div>}</td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontWeight: 700, color: '#b45309' }}>{pend} {it.unidad}</td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right' }}>
                  {pend > 0 ? <input type="number" min="0" max={pend} step="any" style={{ ...inp, width: 100, textAlign: 'right' }} value={cant[i] ?? ''} onChange={(e) => setCant({ ...cant, [i]: e.target.value })} /> : 'Entregado'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }} onClick={() => setCant(Object.fromEntries(items.map((it, i) => [i, pendienteDe(it)])))}>Entregar todo</button>
        <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }} onClick={() => setCant({})}>Poner todo en 0</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
        <Campo label="Entregado por (Euler)"><input style={inp} value={entregadoPor} onChange={(e) => setEntregadoPor(e.target.value)} /></Campo>
        <Campo label="Observaciones (opcional)"><input style={inp} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Quién retiró, lugar de entrega…" /></Campo>
      </div>
      <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
        Se descuenta del stock físico{mat.prueba ? ' (salvo por ser PRUEBA)' : ''} y se genera un remito para la conformidad del cliente: firma en este dispositivo, link por WhatsApp o en papel.
      </div>
      {error && <Alerta>{error}</Alerta>}
    </Modal>
  );
}
