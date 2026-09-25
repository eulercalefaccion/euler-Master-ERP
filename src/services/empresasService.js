import { db } from './firebaseConfig';
import { collection, getDocs, addDoc, doc, updateDoc, setDoc } from 'firebase/firestore';

export const EMPRESAS_INICIALES = [
  {
    id: 'euler-calefaccion',
    nombre: 'EULER CALEFACCIÓN',
    razonSocial: 'Euler Calefacción S.A.S.',
    cuit: '30-71654321-9',
    condicionFiscal: 'Responsable Inscripto',
    puntosVenta: [1, 6, 15],
    direccion: 'Rosario, Santa Fe',
    activa: true
  },
  {
    id: 'ayala-nicolas',
    nombre: 'Ayala Nicolas Federico',
    razonSocial: 'Ayala Nicolas Federico',
    cuit: '20-33445566-7',
    condicionFiscal: 'Responsable Inscripto',
    puntosVenta: [1, 2],
    direccion: 'Rosario, Santa Fe',
    activa: true
  },
  {
    id: 'euler-general',
    nombre: 'EULER SRL / General',
    razonSocial: 'Euler SRL',
    cuit: '30-71998877-5',
    condicionFiscal: 'Responsable Inscripto',
    puntosVenta: [1],
    direccion: 'Rosario, Santa Fe',
    activa: true
  }
];

export const getEmpresas = async () => {
  try {
    const snap = await getDocs(collection(db, 'empresas'));
    if (snap.empty) {
      // Seed inicial
      for (const emp of EMPRESAS_INICIALES) {
        await setDoc(doc(db, 'empresas', emp.id), emp);
      }
      return EMPRESAS_INICIALES;
    }
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('Error al obtener empresas:', error);
    return EMPRESAS_INICIALES;
  }
};
