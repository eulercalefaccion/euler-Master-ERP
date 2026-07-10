import React, { useState, useEffect } from 'react';
import { updateDoc, doc } from 'firebase/firestore';
import { Plus, Trash2, Save, FileText, AlertTriangle } from 'lucide-react';
import { generarPDFBalance } from '../../services/pdfBalance';

export default function BalanceTermico({ selectedLead, setSelectedLead, db }) {
  const [tipo, setTipo] = useState(selectedLead?.balance?.tipo || 'radiadores');
  
  const [radiadores, setRadiadores] = useState(selectedLead?.balance?.radiadores || []);
  const [piso, setPiso] = useState(selectedLead?.balance?.piso || []);
  const [colectores, setColectores] = useState(selectedLead?.balance?.colectores || []);
  
  const [rendimientoElemento, setRendimientoElemento] = useState(selectedLead?.balance?.rendimientoElemento || 180);
  const [condicionesDiseno, setCondicionesDiseno] = useState(selectedLead?.balance?.condicionesDiseno || {
    provincia: 'Santa Fe',
    ciudad: 'Rosario',
    tempExt: -2,
    tempInt: 20
  });
  const [sistemaConstructivo, setSistemaConstructivo] = useState(selectedLead?.balance?.sistemaConstructivo || 'Ladrillo hueco 18 cm + aislación EPS 20-30mm');
  
  const [isSaving, setIsSaving] = useState(false);

  // --- Lógica Radiadores ---
  const addRowRadiadores = () => {
    setRadiadores([...radiadores, {
      id: Date.now().toString(),
      planta: 'Planta Baja',
      ambiente: '',
      largo: 1,
      ancho: 1,
      altura: 2.8,
      coeficiente: 45,
      isToallero: false,
      toalleroSize: '80'
    }]);
  };

  const updateRadiador = (id, field, value) => {
    setRadiadores(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
    // Auto toggle toallero si escriben baño
    if (field === 'ambiente' && typeof value === 'string') {
      const isBano = value.toLowerCase().includes('baño');
      setRadiadores(prev => prev.map(r => r.id === id ? { ...r, ambiente: value, isToallero: isBano, toalleroSize: r.toalleroSize || '80' } : r));
    }
  };

  const removeRadiador = (id) => {
    setRadiadores(prev => prev.filter(r => r.id !== id));
  };

  const toggleToallero = (id, isToallero) => {
    setRadiadores(prev => prev.map(r => r.id === id ? { ...r, isToallero, toalleroSize: r.toalleroSize || '80' } : r));
  };

  // --- Lógica Piso Radiante ---
  const addColector = () => {
    setColectores([...colectores, {
      id: Date.now().toString(),
      nombre: `Colector ${colectores.length + 1}`,
      planta: 'Planta Baja'
    }]);
  };

  const removeColector = (id) => {
    setColectores(prev => prev.filter(c => c.id !== id));
    setPiso(prev => prev.map(p => p.colectorId === id ? { ...p, colectorId: '' } : p));
  };

  const updateColector = (id, field, value) => {
    setColectores(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const addRowPiso = () => {
    setPiso([...piso, {
      id: Date.now().toString(),
      ambiente: '',
      superficie: 10,
      distancia: 0,
      colectorId: colectores.length > 0 ? colectores[0].id : ''
    }]);
  };

  const updatePiso = (id, field, value) => {
    setPiso(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const removePiso = (id) => {
    setPiso(prev => prev.filter(p => p.id !== id));
  };

  // --- Guardado ---
  const handleSave = async () => {
    if (!selectedLead) return;
    setIsSaving(true);
    try {
      const balanceData = {
        tipo,
        radiadores,
        piso,
        colectores,
        rendimientoElemento,
        condicionesDiseno,
        sistemaConstructivo
      };
      await updateDoc(doc(db, 'presupuestos', selectedLead.id), { balance: balanceData });
      setSelectedLead(prev => ({ ...prev, balance: balanceData }));
      alert('Balance térmico guardado con éxito.');
    } catch (err) {
      alert('Error al guardar: ' + err.message);
    }
    setIsSaving(false);
  };

  const handleExportPDF = async () => {
    try {
      await generarPDFBalance(selectedLead, { tipo, radiadores, piso, colectores, rendimientoElemento, condicionesDiseno, sistemaConstructivo });
    } catch (err) {
      alert('Error al generar PDF: ' + err.message);
    }
  };

  // Input style
  const inps = {
    padding: '0.35rem 0.5rem',
    borderRadius: '4px',
    border: '1px solid var(--border-light)',
    fontSize: '0.8rem',
    width: '100%',
    boxSizing: 'border-box'
  };

  return (
    <div style={{ padding: '1.5rem', background: 'white', borderRadius: '8px', minHeight: '100%', border: '1px solid var(--border-light)' }}>
      
      {/* Header & Toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            🌡️ Balance Térmico
          </h2>
          <p style={{ margin: '0.25rem 0 1rem 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Calculá elementos de radiadores o metros de caño para piso radiante.
          </p>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.95rem', fontWeight: '500' }}>
              <input type="radio" checked={tipo === 'radiadores'} onChange={() => setTipo('radiadores')} />
              Sistema por Radiadores
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.95rem', fontWeight: '500' }}>
              <input type="radio" checked={tipo === 'piso'} onChange={() => setTipo('piso')} />
              Sistema por Piso Radiante
            </label>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={handleExportPDF} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileText size={16} /> PDF Balance
          </button>
          <button onClick={handleSave} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} disabled={isSaving}>
            <Save size={16} /> {isSaving ? 'Guardando...' : 'Guardar Balance'}
          </button>
        </div>
      </div>

      {tipo === 'radiadores' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Parámetros Generales */}
          <div style={{ background: 'var(--bg-surface-hover)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
            <h3 style={{ fontSize: '1rem', margin: '0 0 1rem 0', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              ⚙️ Parámetros Generales
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Provincia</label>
                <input type="text" value={condicionesDiseno.provincia} onChange={e => setCondicionesDiseno({...condicionesDiseno, provincia: e.target.value})} style={inps} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Ciudad</label>
                <input type="text" value={condicionesDiseno.ciudad} onChange={e => setCondicionesDiseno({...condicionesDiseno, ciudad: e.target.value})} style={inps} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Temp. Ext. (ºC)</label>
                <input type="number" value={condicionesDiseno.tempExt} onChange={e => setCondicionesDiseno({...condicionesDiseno, tempExt: Number(e.target.value)})} style={inps} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Temp. Int. Objetivo (ºC)</label>
                <input type="number" value={condicionesDiseno.tempInt} onChange={e => setCondicionesDiseno({...condicionesDiseno, tempInt: Number(e.target.value)})} style={inps} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>ΔT (Diferencia)</label>
                <div style={{ padding: '0.35rem 0.5rem', background: 'white', border: '1px solid var(--border-light)', borderRadius: '4px', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
                  {(condicionesDiseno.tempInt - condicionesDiseno.tempExt).toFixed(1)} ºC
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Sistema Constructivo</label>
                <input type="text" value={sistemaConstructivo} onChange={e => setSistemaConstructivo(e.target.value)} style={inps} placeholder="Ej: Ladrillo hueco 18 cm + EPS" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Rendimiento Elem. (kcal/h)</label>
                <input type="number" value={rendimientoElemento} onChange={e => setRendimientoElemento(Number(e.target.value) || 180)} style={inps} />
              </div>
            </div>
          </div>

          <div style={{ overflowX: 'auto', marginBottom: '1rem', border: '1px solid var(--border-strong)', borderRadius: '8px' }}>
            <div style={{ padding: '0.5rem 1rem', background: '#fef9c3', color: '#854d0e', fontSize: '0.8rem', fontWeight: '500', borderBottom: '1px solid #fde047' }}>
              💡 Cada elemento emite {rendimientoElemento} kcal/h. Máximo 12 elementos por radiador.
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
              <thead>
                <tr style={{ background: '#5b4a92', color: 'white', textAlign: 'left' }}>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Ambiente</th>
                  <th style={{ padding: '0.6rem 0.5rem', width: '65px' }}>L (m)</th>
                  <th style={{ padding: '0.6rem 0.5rem', width: '65px' }}>A (m)</th>
                  <th style={{ padding: '0.6rem 0.5rem', width: '65px' }}>H (m)</th>
                  <th style={{ padding: '0.6rem 0.5rem' }}>m²</th>
                  <th style={{ padding: '0.6rem 0.5rem' }}>m³</th>
                  <th style={{ padding: '0.6rem 0.5rem', width: '75px' }}>Carga Térmica (kcal/m³)</th>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Q Total (W)</th>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Q Total (kcal/h)</th>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Elem. Totales</th>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Cant. Radiadores</th>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Elem./Radiador</th>
                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {radiadores.length === 0 && (
                  <tr><td colSpan="14" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>No hay ambientes. Presioná el botón abajo para agregar.</td></tr>
                )}
                {radiadores.map((row, i) => {
                  const sup = (Number(row.largo) || 0) * (Number(row.ancho) || 0);
                  const vol = sup * (Number(row.altura) || 0);
                  const kcal = vol * (Number(row.coeficiente) || 0);
                  const qWatts = kcal / 0.86;
                  const elementos = kcal / rendimientoElemento;
                  const elemTotales = Math.ceil(elementos);
                  
                  let radiadoresArr = [];
                  if (!row.isToallero && elemTotales > 0) {
                    if (elemTotales <= 12) {
                      radiadoresArr = [elemTotales];
                    } else if (elemTotales <= 24) {
                      const m = Math.ceil(elemTotales / 2);
                      radiadoresArr = [m, elemTotales - m];
                    } else {
                      const q = Math.ceil(elemTotales / 12);
                      let rem = elemTotales;
                      for (let j = 0; j < q; j++) {
                        const cant = j === q - 1 ? rem : Math.ceil(elemTotales / q);
                        radiadoresArr.push(cant);
                        rem -= cant;
                      }
                    }
                  }

                  return (
                    <tr key={row.id} style={{ borderBottom: '1px solid var(--border-light)', background: i % 2 === 0 ? 'white' : '#f8fafc' }}>
                      <td style={{ padding: '0.6rem 0.5rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          <input type="text" value={row.ambiente} onChange={e => updateRadiador(row.id, 'ambiente', e.target.value)} style={{...inps, fontWeight: '700', textTransform: 'uppercase'}} placeholder="Ej: Living" />
                          <select value={row.planta} onChange={e => updateRadiador(row.id, 'planta', e.target.value)} style={{...inps, padding: '0.15rem', fontSize: '0.7rem'}}>
                            <option value="Planta Baja">PB</option>
                            <option value="Planta Alta">PA</option>
                          </select>
                        </div>
                      </td>
                      <td style={{ padding: '0.6rem 0.5rem' }}><input type="number" step="0.1" value={row.largo} onChange={e => updateRadiador(row.id, 'largo', e.target.value)} style={{...inps, padding: '0.2rem'}} /></td>
                      <td style={{ padding: '0.6rem 0.5rem' }}><input type="number" step="0.1" value={row.ancho} onChange={e => updateRadiador(row.id, 'ancho', e.target.value)} style={{...inps, padding: '0.2rem'}} /></td>
                      <td style={{ padding: '0.6rem 0.5rem' }}><input type="number" step="0.1" value={row.altura} onChange={e => updateRadiador(row.id, 'altura', e.target.value)} style={{...inps, padding: '0.2rem'}} /></td>
                      <td style={{ padding: '0.6rem 0.5rem', fontWeight: '500' }}>{sup.toFixed(2)}</td>
                      <td style={{ padding: '0.6rem 0.5rem', fontWeight: '500' }}>{vol.toFixed(2)}</td>
                      <td style={{ padding: '0.6rem 0.5rem' }}><input type="number" value={row.coeficiente} onChange={e => updateRadiador(row.id, 'coeficiente', e.target.value)} style={{...inps, padding: '0.2rem'}} /></td>
                      <td style={{ padding: '0.6rem 0.5rem', fontWeight: '700' }}>{qWatts.toFixed(0)}</td>
                      <td style={{ padding: '0.6rem 0.5rem', fontWeight: '700' }}>{kcal.toFixed(0)}</td>
                      <td style={{ padding: '0.6rem 0.5rem', fontWeight: '700' }}>
                        {row.isToallero ? `T. ${row.toalleroSize || '80'}` : elemTotales}
                      </td>
                      <td style={{ padding: '0.6rem 0.5rem' }}>
                        {row.isToallero ? '1' : (radiadoresArr.length > 0 ? radiadoresArr.length : '-')}
                      </td>
                      <td style={{ padding: '0.6rem 0.5rem', fontWeight: '600' }}>
                        {row.isToallero ? '-' : (radiadoresArr.length > 0 ? radiadoresArr.join(' + ') : '-')}
                      </td>
                      <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', flexDirection: 'column' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.65rem' }}>
                            <input type="checkbox" checked={row.isToallero} onChange={e => toggleToallero(row.id, e.target.checked)} />
                            Toallero
                          </label>
                          {row.isToallero && (
                            <select value={row.toalleroSize || '80'} onChange={e => updateRadiador(row.id, 'toalleroSize', e.target.value)} style={{...inps, padding: '0.1rem', fontSize: '0.65rem', width: '100%'}}>
                              <option value="80">T. 80</option>
                              <option value="120">T. 120</option>
                            </select>
                          )}
                          <button onClick={() => removeRadiador(row.id)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '0.2rem' }}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button onClick={addRowRadiadores} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
            <Plus size={16} /> Agregar Ambiente
          </button>
        </div>
      )}

      {tipo === 'piso' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Colectores */}
          <div>
            <h3 style={{ fontSize: '1rem', margin: '0 0 1rem 0', color: 'var(--text-primary)' }}>1. Colectores</h3>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              {colectores.length === 0 && (
                <div style={{ padding: '1rem', background: 'var(--bg-surface-hover)', borderRadius: '8px', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
                  Aún no hay colectores. Agregá al menos uno.
                </div>
              )}
              {colectores.map(col => {
                // Calc stats for col
                const colPisos = piso.filter(p => p.colectorId === col.id);
                const circs = colPisos.reduce((acc, p) => {
                  const sup = Number(p.superficie) || 0;
                  const dist = Number(p.distancia) || 0;
                  if (dist === 0) return acc;
                  const mlCircuito = (sup * 5) + (dist * 2);
                  const cantCirc = mlCircuito > 110 ? Math.ceil(mlCircuito / 100) : 1;
                  return acc + cantCirc;
                }, 0);
                
                const allLengths = [];
                colPisos.forEach(p => {
                  const sup = Number(p.superficie) || 0;
                  const dist = Number(p.distancia) || 0;
                  if (dist === 0) return;
                  const mlCircuito = (sup * 5) + (dist * 2);
                  const cantCirc = mlCircuito > 110 ? Math.ceil(mlCircuito / 100) : 1;
                  for (let i = 0; i < cantCirc; i++) {
                    allLengths.push(mlCircuito / cantCirc);
                  }
                });
                const maxL = allLengths.length ? Math.max(...allLengths) : 0;
                const minL = allLengths.length ? Math.min(...allLengths) : 0;
                const desbalance = maxL > 0 ? ((maxL - minL) / maxL) * 100 : 0;

                return (
                  <div key={col.id} style={{ border: '1px solid var(--border-light)', borderRadius: '8px', padding: '1rem', minWidth: '280px', background: 'var(--bg-surface-hover)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <input type="text" value={col.nombre} onChange={e => updateColector(col.id, 'nombre', e.target.value)} style={{ ...inps, fontWeight: '700', width: '120px' }} />
                      <button onClick={() => removeColector(col.id)} style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer' }}><Trash2 size={16} /></button>
                    </div>
                    <select value={col.planta} onChange={e => updateColector(col.id, 'planta', e.target.value)} style={{ ...inps, marginBottom: '0.5rem' }}>
                      <option value="Planta Baja">Planta Baja</option>
                      <option value="Planta Alta">Planta Alta</option>
                    </select>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <div>Circuitos: <strong>{circs}</strong> {circs > 5 && <span style={{ color: 'var(--error)', fontWeight: '600' }}>(Excede máx 5)</span>}</div>
                      <div>Max: {maxL.toFixed(1)}m | Min: {minL.toFixed(1)}m</div>
                      <div style={{ color: desbalance > 20 ? '#d97706' : 'var(--text-secondary)' }}>
                        Desbalance: <strong>{desbalance.toFixed(1)}%</strong>
                        {desbalance > 20 && <div style={{ fontSize: '0.7rem', fontWeight: '600' }}>⚠️ Considerar prebalanceo</div>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <button onClick={addColector} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', marginTop: '1rem' }}>
              <Plus size={16} /> Agregar Colector
            </button>
          </div>

          {/* Ambientes (Piso) */}
          <div>
            <h3 style={{ fontSize: '1rem', margin: '0 0 1rem 0', color: 'var(--text-primary)' }}>2. Ambientes (Espira paso 20cm)</h3>
            <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-surface-hover)', borderBottom: '2px solid var(--border-strong)', textAlign: 'left' }}>
                    <th style={{ padding: '0.5rem', width: '150px' }}>Colector</th>
                    <th style={{ padding: '0.5rem', width: '200px' }}>Ambiente</th>
                    <th style={{ padding: '0.5rem' }}>Sup. Útil (m²)</th>
                    <th style={{ padding: '0.5rem' }}>Dist. Ida (m)</th>
                    <th style={{ padding: '0.5rem' }}>ML Espira</th>
                    <th style={{ padding: '0.5rem' }}>ML Conexión</th>
                    <th style={{ padding: '0.5rem' }}>ML Total</th>
                    <th style={{ padding: '0.5rem' }}>N° Circ.</th>
                    <th style={{ padding: '0.5rem' }}>Estado</th>
                    <th style={{ padding: '0.5rem', textAlign: 'center' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {piso.length === 0 && (
                    <tr><td colSpan="10" style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>No hay filas agregadas.</td></tr>
                  )}
                  {piso.map(row => {
                    const sup = Number(row.superficie) || 0;
                    const dist = Number(row.distancia) || 0;
                    
                    const mlEspira = sup * 5;
                    const mlConexion = dist * 2;
                    const mlCircuito = mlEspira + mlConexion;

                    let cantCirc = 1;
                    let estado = <span style={{ color: 'var(--success)' }}>OK</span>;
                    let bg = 'transparent';

                    if (dist === 0) {
                      estado = <span style={{ color: 'var(--error)', fontWeight: '600' }}><AlertTriangle size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '0.2rem' }}/>Falta dist. colector</span>;
                    } else if (mlCircuito > 110) {
                      cantCirc = Math.ceil(mlCircuito / 100);
                      estado = <span style={{ color: 'var(--error)', fontWeight: '600' }}><AlertTriangle size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '0.2rem' }}/>FORZADO DIVISIÓN ({cantCirc})</span>;
                      bg = '#fef2f2';
                    } else if (mlCircuito > 100) {
                      estado = <span style={{ color: '#d97706', fontWeight: '600' }}><AlertTriangle size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '0.2rem' }}/>Tolerancia Excepcional</span>;
                      bg = '#fffbeb';
                    }

                    return (
                      <tr key={row.id} style={{ borderBottom: '1px solid var(--border-light)', background: bg }}>
                        <td style={{ padding: '0.4rem' }}>
                          <select value={row.colectorId} onChange={e => updatePiso(row.id, 'colectorId', e.target.value)} style={inps}>
                            <option value="">-- Seleccionar --</option>
                            {colectores.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.planta})</option>)}
                          </select>
                        </td>
                        <td style={{ padding: '0.4rem' }}><input type="text" value={row.ambiente} onChange={e => updatePiso(row.id, 'ambiente', e.target.value)} style={inps} placeholder="Ej: Cocina" /></td>
                        <td style={{ padding: '0.4rem' }}><input type="number" step="0.1" value={row.superficie} onChange={e => updatePiso(row.id, 'superficie', e.target.value)} style={inps} /></td>
                        <td style={{ padding: '0.4rem' }}>
                          <input type="number" step="0.1" value={row.distancia} onChange={e => updatePiso(row.id, 'distancia', e.target.value)} style={{ ...inps, border: dist === 0 ? '1px solid var(--error)' : inps.border }} />
                        </td>
                        <td style={{ padding: '0.4rem', fontWeight: '600', color: 'var(--text-secondary)' }}>{dist > 0 ? mlEspira.toFixed(1) : '-'}</td>
                        <td style={{ padding: '0.4rem', fontWeight: '600', color: 'var(--text-secondary)' }}>{dist > 0 ? mlConexion.toFixed(1) : '-'}</td>
                        <td style={{ padding: '0.4rem', fontWeight: '700' }}>{dist > 0 ? mlCircuito.toFixed(1) : '-'}</td>
                        <td style={{ padding: '0.4rem', fontWeight: '700' }}>{dist > 0 ? cantCirc : '-'}</td>
                        <td style={{ padding: '0.4rem' }}>{estado}</td>
                        <td style={{ padding: '0.4rem', textAlign: 'center' }}>
                          <button onClick={() => removePiso(row.id)} style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', padding: '0.2rem' }}>
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button onClick={addRowPiso} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
              <Plus size={16} /> Agregar Ambiente
            </button>
            <div style={{ marginTop: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <strong>Importante:</strong> La distancia de ida al colector es un campo numérico obligatorio y debe provenir de una medición en plano (AutoCAD) sobre la polilínea del recorrido real del caño, no es un valor estimado.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
