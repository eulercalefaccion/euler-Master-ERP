import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { BookUser } from 'lucide-react';
import { JornadasProvider } from './context/JornadasContext';
import { useAuth, isSuperAdminEmail } from './context/AuthContext';
import { TecnicosProvider } from './servicios_app/components/PinLock';
import MainLayout from './layouts/MainLayout';
import PresupuestosCRM from './pages/Presupuestos/PresupuestosCRM';
import Clientes from './pages/Clientes/Clientes';
import ClienteDetalleERP from './pages/Clientes/ClienteDetalleERP';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard/Dashboard';
import Obras from './pages/Obras/Obras';
import RentabilidadObras from './pages/Obras/RentabilidadObras';
import Stock from './pages/Stock/Stock';
import Jornadas from './pages/Jornadas/Jornadas';
import Colaboradores from './pages/Colaboradores/Colaboradores';
import Balance from './pages/Balance/Balance';
import Sueldos from './pages/Sueldos/Sueldos';
import ListaPrecios from './pages/ListaPrecios/ListaPrecios';
import EncuestaObra from './pages/EncuestaObra/EncuestaObra';
import FirmaRemitoPublica from './pages/Remitos/FirmaRemitoPublica';
import Papelera from './pages/Papelera/Papelera';
import Estandares from './pages/Estandares/Estandares';
import FormularioPublico from './pages/PublicForm/FormularioPublico';
import Reportes from './pages/Reportes/Reportes';
import Configuracion from './pages/Configuracion/Configuracion';
import BalanceTermico from './pages/BalanceTermico/BalanceTermico';
import ServiciosTecnicos from './servicios_app/pages/Admin';
import ServiciosClientes from './servicios_app/pages/Clientes';
import ClienteDetalle from './servicios_app/pages/ClienteDetalle';
import NuevoServicio from './servicios_app/pages/NuevoServicio';
import CompartirServicio from './servicios_app/pages/CompartirServicio';

import Compras from './pages/Compras/Compras';
import VentasCobranzas from './pages/Ventas/VentasCobranzas';
import Tesoreria from './pages/Tesoreria/Tesoreria';
import Contabilidad from './pages/Contabilidad/Contabilidad';
import FlujoFondos from './pages/FlujoFondos/FlujoFondos';
import MigracionGesDatta from './pages/Migracion/MigracionGesDatta';
import Articulos from './pages/Articulos/Articulos';

import './servicios_app/index.css';

