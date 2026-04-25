/**
 * Jornadas — AdminDashboard real integrado desde Euler Jornadas
 * Lee datos en tiempo real desde Firebase "eulerjornadas" via JornadasContext
 */
import React, { useState, useMemo } from 'react';
import { useJornadas } from '../../context/JornadasContext';
import MapView from '../../components/MapView';

const Jornadas = () => {
  const { empleados, empleadosActivos, jornadas, obrasActivas, appConfig, loading } = useJornadas();
  const hoyStr = new Date().toISOString().slice(0, 10);

  const [filtroFecha, setFiltroFecha] = useState('hoy');
  const [customDesde, setCustomDesde] = useState(hoyStr);
  const [customHasta, setCustomHasta] = useState(hoyStr);
  const [filtroEmp, setFiltroEmp] = useState('');
  const [showIncidencias, setShowIncidencias] = useState(false);
  const [showTrabajando, setShowTrabajando] = useState(false);
  const [showLlegadas, setShowLlegadas] = useState(false);
  const [hoveredDay, setHoveredDay] = useState(null);

  const {
    jornadasActivas, empleadosAusentes, jRango, llegadasTarde,
    incidencias, totalMinutosFiltrados, horasPorObra, actividad7Dias
  } = useMemo(() => {
    let fMin = hoyStr, fMax = hoyStr;
    const d = new Date();
    if (filtroFecha === 'ayer') { d.setDate(d.getDate() - 1); fMin = fMax = d.toISOString().slice(0, 10); }
    else if (filtroFecha === '7') { d.setDate(d.getDate() - 6); fMin = d.toISOString().slice(0, 10); }
    else if (filtroFecha === '30') { d.setDate(d.getDate() - 29); fMin = d.toISOString().slice(0, 10); }
    else if (filtroFecha === 'custom') { fMin = customDesde || hoyStr; fMax = customHasta || hoyStr; }
    if (fMin > fMax) { const t = fMin; fMin = fMax; fMax = t; }

    let jRangoObj = jornadas.filter(j => j.fechaIngreso >= fMin && j.fechaIngreso <= fMax);
    if (filtroEmp) {
      const q = filtroEmp.toLowerCase().trim();
      jRangoObj = jRangoObj.filter(j => {
        const e = empleados.find(x => x.id === j.empleadoId);
        return e && (`${e.nombre} ${e.apellido}`.toLowerCase().includes(q));
      });
    }

    const abiertas = jornadas.filter(j => j.estado === 'abierta');
    const eIdsHoy = new Set(jornadas.filter(j => j.fechaIngreso === hoyStr).map(j => j.empleadoId));
    const ausentes = empleadosActivos.filter(e => !eIdsHoy.has(e.id));

    const limitTime = appConfig?.horarioIngreso || '08:30';
    const tardanzas = jRangoObj.filter(j => j.horaIngreso > limitTime);
    const inc = jRangoObj.filter(j => j.semaforo === 'rojo' || (j.fechaIngreso < hoyStr && j.estado === 'abierta'));

    let tMin = 0;
    const hObra = {};
    jRangoObj.forEach(j => {
      if (!j.horaSalida) return;
      const [hi, mi] = j.horaIngreso.split(':').map(Number);
      const [hs, ms] = j.horaSalida.split(':').map(Number);
      const min = (hs * 60 + ms) - (hi * 60 + mi);
      if (min > 0) {
        tMin += min;
        const ob = j.obraDetectada || 'Desconocida';
        if (!hObra[ob]) hObra[ob] = { minutos: 0, empIds: new Set() };
        hObra[ob].minutos += min;
        hObra[ob].empIds.add(j.empleadoId);
      }
    });

    const obrasArr = Object.entries(hObra).map(([n, d]) => ({ nombre: n, minutos: d.minutos, empleados: d.empIds.size })).sort((a, b) => b.minutos - a.minutos);

    const ult7 = [];
    for (let i = 6; i >= 0; i--) {
      const dd = new Date(); dd.setDate(dd.getDate() - i);
      const fStr = dd.toISOString().slice(0, 10);
      const lbl = dd.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' });
      let djMin = 0;
      jornadas.filter(j => j.fechaIngreso === fStr).forEach(j => {
        if (j.horaSalida) {
          const [hi2, mi2] = j.horaIngreso.split(':').map(Number);
          const [hs2, ms2] = j.horaSalida.split(':').map(Number);
          const m = (hs2 * 60 + ms2) - (hi2 * 60 + mi2);
          if (m > 0) djMin += m;
        }
      });
      ult7.push({ fecha: fStr, label: lbl, horas: djMin / 60 });
    }

    return { jornadasActivas: abiertas, empleadosAusentes: ausentes, jRango: jRangoObj, llegadasTarde: tardanzas, incidencias: inc, totalMinutosFiltrados: tMin, horasPorObra: obrasArr, actividad7Dias: ult7 };
  }, [jornadas, empleadosActivos, filtroFecha, customDesde, customHasta, filtroEmp, hoyStr, appConfig, empleados]);

  function minToH(m) { return m ? `${Math.floor(m / 60)}h ${m % 60}m` : '0h'; }

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Conectando con Euler Jornadas...</div>;

  const metrics = [
    { label: 'Trabajando Ahora', value: jornadasActivas.length, icon: '👷', color: '#10b981', action: () => setShowTrabajando(true) },
    { label: 'Aún no inician', value: empleadosAusentes.length, icon: '⏳', color: '#6b7280' },
    { label: 'Llegadas Tarde', value: llegadasTarde.length, icon: '⏰', color: '#f59e0b', action: () => setShowLlegadas(true) },
    { label: 'Incidencias', value: incidencias.length, icon: '🚨', color: '#ef4444', action: () => setShowIncidencias(true) },
    { label: 'Horas Trabajadas', value: minToH(totalMinutosFiltrados).split(' ')[0], icon: '⏱️', color: '#3b82f6' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', margin: 0 }}>Panel de Control Operativo</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div style={{ fontSize: '14px', color: 'var(--text-primary)', background: 'var(--bg-surface)', padding: '8px 16px', borderRadius: '20px', border: '1px solid var(--border-light)', fontWeight: 'bold' }}>
          🕐 {new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="input-field" style={{ width: '220px' }} value={filtroFecha} onChange={e => setFiltroFecha(e.target.value)}>
          <option value="hoy">📅 Hoy</option>
          <option value="ayer">📅 Ayer</option>
          <option value="7">📅 Últimos 7 Días</option>
          <option value="30">📅 Últimos 30 Días</option>
          <option value="custom">📅 Personalizado...</option>
        </select>
        {filtroFecha === 'custom' && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Desde</span>
            <input type="date" className="input-field" style={{ width: '140px' }} value={customDesde} onChange={e => setCustomDesde(e.target.value)} />
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Hasta</span>
            <input type="date" className="input-field" style={{ width: '140px' }} value={customHasta} onChange={e => setCustomHasta(e.target.value)} />
          </div>
        )}
        <input type="search" className="input-field" style={{ flex: 1, minWidth: '250px' }} placeholder="🔍 Buscar empleado..." value={filtroEmp} onChange={e => setFiltroEmp(e.target.value)} />
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
        {metrics.map(m => (
          <div key={m.label} onClick={m.action} className="card" style={{ padding: '1.25rem', borderTop: `4px solid ${m.color}`, cursor: m.action ? 'pointer' : 'default', transition: 'transform 0.2s' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', fontWeight: '700', marginBottom: '6px' }}>{m.label}</div>
                <div style={{ fontSize: '2rem', fontWeight: '900', lineHeight: 1 }}>{m.value}</div>
              </div>
              <div style={{ fontSize: '24px', background: `${m.color}20`, width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '12px' }}>{m.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Mapa + Estado Empleados */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr', gap: '1.5rem' }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden', minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-light)' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem' }}>📍 Mapa en Tiempo Real</h3>
          </div>
          <div style={{ flex: 1 }}>
            <MapView obras={obrasActivas} jornadas={jornadasActivas} empleados={empleados} appConfig={appConfig} height="100%" />
          </div>
        </div>

        <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', minHeight: '400px' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-light)' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem' }}>👥 Estado de Empleados (Hoy)</h3>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
            {empleadosActivos.map(emp => {
              const jsHoy = jornadas.filter(j => j.empleadoId === emp.id && j.fechaIngreso === hoyStr);
              const jActiva = jsHoy.find(j => j.estado === 'abierta');
              const jCerrada = jsHoy.find(j => j.estado === 'cerrada');
              let label = 'No inició jornada', dotColor = '#6b7280', sub = 'Ausente o pendiente';
              if (jActiva) {
                label = 'En jornada'; dotColor = jActiva.semaforo === 'rojo' ? '#ef4444' : (jActiva.semaforo === 'amarillo' ? '#f59e0b' : '#10b981');
                sub = `Desde ${jActiva.horaIngreso} — ${jActiva.obraDetectada || 'Otro lugar'}`;
              } else if (jCerrada) {
                label = 'Salió'; dotColor = '#3b82f6';
                sub = `${jCerrada.horaIngreso} - ${jCerrada.horaSalida} — ${jCerrada.obraDetectada || 'Lugar'}`;
              }
              return (
                <div key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 8px', borderBottom: '1px solid var(--border-light)' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: dotColor, flexShrink: 0, boxShadow: `0 0 8px ${dotColor}80` }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: '700' }}>{emp.nombre} {emp.apellido}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
                  </div>
                  <div style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '4px', background: `${dotColor}20`, color: dotColor, fontWeight: '800' }}>{label}</div>
                </div>
              );
            })}
            {empleadosActivos.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Sin empleados activos</div>}
          </div>
        </div>
      </div>

      {/* Horas por Obra + Actividad 7 días */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem' }}>🏗️ Horas por Obra</h3>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Filtro: {filtroFecha}</span>
          </div>
          {horasPorObra.length === 0 && <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Sin horas registradas</div>}
          {horasPorObra.map((ob, i) => {
            const pct = (ob.minutos / (horasPorObra[0]?.minutos || 1)) * 100;
            return (
              <div key={ob.nombre} style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '13px' }}>
                  <span style={{ fontWeight: '700' }}>{i + 1}. {ob.nombre}</span>
                  <span style={{ fontWeight: '600' }}>{minToH(ob.minutos)} <small style={{ color: 'var(--text-secondary)', fontWeight: 'normal' }}>({ob.empleados} emp)</small></span>
                </div>
                <div style={{ height: '8px', background: 'var(--border-light)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: 'var(--primary-500)', borderRadius: '4px', transition: 'width 1s ease-out' }} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem' }}>📈 Actividad (Últimos 7 días)</h3>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', flex: 1, minHeight: '180px' }}>
            {actividad7Dias.map(d => {
              const maxH = Math.max(...actividad7Dias.map(x => x.horas), 1);
              const active = d.fecha === hoyStr;
              const isHov = hoveredDay === d.fecha;
              return (
                <div key={d.fecha} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', height: '100%', justifyContent: 'flex-end', position: 'relative' }}
                  onMouseEnter={() => d.horas > 0 && setHoveredDay(d.fecha)} onMouseLeave={() => setHoveredDay(null)}>
                  {isHov && (
                    <div style={{ position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.85)', color: 'white', borderRadius: '8px', padding: '6px 10px', fontSize: '12px', whiteSpace: 'nowrap', zIndex: 10, pointerEvents: 'none' }}>
                      <div style={{ fontWeight: '800', color: '#3b82f6' }}>{d.horas.toFixed(2)}h</div>
                    </div>
                  )}
                  <div style={{ fontSize: '11px', fontWeight: '800', color: active ? '#3b82f6' : 'var(--text-secondary)' }}>{d.horas > 0 ? d.horas.toFixed(1) + 'h' : ''}</div>
                  <div style={{ width: '100%', height: `${Math.max(4, (d.horas / maxH) * 100)}%`, background: isHov ? '#3b82f6' : (active ? 'rgba(59,130,246,0.8)' : (d.horas > 0 ? 'rgba(59,130,246,0.3)' : 'var(--border-light)')), borderRadius: '6px', transition: 'height 0.5s ease, background 0.2s ease' }} />
                  <div style={{ fontSize: '11px', color: active ? 'var(--primary-600)' : 'var(--text-secondary)', fontWeight: active ? '700' : '500', textAlign: 'center' }}>{d.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Modal Trabajando */}
      {showTrabajando && <Modal title="👷 Trabajando Ahora" onClose={() => setShowTrabajando(false)}>
        {jornadasActivas.length === 0 ? <Empty text="Nadie trabajando" /> : jornadasActivas.map(jor => {
          const em = empleados.find(e => e.id === jor.empleadoId);
          return <ModalRow key={jor.id} name={em ? `${em.nombre} ${em.apellido}` : jor.empleadoId} sub={`Desde ${jor.horaIngreso} — ${jor.obraDetectada || '?'}`} color="#10b981" badge="Activo" />;
        })}
      </Modal>}

      {/* Modal Incidencias */}
      {showIncidencias && <Modal title="🚨 Incidencias" onClose={() => setShowIncidencias(false)}>
        {incidencias.length === 0 ? <Empty text="Sin incidencias" /> : incidencias.map(inc => {
          const em = empleados.find(e => e.id === inc.empleadoId);
          const motive = inc.semaforo === 'rojo' ? 'Fuera del área de trabajo' : (inc.fechaIngreso < hoyStr && inc.estado === 'abierta') ? 'Jornada sin cerrar' : 'Otra';
          return (
            <div key={inc.id} style={{ background: '#fef2f2', borderLeft: '4px solid #ef4444', padding: '12px', borderRadius: '6px', marginBottom: '8px' }}>
              <div style={{ fontWeight: '800' }}>{em ? `${em.nombre} ${em.apellido}` : inc.empleadoId}</div>
              <div style={{ fontSize: '14px', color: '#ef4444', fontWeight: '600' }}>{motive}</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>📅 {inc.fechaIngreso} — {inc.horaIngreso} — 📍 {inc.obraDetectada || '?'}</div>
            </div>
          );
        })}
      </Modal>}

      {/* Modal Llegadas Tarde */}
      {showLlegadas && <Modal title="⏰ Llegadas Tarde" onClose={() => setShowLlegadas(false)}>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>Límite: {appConfig?.horarioIngreso || '08:30'} — Filtro: {filtroFecha}</div>
        {llegadasTarde.length === 0 ? <Empty text="Nadie llegó tarde" /> : llegadasTarde.map(jor => {
          const em = empleados.find(e => e.id === jor.empleadoId);
          const limit = appConfig?.horarioIngreso || '08:30';
          const [lH, lM] = limit.split(':').map(Number);
          const [jH, jM] = jor.horaIngreso.split(':').map(Number);
          const delay = (jH * 60 + jM) - (lH * 60 + lM);
          return (
            <div key={jor.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fffbeb', borderLeft: '4px solid #f59e0b', padding: '12px', borderRadius: '6px', marginBottom: '8px' }}>
              <div>
                <div style={{ fontWeight: '800' }}>{em ? `${em.nombre} ${em.apellido}` : jor.empleadoId}</div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>📅 {jor.fechaIngreso} — {jor.obraDetectada || '?'}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: '#f59e0b', fontSize: '15px', fontWeight: '800' }}>{jor.horaIngreso}</div>
                <div style={{ color: '#ef4444', fontSize: '12px', fontWeight: '600' }}>+{delay} min</div>
              </div>
            </div>
          );
        })}
      </Modal>}

      <style>{`@media (max-width: 900px) { .card { min-height: auto !important; } }`}</style>
    </div>
  );
};

// Componentes auxiliares para modales
function Modal({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} className="card" style={{ maxWidth: '600px', width: '90%', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-light)' }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>✕</button>
        </div>
        <div style={{ padding: '1rem 1.25rem', overflowY: 'auto', flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}

function ModalRow({ name, sub, color, badge }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', borderRadius: '6px', background: 'var(--bg-surface)', marginBottom: '8px' }}>
      <div><div style={{ fontWeight: '800' }}>{name}</div><div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{sub}</div></div>
      <div style={{ color, background: `${color}15`, padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '800' }}>{badge}</div>
    </div>
  );
}

function Empty({ text }) {
  return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>✅ {text}</div>;
}

export default Jornadas;
