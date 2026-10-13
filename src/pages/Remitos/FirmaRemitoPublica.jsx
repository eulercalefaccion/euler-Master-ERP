import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { CheckCircle, Download, Loader, AlertTriangle } from 'lucide-react';
import { db } from '../../services/firebaseConfig';
import { COL_REMITOS, firmarRemito } from '../../services/remitosService';
import { generarPDFRemito } from '../../services/pdfRemito';
import FormFirma from './FormFirma';

const num = (n) => Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });
const fechaAR = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');
const fechaHora = (iso) => (iso ? new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

const pagina = { minHeight: '100vh', background: '#eef2f7', padding: '1rem 0.75rem 2rem', fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', color: '#0f172a' };
const tarjeta = { maxWidth: 560, margin: '0 auto', background: '#fff', borderRadius: 14, boxShadow: '0 4px 20px rgba(13,42,78,0.08)', overflow: 'hidden' };

/** Página pública (sin login) para que el cliente dé conformidad a un remito de entrega. */
export default function FirmaRemitoPublica() {
  const { id } = useParams();
  const [rem, setRem] = useState(null);
  const [estado, setEstado] = useState('cargando'); // cargando | ok | noexiste | error
  const [recienFirmado, setRecienFirmado] = useState(false);

  useEffect(() => {
    let vivo = true;
    getDoc(doc(db, COL_REMITOS, id))
      .then((s) => { if (!vivo) return; if (s.exists()) { setRem({ id: s.id, ...s.data() }); setEstado('ok'); } else setEstado('noexiste'); })
      .catch(() => vivo && setEstado('error'));
    return () => { vivo = false; };
  }, [id]);

  const firmar = async (f) => {
    await firmarRemito(id, { ...f, metodo: 'link' });
    const ahora = new Date().toISOString();
    setRem((r) => ({ ...r, estadoFirma: 'firmado', firmadoEn: ahora, firma: { ...f, metodo: 'link', fecha: ahora } }));
    setRecienFirmado(true);
  };

  if (estado !== 'ok') {
    return (
      <div style={pagina}>
        <div style={{ ...tarjeta, padding: '2.5rem 1.5rem', textAlign: 'center' }}>
          {estado === 'cargando'
            ? <><Loader size={28} className="spin" /><p>Cargando remito…</p></>
            : <><AlertTriangle size={30} color="#b45309" /><p style={{ fontWeight: 600 }}>{estado === 'noexiste' ? 'El link no es válido o el remito ya no existe.' : 'No pudimos cargar el remito. Probá de nuevo en unos minutos.'}</p></>}
        </div>
      </div>
    );
  }

  const em = rem.emisor || {};
  const firmado = rem.estadoFirma === 'firmado';
  const anulado = rem.estado === 'anulado';

  return (
    <div style={pagina}>
      <div style={tarjeta}>
        <div style={{ background: '#0D2A4E', borderBottom: '3px solid #F5A623', padding: '1rem 1.1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/logo_euler_factura.png" alt="" style={{ height: 34, background: '#fff', borderRadius: 6, padding: '3px 6px' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>Remito de entrega</div>
            <div style={{ fontSize: '0.8rem', opacity: 0.85 }}>N° {rem.numero} · {fechaAR(rem.fecha)}</div>
          </div>
        </div>

        <div style={{ padding: '1rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <div style={{ fontSize: '0.85rem', color: '#475569' }}>
            <b style={{ color: '#0f172a' }}>{em.razonSocial}</b>{em.domicilio ? ` · ${em.domicilio}` : ''}
            <div style={{ marginTop: 6 }}>Entregado a: <b style={{ color: '#0f172a' }}>{rem.clienteNombre}</b>{rem.comprobanteNumero ? ` · Ref. ${rem.comprobanteNumero}` : ''}</div>
          </div>

          <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ background: '#f1f5f9', padding: '0.5rem 0.75rem', fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>MATERIALES ENTREGADOS</div>
            {(rem.items || []).map((it, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '0.6rem 0.75rem', borderTop: i ? '1px solid #f1f5f9' : 'none', fontSize: '0.92rem' }}>
                <b style={{ minWidth: 64, textAlign: 'right', color: '#0D2A4E' }}>{num(it.cantidad)} {it.unidad}</b>
                <span>{it.descripcion}</span>
              </div>
            ))}
          </div>

          {anulado ? (
            <div style={{ padding: '0.8rem', borderRadius: 10, background: '#fef2f2', color: '#b91c1c', fontWeight: 600 }}>Este remito fue anulado. No es necesario firmarlo.</div>
          ) : firmado ? (
            <div style={{ padding: '1rem', borderRadius: 10, background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', textAlign: 'center' }}>
              <CheckCircle size={34} />
              <div style={{ fontWeight: 700, fontSize: '1.05rem', marginTop: 4 }}>{recienFirmado ? '¡Gracias! Recibimos tu conformidad.' : 'Este remito ya fue firmado.'}</div>
              <div style={{ fontSize: '0.85rem', marginTop: 4 }}>{rem.firma?.nombre}{rem.firma?.dni ? ` · DNI ${rem.firma.dni}` : ''} · {fechaHora(rem.firmadoEn)}</div>
              <button type="button" onClick={() => generarPDFRemito(rem)}
                style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.6rem 1rem', borderRadius: 8, border: '1px solid #86efac', background: '#fff', color: '#166534', fontWeight: 600, cursor: 'pointer' }}>
                <Download size={16} /> Descargar comprobante (PDF)
              </button>
            </div>
          ) : (
            <>
              <div style={{ fontSize: '0.9rem', color: '#334155' }}>Revisá los materiales y, si está todo bien, firmá con el dedo para confirmar que los recibiste.</div>
              <FormFirma nombreInicial={rem.clienteNombre || ''} onFirmar={firmar} />
            </>
          )}
        </div>
        <div style={{ padding: '0.7rem 1.1rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0', fontSize: '0.72rem', color: '#64748b', textAlign: 'center' }}>
          {[em.telefono, em.email, em.web].filter(Boolean).join(' · ')}
        </div>
      </div>
    </div>
  );
}
