import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../services/firebaseConfig';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Escuchar el estado de autenticación real de Firebase
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Obtener custom claims para seguridad
          const tokenResult = await user.getIdTokenResult();
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            
            // Asegurar que el dueño siempre sea administrador activo
            if (user.email === 'nicolas@euler.com.ar' && (data.role !== 'administrador' || data.isActive === false)) {
              data.role = 'administrador';
              data.isActive = true;
              await setDoc(doc(db, 'users', user.uid), data);
            }
            
            setCurrentUser({ ...user, ...data, role: data.role || 'tecnico', isActive: data.isActive !== false });
          } else {
            // Documento no existe, lo creamos (esto pasa la primera vez que se registra)
            const isOwner = user.email === 'nicolas@euler.com.ar';
            const newUserProfile = { 
              email: user.email, 
              name: user.email.split('@')[0], 
              role: isOwner ? 'administrador' : 'tecnico', 
              isActive: isOwner ? true : false 
            };
            await setDoc(doc(db, 'users', user.uid), newUserProfile);
            setCurrentUser({ ...user, ...newUserProfile });
          }
        } catch (error) {
          console.error("Error fetching user data from Firestore", error);
          setCurrentUser(user); // fallback
        }
      } else {
        setCurrentUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const register = (email, password) => {
    return createUserWithEmailAndPassword(auth, email, password);
  }

  const loginWithGoogle = () => {
    const provider = new GoogleAuthProvider();
    return signInWithPopup(auth, provider);
  };

  const logout = () => {
    return signOut(auth);
  };

  const value = {
    currentUser,
    login,
    loginWithGoogle,
    register,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
