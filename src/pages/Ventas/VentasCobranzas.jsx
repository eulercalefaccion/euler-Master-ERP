import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { Receipt, FilePlus, Wallet, Settings, FileText, Users, Loader } from 'lucide-react';
import { db } from '../../services/firebaseConfig';
import { useAuth } from '../../context/AuthContext';
import { getArcaConfig } from '../../services/arcaFacturacionService';
import { getVentasConfig, VENTAS_CONFIG_DEFAULT, anularComprobanteX, anularRecibo, EMPRESA_AYALA } from '../../services/cobranzasService';
import { calcularCartera } from '../../services/ventasCalculo';
import TabComprobantes from './TabComprobantes';
import TabRecibos from './TabRecibos';
import TabCuentasCorrientes from './TabCuentasCorrientes';
import NuevaFacturaModal from './NuevaFacturaModal';
import ReciboModal from './ReciboModal';
import NotaCreditoModal from './NotaCreditoModal';
import ConfigVentasModal from './ConfigVentasModal';

const TABS = [
  ['comprobantes', 'Comprobantes', <FileText key="f" size={16} />],
  ['recibos', 'Recibos de cobro', <Wallet key="w" size={16} />],
  ['cuentas', 'Cuentas corrientes', <Users key="u" size={16} />],
];

/**
 * Ventas, Cobranzas y Cuentas Corrientes (menú único).
 * Deep links: ?tab=comprobantes|recibos|cuentas · ?nueva=1&presupuesto=ID · ?cliente=CLAVE
 */
