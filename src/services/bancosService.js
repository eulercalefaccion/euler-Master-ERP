import { db } from './firebaseConfig';
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';

export const BANCOS_INICIALES = [
  {
    id: 'santander-cc-ars',
    nombreBanco: 'Banco Santander Río',
    tipoCuenta: 'Cuenta Corriente',
    numeroCuenta: 'CC-30291-0',
    cbu: '0720000020000003029108',
    alias: 'EULER.SANTANDER',
    moneda: 'ARS',
    saldoInicial: 18100000,
    saldoActual: 18100000,
    empresaId: 'euler-calefaccion',
    activa: true
  },
  {
    id: 'caja-efectivo-ars',
    nombreBanco: 'Caja Efectivo Central',
    tipoCuenta: 'Caja de Efectivo',
    numeroCuenta: 'EFECTIVO-01',
    cbu: '',
    alias: 'CAJA.EULER',
    moneda: 'ARS',
    saldoInicial: 1500000,
    saldoActual: 1500000,
    empresaId: 'euler-calefaccion',
    activa: true
  }
];

export const getCuentasBancarias = async () => {
  try {
    const snap = await getDocs(collection(db, 'cuentas_bancarias'));
    if (snap.empty) {
      for (const bco of BANCOS_INICIALES) {
        await setDoc(doc(db, 'cuentas_bancarias', bco.id), bco);
      }
      return BANCOS_INICIALES;
    }
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('Error al obtener cuentas bancarias:', error);
    return BANCOS_INICIALES;
  }
};

export const crearCuentaBancaria = async (bancoData) => {
  const docRef = await addDoc(collection(db, 'cuentas_bancarias'), {
    ...bancoData,
    saldoActual: Number(bancoData.saldoInicial || 0),
    activa: true,
    createdAt: new Date().toISOString()
  });
  return { id: docRef.id, ...bancoData };
};

export const actualizarCuentaBancaria = async (id, bancoData) => {
  await updateDoc(doc(db, 'cuentas_bancarias', id), bancoData);
};

export const eliminarCuentaBancaria = async (id) => {
  await deleteDoc(doc(db, 'cuentas_bancarias', id));
};
