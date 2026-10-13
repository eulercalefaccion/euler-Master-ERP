import React, { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { Download, MessageCircle, Link2, PenLine, FileSignature, Ban, CheckCircle, Clock, Loader } from 'lucide-react';
import { db } from '../../services/firebaseConfig';
import { useAuth } from '../../context/AuthContext';
import { COL_REMITOS, linkFirmaRemito, firmarRemito, marcarFirmadoEnPapel, anularRemito } from '../../services/remitosService';
import { generarPDFRemito, METODO_FIRMA } from '../../services/pdfRemito';
import { fechaAR, abrirWhatsApp } from '../../services/listadosService';
import { EmpresaBadge, Pill } from '../Listados/listadosUI';
import { Modal, Alerta } from '../Ventas/ventasUI';
import FormFirma from './FormFirma';

const num = (n) => Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });
const fechaHora = (iso) => (iso ? new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const btn = { display: 'flex', alignItems: 'center', gap: 6 };

export function EstadoFirmaPill({ rem }) {
  if (rem.estado === 'anulado') return <Pill texto="Anulado" color="#b91c1c" bg="#fee2e2" />;
  if (rem.estadoFirma === 'firmado') return <Pill texto={`Firmado${rem.firma?.metodo === 'papel' ? ' (papel)' : rem.firma?.metodo === 'link' ? ' (link)' : ''}`} color="#047857" bg="#d1fae5" />;
  return <Pill texto="Pendiente de firma" color="#b45309" bg="#fef3c7" />;
}

/**
 * Detalle de un remito de entrega con las 3 formas de conformidad:
 * firma presencial en este dispositivo, link al cliente (WhatsApp) o firmado en papel.
 */
export default function RemitoModal({ remito, onClose }) {
  const { currentUser } = useAuth();
  const [rem, setRem] = useState(remito);
  const [firmando, setFirmando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [pdfCargando, setPdfCargando] = useState(false);

  useEffect(() => onSnapshot(doc(db, COL_REMITOS, remito.id), (s) => { if (s.exists()) setRem({ id: s.id, ...s.data() }); }, () => {}), [remito.id]);

  const link = linkFirmaRemito(rem.id);
  const vigente = rem.estado !== 'anulado';
  const pendiente = vigente && rem.estadoFirma !== 'firmado';
  const nombreCorto = (rem.clienteNombre || '').split(' ')[0];

  const pdf = async () => { setPdfCargando(true); try { await generarPDFRemito(rem); } catch (e) { setError(e.message); } setPdfCargando(false); };
  const whatsapp = () => abrirWhatsApp(rem.clienteTelefono, `Hola ${nombreCorto}, te escribimos de ${rem.emisor?.razonSocial || 'Euler Calefacción'}. Te entregamos los materiales del remito N° ${rem.numero}:\n${(rem.items || []).map((it) => `• ${num(it.cantidad)} ${it.unidad || ''} ${it.descripcion}`).join('\n')}\n\nPor favor confirmá la recepción firmando desde este link:\n${link}\n\n¡Gracias!`);
  const copiar = async () => { try { await navigator.clipboard.writeText(link); setAviso('Link copiado.'); } catch { window.prompt('Copiá el link:', link); } };
  const papel = async () => {
    const nombre = window.prompt('El cliente firmó el remito impreso.\nAclaración de quien firmó (opcional):', rem.clienteNombre || '');
    if (nombre === null) return;
    try { await marcarFirmadoEnPapel(rem.id, { nombre }, currentUser); } catch (e) { setError(e.message); }
  };
  const anular = async () => {
    const motivo = window.prompt(`Anular el remito ${rem.numero}.\n${rem.descuentaStock ? 'El stock se devuelve al depósito' : ''}${rem.materialId ? ' y los materiales vuelven a quedar pendientes de entrega' : ''}.\n\nMotivo:`);
    if (motivo === null) return;
    try { await anularRemito(rem, motivo, currentUser); } catch (e) { setError(e.message); }
  };

  return (
    <Modal titulo={`Remito de entrega N° ${rem.numero || ''}`} subtitulo={`${rem.clienteNombre || ''} · ${fechaAR(rem.fecha)}${rem.comprobanteNumero ? ` · Ref. ${rem.comprobanteNumero}` : ''}`} onClose={onClose} ancho={760}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: '0.8rem' }}>
        <EmpresaBadge empresaId={rem.empresaId} />
        <EstadoFirmaPill rem={rem} />
        {rem.prueba && <Pill texto="PRUEBA · no descuenta stock" color="#b91c1c" bg="#fee2e2" />}
        {rem.descuentaStock && vigente && <Pill texto="Descontado del stock" color="#1d4ed8" bg="#dbeafe" />}
        <span style={{ color: 'var(--text-secondary)' }}>Entregó: {rem.entregadoPor || '—'}</span>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead><tr style={{ background: 'var(--bg-surface-hover, #f8fafc)', textAlign: 'left' }}><th style={{ padding: '0.45rem 0.6rem', textAlign: 'right', width: 90 }}>Cantidad</th><th style={{ padding: '0.45rem 0.6rem' }}>Material</th></tr></thead>
        <tbody>
          {(rem.items || []).map((it, i) => (
            <tr key={i} style={{ borderTop: '1px solid var(--border-light)' }}>
              <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontWeight: 700 }}>{num(it.cantidad)} {it.unidad}</td>
              <td style={{ padding: '0.45rem 0.6rem' }}>{it.descripcion}{!it.listaItemId && <span style={{ fontSize: '0.7rem', color: '#b91c1c' }}> · sin vincular al stock</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rem.nota && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Obs.: {rem.nota}</div>}

      {rem.estadoFirma === 'firmado' && rem.firma && (
        <div style={{ border: '1px solid #86efac', background: '#f0fdf4', borderRadius: 10, padding: '0.8rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {rem.firma.imagen && <img src={rem.firma.imagen} alt="Firma" style={{ height: 70, background: '#fff', border: '1px solid #d1fae5', borderRadius: 6, padding: 4 }} />}
          <div style={{ fontSize: '0.83rem', color: '#166534' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}><CheckCircle size={16} /> Recibido conforme</div>
            <div>{rem.firma.nombre}{rem.firma.dni ? ` · DNI ${rem.firma.dni}` : ''}</div>
            <div style={{ fontSize: '0.75rem' }}>{METODO_FIRMA[rem.firma.metodo]} · {fechaHora(rem.firma.fecha || rem.firmadoEn)}</div>
          </div>
        </div>
      )}
      {rem.estado === 'anulado' && <Alerta>Remito anulado{rem.motivoAnulacion ? `: ${rem.motivoAnulacion}` : ''}.</Alerta>}

      {pendiente && !firmando && (
        <div style={{ border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 10, padding: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', fontWeight: 700, color: '#92400e' }}><Clock size={16} /> Falta la conformidad del cliente. Elegí cómo:</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem' }}>
            <button className="btn btn-primary" style={btn} onClick={() => setFirmando(true)}><PenLine size={15} /> Firmar ahora en este dispositivo</button>
            <button className="btn btn-secondary" style={btn} onClick={whatsapp} disabled={!rem.clienteTelefono} title={rem.clienteTelefono ? '' : 'El cliente no tiene teléfono cargado: usá "Copiar link"'}><MessageCircle size={15} /> Enviar link por WhatsApp</button>
            <button className="btn btn-secondary" style={btn} onClick={copiar}><Link2 size={15} /> Copiar link de firma</button>
            <button className="btn btn-secondary" style={btn} onClick={papel}><FileSignature size={15} /> Ya firmó en papel</button>
          </div>
        </div>
      )}
      {pendiente && firmando && (
        <div style={{ border: '1px solid var(--border-light)', borderRadius: 10, padding: '0.9rem' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 8 }}>Pasale el dispositivo al cliente para que firme</div>
          <FormFirma nombreInicial={rem.clienteNombre || ''} onFirmar={async (f) => { await firmarRemito(rem.id, { ...f, metodo: 'presencial' }, currentUser); setFirmando(false); }} />
          <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={() => setFirmando(false)}>Cancelar</button>
        </div>
      )}
      {aviso && <Alerta tipo="ok">{aviso}</Alerta>}
      {error && <Alerta>{error}</Alerta>}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" style={btn} onClick={pdf} disabled={pdfCargando}>{pdfCargando ? <Loader size={15} className="spin" /> : <Download size={15} />} PDF para imprimir</button>
        {vigente && <button className="btn btn-secondary" style={{ ...btn, color: '#b91c1c' }} onClick={anular}><Ban size={15} /> Anular remito</button>}
        <button className="btn btn-secondary" onClick={onClose} style={{ marginLeft: 'auto' }}>Cerrar</button>
      </div>
    </Modal>
  );
}
