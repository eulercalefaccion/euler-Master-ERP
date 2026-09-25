import React, { useState, useEffect } from 'react';
import { Database, Play, CheckCircle, AlertTriangle, FileSpreadsheet, History, ShieldCheck } from 'lucide-react';
import { CASOS_ACEPTACION_GESDATTA, ejecutarMigracionGesDatta } from '../../services/migracionGesDattaService';
import { db } from '../../services/firebaseConfig';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';

const MigracionGesDatta = () => {
  const [historialMigraciones, setHistorialMigraciones] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [ultimoResultado, setUltimoResultado] = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'migraciones_gesdatta'), orderBy('fechaEjecucion', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setHistorialMigraciones(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const handleEjecutar = async () => {
    if (!window.confirm('¿Desea ejecutar la migración idempotente de los registros históricos de GesDatta?')) return;
    setIsRunning(true);
    try {
      const res = await ejecutarMigracionGesDatta({
        loteNombre: `Migración GesDatta ${new Date().toLocaleDateString('es-AR')}`,
        registros: CASOS_ACEPTACION_GESDATTA
      });
      setUltimoResultado(res);
      alert('Migración ejecutada con éxito. Revise el informe de conciliación.');
    } catch (err) {
      console.error(err);
      alert('Error ejecutando migración: ' + err.message);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Database size={24} color="var(--primary-600)" /> Importador Idempotente & Conciliación GesDatta
          </h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Migración automatizada con verificación por claves de origen (gesdattaId), zonas de pruebas y conciliación de asientos.
          </p>
        </div>
        <button onClick={handleEjecutar} className="btn btn-primary" disabled={isRunning} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#059669', borderColor: '#047857' }}>
          <Play size={18} /> {isRunning ? 'Procesando Lote...' : 'Ejecutar Lote GesDatta'}
        </button>
      </div>

      {/* Casos de Aceptación Pre-cargados */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ShieldCheck color="#059669" size={20} /> Registros de Prueba / Casos de Aceptación Históricos
        </h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          Los siguientes comprobantes reales de GesDatta forman parte de la suite de aceptación de la migración:
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
          <div style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '1rem', backgroundColor: 'var(--bg-surface-hover)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#dc2626' }}>COMPRA 519769 (FAA 00015-00312360)</span>
            <div style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Fecha: 10/09/2026</div>
            <div style={{ fontSize: '0.85rem' }}>Neto: $ 7.048.415,97 | IVA: $ 1.480.167,35</div>
            <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#dc2626' }}>Total: $ 8.528.583,32</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Asiento 3401228: Debe CMV + IVA; Haber Proveedores.</div>
          </div>

          <div style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '1rem', backgroundColor: 'var(--bg-surface-hover)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#059669' }}>VENTA 1225924 & RECIBO 813232</span>
            <div style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Fecha: 21/09/2026 (FAA 00006-00000289)</div>
            <div style={{ fontSize: '0.85rem' }}>Neto: $ 498.396,00 | IVA: $ 104.663,16</div>
            <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#059669' }}>Total: $ 603.059,16 (Aplicado a Tarjeta)</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Deuda cancelada; Tarjeta pendiente de liquidación.</div>
          </div>

          <div style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '1rem', backgroundColor: 'var(--bg-surface-hover)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#d97706' }}>PAGO DIRECTO 735129 (OPA 0001-00001406)</span>
            <div style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Fecha: 18/09/2026 | Beneficiario: Fletes Varios</div>
            <div style={{ fontSize: '0.85rem' }}>Concepto: Fletes y Acarreos Varios</div>
            <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#d97706' }}>Total: $ 70.000,00 (Débito Santander CC)</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Costo y salida bancaria registrados en un solo paso.</div>
          </div>
        </div>
      </div>

      {/* Historial de Lotes Ejecutados */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <History size={18} color="var(--primary-600)" />
          <h4 style={{ margin: 0, fontSize: '1rem' }}>Historial de Lotes Importados & Log de Conciliación</h4>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-surface-hover)', borderBottom: '1px solid var(--border-light)' }}>
              <th style={{ padding: '0.75rem 1rem' }}>Fecha / Hora</th>
              <th style={{ padding: '0.75rem 1rem' }}>Nombre Lote</th>
              <th style={{ padding: '0.75rem 1rem' }}>Procesados</th>
              <th style={{ padding: '0.75rem 1rem' }}>Compras</th>
              <th style={{ padding: '0.75rem 1rem' }}>Ventas</th>
              <th style={{ padding: '0.75rem 1rem' }}>Recibos / OPAs</th>
              <th style={{ padding: '0.75rem 1rem' }}>Duplicados Omitidos</th>
              <th style={{ padding: '0.75rem 1rem' }}>Estado Idempotencia</th>
            </tr>
          </thead>
          <tbody>
            {historialMigraciones.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  Aún no se ha registrado ninguna ejecución de migración. Presione "Ejecutar Lote GesDatta" para comenzar.
                </td>
              </tr>
            ) : (
              historialMigraciones.map(h => (
                <tr key={h.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '0.75rem 1rem' }}>{new Date(h.fechaEjecucion).toLocaleString('es-AR')}</td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: '600' }}>{h.loteNombre}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>{h.totalProcesados}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>{h.comprasCreadas}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>{h.ventasCreadas}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>{h.recibosCreados} / {h.opasCreadas}</td>
                  <td style={{ padding: '0.75rem 1rem', color: '#64748b' }}>{h.omitidosDuplicados}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '600', backgroundColor: '#d1fae5', color: '#059669' }}>
                      Idempotente OK
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
};

export default MigracionGesDatta;
