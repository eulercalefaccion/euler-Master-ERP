import React, { useEffect, useMemo, useState } from 'react';
import { Loader, Search, Trash2, ClipboardPaste, PackageMinus, PackagePlus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Modal, Alerta, Campo } from '../Ventas/ventasUI';
import { inp } from '../Ventas/ventasHelpers';
import { cargarArticulosStock, registrarConsumo } from '../../services/consumosObraService';

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const hoy = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const td = { padding: '0.4rem 0.5rem', verticalAlign: 'middle' };

/** Interpreta una lista pegada (Excel / texto): "descripción o código [TAB|;] cantidad" por línea. */
const interpretarLista = (texto, articulos) => {
  const ok = []; const fallidas = [];
  String(texto || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((linea) => {
    const partes = linea.split(/\t|;/).map((p) => p.trim()).filter(Boolean);
    let cant = null; let texto2 = linea;
    if (partes.length >= 2) {
      const iNum = partes.findIndex((p) => /^\d+([.,]\d+)?$/.test(p));
      if (iNum >= 0) { cant = Number(partes[iNum].replace(',', '.')); texto2 = partes.filter((_, i) => i !== iNum).join(' '); }
    } else {
      const m = linea.match(/^(.*?)[\s]+(\d+(?:[.,]\d+)?)$/);
      if (m) { texto2 = m[1]; cant = Number(m[2].replace(',', '.')); }
    }
    const t = norm(texto2);
    const art = articulos.find((a) => norm(a.codigo) === t || norm(a.codigoGesdatta) === t)
      || articulos.find((a) => norm(a.descripcion) === t)
      || articulos.find((a) => t.length >= 4 && norm(a.descripcion).includes(t));
    if (art && cant > 0) ok.push({ art, cantidad: cant }); else fallidas.push(linea);
  });
  return { ok, fallidas };
};

/**
 * Movimiento de materiales de obra: ingeniería de cañería, salida adicional o devolución al depósito.
 * @param {{ obra: object, tipo: 'salida'|'devolucion', ingenieria?: boolean, resumen?: object[], onClose: Function }} props
 */
export default function ConsumoModal({ obra, tipo, ingenieria = false, resumen = [], onClose }) {
  const { currentUser } = useAuth();
  const [articulos, setArticulos] = useState(null);
  const [lineas, setLineas] = useState([]);
  const [busca, setBusca] = useState('');
  const [pegar, setPegar] = useState(null);
  const [noEncontradas, setNoEncontradas] = useState([]);
  const [fecha, setFecha] = useState(hoy());
  const [responsable, setResponsable] = useState(currentUser?.displayName || currentUser?.name || currentUser?.email || '');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    cargarArticulosStock().then(setArticulos).catch((e) => { setError(e.message); setArticulos([]); });
  }, []);

  const netoObra = useMemo(() => Object.fromEntries((resumen || []).map((r) => [r.listaItemId, r.neto])), [resumen]);
  const resultados = useMemo(() => {
    const t = norm(busca);
    if (!articulos || t.length < 2) return [];
    const palabras = t.split(' ');
    return articulos.filter((a) => {
      const txt = norm(`${a.descripcion} ${a.codigo || ''} ${a.codigoGesdatta || ''} ${a.categoria || ''} ${a.proveedor || ''}`);
      return palabras.every((p) => txt.includes(p));
    }).slice(0, 25);
  }, [busca, articulos]);

  const agregar = (art, cantidad = '') => {
    setLineas((ls) => {
      const i = ls.findIndex((l) => l.listaItemId === art.id);
      if (i >= 0) {
        if (cantidad === '') return ls;
        const c = [...ls]; c[i] = { ...c[i], cantidad: Number(c[i].cantidad || 0) + Number(cantidad) }; return c;
      }
      return [...ls, { listaItemId: art.id, descripcion: art.descripcion, unidad: art.unidad || '', stock: Number(art.stock || 0), cantidad }];
    });
    setBusca('');
  };

  const aplicarPegado = () => {
    const { ok, fallidas } = interpretarLista(pegar, articulos || []);
    ok.forEach(({ art, cantidad }) => agregar(art, cantidad));
    setNoEncontradas(fallidas);
    setPegar(null);
  };

  const confirmar = async () => {
    setError('');
    const validas = lineas.filter((l) => Number(l.cantidad) > 0);
    if (!validas.length) { setError('Agregá al menos un material con cantidad.'); return; }
    if (tipo === 'devolucion') {
      const exceso = validas.find((l) => Number(l.cantidad) > (netoObra[l.listaItemId] || 0) + 0.0001);
      if (exceso && !window.confirm(`"${exceso.descripcion}": devolvés más de lo que figura consumido en esta obra (${netoObra[exceso.listaItemId] || 0}). ¿Continuar igual?`)) return;
    }
    setGuardando(true);
    try {
      await registrarConsumo({ obra, tipo, ingenieria, etapa: obra.phase === 'Instalación' ? 'instalacion' : 'obra', items: validas, nota, responsable, fecha }, currentUser);
      onClose(true);
    } catch (e) { setError(e.message); setGuardando(false); }
  };

  const titulo = ingenieria ? 'Cargar ingeniería de cañería' : tipo === 'devolucion' ? 'Devolución de materiales al depósito' : 'Salida de materiales a obra';
  const Icono = tipo === 'devolucion' ? PackagePlus : PackageMinus;
  const devolubles = (resumen || []).filter((r) => r.neto > 0 && !lineas.some((l) => l.listaItemId === r.listaItemId));

  return (
    <Modal titulo={titulo} subtitulo={`${obra.otNumber ? `${obra.otNumber} · ` : ''}${obra.name || ''}`} onClose={() => onClose(false)} ancho={860}
      pie={(
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            {lineas.filter((l) => Number(l.cantidad) > 0).length} material(es) · {tipo === 'devolucion' ? 'vuelven al stock' : 'se descuentan del stock'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => onClose(false)} disabled={guardando}>Cancelar</button>
            <button className="btn btn-primary" onClick={confirmar} disabled={guardando || !lineas.length} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {guardando ? <Loader size={15} className="spin" /> : <Icono size={15} />} {tipo === 'devolucion' ? 'Registrar devolución' : 'Descontar del stock'}
            </button>
          </div>
        </div>
      )}>
      {ingenieria && (
        <Alerta tipo="info">
          Cargá los caños, accesorios y piezas que salen de la ingeniería de la cañería. Se descuentan del stock ahora.
          Si durante la obra se usa más, menos o algo distinto, registrás salidas adicionales o devoluciones desde la pestaña Materiales de la obra.
        </Alerta>
      )}

      {/* Buscador */}
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-tertiary)' }} />
            <input style={{ ...inp, paddingLeft: 32 }} value={busca} onChange={(e) => setBusca(e.target.value)} disabled={articulos === null}
              placeholder={articulos === null ? 'Cargando artículos…' : 'Buscar caño, codo, tee, cupla, colector… (código o descripción)'} />
          </div>
          <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }} onClick={() => setPegar(pegar === null ? '' : null)} disabled={!articulos}>
            <ClipboardPaste size={15} /> Pegar lista
          </button>
        </div>
        {resultados.length > 0 && (
          <div style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, top: '100%', marginTop: 4, background: 'var(--bg-primary, #fff)', border: '1px solid var(--border-light)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 300, overflowY: 'auto' }}>
            {resultados.map((a) => (
              <div key={a.id} onClick={() => agregar(a)} style={{ padding: '0.45rem 0.7rem', cursor: 'pointer', borderBottom: '1px solid var(--border-light)', fontSize: '0.82rem', display: 'flex', justifyContent: 'space-between', gap: 8 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9'; }} onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}>
                <span>{a.descripcion}<span style={{ color: 'var(--text-tertiary)', fontSize: '0.72rem' }}>{a.categoria ? ` · ${a.categoria}` : ''}</span></span>
                <span style={{ whiteSpace: 'nowrap', color: Number(a.stock || 0) > 0 ? '#166534' : '#b91c1c', fontSize: '0.75rem' }}>Stock {Number(a.stock || 0)} {a.unidad || ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {pegar !== null && (
        <div style={{ border: '1px dashed var(--border-strong, #cbd5e1)', borderRadius: 8, padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
            Pegá desde Excel dos columnas: <b>descripción (o código)</b> y <b>cantidad</b>. Una fila por material.
          </div>
          <textarea style={{ ...inp, minHeight: 110, fontFamily: 'monospace', fontSize: '0.78rem' }} value={pegar} onChange={(e) => setPegar(e.target.value)}
            placeholder={'TUBO PEX 16MM\t120\nCODO 16MM\t14\nTEE 16MM\t6'} />
          <div><button className="btn btn-primary" style={{ fontSize: '0.78rem' }} onClick={aplicarPegado}>Agregar a la lista</button></div>
        </div>
      )}
      {noEncontradas.length > 0 && (
        <Alerta>{`No encontré estos materiales en la lista de precios (agregalos con el buscador):\n${noEncontradas.join('\n')}`}</Alerta>
      )}

      {tipo === 'devolucion' && devolubles.length > 0 && (
        <div style={{ fontSize: '0.78rem' }}>
          <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>Materiales consumidos en esta obra (click para agregar):</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {devolubles.map((r) => (
              <button key={r.listaItemId} className="btn btn-secondary" style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
                onClick={() => { const a = (articulos || []).find((x) => x.id === r.listaItemId) || { id: r.listaItemId, descripcion: r.descripcion, unidad: r.unidad }; agregar(a); }}>
                {r.descripcion} ({r.neto})
              </button>
            ))}
          </div>
        </div>
      )}

      {lineas.length > 0 ? (
        <div style={{ border: '1px solid var(--border-light)', borderRadius: 8, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface-hover, #f8fafc)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                <th style={td}>Material</th>
                <th style={{ ...td, textAlign: 'right' }}>Stock actual</th>
                {tipo === 'devolucion' && <th style={{ ...td, textAlign: 'right' }}>Consumido en obra</th>}
                <th style={{ ...td, textAlign: 'right', width: 130 }}>Cantidad</th>
                <th style={td}></th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l, i) => (
                <tr key={l.listaItemId} style={{ borderTop: '1px solid var(--border-light)' }}>
                  <td style={td}>{l.descripcion}</td>
                  <td style={{ ...td, textAlign: 'right', color: tipo !== 'devolucion' && l.stock < Number(l.cantidad || 0) ? '#b91c1c' : undefined }}>{l.stock} {l.unidad}</td>
                  {tipo === 'devolucion' && <td style={{ ...td, textAlign: 'right' }}>{netoObra[l.listaItemId] || 0}</td>}
                  <td style={{ ...td, textAlign: 'right' }}>
                    <input type="number" min="0" step="any" autoFocus={i === lineas.length - 1 && l.cantidad === ''} style={{ ...inp, width: 90, textAlign: 'right' }} value={l.cantidad}
                      onChange={(e) => setLineas((ls) => ls.map((x, j) => (j === i ? { ...x, cantidad: e.target.value } : x)))} />
                    <span style={{ marginLeft: 4, fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{l.unidad}</span>
                  </td>
                  <td style={td}>
                    <button onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c' }}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ padding: '1.2rem', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.82rem', border: '1px dashed var(--border-light)', borderRadius: 8 }}>
          Buscá materiales arriba o pegá una lista desde Excel.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 2fr', gap: '0.75rem' }}>
        <Campo label="Fecha"><input type="date" style={inp} value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo>
        <Campo label="Responsable"><input style={inp} value={responsable} onChange={(e) => setResponsable(e.target.value)} /></Campo>
        <Campo label="Observaciones"><input style={inp} value={nota} onChange={(e) => setNota(e.target.value)} placeholder={tipo === 'devolucion' ? 'Sobrante de obra…' : 'Cambio de recorrido, faltante…'} /></Campo>
      </div>
      {error && <Alerta>{error}</Alerta>}
    </Modal>
  );
}