// Rutas Privadas
const PrivateRoute = ({ children, requiredRole }) => {
  const { currentUser, logout } = useAuth();
  
  if (!currentUser) return <Navigate to="/login" />;
  
  const isSuperAdmin = isSuperAdminEmail(currentUser.email);
  const isAdmin = currentUser.role === 'administrador' || isSuperAdmin;

  if (currentUser.isActive === false && !isSuperAdmin) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)', padding: '2rem', textAlign: 'center' }}>
        <h2 style={{ color: 'var(--primary-700)', marginBottom: '1rem' }}>Cuenta Inactiva</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', maxWidth: '400px' }}>Tu cuenta está inactiva o pendiente de aprobación. Por favor, contacta a un administrador para que habilite tu acceso al sistema.</p>
        <button onClick={logout} className="btn btn-primary">Cerrar Sesión</button>
      </div>
    );
  }

  if (requiredRole && currentUser.role !== requiredRole && !isAdmin) {
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

/**
 * /facturas = "Ventas y Facturación". Compatibilidad con links anteriores:
 *  - ?tab=recibos            → /tesoreria?tab=cobranzas
 *  - ?tab=cuentas o ?cliente → /cuentas-corrientes (conserva ?cliente)
 */
const FacturasRoute = () => {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const tab = params.get('tab');
  if (tab === 'recibos') return <Navigate to="/tesoreria?tab=cobranzas" replace />;
  if (tab === 'cuentas' || params.get('cliente')) {
    params.delete('tab');
    const qs = params.toString();
    return <Navigate to={`/cuentas-corrientes${qs ? `?${qs}` : ''}`} replace />;
  }
  return (
    <PrivateRoute>
      <VentasCobranzas key="ventas" tabs={['comprobantes']} titulo="Ventas y Facturación" subtitulo="Facturas, notas de crédito y comprobantes ARCA" />
    </PrivateRoute>
  );
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
        <Route path="/remito/:id" element={<FirmaRemitoPublica />} />
        <Route path="/presupuesto" element={<FormularioPublico />} />
        <Route path="/ver/:id" element={<div className="servicios-app"><CompartirServicio /></div>} />
        <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/clientes" element={<PrivateRoute><Clientes /></PrivateRoute>} />
        <Route path="/clientes/:id" element={<PrivateRoute><ClienteDetalleERP /></PrivateRoute>} />
        <Route path="/compras" element={<PrivateRoute><Compras /></PrivateRoute>} />
        <Route path="/ventas" element={<Navigate to="/facturas" replace />} />
        <Route path="/facturas" element={<FacturasRoute />} />
        <Route path="/cuentas-corrientes" element={<PrivateRoute><VentasCobranzas key="cuentas" tabs={['cuentas']} titulo="Cuentas Corrientes" subtitulo="Saldo de cada cliente: qué facturamos, qué cobró y qué debe" icono={BookUser} /></PrivateRoute>} />
        <Route path="/listado-presupuestos" element={<Navigate to="/presupuestos?vista=listado" replace />} />
        <Route path="/tesoreria" element={<PrivateRoute><Tesoreria /></PrivateRoute>} />
        <Route path="/flujo-fondos" element={<PrivateRoute><FlujoFondos /></PrivateRoute>} />
        <Route path="/contabilidad" element={<PrivateRoute><Contabilidad /></PrivateRoute>} />
        <Route path="/migracion-gesdatta" element={<PrivateRoute requiredRole="administrador"><MigracionGesDatta /></PrivateRoute>} />
        <Route path="/servicios" element={<PrivateRoute><div className="servicios-app"><ServiciosTecnicos /></div></PrivateRoute>} />
        <Route path="/servicios/clientes" element={<PrivateRoute><div className="servicios-app"><ServiciosClientes /></div></PrivateRoute>} />
        <Route path="/servicios/clientes/:id" element={<PrivateRoute><div className="servicios-app"><ClienteDetalle /></div></PrivateRoute>} />
        <Route path="/servicios/nuevo" element={<PrivateRoute><div className="servicios-app"><NuevoServicio /></div></PrivateRoute>} />
        <Route path="/presupuestos" element={<PrivateRoute><PresupuestosCRM /></PrivateRoute>} />
        <Route path="/obras" element={<PrivateRoute><Obras /></PrivateRoute>} />
        <Route path="/rentabilidad-obras" element={<PrivateRoute requiredRole="administrador"><RentabilidadObras /></PrivateRoute>} />
        <Route path="/stock" element={<PrivateRoute><Stock /></PrivateRoute>} />
        <Route path="/lista-precios" element={<PrivateRoute><ListaPrecios /></PrivateRoute>} />
        <Route path="/estandares" element={<PrivateRoute><Estandares /></PrivateRoute>} />
        <Route path="/articulos" element={<PrivateRoute><Articulos /></PrivateRoute>} />
        <Route path="/jornadas" element={<PrivateRoute><Jornadas /></PrivateRoute>} />
        <Route path="/colaboradores" element={<PrivateRoute><Colaboradores /></PrivateRoute>} />
        <Route path="/personas" element={<Navigate to="/colaboradores" replace />} />
        <Route path="/balance" element={<PrivateRoute><Balance /></PrivateRoute>} />
        <Route path="/balance-termico" element={<PrivateRoute><BalanceTermico /></PrivateRoute>} />
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
