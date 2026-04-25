/**
 * Firebase secundario — Euler Sueldos
 * Conecta al proyecto "eulersueldos" sin migrar datos
 */
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const sueldosConfig = {
  apiKey: "AIzaSyCG6amjTJWFH5qwf-d1PudXtCgUhBvJgSs",
  authDomain: "eulersueldos.firebaseapp.com",
  projectId: "eulersueldos",
  storageBucket: "eulersueldos.firebasestorage.app",
  messagingSenderId: "76035111412",
  appId: "1:76035111412:web:e0db4ecf1498c238de21a1"
};

const sueldosApp = initializeApp(sueldosConfig, "sueldos");
export const dbSueldos = getFirestore(sueldosApp);
