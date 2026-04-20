import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import MainLayout from './layouts/MainLayout';
import PresupuestosCRM from './pages/Presupuestos/PresupuestosCRM';
import Clientes from './pages/Clientes/Clientes';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard/Dashboard';
import Obras from './pages/Obras/Obras';
import Stock from './pages/Stock/Stock';
import Jornadas from './pages/Jornadas/Jornadas';
import Personas from './pages/Personas/Personas';
import Balance from './pages/Balance/Balance';
import Sueldos from './pages/Sueldos/Sueldos';

// Rutas Privadas
const PrivateRoute = ({ children }) => {
  const { currentUser } = useAuth();
  return currentUser ? <MainLayout>{children}</MainLayout> : <Navigate to="/login" />;
};

function App() {
  const { currentUser } = useAuth();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={currentUser ? <Navigate to="/" /> : <Login />} />
        <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/clientes" element={<PrivateRoute><Clientes /></PrivateRoute>} />
        <Route path="/presupuestos" element={<PrivateRoute><PresupuestosCRM /></PrivateRoute>} />
        <Route path="/obras" element={<PrivateRoute><Obras /></PrivateRoute>} />
        <Route path="/stock" element={<PrivateRoute><Stock /></PrivateRoute>} />
        <Route path="/jornadas" element={<PrivateRoute><Jornadas /></PrivateRoute>} />
        <Route path="/personas" element={<PrivateRoute><Personas /></PrivateRoute>} />
        <Route path="/balance" element={<PrivateRoute><Balance /></PrivateRoute>} />
        <Route path="/sueldos" element={<PrivateRoute><Sueldos /></PrivateRoute>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
