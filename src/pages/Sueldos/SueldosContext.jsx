/**
 * SueldosContext — Carga datos desde Firebase "eulersueldos" (doc eulerData/mainData)
 */
import React, { createContext, useState, useEffect, useContext } from 'react';
import { dbSueldos } from '../../services/firebaseSueldos';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const SueldosContext = createContext();

export function SueldosProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [rates, setRates] = useState({
    hourlyRate: 0, hourlyRateOficial: 0, hourlyRateMedio: 0,
    bocaObraNueva2p: 0, bocaObraNueva3p: 0,
    bocaRefaccion2p: 0, bocaRefaccion3p: 0,
    mesVigente: '', paritariaFecha: ''
  });
  const [liquidations, setLiquidations] = useState([]);
  const [paritarias, setParitarias] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const docRef = doc(dbSueldos, 'eulerData', 'mainData');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const d = docSnap.data();
        if (d.employees) setEmployees(d.employees);
        if (d.globalRates) setRates(d.globalRates);
        if (d.liquidations) setLiquidations(d.liquidations);
        if (d.paritariasHistory) setParitarias(d.paritariasHistory);
      }
    } catch (err) {
      console.error('Error cargando sueldos:', err);
    }
    setLoading(false);
  };

  const saveData = async (d) => {
    try {
      const docRef = doc(dbSueldos, 'eulerData', 'mainData');
      await setDoc(docRef, {
        employees: d.employees !== undefined ? d.employees : employees,
        globalRates: d.globalRates !== undefined ? d.globalRates : rates,
        liquidations: d.liquidations !== undefined ? d.liquidations : liquidations,
        paritariasHistory: d.paritariasHistory !== undefined ? d.paritariasHistory : paritarias,
        lastUpdate: new Date().toISOString()
      }, { merge: true });
      return true;
    } catch (err) {
      console.error('Error guardando:', err);
      alert('Error al guardar datos');
      return false;
    }
  };

  return (
    <SueldosContext.Provider value={{
      loading, employees, setEmployees, rates, setRates,
      liquidations, setLiquidations, paritarias, setParitarias, saveData
    }}>
      {children}
    </SueldosContext.Provider>
  );
}

export function useSueldos() {
  return useContext(SueldosContext);
}
