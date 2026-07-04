import React, { useState, useEffect, useMemo } from 'react';
import {
  BadgeDollarSign, TrendingUp, HardHat, AlertTriangle, Package,
  ChevronRight, CheckCircle, Clock, Pickaxe, Target, Activity, XCircle, Star
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { db } from '../../services/firebaseConfig';
import { collection, onSnapshot } from 'firebase/firestore';
import { getTipoCambio } from '../../services/tipoCambioService';

// ─── helpers ───────────────────────────────────────────────────────────────
const fmt = (n) =>
  n >= 1_000_000
    ? `$ ${(n / 1_000_000).toFixed(1)} M`
    : n >= 1_000
    ? `$ ${(n / 1_000).toFixed(0)} k`
    : `$ ${n.toFixed(0)}`;

const PIPELINE_STEPS = [
  { key: 'pendiente',   label: 'Pendiente',    color: '#6b7280', bg: '#f3f4f6' },
  { key: 'calculo',     label: 'En Cálculo',   color: '#3b82f6', bg: '#eff6ff' },
  { key: 'enviado',     label: 'Enviado',      color: '#f59e0b', bg: '#fffbeb' },
  { key: 'seguimiento', label: 'Seguimiento',  color: '#f97316', bg: '#fff7ed' },
  { key: 'aprobado',    label: 'Aprobado',     color: '#10b981', bg: '#ecfdf5' },
  { key: 'rechazado',   label: 'Rechazado',    color: '#ef4444', bg: '#fef2f2' },
];

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// ─── KPI Card ──────────────────────────────────────────────────────────────
function KpiCard({ icon, label, main, sub, borderColor, iconBg, iconColor }) {
  return (
    <div
      className="card"
      style={{
        display: 'flex', alignItems: 'center', gap: '1rem',
        borderLeft: `4px solid ${borderColor}`, flex: '1 1 0', minWidth: 0,
        padding: '1rem 1.25rem',
      }}
    >
      <div style={{
        backgroundColor: iconBg, color: iconColor,
        padding: '0.65rem', borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', margin: 0, whiteSpace: 'nowrap' }}>{label}</p>
        <h3 style={{ fontSize: '1.55rem', margin: '0.1rem 0 0', fontWeight: 700, lineHeight: 1, whiteSpace: 'nowrap' }}>{main}</h3>
        {sub && <p style={{ color: 'var(--text-tertiary)', fontSize: '0.72rem', margin: '0.2rem 0 0' }}>{sub}</p>}
      </div>
    </div>
  );
}

// ─── Pipeline Step ──────────────────────────────────────────────────────────
function PipelineStep({ step, count, total, isLast }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
      <div style={{
        flex: 1, background: step.bg, border: `1px solid ${step.color}30`,
        borderRadius: '10px', padding: '0.65rem 0.5rem', textAlign: 'center', minWidth: 0,
      }}>
        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: step.color, lineHeight: 1 }}>{count}</div>
        <div style={{ fontSize: '0.68rem', fontWeight: 600, color: step.color, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '0.15rem' }}>{step.label}</div>
        <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {total > 0 ? fmt(total) : '—'}
        </div>
      </div>
      {!isLast && (
        <ChevronRight size={14} style={{ color: '#d1d5db', flexShrink: 0, margin: '0 2px' }} />
      )}
    </div>
  );
}

