import React, { createContext, useState, useEffect, useContext, useMemo } from 'react';
import { db } from '../../services/firebaseConfig';
import { dbSueldos } from '../../services/firebaseSueldos';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useJornadas } from '../../context/JornadasContext';

const SueldosContext = createContext();

export function SueldosProvider({ children }) {
  const { empleados: jorEmpleados } = useJornadas();
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [rates, setRates] = useState({
    hourlyRate: 0, hourlyRateOficial: 0, hourlyRateMedio: 0, hourlyRateDif: 0,
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
      // 1. Intentar cargar desde la base principal protegida del Master ERP
      let docRef = doc(db, 'eulerData', 'mainData');
      let docSnap = await getDoc(docRef);

      // 2. Si aún no existe en el ERP, migrar automáticamente desde eulersueldos
      if (!docSnap.exists()) {
        try {
          const oldDocRef = doc(dbSueldos, 'eulerData', 'mainData');
          const oldSnap = await getDoc(oldDocRef);
          if (oldSnap.exists()) {
            const oldData = oldSnap.data();
            await setDoc(docRef, oldData, { merge: true });
            docSnap = oldSnap;
          }
        } catch (migErr) {
          console.warn('Fallo migración desde eulersueldos:', migErr);
        }
      }

      if (docSnap && docSnap.exists()) {
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
      const dataToSave = {
        employees: d.employees !== undefined ? d.employees : employees,
        globalRates: d.globalRates !== undefined ? d.globalRates : rates,
        liquidations: d.liquidations !== undefined ? d.liquidations : liquidations,
        paritariasHistory: d.paritariasHistory !== undefined ? d.paritariasHistory : paritarias,
        lastUpdate: new Date().toISOString()
      };

      // Guardar en la base principal protegida
      const docRef = doc(db, 'eulerData', 'mainData');
      await setDoc(docRef, dataToSave, { merge: true });

      // Sincronización secundaria con la base vieja mientras Cindy sigue en la web anterior
      try {
        const oldDocRef = doc(dbSueldos, 'eulerData', 'mainData');
        await setDoc(oldDocRef, dataToSave, { merge: true });
      } catch (e) {
        console.warn('Sync secundario omitido:', e);
      }

      return true;
    } catch (err) {
      console.error('Error guardando:', err);
      alert('Error al guardar datos');
      return false;
    }
  };

  // Unificar colaboradores de Jornadas en la lista de empleados
  const unifiedEmployees = useMemo(() => {
    const list = [...employees];
    jorEmpleados.forEach(je => {
      const index = list.findIndex(x => x.id === je.id || (x.dni && je.dni && x.dni === je.dni));
      if (index === -1) {
        list.push({
          id: je.id,
          name: `${je.nombre} ${je.apellido || ''}`.trim(),
          dni: je.dni || '',
          cat: je.categoriaBase || 'Oficial',
          active: je.activo !== false,
          puesto: je.puesto || 'Instalador'
        });
      } else {
        // Enriquecer con datos actualizados de Jornadas
        list[index] = {
          ...list[index],
          name: `${je.nombre} ${je.apellido || ''}`.trim(),
          dni: je.dni || list[index].dni,
          cat: je.categoriaBase || list[index].cat || 'Oficial',
          active: je.activo !== false,
          puesto: je.puesto || list[index].puesto || 'Instalador'
        };
      }
    });
    return list;
  }, [employees, jorEmpleados]);

  return (
    <SueldosContext.Provider value={{
      loading, employees: unifiedEmployees, setEmployees, rates, setRates,
      liquidations, setLiquidations, paritarias, setParitarias, saveData
    }}>
      {children}
    </SueldosContext.Provider>
  );
}

export function useSueldos() {
  return useContext(SueldosContext);
}

