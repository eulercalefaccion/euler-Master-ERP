/**
 * SueldosDashboard — Inicio con KPIs y gráficos
 * Adaptado de EULER-SUELDOS Dashboard.jsx
 */
import React, { useEffect, useRef } from 'react';
import { Chart as ChartJS } from 'chart.js/auto';
import { useSueldos } from './SueldosContext';
import { MESES, getMonthNumber } from './sueldosUtils';

export default function SueldosDashboard() {
  const { rates, employees, liquidations } = useSueldos();
  const salariosRef = useRef(null);
  const salariosInst = useRef(null);
  const bocasRef = useRef(null);
  const bocasInst = useRef(null);

  useEffect(() => {
    if (liquidations.length > 0) {
      const now = new Date();
      const m12 = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        m12.push({ m: d.getMonth(), y: d.getFullYear(), l: MESES[d.getMonth()].substring(0, 3) + ' ' + d.getFullYear().toString().slice(-2) });
      }

      const salTotals = [], salWeeks = [[], [], [], [], [], []];
      const bocTotals = [], bocWeeks = [[], [], [], [], [], []];

      m12.forEach(x => {
        const liqs = liquidations.filter(l => getMonthNumber(l.week, l.year) === x.m && l.year === x.y);
        const totalSal = liqs.reduce((s, l) => s + (l.calculations?.totalSalario || 0), 0);
        salTotals.push(totalSal);

        const wSal = {};
        liqs.forEach(l => wSal[l.week] = (wSal[l.week] || 0) + (l.calculations?.totalSalario || 0));
        const sortWSal = Object.keys(wSal).map(Number).sort((a, b) => a - b);

        const uniqueBoc = {};
        liqs.forEach(l => {
          const tb = (parseFloat(l.bocasObraNueva2p) || 0) + (parseFloat(l.bocasObraNueva3p) || 0) +
            (parseFloat(l.bocasRefaccion2p) || 0) + (parseFloat(l.bocasRefaccion3p) || 0);
          if (!uniqueBoc[l.week] || tb > uniqueBoc[l.week]) uniqueBoc[l.week] = tb;
        });
        const sortWBoc = Object.keys(uniqueBoc).map(Number).sort((a, b) => a - b);

        let totalBoc = 0;
        for (let i = 0; i < 6; i++) {
          salWeeks[i].push(i < sortWSal.length ? wSal[sortWSal[i]] : 0);
          if (i < sortWBoc.length) {
            bocWeeks[i].push(uniqueBoc[sortWBoc[i]]);
            totalBoc += uniqueBoc[sortWBoc[i]];
          } else bocWeeks[i].push(0);
        }
        bocTotals.push(totalBoc);
      });

      const labels = m12.map(m => m.l);

      const buildChart = (ref, inst, totData, wData, col1, col2, pref) => {
        if (inst.current) inst.current.destroy();
        if (!ref.current) return;
        const datasets = [{
          label: 'Total Mes', data: totData,
          backgroundColor: 'rgba(243, 244, 246, 0.9)', borderColor: 'rgba(229, 231, 235, 1)',
          borderWidth: 1, grouped: false, barPercentage: 1.0, categoryPercentage: 1.0, order: 10
        }];
        wData.forEach((wd, i) => {
          if (wd.some(v => v > 0)) {
            datasets.push({
              label: `Semana ${i + 1}`, data: wd,
              backgroundColor: col1, borderColor: col2,
              borderWidth: 1, borderRadius: 2, order: 1, barPercentage: 0.6, categoryPercentage: 0.8
            });
          }
        });
        inst.current = new ChartJS(ref.current, {
          type: 'bar', data: { labels, datasets },
          options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { display: false }, tooltip: { filter: t => t.raw > 0, callbacks: { label: c => `${c.dataset.label}: ${pref}${c.raw.toLocaleString()}` } } },
            scales: { y: { beginAtZero: true, grid: { display: false }, ticks: { callback: v => pref + v.toLocaleString() } }, x: { grid: { display: false } } }
          }
        });
      };

      buildChart(salariosRef, salariosInst, salTotals, salWeeks, 'rgba(59, 130, 246, 0.8)', 'rgba(37, 99, 235, 1)', '$');
      buildChart(bocasRef, bocasInst, bocTotals, bocWeeks, 'rgba(34, 197, 94, 0.8)', 'rgba(22, 163, 74, 1)', '');
    }
    return () => {
      if (salariosInst.current) salariosInst.current.destroy();
      if (bocasInst.current) bocasInst.current.destroy();
    };
  }, [liquidations]);

  const cs = { card: { background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-light)' } };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ ...cs.card, background: 'linear-gradient(135deg, #eff6ff, white)', borderColor: '#bfdbfe' }}>
        <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#2563eb', marginBottom: '4px' }}>Mes Vigente</div>
        <div style={{ fontSize: '1.5rem', fontWeight: '800' }}>{rates.mesVigente || 'No definido'}</div>
        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Paritaria: {rates.paritariaFecha || 'No definida'}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
        {[
          { label: 'Especializado', value: `$${rates.hourlyRate || 0}` },
          { label: 'Oficial', value: `$${rates.hourlyRateOficial || 0}` },
          { label: 'Medio Oficial', value: `$${rates.hourlyRateMedio || 0}` },
          { label: 'Plantilla', value: `${employees.length} colaboradores`, icon: '👥' },
        ].map((m, i) => (
          <div key={i} style={cs.card}>
            <div style={{ fontSize: '0.875rem', fontWeight: '500', color: 'var(--text-secondary)', marginBottom: '4px' }}>{m.label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: '800' }}>{m.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        <div style={cs.card}>
          <h3 style={{ fontWeight: '600', marginBottom: '1rem', fontSize: '0.95rem' }}>Evolución de Salarios (12 Meses)</h3>
          <div style={{ height: '300px' }}><canvas ref={salariosRef}></canvas></div>
          {liquidations.length === 0 && <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '1rem' }}>Sin datos históricos.</p>}
        </div>
        <div style={cs.card}>
          <h3 style={{ fontWeight: '600', marginBottom: '1rem', fontSize: '0.95rem' }}>Producción de Bocas Semanales</h3>
          <div style={{ height: '300px' }}><canvas ref={bocasRef}></canvas></div>
          {liquidations.length === 0 && <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '1rem' }}>Sin datos históricos.</p>}
        </div>
      </div>
    </div>
  );
}