export default function VentasCobranzas() {
  const { currentUser } = useAuth();
  const [params, setParams] = useSearchParams();
  const [reales, setReales] = useState([]);
  const [pruebas, setPruebas] = useState([]);
  const [recibos, setRecibos] = useState([]);
  const [saldosIni, setSaldosIni] = useState([]);
  const [materiales, setMateriales] = useState([]);
  const [obras, setObras] = useState([]);
  const [arcaCfg, setArcaCfg] = useState(null);
  const [ventasCfg, setVentasCfg] = useState(VENTAS_CONFIG_DEFAULT);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [verPruebas, setVerPruebas] = useState(false);

  const [tab, setTab] = useState(() => params.get('tab') || (params.get('cliente') ? 'cuentas' : 'comprobantes'));
  const [modalFactura, setModalFactura] = useState(() => (params.get('nueva') ? { presupuestoId: params.get('presupuesto') || undefined } : null));
  const [modalRecibo, setModalRecibo] = useState(null);
  const [modalNC, setModalNC] = useState(null);
  const [modalConfig, setModalConfig] = useState(false);
  const [clienteInicial] = useState(() => params.get('cliente') || null);

  // Limpia los parámetros de un solo uso
  useEffect(() => {
    if (params.get('nueva') || params.get('cliente')) setParams({ tab }, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onErr = (e) => { setError(e.message); setCargando(false); };
    const subs = [
      onSnapshot(collection(db, 'comprobantes_venta'), (s) => { setReales(s.docs.map((d) => ({ id: d.id, ...d.data() }))); setCargando(false); }, onErr),
      onSnapshot(collection(db, 'arca_pruebas'), (s) => setPruebas(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {}),
      onSnapshot(collection(db, 'recibos'), (s) => setRecibos(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {}),
      onSnapshot(collection(db, 'saldos_iniciales'), (s) => setSaldosIni(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {}),
      onSnapshot(collection(db, 'materiales_a_favor'), (s) => setMateriales(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {}),
      onSnapshot(collection(db, 'obras'), (s) => setObras(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {}),
    ];
    getArcaConfig().then((c) => { setArcaCfg(c); setVerPruebas(c.entorno !== 'produccion'); }).catch(() => {});
    getVentasConfig().then(setVentasCfg).catch(() => {});
    return () => subs.forEach((u) => u());
  }, []);

  const esProduccion = arcaCfg?.entorno === 'produccion';

  const comprobantes = useMemo(() => [
    ...reales.map((c) => ({ ...c, _col: 'comprobantes_venta', _prueba: false })),
    ...(verPruebas ? pruebas.map((c) => ({ ...c, _col: 'arca_pruebas', _prueba: true })) : []),
  ], [reales, pruebas, verPruebas]);
  const recibosVis = useMemo(() => recibos.filter((r) => verPruebas || !r.prueba), [recibos, verPruebas]);
  const materialesVis = useMemo(() => materiales.filter((m) => verPruebas || !m.prueba), [materiales, verPruebas]);
  const cartera = useMemo(() => calcularCartera(comprobantes, recibosVis, saldosIni), [comprobantes, recibosVis, saldosIni]);

  const cambiarTab = (t) => { setTab(t); setParams({ tab: t }, { replace: true }); };

  const cobrarComprobante = (c, cliente = null) => {
    const pend = Math.max(0, cartera.pendienteDe(c));
    setModalRecibo({
      empresaId: c.empresaId || EMPRESA_AYALA,
      cliente: {
        clave: cartera.claveDe(c), id: c.clienteId || null, nombre: c.clienteNombre, docNro: c.clienteCuit || c.receptor?.docNro || '',
        telefono: c.clienteTelefono || '', domicilio: c.receptor?.domicilio || c.clienteDomicilio || '', condicionIva: c.receptor?.condicionIva || c.clienteCondicionIva || '',
        ...(cliente || {}),
      },
      comprobanteIds: [c.id],
      comprobante: c,
      importeInicial: c._pendiente ?? (pend || Number(c.totalComprobante || 0)),
    });
  };

  const anularX = async (c) => {
    const motivo = window.prompt(`¿Anular el comprobante X ${c.numeroOriginal} de ${c.clienteNombre}?\nSe genera el contra-asiento. Indicá el motivo:`);
    if (motivo === null) return;
    try { await anularComprobanteX(c, motivo, currentUser); } catch (e) { alert(e.message); }
  };
  const anularRec = async (r) => {
    const motivo = window.prompt(`¿Anular el recibo ${r.numeroOriginal} de ${r.clienteNombre} por $ ${Number(r.totalRecibo || 0).toLocaleString('es-AR')}?\nLos comprobantes imputados vuelven a quedar pendientes. Indicá el motivo:`);
    if (motivo === null) return;
    try { await anularRecibo(r, motivo, currentUser); } catch (e) { alert(e.message); }
  };

  const cantPruebas = pruebas.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Receipt size={24} color="var(--primary-600)" /> Ventas y Cobranzas
          </h2>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Facturación, recibos y cuentas corrientes · AYALA NICOLAS FEDERICO (Canal 1) y EULER CALEFACCIÓN (Canal 2)
            {arcaCfg && !esProduccion && <span style={{ marginLeft: 8, color: '#b45309', fontWeight: 600 }}>· ARCA en homologación</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => setModalConfig(true)} title="Numeración y datos" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Settings size={16} /> Configuración
          </button>
          <button className="btn btn-secondary" onClick={() => setModalRecibo({})} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Wallet size={16} /> Nuevo recibo
          </button>
          <button className="btn btn-primary" onClick={() => setModalFactura({})} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <FilePlus size={16} /> Nueva factura
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border-light)' }}>
        {TABS.map(([id, label, icono]) => (
          <button key={id} onClick={() => cambiarTab(id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '0.6rem 1rem', border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.88rem',
              fontWeight: tab === id ? 700 : 500, color: tab === id ? '#0D2A4E' : 'var(--text-secondary)', borderBottom: `3px solid ${tab === id ? '#F5A623' : 'transparent'}`, marginBottom: -1,
            }}>
            {icono} {label}
          </button>
        ))}
      </div>

      {error && <div style={{ padding: '0.75rem', background: '#fef2f2', color: '#b91c1c', borderRadius: 8, fontSize: '0.85rem' }}>{error}</div>}
      {cargando ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}><Loader size={20} className="spin" /> Cargando…</div>
      ) : (
        <>
          {tab === 'comprobantes' && (
            <TabComprobantes
              comprobantes={comprobantes} obras={obras} arcaCfg={arcaCfg} ventasCfg={ventasCfg} cartera={cartera}
              verPruebas={verPruebas} setVerPruebas={setVerPruebas} cantPruebas={cantPruebas} esProduccion={esProduccion}
              onNuevaFactura={(preset) => setModalFactura(preset || {})} onCobrar={(c) => cobrarComprobante(c)} onAnular={anularX} onNotaCredito={(c) => setModalNC(c)}
            />
          )}
          {tab === 'recibos' && (
            <TabRecibos recibos={recibosVis} arcaCfg={arcaCfg} ventasCfg={ventasCfg} cartera={cartera} verPruebas={verPruebas} setVerPruebas={setVerPruebas}
              onAnular={anularRec} onNuevoRecibo={() => setModalRecibo({})} />
          )}
          {tab === 'cuentas' && (
            <TabCuentasCorrientes cartera={cartera} materiales={materialesVis} ventasCfg={ventasCfg} clienteInicial={clienteInicial}
              onNuevoRecibo={(preset) => setModalRecibo(preset || {})} onNuevaFactura={(preset) => setModalFactura(preset || {})}
              onCobrar={(p) => cobrarComprobante(p)} />
          )}
        </>
      )}

      {modalFactura && (
        <NuevaFacturaModal
          preset={modalFactura} arcaCfg={arcaCfg || {}} ventasCfg={ventasCfg} cuentas={Object.values(cartera.cuentas)} comprobantes={comprobantes} obras={obras}
          onClose={() => setModalFactura(null)}
          onCobrar={(r) => { setModalFactura(null); cobrarComprobante(r, r._cliente ? { ...r._cliente, clave: cartera.claveDe(r) } : null); }}
        />
      )}
      {modalRecibo && <ReciboModal preset={modalRecibo} arcaCfg={arcaCfg || {}} ventasCfg={ventasCfg} cartera={cartera} onClose={() => setModalRecibo(null)} />}
      {modalNC && <NotaCreditoModal comprobante={modalNC} arcaCfg={arcaCfg} cartera={cartera} esProduccion={esProduccion} onClose={() => setModalNC(null)} />}
      {modalConfig && <ConfigVentasModal ventasCfg={ventasCfg} onClose={() => setModalConfig(false)} onGuardado={(c) => setVentasCfg((v) => ({ ...v, ...c }))} />}
    </div>
  );
}
