import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { JornadasProvider } from './context/JornadasContext';
import { useAuth } from './context/AuthContext';
import { TecnicosProvider } from './servicios_app/components/PinLock';
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
import Reportes from './pages/Reportes/Reportes';
import Configuracion from './pages/Configuracion/Configuracion';
import ServiciosTecnicos from './servicios_app/pages/Admin';
import ServiciosClientes from './servicios_app/pages/Clientes';
import ClienteDetalle from './servicios_app/pages/ClienteDetalle';
import NuevoServicio from './servicios_app/pages/NuevoServicio';

// Rutas Privadas
const PrivateRoute = ({ children, requiredRole }) => {
  const { currentUser, logout } = useAuth();
  
  if (!currentUser) return <Navigate to="/login" />;
  
  if (currentUser.isActive === false) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)', padding: '2rem', textAlign: 'center' }}>
        <h2 style={{ color: 'var(--primary-700)', marginBottom: '1rem' }}>Cuenta Inactiva</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', maxWidth: '400px' }}>Tu cuenta está inactiva o pendiente de aprobación. Por favor, contacta a un administrador para que habilite tu acceso al sistema.</p>
        <button onClick={logout} className="btn btn-primary">Cerrar Sesión</button>
      </div>
    );
  }

  if (requiredRole && currentUser.role !== requiredRole) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)', padding: '2rem', textAlign: 'center' }}>
        <h2 style={{ color: 'var(--accent-600)', marginBottom: '1rem' }}>Acceso Denegado</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', maxWidth: '400px' }}>No tienes los permisos necesarios para acceder a esta sección.</p>
        <a href="/" className="btn btn-primary">Volver al Inicio</a>
      </div>
    );
  }

  return <MainLayout>{children}</MainLayout>;
};

function App() {
  const { currentUser } = useAuth();

  return (
    <TecnicosProvider>
    <JornadasProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={currentUser ? <Navigate to="/" /> : <Login />} />
        <Route path="/encuesta/:id" element={<EncuestaObra />} />
        <Route path="/presupuesto" element={<FormularioPublico />} />
        <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/clientes" element={<PrivateRoute><Clientes /></PrivateRoute>} />
        <Route path="/servicios" element={<PrivateRoute><ServiciosTecnicos /></PrivateRoute>} />
        <Route path="/servicios/clientes" element={<PrivateRoute><ServiciosClientes /></PrivateRoute>} />
        <Route path="/servicios/clientes/:id" element={<PrivateRoute><ClienteDetalle /></PrivateRoute>} />
        <Route path="/servicios/nuevo" element={<PrivateRoute><NuevoServicio /></PrivateRoute>} />
        <Route path="/presupuestos" element={<PrivateRoute><PresupuestosCRM /></PrivateRoute>} />
        <Route path="/obras" element={<PrivateRoute><Obras /></PrivateRoute>} />
        <Route path="/stock" element={<PrivateRoute><Stock /></PrivateRoute>} />
        <Route path="/lista-precios" element={<PrivateRoute><ListaPrecios /></PrivateRoute>} />
        <Route path="/estandares" element={<PrivateRoute><Estandares /></PrivateRoute>} />
        <Route path="/jornadas" element={<PrivateRoute><Jornadas /></PrivateRoute>} />
        <Route path="/personas" element={<PrivateRoute><Personas /></PrivateRoute>} />
        <Route path="/balance" element={<PrivateRoute><Balance /></PrivateRoute>} />
        <Route path="/sueldos" element={<PrivateRoute><Sueldos /></PrivateRoute>} />
        <Route path="/reportes" element={<PrivateRoute><Reportes /></PrivateRoute>} />
        <Route path="/papelera" element={<PrivateRoute><Papelera /></PrivateRoute>} />
        <Route path="/configuracion" element={<PrivateRoute requiredRole="administrador"><Configuracion /></PrivateRoute>} />
      </Routes>
    </BrowserRouter>
    </JornadasProvider>
    </TecnicosProvider>
  );
}

export default App;
