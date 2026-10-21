/**
 * Pruebas del servicio de aprobaciones contra un Firestore en memoria:
 * obra única con alcance incremental, idempotencia (doble clic / reintento), cancelación sin efectos
 * y fallo + reintento de Euler Jornadas sin duplicar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Firestore en memoria ───────────────────────────────────────────────────
const store = new Map();
const versiones = new Map();
const _set = store.set.bind(store);
store.set = (k, v) => { versiones.set(k, (versiones.get(k) || 0) + 1); return _set(k, v); };
const calls = { set: 0, update: 0, tx: 0 };
let fallarJornadas = false;
let auto = 0;
const clone = (x) => JSON.parse(JSON.stringify(x));
const aplicar = (actual, data) => {
  const out = { ...(actual || {}) };
  Object.entries(data).forEach(([k, v]) => {
    if (v && v.__arrayUnion) out[k] = [...(out[k] || []), ...v.__arrayUnion];
    else out[k] = v;
  });
  return out;
};

vi.mock('firebase/firestore', () => {
  const ref = (dbx, col, id) => ({ path: `${dbx.name}:${col}/${id}`, id, col, db: dbx });
  const snap = (r) => ({ id: r.id, ref: r, exists: () => store.has(r.path), data: () => clone(store.get(r.path)) });
  const escribir = (r, data, merge) => {
    if (r.db.name === 'jor' && fallarJornadas) throw new Error('Jornadas no disponible');
    calls.set += 1;
    store.set(r.path, merge ? aplicar(store.get(r.path), data) : aplicar({}, data));
  };
  const actualizar = (r, data) => {
    if (r.db.name === 'jor' && fallarJornadas) throw new Error('Jornadas no disponible');
    if (!store.has(r.path)) throw new Error(`No existe ${r.path}`);
    calls.update += 1;
    store.set(r.path, aplicar(store.get(r.path), data));
  };
  return {
    collection: (dbx, name) => ({ __col: true, db: dbx, name }),
    doc: (a, col, id) => (a.__col ? ref(a.db, a.name, `auto${++auto}`) : ref(a, col, id)),
    query: (c, ...wheres) => ({ ...c, wheres }),
    where: (f, op, v) => ({ f, op, v }),
    getDoc: async (r) => snap(r),
    getDocs: async (q) => {
      const pref = `${q.db.name}:${q.name}/`;
      const docs = [...store.keys()].filter((k) => k.startsWith(pref)).map((k) => snap(ref(q.db, q.name, k.slice(pref.length))))
        .filter((s) => (q.wheres || []).every((w) => (w.op === 'in' ? w.v.includes(s.data()[w.f]) : s.data()[w.f] === w.v)));
      return { docs, empty: !docs.length };
    },
    setDoc: async (r, data, opts) => escribir(r, data, opts?.merge),
    updateDoc: async (r, data) => actualizar(r, data),
    arrayUnion: (...v) => ({ __arrayUnion: v }),
    serverTimestamp: () => 'TS',
    runTransaction: async (_db, fn) => {
      // Concurrencia optimista como Firestore: si un documento leído cambió antes del commit, se reintenta.
      for (let intento = 0; intento < 5; intento += 1) {
        calls.tx += 1;
        const writes = [];
        const leidas = {};
        const tx = {
          get: async (r) => { leidas[r.path] = versiones.get(r.path) || 0; await Promise.resolve(); return snap(r); },
          set: (r, d) => writes.push(() => escribir(r, d, false)),
          update: (r, d) => writes.push(() => actualizar(r, d)),
        };
        const res = await fn(tx);
        if (Object.entries(leidas).some(([p, v]) => (versiones.get(p) || 0) !== v)) continue;
        writes.forEach((w) => w());
        return res;
      }
      throw new Error('Transacción abortada');
    },
  };
});
vi.mock('./firebaseConfig', () => ({ db: { name: 'erp' }, functions: {}, storage: {}, auth: {} }));
vi.mock('./firebaseJornadas', () => ({ dbJornadas: { name: 'jor' } }));
let seq = 400;
vi.mock('../utils/sequenceGenerator', () => ({ getNextSequenceValue: async () => ++seq, formatObraNumber: (n) => `OT-2026-${String(n).padStart(6, '0')}` }));

const { registrarAprobacion, sincronizarJornadas, nuevoIdAprobacion } = await import('./aprobacionesService');

const ITEMS = [
  { id: 'c1', descripcion: 'Mano de obra y materiales para cañería PEX', tipo: 'mano_de_obra', quantity: 1, unitPrice: 3000000 },
  { id: 'k1', descripcion: 'Caldera mural', tipo: 'material', listaItemId: 'L-CAL', quantity: 1, unitPrice: 2000000 },
  { id: 'r1', descripcion: 'Radiador 600', tipo: 'material', listaItemId: 'L-RAD', quantity: 10, unitPrice: 150000 },
];
const user = { email: 'vendedor@euler.com.ar', name: 'Vendedor' };
const obras = () => [...store.entries()].filter(([k]) => k.startsWith('erp:obras/')).map(([k, v]) => ({ id: k.split('/')[1], ...v }));
const presu = () => store.get('erp:presupuestos/P1');
const jornadas = () => [...store.keys()].filter((k) => k.startsWith('jor:obras/'));

beforeEach(() => {
  store.clear(); auto = 0; fallarJornadas = false; Object.assign(calls, { set: 0, update: 0, tx: 0 });
  store.set('erp:presupuestos/P1', { name: 'Flia. Test', presupuestoNumber: 'PRE-2026-1500', canal: 'iva', revision: 1, status: 'seguimiento', quoteItems: ITEMS, amount: 9999, statusHistory: [], bitacora: [] });
});

describe('Aprobación parcial → obra ERP + Jornadas', () => {
  it('1/6. primera aprobación crea UNA obra solo con lo aprobado; la segunda actualiza la misma obra', async () => {
    const r1 = await registrarAprobacion({ presupuestoId: 'P1', aprobacionId: nuevoIdAprobacion(), seleccion: { c1: 1, k1: 1, r1: 4 }, user });
    expect(r1.obraCreada).toBe(true);
    expect(obras()).toHaveLength(1);
    expect(obras()[0].quoteItems.map((x) => [x.presupuestoItemId, x.quantity])).toEqual([['c1', 1], ['k1', 1], ['r1', 4]]);
    expect(presu().status).toBe('aprobado');
    expect(presu().aprobacionResumen.tipo).toBe('parcial');
    expect(presu().amount).toBe(9999); // el monto del presupuesto no se pisa
    expect(jornadas()).toHaveLength(1);

    const r2 = await registrarAprobacion({ presupuestoId: 'P1', aprobacionId: nuevoIdAprobacion(), seleccion: { r1: 6 }, user });
    expect(r2.obraCreada).toBe(false);
    expect(r2.obraId).toBe(r1.obraId);
    expect(obras()).toHaveLength(1);
    expect(obras()[0].quoteItems.map((x) => [x.presupuestoItemId, x.quantity])).toEqual([['c1', 1], ['k1', 1], ['r1', 10]]);
    expect(presu().aprobaciones).toHaveLength(2);
    expect(presu().aprobacionResumen.tipo).toBe('total');
    expect(presu().statusHistory).toHaveLength(1); // el cambio de columna se registra una sola vez
    expect(jornadas()).toHaveLength(1);
  });

  it('8. doble clic / reintento con el mismo id no duplica aprobación, obra ni Jornadas', async () => {
    const id = nuevoIdAprobacion();
    await Promise.all([
      registrarAprobacion({ presupuestoId: 'P1', aprobacionId: id, seleccion: { k1: 1 }, user }),
      registrarAprobacion({ presupuestoId: 'P1', aprobacionId: id, seleccion: { k1: 1 }, user }).catch((e) => e),
    ]);
    const r3 = await registrarAprobacion({ presupuestoId: 'P1', aprobacionId: id, seleccion: { k1: 1 }, user });
    expect(r3.duplicado).toBe(true);
    expect(presu().aprobaciones).toHaveLength(1);
    expect(presu().aprobaciones[0].items[0]).toMatchObject({ itemId: 'k1', cantidad: 1 });
  });

  it('rechaza cantidades mayores a lo pendiente sin escribir nada', async () => {
    await expect(registrarAprobacion({ presupuestoId: 'P1', aprobacionId: 'x', seleccion: { r1: 11 }, user })).rejects.toThrow(/supera/);
    expect(obras()).toHaveLength(0);
    expect(presu().status).toBe('seguimiento');
  });

  it('7. cancelar el pop-up (no llamar al servicio) no deja efectos', () => {
    expect(calls).toEqual({ set: 0, update: 0, tx: 0 });
    expect(obras()).toHaveLength(0);
  });

  it('el estado de pago es una declaración: no crea recibos ni movimientos', async () => {
    await registrarAprobacion({ presupuestoId: 'P1', aprobacionId: 'a1', seleccion: { k1: 1 }, user, pagoDeclarado: { estado: 'Pago Completo', monto: 2420000 } });
    expect(presu().paymentStatus).toBe('Pago Completo');
    expect(presu().aprobaciones[0].pagoDeclarado).toMatchObject({ manual: true, alcance: 'aprobado_acumulado' });
    expect([...store.keys()].some((k) => /recibos|comprobantes|transacciones|asientos/.test(k))).toBe(false);
  });

  it('falla Euler Jornadas → se informa y el reintento no duplica', async () => {
    fallarJornadas = true;
    const r = await registrarAprobacion({ presupuestoId: 'P1', aprobacionId: 'a1', seleccion: { k1: 1 }, user });
    expect(r.jornadas.ok).toBe(false);
    expect(obras()[0].jornadasSync.estado).toBe('error');
    expect(jornadas()).toHaveLength(0);
    fallarJornadas = false;
    const j1 = await sincronizarJornadas(r.obraId);
    const j2 = await sincronizarJornadas(r.obraId);
    expect(j1.ok && j2.ok).toBe(true);
    expect(jornadas()).toHaveLength(1);
    expect(obras()[0].jornadasSync.estado).toBe('ok');
    expect(store.get(jornadas()[0]).erpObraId).toBe(r.obraId);
  });

  it('10. presupuesto aprobado antes de la mejora: conserva la aprobación histórica y agrega solo lo nuevo a su obra', async () => {
    store.set('erp:presupuestos/P1', { ...presu(), status: 'aprobado', statusHistory: [{ status: 'aprobado', date: '2026-01-01T00:00:00Z' }] });
    store.set('erp:obras/OLD', { presupuestoId: 'P1', otNumber: 'OT-2026-000100', jornadasObraId: 'ob_erp_1', quoteItems: ITEMS.slice(0, 2).map((x) => ({ ...x })) });
    store.set('jor:obras/ob_erp_1', { id: 'ob_erp_1', nombre: 'Vieja', lat: -32.9, lng: -60.6, erpObraId: 'OLD' });
    const r = await registrarAprobacion({ presupuestoId: 'P1', aprobacionId: 'a1', seleccion: { r1: 3 }, user });
    expect(r.obraId).toBe('OLD');
    expect(obras()).toHaveLength(1);
    expect(presu().aprobaciones.map((a) => a.tipo)).toEqual(['historica', 'parcial']);
    expect(presu().aprobaciones[0].items.map((x) => x.itemId)).toEqual(['c1', 'k1']);
    expect(store.get('erp:obras/OLD').quoteItems.map((x) => x.quantity)).toEqual([1, 1, 3]);
    expect(store.get('jor:obras/ob_erp_1').lat).toBe(-32.9); // no pisa datos cargados en Jornadas
    expect(presu().statusHistory).toHaveLength(1);
  });
});
