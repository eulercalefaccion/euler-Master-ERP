/**
 * JornadasContext — Provee datos en tiempo real desde Firebase "eulerjornadas"
 * Adaptado del DataContext original de la webapp Euler Jornadas
 */
import React, { createContext, useState, useEffect, useContext } from 'react';
import { dbJornadas } from '../services/firebaseJornadas';
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
    const unsubs = [];

    // Empleados real-time
    const unsubEmps = onSnapshot(collection(dbJornadas, 'empleados'), (snap) => {
      setEmpleados(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    unsubs.push(unsubEmps);

    // Obras real-time
    const unsubObras = onSnapshot(collection(dbJornadas, 'obras'), (snap) => {
      setObras(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    unsubs.push(unsubObras);

    // Jornadas real-time
    const unsubJornadas = onSnapshot(collection(dbJornadas, 'jornadas'), (snap) => {
      setJornadas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    unsubs.push(unsubJornadas);

    // Gastos real-time
    const unsubGastos = onSnapshot(collection(dbJornadas, 'gastos'), (snap) => {
      setGastos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    unsubs.push(unsubGastos);

    // Config real-time
    const unsubConfig = onSnapshot(collection(dbJornadas, 'configuracion'), (snap) => {
      if (snap.docs.length > 0) {
        setAppConfig({ ...DEFAULT_CONFIG, ...snap.docs[0].data() });
      }
    });
    unsubs.push(unsubConfig);

    // Mark as loaded after a short delay to ensure first snapshots arrive
    const timer = setTimeout(() => setLoading(false), 1500);

    return () => {
      unsubs.forEach(u => u());
      clearTimeout(timer);
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
    }}>
      {children}
    </JornadasContext.Provider>
  );
}

export function useJornadas() {
  return useContext(JornadasContext);
}
