import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../../services/firebaseConfig';
import { Loader, Clock, CheckCircle, TrendingUp, Send, Zap, Filter } from 'lucide-react';
import { calcularMinutosEfectivos, calcularMinutosTotales } from '../../utils/workTimeCalculator';
import { formatDuracionEfectiva, formatDuracionCalendario } from '../../utils/formatDuration';

// ─── Colores por KPI ──────────────────────────────────────────────────────────
const KPI_COLORS = {
  tap: { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8', accent: '#2563eb', icon: Clock     },
  tce: { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d', accent: '#16a34a', icon: Zap       },
  tde: { bg: '#fefce8', border: '#fde68a', text: '#92400e', accent: '#d97706', icon: Send      },
  tat: { bg: '#fdf4ff', border: '#e9d5ff', text: '#6b21a8', accent: '#7c3aed', icon: TrendingUp},
  conv: { bg: '#fff1f2', border: '#fecdd3', text: '#9f1239', accent: '#e11d48', icon: CheckCircle},
};

// ─── Períodos disponibles ─────────────────────────────────────────────────────
const PERIOD_OPTIONS = [
  { label: 'Últimos 30 días', days: 30 },
  { label: 'Últimos 60 días', days: 60 },
  { label: 'Últimos 90 días', days: 90 },
  { label: 'Este año',        days: 365 },
  { label: 'Todo el tiempo',  days: 0 },
];

// ─── Helper: extrae fecha ISO de un campo Firestore timestamp o string ─────────
const toISO = (val) => {
  if (!val) return null;
  if (typeof val === 'string') return val;
  if (val?.toDate) return val.toDate().toISOString(); // Firestore Timestamp
  if (val?.seconds) return new Date(val.seconds * 1000).toISOString();
  return null;
};

// ─── Helper: obtiene la fecha del primer evento de un status en statusHistory ─
const getFirstStatusDate = (presupuesto, status) => {
  const history = presupuesto.statusHistory || [];
  const ev = history.find(h => h.status === status);
  return ev ? ev.date : null;
};

// ─── Calcula KPIs para un presupuesto individual ─────────────────────────────
const calcularKPIsIndividual = (p) => {
  // Timestamps de referencia
  const createdAt      = toISO(p.createdAt);
  const calculoInicio  = p.calculoInicio  || getFirstStatusDate(p, 'en_calculo');
  const calculoFin     = p.calculoFin     || getFirstStatusDate(p, 'listo_para_enviar');
  const enviadoAt      = p.enviadoAt      || getFirstStatusDate(p, 'enviado');

  // TAP: createdAt → calculoInicio (tiempo real, cliente espera)
  const tapMin = (createdAt && calculoInicio)
    ? calcularMinutosTotales(createdAt, calculoInicio)
    : null;

  // TCE: calculoInicio → calculoFin (horas efectivas hábiles 8-16)
  const tceMin = (calculoInicio && calculoFin)
    ? calcularMinutosEfectivos(calculoInicio, calculoFin)
    : null;

  // TDE: calculoFin → enviadoAt (tiempo real, cliente espera)
  const tdeMin = (calculoFin && enviadoAt)
    ? calcularMinutosTotales(calculoFin, enviadoAt)
    : null;

  // TAT: createdAt → enviadoAt (tiempo total real)
  const tatMin = (createdAt && enviadoAt)
    ? calcularMinutosTotales(createdAt, enviadoAt)
    : null;

  return { tapMin, tceMin, tdeMin, tatMin, createdAt, calculoInicio, calculoFin, enviadoAt };
};

// ─── KPI Card ─────────────────────────────────────────────────────────────────
const KpiCard = ({ code, label, subtitle, avgMin, count, formatter, colores }) => {
  const Icon = colores.icon;
  return (
    <div style={{
      backgroundColor: colores.bg,
      border: `2px solid ${colores.border}`,
      borderRadius: '12px',
      padding: '1.25rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
      transition: 'transform 0.15s',
      cursor: 'default',
    }}
    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
    onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span style={{ fontSize: '0.7rem', fontWeight: '800', color: colores.accent, letterSpacing: '1px', textTransform: 'uppercase' }}>{code}</span>
          <div style={{ fontSize: '1rem', fontWeight: '700', color: colores.text, marginTop: '0.15rem' }}>{label}</div>
        </div>
        <Icon size={22} color={colores.accent} />
      </div>
      <div style={{ fontSize: '1.75rem', fontWeight: '800', color: colores.text, lineHeight: 1.1 }}>
        {avgMin !== null ? formatter(avgMin) : '—'}
      </div>
      <div style={{ fontSize: '0.72rem', color: colores.text, opacity: 0.75 }}>
        {subtitle} · {count} caso{count !== 1 ? 's' : ''}
      </div>
    </div>
  );
};

// ─── Componente principal ─────────────────────────────────────────────────────
const ReportesTiempos = () => {
  const [presupuestos, setPresupuestos] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [periodDays, setPeriodDays]     = useState(90);

  useEffect(() => {
    const q = query(collection(db, 'presupuestos'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPresupuestos(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // ─── Filtrado por período ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!periodDays) return presupuestos.filter(p => !p.deleted);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - periodDays);
    return presupuestos.filter(p => {
      if (p.deleted) return false;
      const created = toISO(p.createdAt);
      if (!created) return false;
      return new Date(created) >= cutoff;
    });
  }, [presupuestos, periodDays]);

  // ─── Cálculo de promedios KPI ─────────────────────────────────────────────
  const kpiStats = useMemo(() => {
    const tap = { totalMin: 0, count: 0 };
    const tce = { totalMin: 0, count: 0 };
    const tde = { totalMin: 0, count: 0 };
    const tat = { totalMin: 0, count: 0 };
    let totalEnviados = 0;
    let totalAprobados = 0;

    filtered.forEach(p => {
      const { tapMin, tceMin, tdeMin, tatMin } = calcularKPIsIndividual(p);
      if (tapMin !== null && tapMin > 0) { tap.totalMin += tapMin; tap.count++; }
      if (tceMin !== null && tceMin > 0) { tce.totalMin += tceMin; tce.count++; }
      if (tdeMin !== null && tdeMin > 0) { tde.totalMin += tdeMin; tde.count++; }
      if (tatMin !== null && tatMin > 0) { tat.totalMin += tatMin; tat.count++; }

      // Tasa de aprobación: contar todos los que llegaron a "enviado" (en pipeline) y los aprobados
      const status = p.status;
      if (['enviado', 'seguimiento', 'aprobado', 'rechazado'].includes(status)) totalEnviados++;
      if (status === 'aprobado') totalAprobados++;
    });

    return {
      tapAvg: tap.count ? Math.round(tap.totalMin / tap.count) : null,
      tapCount: tap.count,
      tceAvg: tce.count ? Math.round(tce.totalMin / tce.count) : null,
      tceCount: tce.count,
      tdeAvg: tde.count ? Math.round(tde.totalMin / tde.count) : null,
      tdeCount: tde.count,
      tatAvg: tat.count ? Math.round(tat.totalMin / tat.count) : null,
      tatCount: tat.count,
      tasaAprobacion: totalEnviados > 0 ? ((totalAprobados / totalEnviados) * 100).toFixed(1) : null,
      totalPresupuestos: filtered.length,
      totalAprobados,
      totalEnviados,
    };
  }, [filtered]);

  // ─── Tabla detalle por presupuesto ────────────────────────────────────────
  const detailRows = useMemo(() => {
    return filtered
      .map(p => ({
        ...p,
        kpis: calcularKPIsIndividual(p),
      }))
      .filter(p => p.kpis.tapMin !== null || p.kpis.tceMin !== null || p.kpis.tatMin !== null)
      .sort((a, b) => {
        const da = toISO(a.createdAt) || '';
        const db_ = toISO(b.createdAt) || '';
        return db_.localeCompare(da);
      })
      .slice(0, 50); // Máx 50 filas para no saturar
  }, [filtered]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '4rem' }}>
        <Loader className="spin" size={32} color="var(--primary-600)" />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* ── HEADER ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)' }}>
            KPIs de Tiempos del Proceso de Presupuestación
          </h3>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            TCE excluye horario no laboral (8–16 hs, Lun–Vie, sin feriados AR). TAP y TDE cuentan tiempo real.
          </p>
        </div>
        {/* Selector de período */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Filter size={15} color="var(--text-secondary)" />
          <select
            value={periodDays}
            onChange={e => setPeriodDays(Number(e.target.value))}
            style={{ padding: '0.35rem 0.65rem', border: '1px solid var(--border-strong)', borderRadius: '6px', fontSize: '0.82rem', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer' }}
          >
            {PERIOD_OPTIONS.map(o => (
              <option key={o.days} value={o.days}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── KPI CARDS PRINCIPALES ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: '1rem' }}>
        <KpiCard
          code="TAP"
          label="Tiempo de Atención al Pedido"
          subtitle="Solicitud → En Cálculo"
          avgMin={kpiStats.tapAvg}
          count={kpiStats.tapCount}
          formatter={formatDuracionCalendario}
          colores={KPI_COLORS.tap}
        />
        <KpiCard
          code="TCE"
          label="Tiempo de Cálculo Efectivo"
          subtitle="En Cálculo → Listo (hábil)"
          avgMin={kpiStats.tceAvg}
          count={kpiStats.tceCount}
          formatter={formatDuracionEfectiva}
          colores={KPI_COLORS.tce}
        />
        <KpiCard
          code="TDE"
          label="Tiempo de Entrega"
          subtitle="Listo → Enviado al Cliente"
          avgMin={kpiStats.tdeAvg}
          count={kpiStats.tdeCount}
          formatter={formatDuracionCalendario}
          colores={KPI_COLORS.tde}
        />
        <KpiCard
          code="TAT"
          label="Turnaround Total"
          subtitle="Solicitud → Enviado"
          avgMin={kpiStats.tatAvg}
          count={kpiStats.tatCount}
          formatter={formatDuracionCalendario}
          colores={KPI_COLORS.tat}
        />

        {/* Tasa de Aprobación */}
        <div style={{
          backgroundColor: KPI_COLORS.conv.bg,
          border: `2px solid ${KPI_COLORS.conv.border}`,
          borderRadius: '12px',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '0.7rem', fontWeight: '800', color: KPI_COLORS.conv.accent, letterSpacing: '1px', textTransform: 'uppercase' }}>CONV</span>
              <div style={{ fontSize: '1rem', fontWeight: '700', color: KPI_COLORS.conv.text, marginTop: '0.15rem' }}>Tasa de Aprobación</div>
            </div>
            <CheckCircle size={22} color={KPI_COLORS.conv.accent} />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: '800', color: KPI_COLORS.conv.text, lineHeight: 1.1 }}>
            {kpiStats.tasaAprobacion !== null ? `${kpiStats.tasaAprobacion}%` : '—'}
          </div>
          <div style={{ fontSize: '0.72rem', color: KPI_COLORS.conv.text, opacity: 0.75 }}>
            {kpiStats.totalAprobados} aprobados / {kpiStats.totalEnviados} enviados
          </div>
          {/* Referencia 2025 */}
          <div style={{ marginTop: '0.25rem', padding: '0.35rem 0.6rem', background: 'rgba(225,29,72,0.08)', borderRadius: '6px', fontSize: '0.7rem', color: KPI_COLORS.conv.text }}>
            📊 Referencia 2025: <strong>28%</strong>
          </div>
        </div>
      </div>

      {/* ── RESUMEN CONTADORES ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.75rem' }}>
        {[
          { label: 'Total en período', val: kpiStats.totalPresupuestos },
          { label: 'Con TCE registrado', val: kpiStats.tceCount },
          { label: 'Aprobados', val: kpiStats.totalAprobados },
        ].map(item => (
          <div key={item.label} style={{ background: 'var(--bg-surface-hover)', borderRadius: '8px', padding: '0.75rem 1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--text-primary)' }}>{item.val}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>{item.label}</div>
          </div>
        ))}
      </div>

      {/* ── TABLA DETALLE ── */}
      {detailRows.length > 0 && (
        <div style={{ border: '1px solid var(--border-light)', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '0.75rem 1rem', background: 'var(--bg-surface-hover)', fontWeight: '700', fontSize: '0.875rem', color: 'var(--text-primary)' }}>
            📋 Detalle por Presupuesto <span style={{ fontWeight: '400', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>(últimos {detailRows.length})</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border-light)' }}>
                  {['Número', 'Cliente', 'Sistema', 'TAP', 'TCE', 'TDE', 'TAT', 'Estado'].map(h => (
                    <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: '700', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detailRows.map((p, idx) => {
                  const { tapMin, tceMin, tdeMin, tatMin } = p.kpis;
                  const STATUS_BADGE = {
                    pendiente:         { bg: '#f1f5f9', color: '#475569', label: 'Pendiente' },
                    en_calculo:        { bg: '#dbeafe', color: '#1d4ed8', label: 'En Cálculo' },
                    listo_para_enviar: { bg: '#d1fae5', color: '#065f46', label: 'Listo' },
                    enviado:           { bg: '#fef9c3', color: '#92400e', label: 'Enviado' },
                    seguimiento:       { bg: '#ede9fe', color: '#5b21b6', label: 'Seguimiento' },
                    aprobado:          { bg: '#dcfce7', color: '#14532d', label: '✓ Aprobado' },
                    rechazado:         { bg: '#fee2e2', color: '#7f1d1d', label: 'Rechazado' },
                  };
                  const badge = STATUS_BADGE[p.status] || { bg: '#f1f5f9', color: '#475569', label: p.status };
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border-light)', background: idx % 2 === 0 ? 'transparent' : 'var(--bg-surface-hover)' }}>
                      <td style={{ padding: '0.5rem 0.75rem', fontWeight: '600', color: 'var(--primary-700)', whiteSpace: 'nowrap' }}>{p.presupuestoNumber || '—'}</td>
                      <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-primary)', maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.name}>{p.name || '—'}</td>
                      <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-secondary)', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.paramSistema || '—'}</td>
                      <td style={{ padding: '0.5rem 0.75rem', color: KPI_COLORS.tap.text, whiteSpace: 'nowrap' }}>{tapMin !== null ? formatDuracionCalendario(tapMin) : '—'}</td>
                      <td style={{ padding: '0.5rem 0.75rem', color: KPI_COLORS.tce.text, whiteSpace: 'nowrap' }}>{tceMin !== null ? formatDuracionEfectiva(tceMin) : '—'}</td>
                      <td style={{ padding: '0.5rem 0.75rem', color: KPI_COLORS.tde.text, whiteSpace: 'nowrap' }}>{tdeMin !== null ? formatDuracionCalendario(tdeMin) : '—'}</td>
                      <td style={{ padding: '0.5rem 0.75rem', color: KPI_COLORS.tat.text, whiteSpace: 'nowrap' }}>{tatMin !== null ? formatDuracionCalendario(tatMin) : '—'}</td>
                      <td style={{ padding: '0.5rem 0.75rem' }}>
                        <span style={{ background: badge.bg, color: badge.color, padding: '0.15rem 0.5rem', borderRadius: '10px', fontSize: '0.7rem', fontWeight: '700', whiteSpace: 'nowrap' }}>
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {detailRows.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.875rem', fontStyle: 'italic' }}>
          No hay presupuestos con datos de KPI en el período seleccionado.<br />
          <span style={{ fontSize: '0.75rem' }}>Los KPIs se registran automáticamente al mover tarjetas entre las columnas del Kanban.</span>
        </div>
      )}

    </div>
  );
};

export default ReportesTiempos;
