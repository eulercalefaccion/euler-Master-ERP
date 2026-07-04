import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, deleteDoc, doc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAUeB2_H8e5LpW8K0aDYcygfuY__SnN8mE",
  authDomain: "euler-master-erp.firebaseapp.com",
  projectId: "euler-master-erp",
  storageBucket: "euler-master-erp.firebasestorage.app",
  messagingSenderId: "406404753571",
  appId: "1:406404753571:web:eaed0ecff25d961878b716"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function clean() {
  console.log("Fetching presupuestos...");
  const snap = await getDocs(collection(db, "presupuestos"));
  let deleted = 0;
  
  for (const document of snap.docs) {
    const data = document.data();
    const dataStr = JSON.stringify(data).toLowerCase();
    
    // Si contiene "test" y NO contiene "tomas", lo borramos
    if (dataStr.includes("test") || (!dataStr.includes("tomas") && dataStr.includes("test"))) {
      console.log(`Borrando documento ${document.id}...`);
      await deleteDoc(doc(db, "presupuestos", document.id));
      deleted++;
    } else if (!dataStr.includes("tomas") && !dataStr.includes("test")) {
        // También podríamos borrar si no dice tomas por si acaso, pero seamos seguros
        // Si el usuario dijo "deja solamente la de tomas y limpia los test"
        // Borramos si la data NO dice "tomas"
        console.log(`Borrando documento ${document.id} (no es de tomas)...`);
        await deleteDoc(doc(db, "presupuestos", document.id));
        deleted++;
    }
  }
  
  console.log(`Limpieza terminada. Se borraron ${deleted} presupuestos de prueba.`);
  process.exit(0);
}

clean().catch(console.error);
