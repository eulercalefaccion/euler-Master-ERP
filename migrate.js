import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, setDoc } from "firebase/firestore";

const configServicios = {
  apiKey: "AIzaSyDEJ8Xe3hrZHD0zv-V6bncfjurBZ-y7Lz0",
  authDomain: "euler-servicios.firebaseapp.com",
  projectId: "euler-servicios",
  storageBucket: "euler-servicios.firebasestorage.app",
  messagingSenderId: "200297138347",
  appId: "1:200297138347:web:af92169bf8c35215c50fee"
};

const configERP = {
  apiKey: "AIzaSyAUeB2_H8e5LpW8K0aDYcygfuY__SnN8mE",
  authDomain: "euler-master-erp.firebaseapp.com",
  projectId: "euler-master-erp",
  storageBucket: "euler-master-erp.firebasestorage.app",
  messagingSenderId: "406404753571",
  appId: "1:406404753571:web:eaed0ecff25d961878b716"
};

const appServicios = initializeApp(configServicios, "servicios");
const dbServicios = getFirestore(appServicios);

const appERP = initializeApp(configERP, "erp");
const dbERP = getFirestore(appERP);

async function migrateCollection(collectionName, transformFn = null) {
  console.log(`Migrando colección: ${collectionName}`);
  const snap = await getDocs(collection(dbServicios, collectionName));
  let count = 0;
  for (const document of snap.docs) {
    let data = document.data();
    if (transformFn) {
      data = transformFn(data);
    }
    // Set document with same ID to preserve relationships
    await setDoc(doc(dbERP, collectionName, document.id), data);
    count++;
  }
  console.log(`Colección ${collectionName} migrada con ${count} documentos.`);
}

async function run() {
  try {
    await migrateCollection('clientes', (data) => {
      // Si el cliente no tiene type, le ponemos Cliente SSTT para que el ERP lo reconozca
      // Y mapeamos nombreCompleto a name si es necesario
      return {
        ...data,
        type: 'Cliente SSTT',
        name: data.nombreCompleto || `${data.nombre} ${data.apellido || ''}`.trim(),
        phone: data.telefono || '',
        location: data.localidad || ''
      };
    });
    await migrateCollection('servicios');
    await migrateCollection('tecnicos');
    console.log("Migración completada exitosamente.");
    process.exit(0);
  } catch (err) {
    console.error("Error en migración:", err);
    process.exit(1);
  }
}

run();
