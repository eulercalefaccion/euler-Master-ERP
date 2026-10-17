import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import {
  Calculator, Download, MessageCircle, HardHat, FileSpreadsheet, ExternalLink, Plus, TrendingUp, CheckCircle, Clock, Target, Loader, Receipt,
} from 'lucide-react';
import { db } from '../../services/firebaseConfig';
import { generarPDFPresupuesto } from '../../services/pdfPresupuesto';
import {
  EMPRESAS_LISTADO, ESTADOS_PRESUPUESTO, empresaDeCanal, fechaPresupuestoISO, totalPresupuesto,
  rangoPeriodo, enRango, ars, fechaAR, abrirWhatsApp, exportarExcel, calcularTasaAprobacion,
} from '../../services/listadosService';
import { KpiCard, Pill, EmpresaBadge, SortTh, IconBtn, BarraFiltros } from './listadosUI';
import { ordenar, cellPad } from './listadosHelpers';

const EN_CURSO = ['pendiente', 'en_calculo', 'listo_para_enviar', 'enviado', 'seguimiento'];

export default function ListadoPresupuestos({ embedded = false } = {}) {
  const navigate = useNavigate();
  const [presupuestos, setPresupuestos] = useState([]);
  const [obras, setObras] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [generando, setGenerando] = useState(null);

  const [busqueda, setBusqueda] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [periodo, setPeriodo] = useState('anio');
  const [custom, setCustom] = useState({});
  const [estado, setEstado] = useState('');
  const [orden, setOrden] = useState({ campo: 'fecha', dir: 'desc' });

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'presupuestos'), (s) => {
      setPresupuestos(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => !p.deleted));
      setCargando(false);
    }, (e) => { setError(e.message); setCargando(false); });
    const u2 = onSnapshot(collection(db, 'obras'), (s) => setObras(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((o) => !o.deleted)), () => {});
    return () => { u1(); u2(); };
  }, []);

  const obraPorPresupuesto = useMemo(() => Object.fromEntries(obras.filter((o) => o.presupuestoId).map((o) => [o.presupuestoId, o])), [obras]);

  const todos = useMemo(() => presupuestos.map((p) => ({
    ...p,
    _fecha: fechaPresupuestoISO(p),
    _empresa: empresaDeCanal(p.canal),
    _total: totalPresupuesto(p),
    _cliente: p.clientName || p.name || '',
    _ref: p.direccionObra || p.location || '',
    _estado: ESTADOS_PRESUPUESTO[p.status] ? p.status : 'pendiente',
    _obra: obraPorPresupuesto[p.id],
  })), [presupuestos, obraPorPresupuesto]);

  const [desde, hasta] = rangoPeriodo(periodo, custom);
  // Base del período (sin filtro de estado) → KPIs y chips de estado
  const delPeriodo = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    return todos.filter((p) => {
      if (empresa && p._empresa !== empresa) return false;
      if (!enRango(p._fecha, [desde, hasta])) return false;
      if (!t) return true;
      return [p._cliente, p.presupuestoNumber, p._ref, p.cuit, p.dni, p.email, p.telefono, p.notas, p.estudioArquitectura, p.empresaOEstudio]
        .some((v) => String(v || '').toLowerCase().includes(t));
    });
  }, [todos, empresa, desde, hasta, busqueda]);

  const filtrados = useMemo(() => ordenar(delPeriodo.filter((p) => !estado || p._estado === estado), orden, {
    fecha: (p) => p._fecha,
    numero: (p) => p.presupuestoNumber,
    empresa: (p) => p._empresa,
    cliente: (p) => p._cliente,
    estado: (p) => ESTADOS_PRESUPUESTO[p._estado]?.label,
    total: (p) => p._total,
  }), [delPeriodo, estado, orden]);

  const kpi = useMemo(() => {
    const k = { total: 0, cant: delPeriodo.length, aprob: 0, aprobMonto: 0, rech: 0, curso: 0, cursoMonto: 0, porEstado: {} };
    delPeriodo.forEach((p) => {
      k.total += p._total;
      k.porEstado[p._estado] = (k.porEstado[p._estado] || 0) + 1;
      if (p._estado === 'aprobado') { k.aprob += 1; k.aprobMonto += p._total; }
      if (p._estado === 'rechazado') k.rech += 1;
      if (EN_CURSO.includes(p._estado)) { k.curso += 1; k.cursoMonto += p._total; }
    });
    // Tasa = aprobados / enviados al cliente (incluye los que esperan respuesta)
    const t = calcularTasaAprobacion(delPeriodo.map((p) => p._estado));
    k.presentados = t.presentados;
    k.tasa = t.tasa == null ? null : Math.round(t.tasa);
    return k;
  }, [delPeriodo]);

  // ── Acciones ──
  const abrir = (p) => navigate(`/presupuestos?abrir=${p.id}`);
  const pdf = async (p) => {
    setGenerando(p.id);
    try { await generarPDFPresupuesto(p, []); } catch (e) { alert(`No se pudo generar el PDF: ${e.message}`); }
    setGenerando(null);
  };
  const whatsapp = (p) => {
    const nombre = (p.contactoNombre || p._cliente || '').split(' ')[0] || '';
    abrirWhatsApp(p.telefono || p.contactoTelefono,
      `Hola ${nombre}, te escribimos de Euler Calefacción por el presupuesto N° ${p.presupuestoNumber || ''}${p._ref ? ` (${p._ref})` : ''} por ${ars(p._total)}. ¿Pudiste revisarlo? Quedamos a disposición.`);
  };
  const exportar = () => exportarExcel(filtrados, [
    { titulo: 'Fecha', valor: (p) => fechaAR(p._fecha), ancho: 11 },
    { titulo: 'N° Presupuesto', valor: (p) => p.presupuestoNumber, ancho: 22 },
    { titulo: 'Empresa', valor: (p) => EMPRESAS_LISTADO[p._empresa]?.nombre, ancho: 26 },
    { titulo: 'Cliente', valor: (p) => p._cliente, ancho: 32 },
    { titulo: 'Referencia / Obra', valor: (p) => p._ref, ancho: 36 },
    { titulo: 'Teléfono', valor: (p) => p.telefono || p.contactoTelefono || '', ancho: 16 },
    { titulo: 'Estado', valor: (p) => ESTADOS_PRESUPUESTO[p._estado]?.label, ancho: 16 },
    { titulo: 'Total', valor: (p) => Math.round(p._total * 100) / 100, ancho: 14 },
    { titulo: 'Obra creada', valor: (p) => (p._obra ? (p._obra.otNumber || 'Sí') : ''), ancho: 12 },
  ], `Presupuestos_${new Date().toISOString().slice(0, 10)}.xlsx`, 'Presupuestos');

  const thSt = { background: 'var(--bg-surface-hover, #f8fafc)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-light)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: embedded ? 'flex-end' : 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        {!embedded && (
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Calculator size={24} color="var(--primary-600)" /> Listado de Presupuestos
          </h2>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Todos los presupuestos realizados, de Canal 1 (Ayala Nicolás Federico) y Canal 2 (Euler Calefacción).
          </p>
        </div>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={exportar} disabled={!filtrados.length} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <FileSpreadsheet size={16} /> Exportar Excel
          </button>
          <button className="btn btn-primary" onClick={() => navigate('/presupuestos')} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Plus size={16} /> Nuevo presupuesto
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.75rem' }}>
        <KpiCard titulo="Presupuestado en el período" valor={ars(kpi.total)} color="#0D2A4E" icono={<TrendingUp size={18} />}
          detalle={`${kpi.cant} presupuesto(s) · promedio ${ars(kpi.cant ? kpi.total / kpi.cant : 0)}`} />
        <KpiCard titulo="Aprobados" valor={ars(kpi.aprobMonto)} color="#047857" icono={<CheckCircle size={18} />} detalle={`${kpi.aprob} aprobado(s)`} />
        <KpiCard titulo="En curso" valor={ars(kpi.cursoMonto)} color="#b45309" icono={<Clock size={18} />} detalle={`${kpi.curso} sin cerrar (pendientes, enviados, seguimiento)`} />
        <KpiCard titulo="Tasa de aprobación" valor={kpi.tasa == null ? '—' : `${kpi.tasa}%`} color="#7c3aed" icono={<Target size={18} />}
          detalle={`${kpi.aprob} aprobados / ${kpi.presentados} enviados al cliente`} />
      </div>

      <BarraFiltros
        busqueda={busqueda} setBusqueda={setBusqueda} empresa={empresa} setEmpresa={setEmpresa}
        periodo={periodo} setPeriodo={setPeriodo} custom={custom} setCustom={setCustom}
        placeholder="Buscar cliente, número, dirección, CUIT, teléfono…"
      />

      {/* Chips de estado (filtran) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
        <button onClick={() => setEstado('')} style={{ padding: '0.3rem 0.75rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', border: estado === '' ? '2px solid #0D2A4E' : '1px solid var(--border-strong, #cbd5e1)', background: estado === '' ? '#0D2A4E' : 'transparent', color: estado === '' ? '#fff' : 'inherit' }}>
          Todos ({kpi.cant})
        </button>
        {Object.entries(ESTADOS_PRESUPUESTO).map(([id, e]) => (
          <button key={id} onClick={() => setEstado(estado === id ? '' : id)}
            style={{ padding: '0.3rem 0.75rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', border: estado === id ? `2px solid ${e.color}` : '1px solid transparent', background: e.bg, color: e.color, opacity: kpi.porEstado[id] ? 1 : 0.5 }}>
            {e.label} ({kpi.porEstado[id] || 0})
          </button>
        ))}
      </div>

      {error && <div style={{ color: '#b91c1c', fontSize: '0.85rem' }}>Error: {error}</div>}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
            <thead>
              <tr style={thSt}>
                <SortTh label="Fecha" campo="fecha" orden={orden} setOrden={setOrden} />
                <SortTh label="Presupuesto" campo="numero" orden={orden} setOrden={setOrden} />
                <SortTh label="Empresa" campo="empresa" orden={orden} setOrden={setOrden} />
                <SortTh label="Cliente" campo="cliente" orden={orden} setOrden={setOrden} />
                <th style={{ ...cellPad, textAlign: 'left', fontWeight: 600, fontSize: '0.75rem' }}>Referencia</th>
                <SortTh label="Estado" campo="estado" orden={orden} setOrden={setOrden} />
                <SortTh label="Total" campo="total" orden={orden} setOrden={setOrden} align="right" />
                <th style={{ ...cellPad, textAlign: 'center', fontWeight: 600, fontSize: '0.75rem' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr><td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Cargando…</td></tr>
              ) : filtrados.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No hay presupuestos para los filtros elegidos.</td></tr>
              ) : filtrados.map((p) => {
                const est = ESTADOS_PRESUPUESTO[p._estado];
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ ...cellPad, whiteSpace: 'nowrap' }}>{fechaAR(p._fecha)}</td>
                    <td style={{ ...cellPad, whiteSpace: 'nowrap' }}>
                      <button onClick={() => abrir(p)} title="Abrir presupuesto"
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--primary-600, #1d4ed8)', fontWeight: 600, fontSize: '0.83rem' }}>
                        {p.presupuestoNumber || 'S/N'}
                      </button>
                      {p._obra && <div style={{ fontSize: '0.68rem', color: '#047857' }}>Obra {p._obra.otNumber || 'creada'}</div>}
                    </td>
                    <td style={cellPad}><EmpresaBadge empresaId={p._empresa} /></td>
                    <td style={cellPad}>
                      <div style={{ fontWeight: 500 }}>{p._cliente}</div>
                      {(p.estudioArquitectura || p.empresaOEstudio) && <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{p.estudioArquitectura || p.empresaOEstudio}</div>}
                    </td>
                    <td style={{ ...cellPad, maxWidth: 280 }}>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p._ref}>{p._ref ? `REF.: ${p._ref}` : '—'}</div>
                    </td>
                    <td style={cellPad}><Pill texto={est.label} color={est.color} bg={est.bg} /></td>
                    <td style={{ ...cellPad, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{ars(p._total)}</td>
                    <td style={{ ...cellPad, whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <IconBtn title="Abrir en el CRM" onClick={() => abrir(p)} color="#1d4ed8" bg="#dbeafe"><ExternalLink size={14} /></IconBtn>
                        <IconBtn title="Descargar PDF (sin folletos)" onClick={() => pdf(p)} disabled={generando === p.id} color="#c2410c" bg="#ffedd5">
                          {generando === p.id ? <Loader size={14} className="spin" /> : <Download size={14} />}
                        </IconBtn>
                        <IconBtn title="Seguimiento por WhatsApp" onClick={() => whatsapp(p)} color="#15803d" bg="#dcfce7"><MessageCircle size={14} /></IconBtn>
                        <IconBtn title="Facturar este presupuesto" onClick={() => navigate(`/facturas?nueva=1&presupuesto=${p.id}`)} color="#047857" bg="#d1fae5"><Receipt size={14} /></IconBtn>
                        <IconBtn title={p._obra ? 'Ir a la obra' : 'Todavía no tiene obra'} onClick={() => navigate(`/obras?obra=${p._obra.id}`)} disabled={!p._obra} color="#0D2A4E" bg="#e8eff7"><HardHat size={14} /></IconBtn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {filtrados.length > 0 && (
              <tfoot>
                <tr style={{ background: 'var(--bg-surface-hover, #f8fafc)', fontWeight: 700 }}>
                  <td colSpan={6} style={{ ...cellPad, fontSize: '0.8rem' }}>{filtrados.length} presupuesto(s)</td>
                  <td style={{ ...cellPad, textAlign: 'right', whiteSpace: 'nowrap' }}>{ars(filtrados.reduce((a, p) => a + p._total, 0))}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
