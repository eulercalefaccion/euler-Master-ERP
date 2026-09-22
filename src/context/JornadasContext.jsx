/**
 * JornadasContext — Provee datos en tiempo real desde Firebase "eulerjornadas"
 * Adaptado del DataContext original de la webapp Euler Jornadas
 */
import React, { createContext, useState, useEffect, useContext } from 'react';
import { dbJornadas, ensureJornadasAuth } from '../services/firebaseJornadas';
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';

const JornadasContext = createContext();

const DEFAULT_CONFIG = {
  radioDefecto: 200,
  radioTolerancia: 50,
  horaCierreAuto: 12,
  horarioIngreso: '08:30',
  geminiApiKey: '',
};

export function JornadasProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [empleados, setEmpleados] = useState([]);
  const [obras, setObras] = useState([]);
  const [jornadas, setJornadas] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [appConfig, setAppConfig] = useState(DEFAULT_CONFIG);

  useEffect(() => {
    let unsubs = [];
    let mounted = true;

    const init = async () => {
      await ensureJornadasAuth();
      if (!mounted) return;

      // Empleados real-time (sin exponer contraseñas)
      const unsubEmps = onSnapshot(collection(dbJornadas, 'empleados'), (snap) => {
        if (mounted) {
          setEmpleados(snap.docs.map(d => {
            const { password, ...safe } = d.data();
            return { id: d.id, ...safe };
          }));
        }
      });
      unsubs.push(unsubEmps);

      // Obras real-time
      const unsubObras = onSnapshot(collection(dbJornadas, 'obras'), (snap) => {
        if (mounted) setObras(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
      unsubs.push(unsubObras);

      // Jornadas real-time
      const unsubJornadas = onSnapshot(collection(dbJornadas, 'jornadas'), (snap) => {
        if (mounted) setJornadas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
      unsubs.push(unsubJornadas);

      // Gastos real-time
      const unsubGastos = onSnapshot(collection(dbJornadas, 'gastos'), (snap) => {
        if (mounted) setGastos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
      unsubs.push(unsubGastos);

      // Config real-time
      const unsubConfig = onSnapshot(collection(dbJornadas, 'configuracion'), (snap) => {
        if (mounted && snap.docs.length > 0) {
          setAppConfig({ ...DEFAULT_CONFIG, ...snap.docs[0].data() });
        }
      });
      unsubs.push(unsubConfig);

      setLoading(false);
    };

    init();

    return () => {
      mounted = false;
      unsubs.forEach(u => u());
    };
  }, []);

  // Derived data
  const empleadosActivos = empleados.filter(e => e.activo && (e.rol === 'empleado' || e.rol === 'ambos'));
  const obrasActivas = obras.filter(o => o.activa);

  // CRUD Empleados
  async function addEmpleado(emp) {
    const newItem = { ...emp, id: `usr_${Date.now()}`, activo: true };
    await setDoc(doc(dbJornadas, 'empleados', newItem.id), newItem);
  }
  async function updateEmpleado(id, data) {
    await updateDoc(doc(dbJornadas, 'empleados', id), data);
  }
  async function deleteEmpleado(id) {
    await updateDoc(doc(dbJornadas, 'empleados', id), { activo: false });
  }

  // CRUD Obras
  async function addObra(o) {
    const newItem = { ...o, id: `ob_${Date.now()}`, activa: true };
    await setDoc(doc(dbJornadas, 'obras', newItem.id), newItem);
  }
  async function updateObra(id, data) {
    await updateDoc(doc(dbJornadas, 'obras', id), data);
  }
  async function deleteObra(id) {
    await updateDoc(doc(dbJornadas, 'obras', id), { activa: false });
  }

  // Config
  async function updateConfig(data) {
    setAppConfig(c => ({ ...c, ...data }));
    const configSnap = await getDocs(collection(dbJornadas, 'configuracion'));
    let docId = 'general';
    if (configSnap.docs.length > 0) docId = configSnap.docs[0].id;
    await updateDoc(doc(dbJornadas, 'configuracion', docId), data);
  }

  // Jornadas CRUD
  async function updateJornada(jorId, data) {
    await updateDoc(doc(dbJornadas, 'jornadas', jorId), data);
  }
  async function deleteJornada(jorId) {
    await updateDoc(doc(dbJornadas, 'jornadas', jorId), { eliminada: true });
  }
  async function restoreJornada(jorId) {
    await updateDoc(doc(dbJornadas, 'jornadas', jorId), { eliminada: false });
  }
  async function hardDeleteJornada(jorId) {
    await deleteDoc(doc(dbJornadas, 'jornadas', jorId));
  }

  // Gastos CRUD
  async function addGasto(gasto) {
    const newItem = { ...gasto, id: `gst_${Date.now()}`, creadoEn: Date.now() };
    await setDoc(doc(dbJornadas, 'gastos', newItem.id), newItem);
  }
  async function updateGasto(id, data) {
    await updateDoc(doc(dbJornadas, 'gastos', id), data);
  }
  async function deleteGasto(id) {
    await deleteDoc(doc(dbJornadas, 'gastos', id));
  }

  // Toasts
  const [toasts, setToasts] = useState([]);
  function showToast(msg, type = 'success') {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  }
  function dismissToast(id) {
    setToasts(t => t.filter(x => x.id !== id));
  }

  // Session & ViewMode
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const d = localStorage.getItem('euler_user');
      return d ? JSON.parse(d) : null;
    } catch {
      return null;
    }
  });
  const [viewMode, setViewMode] = useState('admin');

  useEffect(() => {
    if (currentUser) {
      const { password, ...safeUser } = currentUser;
      localStorage.setItem('euler_user', JSON.stringify(safeUser));
    } else {
      localStorage.removeItem('euler_user');
    }
  }, [currentUser]);

  function login(u, p) {
    const user = empleados.find(e => e.usuario === u && e.password === p && e.activo);
    if (user) {
      setCurrentUser(user);
      setViewMode(user.rol === 'admin' ? 'admin' : 'empleado');
      showToast(`¡Bienvenido ${user.nombre}!`);
      return user;
    }
    return null;
  }
  function logout() {
    setCurrentUser(null);
    showToast('Sesión cerrada');
  }

  return (
    <JornadasContext.Provider value={{
      loading,
      empleados, empleadosActivos,
      obras, obrasActivas,
      jornadas, gastos, appConfig,
      addEmpleado, updateEmpleado, deleteEmpleado,
      addObra, updateObra, deleteObra,
      updateConfig,
      updateJornada, deleteJornada, restoreJornada, hardDeleteJornada,
      addGasto, updateGasto, deleteGasto,
      toasts, showToast, dismissToast,
      currentUser, setCurrentUser, viewMode, setViewMode, login, logout
    }}>
      {children}
    </JornadasContext.Provider>
  );
}

export function useJornadas() {
  return useContext(JornadasContext);
}

