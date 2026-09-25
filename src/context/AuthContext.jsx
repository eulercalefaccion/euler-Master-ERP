import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../services/firebaseConfig';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const AuthContext = createContext();

// Dueño / Desarrollador (Superadmin único con potestad de autorizar otros administradores)
export const SUPERADMIN_EMAILS = [
  'nicolas@euler.com.ar',
  'info@euler.com.ar',
  'nfayala@gmail.com'
];

// Administradores autorizados explícitamente por el dueño
export const AUTHORIZED_ADMIN_EMAILS = [
  'nicolas@euler.com.ar',
  'info@euler.com.ar',
  'nfayala@gmail.com',
  'admin@eulercalefaccion.com',
  'cindeaalvarez07@gmail.com',
  'agustin.ayala@euler.com.ar'
];

export const isSuperAdminEmail = (email) => {
  if (!email) return false;
  return SUPERADMIN_EMAILS.includes(email.toLowerCase().trim());
};

export const isAuthorizedAdminEmail = (email) => {
  if (!email) return false;
  return AUTHORIZED_ADMIN_EMAILS.includes(email.toLowerCase().trim());
};

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Escuchar el estado de autenticación real de Firebase
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const isSuperAdmin = isSuperAdminEmail(user.email);
          const isAuthorizedAdmin = isAuthorizedAdminEmail(user.email);
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          
          if (userDoc.exists()) {
            const data = userDoc.data();
            
            // Determinar rol efectivo:
            // - Superadmin siempre es 'administrador'
            // - Si es administrador autorizado, mantiene 'administrador'
            // - Nadie más puede asumir 'administrador' a menos que esté autorizado
            let effectiveRole = data.role || 'tecnico';
            if (isSuperAdmin) {
              effectiveRole = 'administrador';
            } else if (effectiveRole === 'administrador' && !isAuthorizedAdmin) {
              console.warn("Usuario no autorizado para rol administrador. Asignando técnico:", user.email);
              effectiveRole = 'tecnico';
            }

            const effectiveActive = isSuperAdmin ? true : (data.isActive !== false);

            if (isSuperAdmin && (data.role !== 'administrador' || data.isActive === false)) {
              data.role = 'administrador';
              data.isActive = true;
              try {
                await setDoc(doc(db, 'users', user.uid), data, { merge: true });
              } catch (writeErr) {
                console.warn("No se pudo actualizar Firestore para el usuario maestro:", writeErr);
              }
            }
            
            setCurrentUser({ 
              ...user, 
              ...data, 
              role: effectiveRole, 
              isActive: effectiveActive 
            });
          } else {
            // Documento no existe, lo creamos (esto pasa la primera vez que se registra)
            const newUserProfile = { 
              email: user.email, 
              name: user.displayName || user.email.split('@')[0], 
              role: isSuperAdmin ? 'administrador' : 'tecnico', 
              isActive: isSuperAdmin ? true : false 
            };
            try {
              await setDoc(doc(db, 'users', user.uid), newUserProfile);
            } catch (createErr) {
              console.warn("No se pudo crear perfil en Firestore:", createErr);
            }
            setCurrentUser({ ...user, ...newUserProfile });
          }
        } catch (error) {
          console.error("Error fetching user data from Firestore", error);
          const isSuperAdmin = isSuperAdminEmail(user?.email);
          setCurrentUser({
            ...user,
            role: isSuperAdmin ? 'administrador' : 'tecnico',
            isActive: true
          });
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

  const isSuperAdmin = isSuperAdminEmail(currentUser?.email);

  const value = {
    currentUser,
    isSuperAdmin,
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
