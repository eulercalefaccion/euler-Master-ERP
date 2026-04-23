import React, { useState } from 'react';
import { db } from '../services/firebaseConfig';
import { collection, getDocs, deleteDoc, writeBatch, doc } from 'firebase/firestore';

const DatabaseWiper = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState('');

  const handleWipeAndSeed = async () => {
    if (!window.confirm("¡ATENCIÓN! ESTO BORRARÁ TODA LA BASE DE DATOS Y CARGARÁ LOS 532 CLIENTES. ¿Estás seguro?")) return;
    
    setIsProcessing(true);
    try {
      const collectionsToWipe = ['clientes', 'obras', 'presupuestos', 'jornadas', 'stock'];
      
      for (const colName of collectionsToWipe) {
        setStatus(`Borrando colección: ${colName}...`);
        const querySnapshot = await getDocs(collection(db, colName));
        for (const document of querySnapshot.docs) {
           await deleteDoc(document.ref);
        }
      }

      setStatus('Datos de prueba eliminados. Importando 532 clientes de Gesdatta...');
      
      const response = await fetch('/clientes_gesdatta.json');
      const data = await response.json();
      
      const batches = [];
      let currentBatch = writeBatch(db);
      let count = 0;
      
      data.forEach(client => {
        const docRef = doc(collection(db, 'clientes'));
        currentBatch.set(docRef, { ...client, createdAt: new Date() });
        count++;
        if (count === 400) {
          batches.push(currentBatch);
          currentBatch = writeBatch(db);
          count = 0;
        }
      });
      if (count > 0) batches.push(currentBatch);
      
      for (const b of batches) {
         await b.commit();
      }

      setStatus('¡ÉXITO TOTAL! Base limpia y Clientes cargados.');
      alert('Se limpió toda la base de datos y se importaron los clientes correctamente.');
    } catch (e) {
      console.error(e);
      setStatus('Error: Ver consola (F12)');
      alert('Error en el proceso');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
    <div style={{ padding: '1rem', backgroundColor: '#fee2e2', border: '2px solid #ef4444', borderRadius: '8px', marginBottom: '2rem' }}>
      <h3 style={{ color: '#b91c1c', marginTop: 0 }}>🧹 Panel de Limpieza de Lanzamiento</h3>
      <p style={{ fontSize: '0.875rem' }}>Estado: <strong>{status || 'Esperando inicio...'}</strong></p>
      <button 
        onClick={handleWipeAndSeed} 
        disabled={isProcessing}
        style={{ 
          backgroundColor: '#ef4444', color: 'white', border: 'none', padding: '0.75rem 1rem', 
          borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' 
        }}
      >
        {isProcessing ? 'Procesando...' : '⚠️ ELIMINAR DATOS DE PRUEBA Y CARGAR GESDATTA'}
      </button>
    </div>
      
    <div style={{ padding: '1rem', backgroundColor: '#ecfdf5', border: '2px solid #10b981', borderRadius: '8px', marginBottom: '2rem' }}>
      {/* SECCIÓN MIGRAR STOCK GESDATTA */}
      <h3 style={{ color: '#047857', marginTop: 0 }}>📦 Migrar Stock de Gesdatta</h3>
      <p style={{ fontSize: '0.875rem' }}>Añadirá los {status ? '' : ''} 533 elementos a la colección "stock". No borrará nada de lo que ya haya.</p>
      <button 
        onClick={async () => {
          if(!window.confirm("¿Importar los 533 artículos de stock?")) return;
          setIsProcessing(true);
          try {
            setStatus('Importando catalogo_limpio.json...');
            const response = await fetch('/catalogo_limpio.json');
            const data = await response.json();
            
            const batches = [];
            let currentBatch = writeBatch(db);
            let count = 0;
            
            data.forEach(item => {
              const docRef = doc(collection(db, 'stock'));
              currentBatch.set(docRef, { ...item, createdAt: new Date() });
              count++;
              if (count === 400) {
                batches.push(currentBatch);
                currentBatch = writeBatch(db);
                count = 0;
              }
            });
            if (count > 0) batches.push(currentBatch);
            
            for (const b of batches) {
               await b.commit();
            }
            setStatus('¡Stock importado con éxito!');
            alert('Stock cargado correctamente en Firebase.');
          } catch(e) {
            console.error(e);
            setStatus('Error migrando stock');
          } finally {
            setIsProcessing(false);
          }
        }} 
        disabled={isProcessing}
        style={{ 
          backgroundColor: '#059669', color: 'white', border: 'none', padding: '0.75rem 1rem', 
          borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', width: '100%', marginBottom: '1rem'
        }}
      >
        {isProcessing ? 'Procesando...' : 'INYECTAR STOCK AHORA'}
      </button>

      <button 
        onClick={async () => {
          if(!window.confirm("¿Eliminar artículos repetidos en el stock?")) return;
          setIsProcessing(true);
          try {
            setStatus('Buscando repetidos...');
            const querySnapshot = await getDocs(collection(db, 'stock'));
            const items = querySnapshot.docs;
            const seen = new Set();
            const toDelete = [];
            
            items.forEach(document => {
               const data = document.data();
               const key = data.name ? data.name.trim().toLowerCase() : '';
               if (!key) return; // ignore unnamed items
               
               if(seen.has(key)) {
                  toDelete.push(document.ref);
               } else {
                  seen.add(key);
               }
            });

            if (toDelete.length === 0) {
              alert("No hay artículos repetidos.");
              return;
            }

            setStatus(`Eliminando ${toDelete.length} artículos repetidos...`);
            const batches = [];
            let batch = writeBatch(db);
            let count = 0;
            for(const ref of toDelete) {
               batch.delete(ref);
               count++;
               if(count === 400) {
                  batches.push(batch);
                  batch = writeBatch(db);
                  count = 0;
               }
            }
            if(count > 0) batches.push(batch);
            
            for(const b of batches) {
               await b.commit();
            }

            setStatus('¡Repetidos eliminados!');
            alert(`Se eliminaron con éxito ${toDelete.length} artículos duplicados.`);
          } catch(e) {
            console.error(e);
            setStatus('Error deduplicando');
          } finally {
            setIsProcessing(false);
          }
        }} 
        disabled={isProcessing}
        style={{ 
          backgroundColor: '#d97706', color: 'white', border: 'none', padding: '0.75rem 1rem', 
          borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', width: '100%'
        }}
      >
        {isProcessing ? 'Procesando...' : '⚠️ ARREGLAR REPETIDOS AHORA'}
      </button>
    </div>
    </>
  );
};

export default DatabaseWiper;