// ─── Progress Bar ──────────────────────────────────────────────────────────
function ProgressBar({ pct, color = 'var(--primary-500)' }) {
  return (
    <div style={{ background: 'var(--border-light)', borderRadius: 4, height: 6, overflow: 'hidden', flex: 1 }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.4s' }} />
    </div>
  );
}

// ─── Sistema Badge ─────────────────────────────────────────────────────────
function SistemaBadge({ system }) {
  if (!system) return null;
  const color = system.toLowerCase().includes('gas') ? '#f59e0b'
              : system.toLowerCase().includes('bomba') ? '#3b82f6'
              : system.toLowerCase().includes('solar') ? '#10b981'
              : '#6b7280';
  return (
    <span style={{
      fontSize: '0.65rem', fontWeight: 600, padding: '0.1rem 0.4rem',
      borderRadius: 4, background: color + '20', color,
      border: `1px solid ${color}40`, whiteSpace: 'nowrap',
    }}>
      {system}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════
const Dashboard = () => {
  // ── raw data ──
  const [presupuestos, setPresupuestos] = useState([]);
  const [obras, setObras] = useState([]);
  const [listaPrecios, setListaPrecios] = useState([]);
  const [transacciones, setTransacciones] = useState([]);
  const [tipoCambio, setTipoCambio] = useState(null);
  const [tcLoading, setTcLoading] = useState(true);

  // ── Firestore listeners ──
  useEffect(() => {
    const unsubs = [
      onSnapshot(collection(db, 'presupuestos'), (snap) =>
        setPresupuestos(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(collection(db, 'obras'), (snap) =>
        setObras(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(collection(db, 'lista_precios'), (snap) =>
        setListaPrecios(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(collection(db, 'transacciones'), (snap) =>
        setTransacciones(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      ),
    ];

    getTipoCambio()
      .then(tc => setTipoCambio(tc))
      .catch(() => setTipoCambio(null))
      .finally(() => setTcLoading(false));

    return () => unsubs.forEach(u => u());
  }, []);

  // ── Derived: Pipeline ──
  const pipelineMap = useMemo(() => {
    const map = {};
    PIPELINE_STEPS.forEach(s => { map[s.key] = { count: 0, total: 0 }; });
    presupuestos.forEach(p => {
      const key = p.status;
      if (map[key]) {
        map[key].count += 1;
        map[key].total += Number(p.amount) || 0;
      }
    });
    return map;
  }, [presupuestos]);

  const pipelineActivos = useMemo(() =>
    ['calculo', 'enviado', 'seguimiento'].reduce((acc, k) => ({
      count: acc.count + (pipelineMap[k]?.count || 0),
      total: acc.total + (pipelineMap[k]?.total || 0),
    }), { count: 0, total: 0 }),
  [pipelineMap]);

  // ── Derived: Obras ──
  const obrasEnProceso = useMemo(() => obras.filter(o => o.estado === 'En Proceso'), [obras]);
  const obrasPendientesInicio = useMemo(() => obras.filter(o => o.estado === 'Pendiente de Inicio'), [obras]);

  const progAvg = useMemo(() => {
    if (!obrasEnProceso.length) return 0;
    return Math.round(obrasEnProceso.reduce((s, o) => s + (Number(o.progress) || 0), 0) / obrasEnProceso.length);
  }, [obrasEnProceso]);

  // ── Derived: Satisfacción del Cliente ──
  const satisfaccionData = useMemo(() => {
    const encuestas = obras.filter(o => o.encuesta).map(o => o.encuesta);
    if (!encuestas.length) return { average: 0, count: 0 };
    const sum = encuestas.reduce((acc, e) => acc + (Number(e.promedio) || 0), 0);
    return {
      average: (sum / encuestas.length).toFixed(1),
      count: encuestas.length
    };
  }, [obras]);

  // ── Derived: Alertas de Stock ──
  const alertasStock = useMemo(() => {
    return listaPrecios
      .filter(item => {
        const tipo = (item.tipo || '').toLowerCase();
        if (tipo !== 'material') return false;
        const sm = Number(item.stockMinimo) || 0;
        if (sm <= 0) return false;
        const disp = (Number(item.stock) || 0) - (Number(item.stockReservado) || 0);
        return disp <= sm;
      })
      .map(item => ({
        ...item,
        disponible: (Number(item.stock) || 0) - (Number(item.stockReservado) || 0),
      }))
      .sort((a, b) => a.disponible - b.disponible);
  }, [listaPrecios]);

  // ── Derived: Ventas anuales chart ──
  const chartData = useMemo(() => {
    const year = new Date().getFullYear();
    const map = Array(12).fill(0);
    transacciones.forEach(t => {
      if (!t.fecha || t.tipo !== 'ingreso') return;
      const d = new Date(t.fecha);
      if (d.getFullYear() === year) map[d.getMonth()] += Number(t.monto) || 0;
    });
    return MESES.map((name, i) => ({ name, ventas: map[i] }));
  }, [transacciones]);

  // ── Ventas mes actual ──
  const ventasMesActual = useMemo(() => {
    const now = new Date();
    return transacciones
      .filter(t => {
        if (!t.fecha || t.tipo !== 'ingreso') return false;
        const d = new Date(t.fecha);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .reduce((s, t) => s + (Number(t.monto) || 0), 0);
  }, [transacciones]);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '2rem' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 700, margin: 0 }}>Dashboard Operativo</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0.2rem 0 0' }}>
            Euler Calefacción por Agua · Vista en tiempo real
          </p>
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <Activity size={12} />
          {new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </span>
      </div>

      {/* ── KPI Row ── */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <KpiCard
          icon={<Target size={20} />}
          label="Pipeline Comercial"
          main={String(pipelineActivos.count)}
          sub={pipelineActivos.total > 0 ? `Total: ${fmt(pipelineActivos.total)}` : 'Sin presupuestos activos'}
          borderColor="#f97316"
          iconBg="#fff7ed"
          iconColor="#f97316"
        />
        <KpiCard
          icon={<HardHat size={20} />}
          label="Obras en Curso"
          main={String(obrasEnProceso.length)}
          sub={obrasEnProceso.length > 0 ? `Avance promedio: ${progAvg}%` : 'Sin obras activas'}
          borderColor="#3b82f6"
          iconBg="#eff6ff"
          iconColor="#3b82f6"
        />
        <KpiCard
          icon={<Clock size={20} />}
          label="Obras Aprobadas"
          main={String(obrasPendientesInicio.length)}
          sub="Pendientes de inicio"
          borderColor="#8b5cf6"
          iconBg="#f5f3ff"
          iconColor="#8b5cf6"
        />
        <KpiCard
          icon={<AlertTriangle size={20} />}
          label="Alertas de Stock"
          main={String(alertasStock.length)}
          sub={alertasStock.length === 0 ? 'Sin alertas · Stock OK' : 'Materiales bajo mínimo'}
          borderColor={alertasStock.length > 0 ? '#ef4444' : '#10b981'}
          iconBg={alertasStock.length > 0 ? '#fef2f2' : '#ecfdf5'}
          iconColor={alertasStock.length > 0 ? '#ef4444' : '#10b981'}
        />
        <KpiCard
          icon={<BadgeDollarSign size={20} />}
          label="Dólar BNA (venta)"
          main={tcLoading ? '···' : tipoCambio ? `$ ${tipoCambio.valor?.toLocaleString('es-AR')}` : 'N/A'}
          sub={tipoCambio?.fechaActualizacion ? `Actualizado: ${tipoCambio.fechaActualizacion}` : undefined}
          borderColor="#059669"
          iconBg="#ecfdf5"
          iconColor="#059669"
        />
        <KpiCard
          icon={<Star size={20} />}
          label="Satisfacción Cliente"
          main={satisfaccionData.count > 0 ? `${satisfaccionData.average} / 5` : 'N/A'}
          sub={satisfaccionData.count > 0 ? `Basado en ${satisfaccionData.count} encuestas` : 'Sin encuestas'}
          borderColor="#fbbf24"
          iconBg="#fef3c7"
          iconColor="#d97706"
        />
      </div>

      {/* ── Pipeline de Presupuestos ── */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingUp size={16} color="var(--primary-600)" />
            Pipeline de Presupuestos
          </h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
            {presupuestos.length} presupuestos totales
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
          {PIPELINE_STEPS.map((step, i) => (
            <PipelineStep
              key={step.key}
              step={step}
              count={pipelineMap[step.key]?.count || 0}
              total={pipelineMap[step.key]?.total || 0}
              isLast={i === PIPELINE_STEPS.length - 1}
            />
          ))}
        </div>
      </div>

      {/* ── Obras + Stock Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>

        {/* Obras Activas */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-light)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <HardHat size={16} color="#3b82f6" />
              Obras Activas
            </h3>
            <span style={{
              fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.5rem',
              borderRadius: 20, background: '#eff6ff', color: '#3b82f6',
            }}>
              {obrasEnProceso.length} en proceso
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', overflowY: 'auto', maxHeight: 320 }}>
            {obrasEnProceso.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', color: 'var(--text-tertiary)', gap: '0.5rem' }}>
                <HardHat size={32} strokeWidth={1.2} />
                <p style={{ margin: 0, fontSize: '0.85rem' }}>No hay obras en proceso</p>
              </div>
            ) : (
              obrasEnProceso.map(obra => {
                const pct = Number(obra.progress) || 0;
                const barColor = pct >= 75 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#3b82f6';
                return (
                  <div key={obra.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', padding: '0.5rem 0', borderBottom: '1px dashed var(--border-light)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, fontWeight: 600, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {obra.name || 'Sin nombre'}
                        </p>
                        <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                          {obra.clientName || '—'} {obra.phase ? `· Fase: ${obra.phase}` : ''}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', flexShrink: 0 }}>
                        <SistemaBadge system={obra.system} />
                        <span style={{
                          fontSize: '0.65rem', fontWeight: 600, padding: '0.1rem 0.4rem',
                          borderRadius: 4, background: '#dbeafe', color: '#1d4ed8',
                        }}>
                          En Proceso
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <ProgressBar pct={pct} color={barColor} />
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: barColor, minWidth: 28, textAlign: 'right' }}>{pct}%</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Alertas de Stock */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-light)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Package size={16} color={alertasStock.length > 0 ? '#ef4444' : '#10b981'} />
              Alertas de Stock
            </h3>
            {alertasStock.length > 0 ? (
              <span style={{
                fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.5rem',
                borderRadius: 20, background: '#fef2f2', color: '#ef4444',
              }}>
                {alertasStock.length} bajo mínimo
              </span>
            ) : (
              <span style={{
                fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.5rem',
                borderRadius: 20, background: '#ecfdf5', color: '#059669',
              }}>
                Stock OK
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', overflowY: 'auto', maxHeight: 320 }}>
            {alertasStock.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', color: '#10b981', gap: '0.5rem' }}>
                <CheckCircle size={32} strokeWidth={1.2} />
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Stock al día · Sin alertas</p>
              </div>
            ) : (
              alertasStock.map(item => {
                const isCritical = item.disponible <= 0;
                return (
                  <div key={item.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '0.5rem 0.6rem', borderRadius: 8,
                    background: isCritical ? '#fef2f2' : '#fff7ed',
                    border: `1px solid ${isCritical ? '#fecaca' : '#fed7aa'}`,
                    gap: '0.5rem',
                  }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.descripcion || 'Sin descripción'}
                      </p>
                      <p style={{ margin: '0.1rem 0 0', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                        Mínimo: <strong>{item.stockMinimo}</strong>
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexShrink: 0 }}>
                      <span style={{
                        fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.45rem',
                        borderRadius: 6, background: isCritical ? '#ef4444' : '#f97316',
                        color: '#fff', whiteSpace: 'nowrap',
                      }}>
                        {isCritical ? '⚠ 0' : item.disponible} disp.
                      </span>
                      {Number(item.stockReservado) > 0 && (
                        <span style={{
                          fontSize: '0.68rem', fontWeight: 600, padding: '0.1rem 0.35rem',
                          borderRadius: 6, background: '#fef3c7', color: '#92400e',
                        }}>
                          {item.stockReservado} res.
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ── Ventas Anuales Chart ── */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingUp size={16} color="var(--primary-600)" />
            Ingresos Anuales {new Date().getFullYear()}
          </h3>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>Mes actual</p>
            <p style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--primary-600)' }}>{fmt(ventasMesActual)}</p>
          </div>
        </div>
        <div style={{ width: '100%', height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                tickFormatter={v => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}
              />
              <Tooltip
                cursor={{ fill: 'var(--bg-surface-hover)' }}
                formatter={v => [`$ ${v.toLocaleString('es-AR')}`, 'Ingresos']}
                contentStyle={{
                  borderRadius: 8, border: '1px solid var(--border-light)',
                  background: 'var(--bg-primary)', fontSize: '0.8rem',
                }}
              />
              <Bar dataKey="ventas" fill="var(--primary-500)" radius={[5, 5, 0, 0]} barSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
};

export default Dashboard;
