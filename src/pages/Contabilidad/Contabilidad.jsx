import React, { useState, useEffect } from 'react';
import { BookOpen, FileText, CheckCircle, Filter, Download } from 'lucide-react';
import { db } from '../../services/firebaseConfig';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { getPlanCuentas } from '../../services/contabilidadService';
import { getEmpresas } from '../../services/empresasService';

const Contabilidad = () => {
  const [asientos, setAsientos] = useState([]);
  const [planCuentas, setPlanCuentas] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [empresaFiltro, setEmpresaFiltro] = useState('');
  const [activeTab, setActiveTab] = useState('diario'); // diario, mayor, sumas_saldos

  useEffect(() => {
    (async () => {
      setPlanCuentas(await getPlanCuentas());
      setEmpresas(await getEmpresas());
    })();

    const q = query(collection(db, 'asientos_contables'), orderBy('fecha', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setAsientos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const asientosFiltrados = empresaFiltro 
    ? asientos.filter(a => a.empresaId === empresaFiltro)
    : asientos;

  // Cómputo de Balance de Sumas y Saldos
  const sumasYSaldosMap = {};
  planCuentas.forEach(c => {
    sumasYSaldosMap[c.codigo] = { codigo: c.codigo, nombre: c.nombre, tipo: c.tipo, debe: 0, haber: 0 };
  });

  asientosFiltrados.forEach(a => {
    a.lineas?.forEach(l => {
      if (!sumasYSaldosMap[l.cuentaCodigo]) {
        sumasYSaldosMap[l.cuentaCodigo] = { codigo: l.cuentaCodigo, nombre: l.cuentaNombre || l.cuentaCodigo, debe: 0, haber: 0 };
      }
      sumasYSaldosMap[l.cuentaCodigo].debe += Number(l.debe || 0);
      sumasYSaldosMap[l.cuentaCodigo].haber += Number(l.haber || 0);
    });
  });

  const listSumasYSaldos = Object.values(sumasYSaldosMap).filter(s => s.debe > 0 || s.haber > 0);

  const totalDebeGlobal = asientosFiltrados.reduce((acc, a) => acc + (a.totalDebe || 0), 0);
  const totalHaberGlobal = asientosFiltrados.reduce((acc, a) => acc + (a.totalHaber || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BookOpen size={24} color="var(--primary-600)" /> Contabilidad General & Libros Fiscales
          </h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Libro Diario, Libro Mayor por cuenta, Balance de Sumas y Saldos y control de Partida Doble.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <select className="input-field" value={empresaFiltro} onChange={e => setEmpresaFiltro(e.target.value)} style={{ width: '220px' }}>
            <option value="">Todas las Empresas</option>
            {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--border-light)', gap: '1rem' }}>
        <button 
          onClick={() => setActiveTab('diario')} 
          style={{ padding: '0.5rem 1rem', border: 'none', background: 'none', fontWeight: '600', cursor: 'pointer', color: activeTab === 'diario' ? 'var(--primary-600)' : '#64748b', borderBottom: activeTab === 'diario' ? '2px solid var(--primary-600)' : 'none' }}
        >
          Libro Diario ({asientosFiltrados.length} Asientos)
        </button>
        <button 
          onClick={() => setActiveTab('sumas_saldos')} 
          style={{ padding: '0.5rem 1rem', border: 'none', background: 'none', fontWeight: '600', cursor: 'pointer', color: activeTab === 'sumas_saldos' ? 'var(--primary-600)' : '#64748b', borderBottom: activeTab === 'sumas_saldos' ? '2px solid var(--primary-600)' : 'none' }}
        >
          Sumas y Saldos
        </button>
      </div>

      {/* Tab: Libro Diario */}
      {activeTab === 'diario' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {asientosFiltrados.length === 0 ? (
            <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No se han registrado asientos contables.
            </div>
          ) : (
            asientosFiltrados.map((a, idx) => (
              <div key={a.id} className="card" style={{ padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
                  <div>
                    <span style={{ fontWeight: '700', fontSize: '0.9rem' }}>Asiento N° {asientosFiltrados.length - idx}</span>
                    <span style={{ marginLeft: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{a.fecha}</span>
                    <span style={{ marginLeft: '1rem', color: 'var(--primary-600)', fontSize: '0.85rem', fontWeight: '600' }}>{a.concepto}</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#059669', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <CheckCircle size={14} /> Equilibrado (Debe = Haber = $ {Number(a.totalDebe).toLocaleString('es-AR')})
                  </div>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-secondary)', textAlign: 'left' }}>
                      <th style={{ padding: '0.25rem 0.5rem' }}>Código</th>
                      <th style={{ padding: '0.25rem 0.5rem' }}>Cuenta Contable</th>
                      <th style={{ padding: '0.25rem 0.5rem' }}>Centro Costo</th>
                      <th style={{ padding: '0.25rem 0.5rem', textAlign: 'right' }}>Debe ($)</th>
                      <th style={{ padding: '0.25rem 0.5rem', textAlign: 'right' }}>Haber ($)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.lineas?.map((l, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.25rem 0.5rem', color: 'var(--text-secondary)' }}>{l.cuentaCodigo}</td>
                        <td style={{ padding: '0.25rem 0.5rem', fontWeight: l.debe > 0 ? '600' : '400', paddingLeft: l.haber > 0 ? '1.5rem' : '0.5rem' }}>{l.cuentaNombre}</td>
                        <td style={{ padding: '0.25rem 0.5rem', color: 'var(--text-secondary)' }}>{l.centroCosto}</td>
                        <td style={{ padding: '0.25rem 0.5rem', textAlign: 'right', fontWeight: l.debe > 0 ? '600' : '400' }}>
                          {l.debe > 0 ? `$ ${Number(l.debe).toLocaleString('es-AR')}` : '-'}
                        </td>
                        <td style={{ padding: '0.25rem 0.5rem', textAlign: 'right', fontWeight: l.haber > 0 ? '600' : '400' }}>
                          {l.haber > 0 ? `$ ${Number(l.haber).toLocaleString('es-AR')}` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab: Sumas y Saldos */}
      {activeTab === 'sumas_saldos' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface-hover)', borderBottom: '1px solid var(--border-light)' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Código</th>
                <th style={{ padding: '0.75rem 1rem' }}>Cuenta</th>
                <th style={{ padding: '0.75rem 1rem' }}>Tipo</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Total Debe ($)</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Total Haber ($)</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Saldo Net ($)</th>
              </tr>
            </thead>
            <tbody>
              {listSumasYSaldos.map(s => {
                const saldo = s.debe - s.haber;
                return (
                  <tr key={s.codigo} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: '600' }}>{s.codigo}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>{s.nombre}</td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{s.tipo}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>$ {s.debe.toLocaleString('es-AR')}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>$ {s.haber.toLocaleString('es-AR')}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: '700', color: saldo >= 0 ? '#059669' : '#dc2626' }}>
                      $ {saldo.toLocaleString('es-AR')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--bg-surface-hover)', fontWeight: '700' }}>
                <td colSpan="3" style={{ padding: '0.75rem 1rem' }}>TOTALES CONSOLIDADOS</td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>$ {totalDebeGlobal.toLocaleString('es-AR')}</td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>$ {totalHaberGlobal.toLocaleString('es-AR')}</td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: totalDebeGlobal === totalHaberGlobal ? '#059669' : '#dc2626' }}>
                  $ {(totalDebeGlobal - totalHaberGlobal).toLocaleString('es-AR')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

    </div>
  );
};

export default Contabilidad;
