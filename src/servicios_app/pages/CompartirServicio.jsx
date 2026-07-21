import { useState, useEffect } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../services/firebaseConfig'
import { FileText, Printer, ShieldCheck, MapPin, Phone, Mail, Clock, CheckCircle, ArrowLeft } from 'lucide-react'

const EQUIPO_LABELS = {
  caldera: 'Caldera',
  radiador: 'Radiador',
  piso_radiante: 'Piso Radiante',
  termostato: 'Termostato',
  climatizador_piscina: 'Climatizador Piscina',
  mantenimiento: 'Mantenimiento Preventivo / Puesta en Marcha',
  otro: 'Otro',
}

const IVA = 0.21

function formatMoney(val) {
  const n = parseFloat(val) || 0
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function calcTotalesItems(materiales, manoObra) {
  const totalMatNeto = (materiales || []).reduce((acc, m) => acc + (parseFloat(m.precio) || 0) * (parseFloat(m.cant) || 1), 0)
  const totalMoNeto = (manoObra || []).reduce((acc, m) => acc + (parseFloat(m.precio) || 0), 0)
  const sinIVA = totalMatNeto + totalMoNeto
  const ivaTotal = sinIVA * IVA
  const conIVA = sinIVA + ivaTotal
  return { totalMatNeto, totalMoNeto, sinIVA, ivaTotal, conIVA }
}

export default function CompartirServicio() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [servicio, setServicio] = useState(null)
  const [loading, setLoading] = useState(true)

  const tipo = searchParams.get('tipo') || 'presupuesto'
  const esRecibo = tipo === 'recibo'

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'servicios', id), (docSnap) => {
      if (docSnap.exists()) {
        setServicio({ id: docSnap.id, ...docSnap.data() })
      }
      setLoading(false)
    })
    return unsub
  }, [id])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh', flexDirection: 'column', gap: 16 }}>
        <div className="spinner" />
        <p style={{ fontFamily: 'var(--font)', color: 'var(--azul)', fontWeight: 600 }}>Cargando ficha de servicio...</p>
      </div>
    )
  }

  if (!servicio) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh', flexDirection: 'column', gap: 12, padding: 24, textAlign: 'center' }}>
        <FileText size={48} color="var(--rojo)" />
        <h2 style={{ fontFamily: 'var(--font-display)', color: 'var(--azul)' }}>Ficha no encontrada</h2>
        <p style={{ fontFamily: 'var(--font)', color: 'var(--gris-texto)', maxWidth: 400 }}>El enlace que abriste podría ser incorrecto o el servicio ha sido removido.</p>
      </div>
    )
  }

  const materiales = servicio.materiales || []
  const manoObra = servicio.manoObra || []
  const { totalMatNeto, totalMoNeto, sinIVA, ivaTotal, conIVA } = calcTotalesItems(materiales, manoObra)
  const equipos = (servicio.equipos || []).map(e => EQUIPO_LABELS[e] || e).join(', ')

  const handlePrint = () => {
    window.print()
  }

  return (
    <div style={{ background: '#F4F6F9', minHeight: '100vh', padding: '24px 16px', fontFamily: 'var(--font)' }}>
      {/* Botones de acción flotantes (no se imprimen) */}
      <div className="no-print" style={{ maxWidth: 650, margin: '0 auto 16px auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '12px 20px', borderRadius: 12, boxShadow: 'var(--sombra)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#27AE60', animation: 'pulse 1.5s infinite' }} />
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--azul)' }}>Ficha Oficial de Servicio</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'none', border: '1.5px solid #D8E2EE', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', color: 'var(--azul)' }}>
            <ArrowLeft size={15} /> Volver
          </button>
          <button onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'var(--azul)', color: 'white', border: 'none', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', boxShadow: '0 2px 8px rgba(30,58,95,0.2)' }}>
            <Printer size={15} /> Imprimir / Guardar PDF
          </button>
        </div>
      </div>

      {/* Contenedor principal de la ficha (es lo que se imprime) */}
      <div className="print-container" style={{ maxWidth: 650, margin: '0 auto', background: 'white', borderRadius: 16, padding: '32px 28px', boxShadow: 'var(--sombra)', position: 'relative', borderTop: '6px solid var(--azul)' }}>
        
        {/* Cabecera / Marca */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
          <div style={{ width: '100%', maxWidth: 280 }}>
            <img src={import.meta.env.VITE_PDF_LOGO || '/membrete.jpeg'} alt="Euler Calefacción" style={{ width: '100%', height: 'auto', display: 'block' }} />
          </div>
          <div style={{ textAlign: 'right', minWidth: 150 }}>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--azul)', fontFamily: 'var(--font-display)' }}>{servicio.numeroST || 'ST-PENDIENTE'}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--gris-texto)', marginTop: 4 }}>
              Fecha: {new Date().toLocaleDateString('es-AR')}
            </div>
            <div style={{ marginTop: 8, display: 'inline-block', padding: '4px 12px', background: esRecibo ? '#E8F5E9' : '#E3F2FD', color: esRecibo ? '#2E7D32' : '#1565C0', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {esRecibo ? 'COMPROBANTE DE PAGO' : 'PRESUPUESTO'}
            </div>
          </div>
        </div>

        {/* Línea decorativa degradada */}
        <div style={{ width: '100%', height: 3, background: 'linear-gradient(90deg,#F5A623,#E04E2B)', marginBottom: 24 }} />

        {/* Datos del Cliente */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--naranja)', letterSpacing: 0.8, borderBottom: '1px solid #D8E2EE', paddingBottom: 6, marginBottom: 12 }}>
            Datos del Cliente
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, fontSize: '0.88rem' }}>
            <div style={{ display: 'flex', gap: 8 }}><span style={{ fontWeight: 600, color: 'var(--azul)', minWidth: 90 }}>Cliente:</span><span style={{ color: '#333' }}>{servicio.nombre || '—'}</span></div>
            {servicio.telefono && (
              <div style={{ display: 'flex', gap: 8 }}><span style={{ fontWeight: 600, color: 'var(--azul)', minWidth: 90 }}>Teléfono:</span><span style={{ color: '#333' }}>{servicio.telefono}</span></div>
            )}
            {servicio.email && (
              <div style={{ display: 'flex', gap: 8 }}><span style={{ fontWeight: 600, color: 'var(--azul)', minWidth: 90 }}>Email:</span><span style={{ color: '#333' }}>{servicio.email}</span></div>
            )}
            <div style={{ display: 'flex', gap: 8 }}><span style={{ fontWeight: 600, color: 'var(--azul)', minWidth: 90 }}>Dirección:</span><span style={{ color: '#333' }}>{servicio.direccionCompleta || servicio.direccion || '—'}{servicio.localidad ? `, ${servicio.localidad}` : ''}</span></div>
          </div>
        </div>

        {/* Detalles del Servicio */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--naranja)', letterSpacing: 0.8, borderBottom: '1px solid #D8E2EE', paddingBottom: 6, marginBottom: 12 }}>
            Detalle del Servicio
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, fontSize: '0.88rem' }}>
            <div style={{ display: 'flex', gap: 8 }}><span style={{ fontWeight: 600, color: 'var(--azul)', minWidth: 90 }}>Equipo:</span><span style={{ color: '#333' }}>{equipos || '—'}</span></div>
            {servicio.marca && (
              <div style={{ display: 'flex', gap: 8 }}><span style={{ fontWeight: 600, color: 'var(--azul)', minWidth: 90 }}>Marca/Modelo:</span><span style={{ color: '#333' }}>{servicio.marca} {servicio.modelo || ''}</span></div>
            )}
            <div style={{ display: 'flex', gap: 8 }}><span style={{ fontWeight: 600, color: 'var(--azul)', minWidth: 90 }}>Problema:</span><span style={{ color: '#333', lineHeight: 1.4 }}>{servicio.descripcion || '—'}</span></div>
            {servicio.tecnico && (
              <div style={{ display: 'flex', gap: 8 }}><span style={{ fontWeight: 600, color: 'var(--azul)', minWidth: 90 }}>Técnico:</span><span style={{ color: '#333' }}>{servicio.tecnico}</span></div>
            )}
          </div>
        </div>

        {/* Materiales */}
        {materiales.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--naranja)', letterSpacing: 0.8, marginBottom: 10 }}>
              Materiales / Repuestos
            </h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'var(--azul)', color: 'white' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Descripción</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, width: 60 }}>Cant.</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, width: 100 }}>Precio unit.</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, width: 110 }}>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {materiales.map((m, idx) => {
                    const subtotal = (parseFloat(m.precio) || 0) * (parseFloat(m.cant) || 1)
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid #EEF4FF' }}>
                        <td style={{ padding: '8px 12px', color: '#333' }}>{m.desc || '—'}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', color: '#555' }}>{m.cant || 1}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#555' }}>${formatMoney(m.precio)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--azul)' }}>${formatMoney(subtotal)}</td>
                      </tr>
                    )
                  })}
                  <tr style={{ background: '#EEF4FF', fontWeight: 700 }}>
                    <td colSpan="3" style={{ padding: '8px 12px', color: 'var(--azul)' }}>Subtotal materiales (sin IVA)</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--azul)' }}>${formatMoney(totalMatNeto)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Mano de Obra */}
        {manoObra.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--naranja)', letterSpacing: 0.8, marginBottom: 10 }}>
              Mano de Obra / Servicios
            </h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'var(--azul)', color: 'white' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Descripción del trabajo</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, width: 110 }}>Importe (sin IVA)</th>
                  </tr>
                </thead>
                <tbody>
                  {manoObra.map((m, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #EEF4FF' }}>
                      <td style={{ padding: '8px 12px', color: '#333' }}>{m.desc || '—'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--azul)' }}>${formatMoney(m.precio)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: '#EEF4FF', fontWeight: 700 }}>
                    <td style={{ padding: '8px 12px', color: 'var(--azul)' }}>Subtotal mano de obra (sin IVA)</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--azul)' }}>${formatMoney(totalMoNeto)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Resumen Económico */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--naranja)', letterSpacing: 0.8, marginBottom: 10 }}>
            Resumen Económico
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <tbody>
              {servicio.cobroSinIva ? (
                <tr style={{ background: 'var(--azul)', color: 'white', fontWeight: 800, fontSize: '1rem' }}>
                  <td style={{ padding: '10px 14px' }}>TOTAL ABONADO (sin IVA)</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>${formatMoney(sinIVA)}</td>
                </tr>
              ) : (
                <>
                  <tr style={{ borderBottom: '1px solid #EEF4FF' }}>
                    <td style={{ padding: '8px 12px', color: '#555' }}>Subtotal neto (sin IVA)</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>${formatMoney(sinIVA)}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #EEF4FF' }}>
                    <td style={{ padding: '8px 12px', color: '#555' }}>IVA (21%)</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>${formatMoney(ivaTotal)}</td>
                  </tr>
                  <tr style={{ background: 'var(--azul)', color: 'white', fontWeight: 800, fontSize: '1rem' }}>
                    <td style={{ padding: '10px 14px' }}>{esRecibo ? 'TOTAL ABONADO' : 'TOTAL A ABONAR'}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>${formatMoney(conIVA)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Detalles de Pago (Solo para Recibos) */}
        {esRecibo && (
          <div style={{ marginBottom: 24, background: '#EEF4FF', padding: '16px 20px', borderRadius: 8, border: '1.5px solid #D8E2EE' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--azul)', fontWeight: 700, fontSize: '0.92rem', marginBottom: 8 }}>
              <ShieldCheck size={18} /> Información de Pago
            </div>
            <div style={{ fontSize: '0.85rem', display: 'flex', gap: 6 }}>
              <span style={{ fontWeight: 600 }}>Método utilizado:</span>
              <span style={{ color: '#333', fontWeight: 700 }}>{servicio.metodoPago || 'No especificado'}</span>
            </div>
          </div>
        )}

        {/* Diagnóstico */}
        {servicio.diagnostico && (
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--naranja)', letterSpacing: 0.8, borderBottom: '1px solid #D8E2EE', paddingBottom: 6, marginBottom: 8 }}>
              Diagnóstico / Notas Técnicas
            </h2>
            <p style={{ fontSize: '0.88rem', color: '#333', lineHeight: 1.5, background: '#FAFBFD', padding: 12, borderRadius: 8, border: '1px solid #EEF4FF' }}>
              {servicio.diagnostico}
            </p>
          </div>
        )}

        {/* Recomendaciones (Retrocompatibilidad) */}
        {servicio.recomendaciones && (
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--naranja)', letterSpacing: 0.8, borderBottom: '1px solid #D8E2EE', paddingBottom: 6, marginBottom: 8 }}>
              Recomendaciones
            </h2>
            <p style={{ fontSize: '0.88rem', color: '#333', lineHeight: 1.5, background: '#FAFBFD', padding: 12, borderRadius: 8, border: '1px solid #EEF4FF' }}>
              {servicio.recomendaciones}
            </p>
          </div>
        )}

        {/* Tareas Pendientes (Retrocompatibilidad) */}
        {servicio.tareasPendientes && (
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--naranja)', letterSpacing: 0.8, borderBottom: '1px solid #D8E2EE', paddingBottom: 6, marginBottom: 8 }}>
              Tareas Pendientes
            </h2>
            <p style={{ fontSize: '0.88rem', color: '#333', lineHeight: 1.5, background: '#FAFBFD', padding: 12, borderRadius: 8, border: '1px solid #EEF4FF' }}>
              {servicio.tareasPendientes}
            </p>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 36, paddingTop: 16, borderTop: '1px solid #D8E2EE', fontSize: '0.75rem', color: '#888', textAlign: 'center' }}>
          <strong>Euler Calefacción</strong> — www.euler.com.ar — Ing. Nicolás F. Ayala
        </div>
      </div>

      {/* Estilos CSS adicionales embebidos */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body { background: white !important; padding: 0 !important; }
          .no-print { display: none !important; }
          .print-container { box-shadow: none !important; padding: 0 !important; border: none !important; }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.2); opacity: 0.6; }
        }
      ` }} />
    </div>
  )
}
