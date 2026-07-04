import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';

/**
 * Gets the next sequence number for a given entity type (presupuestos or obras).
 * Uses a Firestore transaction to guarantee atomicity and sequential numbers.
 * 
 * @param {string} counterName - The field name in the counters document (e.g., 'presupuestosSeq', 'obrasSeq')
 * @returns {Promise<number>} - The next sequence number
 */
export const getNextSequenceValue = async (counterName) => {
  const counterRef = doc(db, 'metadata', 'counters');
  
  try {
    const newSeq = await runTransaction(db, async (transaction) => {
      const sfDoc = await transaction.get(counterRef);
      
      if (!sfDoc.exists()) {
        // Initialize if not exists with base values
        const initialValues = {
          presupuestosSeq: 1443,
          obrasSeq: 356
        };
        transaction.set(counterRef, initialValues);
        return initialValues[counterName] || 1;
      }
      
      const data = sfDoc.data();
      const currentVal = data[counterName] || 0;
      let nextVal = currentVal + 1;
      
      // Enforce minimum values specified by user requirements
      if (counterName === 'presupuestosSeq' && nextVal < 1443) nextVal = 1443;
      if (counterName === 'obrasSeq' && nextVal < 356) nextVal = 356;
      
      transaction.update(counterRef, { [counterName]: nextVal });
      return nextVal;
    });
    
    return newSeq;
  } catch (e) {
    console.error("Transaction failed: ", e);
    throw e;
  }
};

/**
 * Formats a sequence number into a PRE string
 * @param {number} seq - Sequence number
 * @returns {string} - Formatted string like PRE-2026-1443
 */
export const formatPresupuestoNumber = (seq) => {
  const year = new Date().getFullYear();
  const numStr = String(seq).padStart(4, '0');
  return `PRE-${year}-${numStr}`;
};

/**
 * Formats a sequence number into an OT string
 * @param {number} seq - Sequence number
 * @returns {string} - Formatted string like OT-2026-000356
 */
export const formatObraNumber = (seq) => {
  const year = new Date().getFullYear();
  const numStr = String(seq).padStart(6, '0');
  return `OT-${year}-${numStr}`;
};
