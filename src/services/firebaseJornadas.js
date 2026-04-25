/**
 * Firebase secundario — Euler Jornadas
 * Conecta al proyecto "eulerjornadas" para leer empleados, obras, jornadas y gastos
 * sin migrar datos. Todo el historial se preserva.
 */
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const jornadasConfig = {
  apiKey: "AIzaSyAmg8089B1e2wII2jSzzvHI0kEi8Sd9Fw0",
  authDomain: "eulerjornadas.firebaseapp.com",
  projectId: "eulerjornadas",
  storageBucket: "eulerjornadas.firebasestorage.app",
  messagingSenderId: "522409849605",
  appId: "1:522409849605:web:d1ac61d47e7c5ae3a97d6c"
};

const jornadasApp = initializeApp(jornadasConfig, "jornadas");
export const dbJornadas = getFirestore(jornadasApp);
export const storageJornadas = getStorage(jornadasApp);
