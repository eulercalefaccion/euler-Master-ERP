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
      
      {/* SECCIÓN MIGRAR STOCK GESDATTA */}
      <hr style={{margin: '20px 0'}} />
      <h3 style={{ color: '#047857', marginTop: 0 }}>📦 Migrar Stock de Gesdatta</h3>
      <p style={{ fontSize: '0.875rem' }}>Añadirá los 533 elementos a la colección "stock". No borrará nada de lo que ya haya.</p>
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
          borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' 
        }}
      >
        {isProcessing ? 'Procesando...' : 'INYECTAR STOCK AHORA'}
      </button>
    </div>
  );
};

export default DatabaseWiper;
