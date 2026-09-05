import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  doc, onSnapshot, updateDoc, collection, query, where, arrayUnion
} from 'firebase/firestore';
import { db } from '../../services/firebaseConfig';
import { useAuth } from '../../context/AuthContext';
import {
  ArrowLeft, User, Building, Phone, Mail, MapPin, Calendar, Wrench,
  FileText, CheckCircle2, Clock, AlertCircle, MessageSquare, Plus,
  Edit2, Trash2, Camera, Download, ExternalLink, ShieldAlert, Layers,
  Search, Play, Send, Save, X, ChevronRight, HardHat, DollarSign
} from 'lucide-react';
import MediaLightbox from '../../servicios_app/components/MediaLightbox';

function formatFecha(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatFechaHora(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatMoney(val) {
  const n = parseFloat(val) || 0;
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const IVA = 0.21;
function calcTotal(materiales, manoObra) {
  const mat = (materiales || []).reduce((a, m) => a + (parseFloat(m.precio) || 0) * (parseFloat(m.cant) || 1), 0);
  const mo = (manoObra || []).reduce((a, m) => a + (parseFloat(m.precio) || 0), 0);
  const neto = mat + mo;
  return { neto, conIVA: neto * (1 + IVA) };
}

export default function ClienteDetalleERP() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const isTecnico = currentUser?.role === 'tecnico' || currentUser?.rol === 'tecnico';

  const [cliente, setCliente] = useState(null);
  const [loading, setLoading] = useState(true);
  const [servicios, setServicios] = useState([]);
  const [obras, setObras] = useState([]);
  const [presupuestos, setPresupuestos] = useState([]);
  
  // Tabs: 'timeline' | 'servicios' | 'obras' | 'presupuestos' | 'bitacora' | 'multimedia'
  const [activeTab, setActiveTab] = useState('timeline');

  // Media lightbox
  const [mediaActivo, setMediaActivo] = useState(null);

  // Modal edición
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({});
  const [isSavingCliente, setIsSavingCliente] = useState(false);

  // Nueva anotación en bitácora
  const [nuevaAnotacion, setNuevaAnotacion] = useState('');
  const [isSavingAnotacion, setIsSavingAnotacion] = useState(false);

  // Escuchar datos del cliente
  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, 'clientes', id), (snap) => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() };
        setCliente(data);
        setEditFormData({
          name: data.name || data.nombre || '',
          type: data.type || 'Propietario',
          phone: data.phone || data.telefono || '',
          email: data.email || '',
          address: data.address || data.direccion || '',
          location: data.location || data.localidad || '',
          cuit: data.cuit || '',
          dni: data.dni || '',
          contactoNombre: data.contactoNombre || '',
          contactoTelefono: data.contactoTelefono || '',
          priceList: data.priceList || 'Consumidor Final',
        });
      } else {
        setCliente(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [id]);

  // Escuchar Servicios Técnicos
  useEffect(() => {
    if (!id) return;
    const q = query(collection(db, 'servicios'), where('clienteId', '==', id));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const tA = a.creadoEn?.toMillis ? a.creadoEn.toMillis() : new Date(a.creadoEn || 0).getTime();
        const tB = b.creadoEn?.toMillis ? b.creadoEn.toMillis() : new Date(b.creadoEn || 0).getTime();
        return tB - tA;
      });
      setServicios(list);
    });
    return () => unsub();
  }, [id]);

  // Escuchar Obras
  useEffect(() => {
    if (!id) return;
    const q = query(collection(db, 'obras'));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(o => {
          if (o.deleted) return false;
          if (o.clientId === id || o.clienteId === id) return true;
          if (cliente?.name && o.clientName && o.clientName.trim().toLowerCase() === cliente.name.trim().toLowerCase()) return true;
          if (cliente?.nombre && o.clientName && o.clientName.trim().toLowerCase() === cliente.nombre.trim().toLowerCase()) return true;
          return false;
        });
      list.sort((a, b) => {
        const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
        const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
        return tB - tA;
      });
      setObras(list);
    });
    return () => unsub();
  }, [id, cliente?.name, cliente?.nombre]);

  // Escuchar Presupuestos (Solo si NO es técnico)
  useEffect(() => {
    if (!id || isTecnico) return;
    const q = query(collection(db, 'presupuestos'));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(p => {
          if (p.deleted) return false;
          if (p.clientId === id || p.clienteId === id) return true;
          const presName = (p.clientName || p.name || '').trim().toLowerCase();
          if (cliente?.name && presName === cliente.name.trim().toLowerCase()) return true;
          if (cliente?.nombre && presName === cliente.nombre.trim().toLowerCase()) return true;
          return false;
        });
      list.sort((a, b) => {
        const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
        const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
        return tB - tA;
      });
      setPresupuestos(list);
    });
    return () => unsub();
  }, [id, isTecnico, cliente?.name, cliente?.nombre]);

  // Colección de todos los medios (fotos/videos) para galería y lightbox
  const todosMedios = useMemo(() => {
    const arr = [];
    servicios.forEach(s => {
      if (s.fotoURL) {
        arr.push({
          url: s.fotoURL,
          tipo: 'foto',
          info: 'Foto cliente · ST-' + (s.numeroST || 'S/N'),
          fecha: s.creadoEn,
          tecnico: 'Cliente'
        });
      }
      (s.fotosHecnico || []).forEach(f => {
        const esVideo = f.url?.toLowerCase().includes('/video/upload/') || f.url?.match(/\.(mp4|webm|ogg|mov|avi)($|\?)/i);
        const tec = f.tecnico || s.tecnicoVisito || s.tecnico || 'Técnico';
        arr.push({
          url: f.url,
          tipo: esVideo ? 'video' : 'foto',
          info: (f.tipo || 'Evidencia') + ' por ' + tec + ' · ST-' + (s.numeroST || 'S/N'),
          fecha: f.fecha || s.creadoEn,
          tecnico: tec,
          servicioST: s.numeroST
        });
      });
    });
    return arr;
  }, [servicios]);

  // Línea de tiempo 360° unificada
  const timelineEvents = useMemo(() => {
    const evs = [];

    // 1. Servicios Técnicos
    servicios.forEach(s => {
      const tCreacion = s.creadoEn ? (s.creadoEn.toDate ? s.creadoEn.toDate() : new Date(s.creadoEn)) : new Date(0);
      evs.push({
        id: s.id + '-creado',
        tipo: 'servicio_creado',
        fecha: tCreacion,
        titulo: 'Solicitud de Servicio ST-' + (s.numeroST || 'S/N'),
        color: '#E65100',
        icono: '🔧',
        servicio: s,
        descripcion: s.descripcion || 'Sin descripción ingresada'
      });

      if (s.horaLlegada) {
        const tVisita = new Date(s.horaLlegada);
        const tecVisita = s.tecnicoVisito || s.tecnico || 'Técnico';
        evs.push({
          id: s.id + '-visita',
          tipo: 'visita',
          fecha: tVisita,
          titulo: 'Visita a Domicilio - ' + tecVisita,
          color: '#2980B9',
          icono: '📍',
          servicio: s,
          tecnico: tecVisita
        });
      }

      if (s.notaVozURL) {
        const tNota = s.notaVozFecha ? new Date(s.notaVozFecha) : tCreacion;
        evs.push({
          id: s.id + '-audio',
          tipo: 'nota_voz',
          fecha: tNota,
          titulo: 'Nota de Voz Técnica',
          color: '#8E44AD',
          icono: '🎙️',
          servicio: s,
          data: { audioURL: s.notaVozURL, transcripcion: s.notaVozTranscripcion }
        });
      }

      (s.fotosHecnico || []).forEach((f, idx) => {
        const tFoto = f.fecha ? new Date(f.fecha) : tCreacion;
        const tec = f.tecnico || s.tecnicoVisito || s.tecnico || 'Técnico';
        evs.push({
          id: s.id + '-foto-' + idx,
          tipo: 'foto',
          fecha: tFoto,
          titulo: 'Evidencia Multimedia por ' + tec,
          color: '#16A085',
          icono: '📷',
          servicio: s,
          data: { ...f, tecnico: tec }
        });
      });

      if (s.diagnostico || s.estado === 'resuelto' || (s.materiales && s.materiales.length > 0)) {
        const tResolucion = s.fechaDiagnostico ? new Date(s.fechaDiagnostico) : (s.actualizadoEn?.toDate ? s.actualizadoEn.toDate() : tCreacion);
        const tecDiag = s.tecnicoDiagnostico || s.tecnicoVisito || s.tecnico || 'Técnico';
        evs.push({
          id: s.id + '-resolucion',
          tipo: 'resolucion',
          fecha: tResolucion,
          titulo: 'Diagnóstico y Resolución (' + tecDiag + ')',
          color: s.estado === 'resuelto' ? '#27AE60' : '#D97706',
          icono: '📋',
          servicio: s,
          tecnico: tecDiag
        });
      }
    });

    // 2. Obras
    obras.forEach(o => {
      const tObra = o.createdAt ? (o.createdAt.toDate ? o.createdAt.toDate() : new Date(o.createdAt)) : new Date(0);
      evs.push({
        id: 'obra-' + o.id,
        tipo: 'obra',
        fecha: tObra,
        titulo: 'Obra: ' + (o.name || 'Nueva Obra'),
        color: '#2563EB',
        icono: '🏗️',
        obra: o
      });

      (o.bitacoraHistory || []).forEach((b, bIdx) => {
        const tB = b.fecha ? new Date(b.fecha) : tObra;
        evs.push({
          id: 'obra-' + o.id + '-bitacora-' + bIdx,
          tipo: 'obra_bitacora',
          fecha: tB,
          titulo: 'Avance de Obra (' + (b.autor || 'Colaborador') + ')',
          color: '#3B82F6',
          icono: '📝',
          obra: o,
          data: b
        });
      });
    });

    // 3. Presupuestos (Solo si NO es técnico)
    if (!isTecnico) {
      presupuestos.forEach(p => {
        const tP = p.createdAt ? (p.createdAt.toDate ? p.createdAt.toDate() : new Date(p.createdAt)) : new Date(0);
        evs.push({
          id: 'pres-' + p.id,
          tipo: 'presupuesto',
          fecha: tP,
          titulo: 'Presupuesto #' + (p.presupuestoNumber || p.id.slice(0, 6)) + ' (' + (p.status || 'Pendiente') + ')',
          color: '#059669',
          icono: '💼',
          presupuesto: p
        });
      });
    }

    // 4. Anotaciones / Bitácora General del Cliente
    (cliente?.anotacionesHistorial || []).forEach((a, aIdx) => {
      const tA = a.fecha ? new Date(a.fecha) : new Date();
      evs.push({
        id: 'anotacion-' + (a.id || aIdx),
        tipo: 'anotacion_cliente',
        fecha: tA,
        titulo: 'Anotación por ' + (a.autor || 'Colaborador'),
        color: '#6366F1',
        icono: '💬',
        data: a
      });
    });

    evs.sort((a, b) => {
      const timeA = a.fecha instanceof Date ? a.fecha.getTime() : 0;
      const timeB = b.fecha instanceof Date ? b.fecha.getTime() : 0;
      return timeB - timeA;
    });

    return evs;
  }, [servicios, obras, presupuestos, cliente?.anotacionesHistorial, isTecnico]);

  // Guardar anotación en la bitácora del cliente
  const handleGuardarAnotacion = async (e) => {
    e.preventDefault();
    if (!nuevaAnotacion.trim()) return;

    setIsSavingAnotacion(true);
    try {
      const authorName = currentUser?.name || currentUser?.displayName || currentUser?.email || 'Colaborador Euler';
      const nuevaEntrada = {
        id: 'nota_' + Date.now(),
        fecha: new Date().toISOString(),
        autor: authorName,
        texto: nuevaAnotacion.trim()
      };

      await updateDoc(doc(db, 'clientes', id), {
        anotacionesHistorial: arrayUnion(nuevaEntrada)
      });

      setNuevaAnotacion('');
    } catch (err) {
      console.error('Error al guardar anotación:', err);
      alert('Error al guardar anotación: ' + err.message);
    } finally {
      setIsSavingAnotacion(false);
    }
  };

  // Guardar cambios de edición de cliente
  const handleSaveClienteModal = async (e) => {
    e.preventDefault();
    if (!editFormData.name) {
      alert('El Nombre o Razón Social es requerido');
      return;
    }

    setIsSavingCliente(true);
    try {
      const payload = {
        name: editFormData.name,
        nombre: editFormData.name,
        nombreCompleto: editFormData.name,
        nombreBusqueda: editFormData.name.toLowerCase().trim(),
        phone: editFormData.phone || '',
        telefono: editFormData.phone || '',
        email: editFormData.email || '',
        address: editFormData.address || '',
        direccion: editFormData.address || '',
        location: editFormData.location || '',
        localidad: editFormData.location || '',
        cuit: editFormData.cuit || '',
        dni: editFormData.dni || '',
        type: editFormData.type || 'Propietario',
        contactoNombre: editFormData.contactoNombre || '',
        contactoTelefono: editFormData.contactoTelefono || '',
        priceList: editFormData.priceList || 'Consumidor Final',
      };

      await updateDoc(doc(db, 'clientes', id), payload);
      setIsEditModalOpen(false);
    } catch (err) {
      console.error('Error al actualizar cliente:', err);
      alert('Error: ' + err.message);
    } finally {
      setIsSavingCliente(false);
    }
  };

  // Generar PDF 360° del Cliente
  const generarPDF = () => {
    if (!cliente) return;
    const nombreCli = cliente.name || cliente.nombre || 'Cliente';
    const fechaHoy = new Date().toLocaleDateString('es-AR');

    const serviciosHTML = servicios.map(s => {
      const totalFinanciero = !isTecnico ? calcTotal(s.materiales, s.manoObra) : null;
      return `
        <div style="margin-bottom:16px;padding:12px 16px;border:1px solid #E2E8F0;border-radius:8px;background:#F8FAFC;">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
            <strong style="color:#1E3A8A;font-size:13px;">ST-${s.numeroST || 'S/N'} — ${s.descripcion || 'Sin descripción'}</strong>
            <span style="font-size:11px;color:#64748B;">${formatFecha(s.creadoEn)}</span>
          </div>
          ${s.tecnicoVisito || s.tecnico ? `<div style="font-size:11px;margin-bottom:4px;"><strong>Técnico que realizó el servicio:</strong> ${s.tecnicoVisito || s.tecnico}</div>` : ''}
          ${s.diagnostico ? `<div style="font-size:11px;margin-bottom:4px;"><strong>Diagnóstico${s.tecnicoDiagnostico ? ` (por ${s.tecnicoDiagnostico})` : ''}:</strong> ${s.diagnostico}</div>` : ''}
          ${s.materiales && s.materiales.length > 0 ? `
            <div style="font-size:11px;margin-top:6px;">
              <strong>Materiales:</strong>
              ${s.materiales.map(m => `${m.cant}x ${m.desc}${!isTecnico ? ` ($ ${formatMoney(m.precio * m.cant)})` : ''}`).join(', ')}
            </div>
          ` : ''}
          ${!isTecnico && totalFinanciero && totalFinanciero.conIVA > 0 ? `
            <div style="font-size:11px;margin-top:6px;font-weight:bold;color:#1E3A8A;">Total facturado (c/IVA): $ ${formatMoney(totalFinanciero.conIVA)}</div>
          ` : ''}
        </div>
      `;
    }).join('');

    const obrasHTML = obras.map(o => `
      <div style="margin-bottom:12px;padding:10px 14px;border:1px solid #E2E8F0;border-radius:8px;background:#F8FAFC;">
        <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:bold;color:#1E3A8A;">
          <span>${o.name}</span>
          <span style="color:#64748B;">Fase: ${o.phase || 'Obra'} - ${o.progress || 0}%</span>
        </div>
        <div style="font-size:11px;color:#475569;margin-top:4px;">${o.system || 'Sistema no especificado'} · ${o.location || 'Sin ubicación'}</div>
      </div>
    `).join('');

    const anotacionesHTML = (cliente.anotacionesHistorial || []).map(a => `
      <div style="margin-bottom:10px;padding:8px 12px;border-left:3px solid #6366F1;background:#EEF2FF;border-radius:0 6px 6px 0;">
        <div style="font-size:10px;color:#4F46E5;font-weight:600;">${formatFechaHora(a.fecha)} — ${a.autor}</div>
        <div style="font-size:11px;color:#1F2937;margin-top:2px;">${a.texto}</div>
      </div>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Ficha 360° - ${nombreCli}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1E293B; padding: 24px; }
          .header { border-bottom: 2px solid #2563EB; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
          .title { font-size: 20px; font-weight: 800; color: #1E3A8A; text-transform: uppercase; margin: 0; }
          .section-title { font-size: 13px; font-weight: 700; color: #1E3A8A; text-transform: uppercase; border-bottom: 1px solid #CBD5E1; padding-bottom: 4px; margin: 20px 0 10px 0; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px; margin-bottom: 16px; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div style="font-size: 10px; color: #E65100; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;">EULER CLIMATIZACIÓN — FICHA 360° DE CLIENTE</div>
            <h1 class="title">${nombreCli}</h1>
          </div>
          <div style="text-align: right; font-size: 10px; color: #64748B;">Fecha: ${fechaHoy}</div>
        </div>

        <div class="grid">
          <div><strong>Tipo de Contacto:</strong> ${cliente.type || 'Propietario'}</div>
          <div><strong>Teléfono:</strong> ${cliente.phone || cliente.telefono || '—'}</div>
          <div><strong>Email:</strong> ${cliente.email || '—'}</div>
          <div><strong>Dirección:</strong> ${cliente.address || cliente.direccion || '—'} ${cliente.location || cliente.localidad ? '(' + (cliente.location || cliente.localidad) + ')' : ''}</div>
          <div><strong>CUIT/DNI:</strong> ${cliente.cuit || cliente.dni || '—'}</div>
          <div><strong>Contacto Alternativo:</strong> ${cliente.contactoNombre || '—'} ${cliente.contactoTelefono ? '(' + cliente.contactoTelefono + ')' : ''}</div>
        </div>

        ${servicios.length > 0 ? `
          <div class="section-title">Historial de Servicios Técnicos (${servicios.length})</div>
          ${serviciosHTML}
        ` : ''}

        ${obras.length > 0 ? `
          <div class="section-title">Obras Relacionadas (${obras.length})</div>
          ${obrasHTML}
        ` : ''}

        ${(cliente.anotacionesHistorial || []).length > 0 ? `
          <div class="section-title">Bitácora y Notas del Colaborador</div>
          ${anotacionesHTML}
        ` : ''}

        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
  };

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
        Cargando expediente 360° del cliente...
      </div>
    );
  }

  if (!cliente) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <h3>Cliente no encontrado</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>El contacto solicitado no existe o fue eliminado.</p>
        <Link to="/clientes" className="btn btn-primary">Volver a Clientes</Link>
      </div>
    );
  }

  const nombreMostrar = cliente.name || cliente.nombre || 'Cliente sin nombre';
  const telefonoLimpio = (cliente.phone || cliente.telefono || '').replace(/\D/g, '');
  const direccionCompleta = [cliente.address || cliente.direccion, cliente.location || cliente.localidad].filter(Boolean).join(', ');

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* ── BREADCRUMB / ACCIÓN VOLVER ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <Link to="/clientes" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500 }}>
          <ArrowLeft size={16} /> Volver al listado de Clientes
        </Link>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={() => setIsEditModalOpen(true)} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
            <Edit2 size={15} /> Editar Contacto
          </button>
          <button onClick={generarPDF} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
            <FileText size={15} /> Exportar Ficha 360° (PDF)
          </button>
        </div>
      </div>

      {/* ── TARJETA PRINCIPAL DEL CLIENTE ── */}
      <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '1.25rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '-0.02em' }}>
                {nombreMostrar}
              </h1>
              <span style={{ backgroundColor: 'var(--primary-50)', color: 'var(--primary-700)', border: '1px solid var(--primary-200)', padding: '0.2rem 0.6rem', borderRadius: '16px', fontSize: '0.75rem', fontWeight: 600 }}>
                {cliente.type || 'Propietario'}
              </span>
              {cliente.cuit && (
                <span style={{ backgroundColor: 'var(--bg-surface-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)', padding: '0.2rem 0.6rem', borderRadius: '16px', fontSize: '0.75rem' }}>
                  CUIT: {cliente.cuit}
                </span>
              )}
              {cliente.dni && !cliente.cuit && (
                <span style={{ backgroundColor: 'var(--bg-surface-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)', padding: '0.2rem 0.6rem', borderRadius: '16px', fontSize: '0.75rem' }}>
                  DNI: {cliente.dni}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', flexWrap: 'wrap' }}>
              {direccionCompleta && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <MapPin size={15} style={{ color: 'var(--text-tertiary)' }} /> {direccionCompleta}
                </div>
              )}
              {(cliente.phone || cliente.telefono) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Phone size={15} style={{ color: 'var(--text-tertiary)' }} /> {cliente.phone || cliente.telefono}
                </div>
              )}
              {cliente.email && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Mail size={15} style={{ color: 'var(--text-tertiary)' }} /> {cliente.email}
                </div>
              )}
            </div>
          </div>

          {/* Botones de acción directa */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {telefonoLimpio && (
              <a href={`https://wa.me/54${telefonoLimpio}`} target="_blank" rel="noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 0.9rem', backgroundColor: '#25D366', color: 'white', borderRadius: '8px', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 600, boxShadow: '0 2px 4px rgba(37,211,102,0.2)' }}>
                <span>💬</span> WhatsApp
              </a>
            )}
            {direccionCompleta && (
              <a href={`https://maps.google.com/?q=${encodeURIComponent(direccionCompleta)}`} target="_blank" rel="noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 0.9rem', backgroundColor: '#4285F4', color: 'white', borderRadius: '8px', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 600, boxShadow: '0 2px 4px rgba(66,133,244,0.2)' }}>
                <MapPin size={15} /> Ver Mapa
              </a>
            )}
            {(cliente.phone || cliente.telefono) && (
              <a href={`tel:${telefonoLimpio}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 0.9rem', backgroundColor: 'var(--bg-surface-hover)', color: 'var(--text-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 500 }}>
                <Phone size={15} /> Llamar
              </a>
            )}
            {cliente.email && (
              <a href={`mailto:${cliente.email}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 0.9rem', backgroundColor: 'var(--bg-surface-hover)', color: 'var(--text-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 500 }}>
                <Mail size={15} /> Enviar Mail
              </a>
            )}
          </div>
        </div>

        {/* Datos secundarios del cliente */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginTop: '1.25rem', fontSize: '0.85rem' }}>
          <div>
            <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600, display: 'block' }}>Contacto Adicional</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{cliente.contactoNombre || '—'}</span>
            {cliente.contactoTelefono && <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.8rem' }}>Tel: {cliente.contactoTelefono}</span>}
          </div>
          <div>
            <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600, display: 'block' }}>Lista de Precios Base</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{cliente.priceList || 'Consumidor Final'}</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600, display: 'block' }}>Fecha de Alta</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatFecha(cliente.createdAt || cliente.creadoEn)}</span>
          </div>
        </div>
      </div>

      {/* ── RESUMEN EN TARJETAS DE ESTADÍSTICAS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isTecnico ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '1.2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ backgroundColor: '#FFF3E0', padding: '0.75rem', borderRadius: '10px', color: '#E65100' }}>
            <Wrench size={24} />
          </div>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>{servicios.length}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Servicios Técnicos</div>
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '1.2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ backgroundColor: '#EFF6FF', padding: '0.75rem', borderRadius: '10px', color: '#2563EB' }}>
            <HardHat size={24} />
          </div>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>{obras.length}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Obras Vinculadas</div>
          </div>
        </div>

        {!isTecnico && (
          <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '1.2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ backgroundColor: '#ECFDF5', padding: '0.75rem', borderRadius: '10px', color: '#059669' }}>
              <DollarSign size={24} />
            </div>
            <div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>{presupuestos.length}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Presupuestos / Cotizaciones</div>
            </div>
          </div>
        )}

        <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '1.2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ backgroundColor: '#EEF2FF', padding: '0.75rem', borderRadius: '10px', color: '#4F46E5' }}>
            <Camera size={24} />
          </div>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>{todosMedios.length}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Fotos y Videos Registrados</div>
          </div>
        </div>
      </div>

      {/* ── NAVEGACIÓN POR PESTAÑAS ── */}
      <div style={{ borderBottom: '1px solid var(--border-light)', marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', overflowX: 'auto' }}>
        <button
          onClick={() => setActiveTab('timeline')}
          style={{
            padding: '0.75rem 1.25rem', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem',
            color: activeTab === 'timeline' ? 'var(--primary-600)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'timeline' ? '3px solid var(--primary-600)' : '3px solid transparent'
          }}>
          <Clock size={16} /> Línea de Tiempo 360° ({timelineEvents.length})
        </button>

        <button
          onClick={() => setActiveTab('servicios')}
          style={{
            padding: '0.75rem 1.25rem', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem',
            color: activeTab === 'servicios' ? 'var(--primary-600)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'servicios' ? '3px solid var(--primary-600)' : '3px solid transparent'
          }}>
          <Wrench size={16} /> Servicios Técnicos ({servicios.length})
        </button>

        <button
          onClick={() => setActiveTab('obras')}
          style={{
            padding: '0.75rem 1.25rem', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem',
            color: activeTab === 'obras' ? 'var(--primary-600)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'obras' ? '3px solid var(--primary-600)' : '3px solid transparent'
          }}>
          <HardHat size={16} /> Obras ({obras.length})
        </button>

        {!isTecnico && (
          <button
            onClick={() => setActiveTab('presupuestos')}
            style={{
              padding: '0.75rem 1.25rem', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem',
              color: activeTab === 'presupuestos' ? 'var(--primary-600)' : 'var(--text-secondary)',
              borderBottom: activeTab === 'presupuestos' ? '3px solid var(--primary-600)' : '3px solid transparent'
            }}>
            <FileText size={16} /> Presupuestos ({presupuestos.length})
          </button>
        )}

        <button
          onClick={() => setActiveTab('bitacora')}
          style={{
            padding: '0.75rem 1.25rem', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem',
            color: activeTab === 'bitacora' ? 'var(--primary-600)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'bitacora' ? '3px solid var(--primary-600)' : '3px solid transparent'
          }}>
          <MessageSquare size={16} /> Bitácora General ({(cliente.anotacionesHistorial || []).length})
        </button>

        <button
          onClick={() => setActiveTab('multimedia')}
          style={{
            padding: '0.75rem 1.25rem', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem',
            color: activeTab === 'multimedia' ? 'var(--primary-600)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'multimedia' ? '3px solid var(--primary-600)' : '3px solid transparent'
          }}>
          <Camera size={16} /> Archivos y Fotos ({todosMedios.length})
        </button>
      </div>

      {/* ── CONTENIDO: TAB 1 LÍNEA DE TIEMPO 360° ── */}
      {activeTab === 'timeline' && (
        <div>
          {/* Caja rápida para agregar nota a la bitácora */}
          <form onSubmit={handleGuardarAnotacion} style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '1.25rem', marginBottom: '2rem', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              <MessageSquare size={16} style={{ color: 'var(--primary-600)' }} /> Agregar Registro / Conversación / Nota a la Bitácora
            </div>
            <textarea
              rows={2}
              placeholder="Ej: Se coordinó con el cliente visita para el viernes. Acuerdan cambio de repuesto..."
              value={nuevaAnotacion}
              onChange={(e) => setNuevaAnotacion(e.target.value)}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.875rem', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button type="submit" disabled={isSavingAnotacion || !nuevaAnotacion.trim()} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem' }}>
                <Send size={14} /> {isSavingAnotacion ? 'Guardando...' : 'Guardar Anotación'}
              </button>
            </div>
          </form>

          {/* Timeline Feed */}
          {timelineEvents.length === 0 ? (
            <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              Sin eventos registrados todavía en la línea de tiempo.
            </div>
          ) : (
            <div style={{ position: 'relative', paddingLeft: '1.5rem' }}>
              {/* Barra vertical central */}
              <div style={{ position: 'absolute', left: '7px', top: '10px', bottom: '0', width: '2px', backgroundColor: 'var(--border-light)' }} />

              {timelineEvents.map((ev) => {
                const totalFinanciero = (ev.tipo === 'resolucion' && !isTecnico) ? calcTotal(ev.servicio.materiales, ev.servicio.manoObra) : null;

                return (
                  <div key={ev.id} style={{ position: 'relative', marginBottom: '1.75rem' }}>
                    {/* Indicador puntual */}
                    <div style={{
                      position: 'absolute', left: '-1.5rem', top: '1rem', width: '14px', height: '14px',
                      borderRadius: '50%', backgroundColor: ev.color, border: '3px solid var(--bg-primary)',
                      boxShadow: '0 0 0 1px var(--border-light)', zIndex: 2
                    }} />

                    {/* Tarjeta del evento */}
                    <div style={{
                      backgroundColor: 'var(--bg-surface)', borderRadius: '10px', padding: '1.25rem',
                      border: '1px solid var(--border-light)', borderLeft: '4px solid ' + ev.color,
                      boxShadow: 'var(--shadow-sm)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '1.2rem' }}>{ev.icono}</span>
                          <span style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{ev.titulo}</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'right' }}>
                          {formatFechaHora(ev.fecha)}
                        </div>
                      </div>

                      {/* Cuerpo por tipo de evento */}
                      {ev.tipo === 'servicio_creado' && (
                        <div>
                          <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                            <strong>Problema reportado:</strong> {ev.descripcion}
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {ev.servicio.numeroST && (
                              <span style={{ backgroundColor: '#FFF3E0', color: '#E65100', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                                ST-{ev.servicio.numeroST}
                              </span>
                            )}
                            <span style={{ backgroundColor: 'var(--bg-surface-hover)', color: 'var(--text-secondary)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>
                              Estado: {(ev.servicio.estado || '').replace('-', ' ').toUpperCase()}
                            </span>
                            {ev.servicio.equipos?.length > 0 && (
                              <span style={{ backgroundColor: '#EFF6FF', color: '#2563EB', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>
                                🔧 {ev.servicio.equipos.join(', ')}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {ev.tipo === 'visita' && (
                        <div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                            El técnico <strong>{ev.tecnico}</strong> visitó el domicilio del cliente para el servicio <strong>ST-{ev.servicio.numeroST || 'S/N'}</strong>.
                          </div>
                          {(ev.servicio.horaLlegada || ev.servicio.horaSalida) && (
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                              ⏱ {ev.servicio.horaLlegada ? `Llegada: ${new Date(ev.servicio.horaLlegada).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}` : ''}
                              {ev.servicio.horaSalida ? ` · Salida: ${new Date(ev.servicio.horaSalida).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}` : ''}
                            </div>
                          )}
                        </div>
                      )}

                      {ev.tipo === 'foto' && (
                        <div>
                          <div
                            onClick={() => {
                              const lista = todosMedios;
                              const idx = lista.findIndex(m => m.url === ev.data.url);
                              setMediaActivo({ lista, index: Math.max(0, idx) });
                            }}
                            style={{ cursor: 'pointer', display: 'inline-block', width: '120px', height: '120px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-light)' }}>
                            {ev.data.url?.toLowerCase().includes('/video/upload/') || ev.data.url?.match(/\.(mp4|webm|ogg|mov|avi)($|\?)/i) ? (
                              <div style={{ width: '100%', height: '100%', backgroundColor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                                <Play size={24} />
                              </div>
                            ) : (
                              <img src={ev.data.url} alt="Evidencia" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            )}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                            👷 Subido por: <strong style={{ color: 'var(--text-primary)' }}>{ev.data.tecnico || 'Técnico'}</strong> ({ev.data.tipo || 'Evidencia'})
                          </div>
                        </div>
                      )}

                      {ev.tipo === 'nota_voz' && (
                        <div style={{ backgroundColor: 'var(--bg-surface-hover)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                          <audio src={ev.data.audioURL} controls style={{ width: '100%', height: '36px', marginBottom: '0.35rem' }} />
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                            "{ev.data.transcripcion || 'Nota de voz técnica (Sin transcripción)'}"
                          </div>
                        </div>
                      )}

                      {ev.tipo === 'resolucion' && (
                        <div>
                          <div style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', padding: '0.6rem 0.8rem', borderRadius: '6px', marginBottom: '0.75rem', fontSize: '0.8rem', color: '#166534' }}>
                            👷 <strong>Técnico actuante:</strong> {ev.tecnico} {ev.servicio.fechaDiagnostico ? `(${formatFechaHora(ev.servicio.fechaDiagnostico)})` : ''}
                          </div>

                          {ev.servicio.diagnostico && (
                            <div style={{ marginBottom: '0.75rem' }}>
                              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '0.2rem' }}>Diagnóstico / Trabajo Realizado</span>
                              <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{ev.servicio.diagnostico}</div>
                            </div>
                          )}

                          {ev.servicio.recomendaciones && (
                            <div style={{ marginBottom: '0.75rem' }}>
                              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '0.2rem' }}>Recomendaciones al Cliente</span>
                              <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{ev.servicio.recomendaciones}</div>
                            </div>
                          )}

                          {/* Materiales (Con o sin precios según rol) */}
                          {ev.servicio.materiales && ev.servicio.materiales.length > 0 && (
                            <div style={{ marginTop: '0.5rem', borderTop: '1px dashed var(--border-light)', paddingTop: '0.5rem' }}>
                              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '0.2rem' }}>Materiales y Repuestos</span>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                {ev.servicio.materiales.map((m, mIdx) => (
                                  <div key={mIdx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                                    <span>{m.cant}x {m.desc}</span>
                                    {!isTecnico && (
                                      <span style={{ color: 'var(--text-secondary)' }}>$ {formatMoney((m.precio || 0) * (m.cant || 1))}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {!isTecnico && totalFinanciero && totalFinanciero.conIVA > 0 && (
                            <div style={{ textAlign: 'right', marginTop: '0.5rem', fontWeight: 700, color: 'var(--primary-700)', fontSize: '0.88rem' }}>
                              Total cobrado (c/IVA): $ {formatMoney(totalFinanciero.conIVA)}
                            </div>
                          )}
                        </div>
                      )}

                      {ev.tipo === 'obra' && (
                        <div>
                          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>{ev.obra.name}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                            Fase: <strong>{ev.obra.phase || 'Obra'}</strong> · Estado: {ev.obra.estado || 'Activa'} · Sistema: {ev.obra.system || 'General'}
                          </div>
                        </div>
                      )}

                      {ev.tipo === 'obra_bitacora' && (
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                          <div style={{ fontStyle: 'italic', marginBottom: '0.25rem' }}>"{ev.data.texto}"</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Obra: {ev.obra.name}</div>
                        </div>
                      )}

                      {ev.tipo === 'presupuesto' && !isTecnico && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                              Presupuesto #{ev.presupuesto.presupuestoNumber || ev.presupuesto.id.slice(0, 6)}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                              Sistema: {ev.presupuesto.paramSistema || 'S/D'} · Estado: {ev.presupuesto.status}
                            </div>
                          </div>
                          {ev.presupuesto.totalUSD && (
                            <div style={{ fontWeight: 800, color: '#059669', fontSize: '1rem' }}>
                              USD {formatMoney(ev.presupuesto.totalUSD)}
                            </div>
                          )}
                        </div>
                      )}

                      {ev.tipo === 'anotacion_cliente' && (
                        <div>
                          <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                            {ev.data.texto}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.25rem' }}>
                            Registrado por: <strong>{ev.data.autor}</strong>
                          </div>
                        </div>
                      )}

                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── CONTENIDO: TAB 2 SERVICIOS TÉCNICOS ── */}
      {activeTab === 'servicios' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {servicios.length === 0 ? (
            <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No hay servicios técnicos registrados para este cliente.
            </div>
          ) : (
            servicios.map((s) => {
              const totalFinanciero = !isTecnico ? calcTotal(s.materiales, s.manoObra) : null;
              return (
                <div key={s.id} style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '1.5rem', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--primary-700)' }}>
                          ST-{s.numeroST || 'S/N'}
                        </span>
                        <span style={{ backgroundColor: 'var(--primary-50)', color: 'var(--primary-700)', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>
                          {(s.estado || 'pendiente').toUpperCase()}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                        Fecha de ingreso: {formatFecha(s.creadoEn)}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        👷 Técnico que realizó / visitó:
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--primary-600)', fontWeight: 600 }}>
                        {s.tecnicoVisito || s.tecnico || 'Sin asignar'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', display: 'block' }}>Problema Reportado</span>
                      <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.88rem', color: 'var(--text-primary)' }}>{s.descripcion || 'Sin descripción'}</p>
                    </div>
                    {s.diagnostico && (
                      <div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', display: 'block' }}>
                          Diagnóstico {s.tecnicoDiagnostico ? `(por ${s.tecnicoDiagnostico})` : ''}
                        </span>
                        <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.88rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{s.diagnostico}</p>
                      </div>
                    )}
                  </div>

                  {/* Notas de audio del servicio */}
                  {s.notaVozURL && (
                    <div style={{ backgroundColor: 'var(--bg-surface-hover)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', marginBottom: '1rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>🎙️ Nota de voz del técnico</span>
                      <audio src={s.notaVozURL} controls style={{ width: '100%', height: '36px' }} />
                    </div>
                  )}

                  {/* Galería de fotos del servicio */}
                  {((s.fotosHecnico && s.fotosHecnico.length > 0) || s.fotoURL) && (
                    <div style={{ marginBottom: '1rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem' }}>Fotos y Evidencias</span>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {s.fotoURL && (
                          <div
                            onClick={() => {
                              const lista = todosMedios;
                              const idx = lista.findIndex(m => m.url === s.fotoURL);
                              setMediaActivo({ lista, index: Math.max(0, idx) });
                            }}
                            style={{ width: '80px', height: '80px', borderRadius: '6px', overflow: 'hidden', cursor: 'pointer', border: '1px solid var(--border-light)' }}>
                            <img src={s.fotoURL} alt="ST" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                        )}
                        {(s.fotosHecnico || []).map((f, fIdx) => (
                          <div
                            key={fIdx}
                            onClick={() => {
                              const lista = todosMedios;
                              const idx = lista.findIndex(m => m.url === f.url);
                              setMediaActivo({ lista, index: Math.max(0, idx) });
                            }}
                            style={{ width: '80px', height: '80px', borderRadius: '6px', overflow: 'hidden', cursor: 'pointer', border: '1px solid var(--border-light)', position: 'relative' }}>
                            <img src={f.url} alt="Evidencia" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', color: 'white', fontSize: '9px', textAlign: 'center', padding: '1px' }}>
                              {f.tecnico || 'Téc'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Materiales y cobro (Hidden if isTecnico) */}
                  {s.materiales && s.materiales.length > 0 && (
                    <div style={{ borderTop: '1px dashed var(--border-light)', paddingTop: '0.75rem', marginTop: '0.5rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', display: 'block', marginBottom: '0.35rem' }}>Materiales Utilizados</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        {s.materiales.map((m, mIdx) => (
                          <div key={mIdx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                            <span>{m.cant}x {m.desc}</span>
                            {!isTecnico && (
                              <span style={{ color: 'var(--text-secondary)' }}>$ {formatMoney((m.precio || 0) * (m.cant || 1))}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {!isTecnico && totalFinanciero && totalFinanciero.conIVA > 0 && (
                    <div style={{ textAlign: 'right', marginTop: '0.75rem', fontWeight: 800, color: 'var(--primary-700)', fontSize: '0.95rem' }}>
                      Total facturado (c/IVA): $ {formatMoney(totalFinanciero.conIVA)}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── CONTENIDO: TAB 3 OBRAS ── */}
      {activeTab === 'obras' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {obras.length === 0 ? (
            <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No hay obras vinculadas a este cliente.
            </div>
          ) : (
            obras.map((o) => (
              <div key={o.id} style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '1.5rem', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>{o.name}</h3>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                      📍 {o.location || 'Sin dirección de obra'} · Sistema: <strong>{o.system || 'No especificado'}</strong>
                    </div>
                  </div>
                  <span style={{ backgroundColor: 'var(--primary-50)', color: 'var(--primary-700)', padding: '0.3rem 0.8rem', borderRadius: '16px', fontSize: '0.75rem', fontWeight: 700 }}>
                    Fase: {o.phase || 'Obra'} ({o.progress || 0}%)
                  </span>
                </div>

                {/* Barra de progreso */}
                <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--border-light)', borderRadius: '4px', overflow: 'hidden', margin: '0.75rem 0' }}>
                  <div style={{ width: `${o.progress || 0}%`, height: '100%', backgroundColor: 'var(--primary-600)', borderRadius: '4px', transition: 'width 0.3s' }} />
                </div>

                {/* Últimas anotaciones de la obra */}
                {o.bitacoraHistory && o.bitacoraHistory.length > 0 && (
                  <div style={{ marginTop: '0.75rem', backgroundColor: 'var(--bg-surface-hover)', padding: '0.75rem', borderRadius: '8px' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '0.3rem' }}>Último Avance Registrado</span>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>"{o.bitacoraHistory[o.bitacoraHistory.length - 1]?.texto}"</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '0.2rem' }}>
                      Por {o.bitacoraHistory[o.bitacoraHistory.length - 1]?.autor || 'Colaborador'} — {formatFecha(o.bitacoraHistory[o.bitacoraHistory.length - 1]?.fecha)}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── CONTENIDO: TAB 4 PRESUPUESTOS (HIDDEN IF isTecnico) ── */}
      {activeTab === 'presupuestos' && !isTecnico && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {presupuestos.length === 0 ? (
            <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No hay presupuestos o cotizaciones registrados para este cliente.
            </div>
          ) : (
            presupuestos.map((p) => (
              <div key={p.id} style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '1.5rem', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                        Presupuesto #{p.presupuestoNumber || p.id.slice(0, 6)}
                      </span>
                      <span style={{ backgroundColor: '#ECFDF5', color: '#059669', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700 }}>
                        {(p.status || 'Pendiente').toUpperCase()}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                      Fecha: {formatFecha(p.createdAt)} · Sistema: <strong>{p.paramSistema || 'S/D'}</strong>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    {p.totalUSD && (
                      <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#059669' }}>
                        USD {formatMoney(p.totalUSD)}
                      </div>
                    )}
                    {p.totalARS && (
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        ARS $ {formatMoney(p.totalARS)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Versiones / Revisiones del presupuesto */}
                {p.revisiones && p.revisiones.length > 0 && (
                  <div style={{ marginTop: '0.75rem', borderTop: '1px dashed var(--border-light)', paddingTop: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', display: 'block', marginBottom: '0.25rem' }}>Revisiones Guardadas ({p.revisiones.length})</span>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {p.revisiones.map((rev, rIdx) => (
                        <span key={rIdx} style={{ backgroundColor: 'var(--bg-surface-hover)', border: '1px solid var(--border-light)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>
                          Rev {rev.numero || rIdx + 1}: {formatFecha(rev.fecha)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── CONTENIDO: TAB 5 BITÁCORA GENERAL ── */}
      {activeTab === 'bitacora' && (
        <div>
          {/* Formulario para agregar nota */}
          <form onSubmit={handleGuardarAnotacion} style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '1.25rem', marginBottom: '1.5rem', boxShadow: 'var(--shadow-sm)' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>Nueva Anotación en la Bitácora del Cliente</h4>
            <textarea
              rows={3}
              placeholder="Detalla acuerdos telefónicos, reuniones, visitas especiales o cualquier observación de interés general..."
              value={nuevaAnotacion}
              onChange={(e) => setNuevaAnotacion(e.target.value)}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.875rem', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button type="submit" disabled={isSavingAnotacion || !nuevaAnotacion.trim()} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                <Send size={15} /> {isSavingAnotacion ? 'Guardando...' : 'Registrar en Bitácora'}
              </button>
            </div>
          </form>

          {/* Listado de anotaciones */}
          {(cliente.anotacionesHistorial || []).length === 0 ? (
            <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              Aún no hay anotaciones registradas en la bitácora de este cliente.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[...(cliente.anotacionesHistorial || [])].reverse().map((a, idx) => (
                <div key={a.id || idx} style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderLeft: '4px solid #6366F1', borderRadius: '8px', padding: '1rem', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <span style={{ fontWeight: 700, color: '#4F46E5', fontSize: '0.85rem' }}>👤 {a.autor}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{formatFechaHora(a.fecha)}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{a.texto}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── CONTENIDO: TAB 6 MULTIMEDIA Y ARCHIVOS ── */}
      {activeTab === 'multimedia' && (
        <div>
          {todosMedios.length === 0 ? (
            <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No hay fotos ni videos registrados para este cliente.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
              {todosMedios.map((m, idx) => (
                <div
                  key={idx}
                  onClick={() => setMediaActivo({ lista: todosMedios, index: idx })}
                  style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', overflow: 'hidden', cursor: 'pointer', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ height: '140px', backgroundColor: '#000', position: 'relative' }}>
                    {m.tipo === 'video' ? (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                        <Play size={32} />
                      </div>
                    ) : (
                      <img src={m.url} alt="Media" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    )}
                  </div>
                  <div style={{ padding: '0.6rem', fontSize: '0.78rem' }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {m.info}
                    </div>
                    <div style={{ color: 'var(--text-tertiary)', fontSize: '0.72rem', marginTop: '2px' }}>
                      {formatFecha(m.fecha)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MODAL DE EDICIÓN DEL CLIENTE ── */}
      {isEditModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: '12px', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border-light)' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>Editar Ficha de Contacto</h3>
              <button onClick={() => setIsEditModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveClienteModal} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Nombre o Razón Social</label>
                <input
                  type="text"
                  required
                  className="input-field"
                  value={editFormData.name || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Tipo de Cliente</label>
                  <select
                    className="input-field"
                    value={editFormData.type || 'Propietario'}
                    onChange={(e) => setEditFormData({ ...editFormData, type: e.target.value })}>
                    {['Propietario', 'Arquitecto', 'Estudio de Arquitectura', 'Constructora', 'Desarrolladora', 'Cliente SSTT'].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Lista de Precios</label>
                  <select
                    className="input-field"
                    value={editFormData.priceList || 'Consumidor Final'}
                    onChange={(e) => setEditFormData({ ...editFormData, priceList: e.target.value })}>
                    <option value="Consumidor Final">Consumidor Final</option>
                    <option value="Mayorista">Mayorista (Gremio)</option>
                    <option value="Arquitectos">Arquitectos (Especial)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Teléfono</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editFormData.phone || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    className="input-field"
                    value={editFormData.email || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Dirección</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editFormData.address || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Localidad</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editFormData.location || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, location: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">CUIT</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editFormData.cuit || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, cuit: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">DNI</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editFormData.dni || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, dni: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Contacto Secundario (Nombre)</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editFormData.contactoNombre || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, contactoNombre: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Contacto Secundario (Teléfono)</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editFormData.contactoTelefono || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, contactoTelefono: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                <button type="button" onClick={() => setIsEditModalOpen(false)} className="btn btn-secondary">
                  Cancelar
                </button>
                <button type="submit" disabled={isSavingCliente} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Save size={15} /> {isSavingCliente ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── VISOR LIGHTBOX PARA FOTOS Y VIDEOS ── */}
      {mediaActivo && (
        <MediaLightbox
          media={mediaActivo.lista}
          index={mediaActivo.index}
          onClose={() => setMediaActivo(null)}
          onChangeIndex={(idx) => setMediaActivo({ ...mediaActivo, index: idx })}
        />
      )}
    </div>
  );
}
