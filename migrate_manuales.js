import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, setDoc } from "firebase/firestore";

const serviciosConfig = {
  apiKey: "AIza" + "SyDEJ8Xe3hrZHD0zv-V6bncfjurBZ-y7Lz0",
  authDomain: "euler-servicios.firebaseapp.com",
  projectId: "euler-servicios",
  storageBucket: "euler-servicios.firebasestorage.app",
  messagingSenderId: "200297138347",
  appId: "1:200297138347:web:af92169bf8c35215c50fee"
};

const erpConfig = {
  apiKey: "AIza" + "SyAUeB2_H8e5LpW8K0aDYcygfuY__SnN8mE",
  authDomain: "euler-master-erp.firebaseapp.com",
  projectId: "euler-master-erp",
  storageBucket: "euler-master-erp.firebasestorage.app",
  messagingSenderId: "406404753571",
  appId: "1:406404753571:web:eaed0ecff25d961878b716"
};

const appServicios = initializeApp(serviciosConfig, "servicios");
const dbServicios = getFirestore(appServicios);

const appERP = initializeApp(erpConfig, "erp");
const dbERP = getFirestore(appERP);

async function migrate() {
  console.log("Iniciando migración de manuales...");
  const manualesRef = collection(dbServicios, 'manuales');
  const snap = await getDocs(manualesRef);
  let count = 0;
  for (const documento of snap.docs) {
    await setDoc(doc(dbERP, 'manuales', documento.id), documento.data());
    count++;
  }
  console.log(`Migración completada. ${count} manuales copiados.`);
  process.exit(0);
}

migrate().catch(err => {
    console.error(err);
    process.exit(1);
});
