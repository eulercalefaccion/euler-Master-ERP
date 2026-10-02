import { db } from './firebaseConfig';
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';

export const EMPRESAS_INICIALES = [
  {
    id: 'ayala-nicolas',
    nombre: 'AYALA NICOLAS FEDERICO',
    razonSocial: 'AYALA NICOLAS FEDERICO',
    cuit: '20-31627562-2',
    condicionFiscal: 'Responsable Inscripto',
    puntosVenta: [1, 2],
    direccion: 'San Marcos 2760 M:24, Roldán, Santa Fe',
    activa: true
  },
  {
    id: 'euler-calefaccion',
    nombre: 'EULER CALEFACCIÓN (Canal 2 / Informal)',
    razonSocial: 'Euler Calefacción',
    cuit: '',
    condicionFiscal: 'Consumidor Final / Informal',
    puntosVenta: [1],
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
      for (const emp of EMPRESAS_INICIALES) {
        await setDoc(doc(db, 'empresas', emp.id), emp);
      }
      return EMPRESAS_INICIALES;
    }
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Asegurar que Ayala Nicolas Federico tenga el CUIT real 20-31627562-2 y esté prioritario
    const ayala = docs.find(d => d.id === 'ayala-nicolas' || /ayala/i.test(d.nombre));
    if (ayala && ayala.cuit !== '20-31627562-2') {
      ayala.cuit = '20-31627562-2';
      ayala.nombre = 'AYALA NICOLAS FEDERICO';
      ayala.razonSocial = 'AYALA NICOLAS FEDERICO';
      updateDoc(doc(db, 'empresas', ayala.id), { 
        cuit: '20-31627562-2', 
        nombre: 'AYALA NICOLAS FEDERICO',
        razonSocial: 'AYALA NICOLAS FEDERICO'
      }).catch(console.warn);
    }

    // Ordenar para que AYALA NICOLAS FEDERICO figure primero por defecto
    docs.sort((a, b) => (a.id === 'ayala-nicolas' ? -1 : b.id === 'ayala-nicolas' ? 1 : 0));
    return docs;
  } catch (error) {
    console.error('Error al obtener empresas:', error);
    return EMPRESAS_INICIALES;
  }
};

export const crearEmpresa = async (empresaData) => {
  const docRef = await addDoc(collection(db, 'empresas'), {
    ...empresaData,
    activa: true,
    createdAt: new Date().toISOString()
  });
  return { id: docRef.id, ...empresaData };
};

export const actualizarEmpresa = async (id, empresaData) => {
  await updateDoc(doc(db, 'empresas', id), empresaData);
};

export const eliminarEmpresa = async (id) => {
  await deleteDoc(doc(db, 'empresas', id));
};
