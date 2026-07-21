import { Routes, Route, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import Header from './components/Header'
import FormularioCliente from './pages/FormularioCliente'
import Admin from './pages/Admin'
import NuevoServicio from './pages/NuevoServicio'
import Clientes from './pages/Clientes'
import ClienteDetalle from './pages/ClienteDetalle'
import Tecnico from './pages/Tecnico'
import TecnicoServicio from './pages/TecnicoServicio'
import CompartirServicio from './pages/CompartirServicio'

export default function App() {
  const navigate = useNavigate()

  useEffect(() => {
    // Si la app se inicia en modo PWA (standalone)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      const mode = localStorage.getItem('euler_device_role')
      if (mode && window.location.pathname === '/') {
        navigate(mode)
      }
    }
  }, [navigate])

  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={<FormularioCliente />} />
        <Route path="/servicios" element={<Admin />} />
        <Route path="/servicios/nuevo" element={<NuevoServicio />} />
        <Route path="/servicios/clientes" element={<Clientes />} />
        <Route path="/servicios/clientes/:id" element={<ClienteDetalle />} />
        <Route path="/tecnico" element={<Tecnico />} />
        <Route path="/tecnico/servicio/:id" element={<TecnicoServicio />} />
        <Route path="/ver/:id" element={<CompartirServicio />} />
      </Routes>
    </>
  )
}
