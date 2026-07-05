import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { JornadasProvider } from './context/JornadasContext';
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
import ListaPrecios from './pages/ListaPrecios/ListaPrecios';
import EncuestaObra from './pages/EncuestaObra/EncuestaObra';
import Papelera from './pages/Papelera/Papelera';
import Estandares from './pages/Estandares/Estandares';
import FormularioPublico from './pages/PublicForm/FormularioPublico';

// Rutas Privadas
const PrivateRoute = ({ children }) => {
  const { currentUser } = useAuth();
  return currentUser ? <MainLayout>{children}</MainLayout> : <Navigate to="/login" />;
};

function App() {
  const { currentUser } = useAuth();

  return (
    <JornadasProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={currentUser ? <Navigate to="/" /> : <Login />} />
        <Route path="/encuesta/:id" element={<EncuestaObra />} />
        <Route path="/presupuesto" element={<FormularioPublico />} />
        <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/clientes" element={<PrivateRoute><Clientes /></PrivateRoute>} />
        <Route path="/presupuestos" element={<PrivateRoute><PresupuestosCRM /></PrivateRoute>} />
        <Route path="/obras" element={<PrivateRoute><Obras /></PrivateRoute>} />
        <Route path="/stock" element={<PrivateRoute><Stock /></PrivateRoute>} />
        <Route path="/lista-precios" element={<PrivateRoute><ListaPrecios /></PrivateRoute>} />
        <Route path="/estandares" element={<PrivateRoute><Estandares /></PrivateRoute>} />
        <Route path="/jornadas" element={<PrivateRoute><Jornadas /></PrivateRoute>} />
        <Route path="/personas" element={<PrivateRoute><Personas /></PrivateRoute>} />
        <Route path="/balance" element={<PrivateRoute><Balance /></PrivateRoute>} />
        <Route path="/sueldos" element={<PrivateRoute><Sueldos /></PrivateRoute>} />
        <Route path="/papelera" element={<PrivateRoute><Papelera /></PrivateRoute>} />
      </Routes>
    </BrowserRouter>
    </JornadasProvider>
  );
}

export default App;
