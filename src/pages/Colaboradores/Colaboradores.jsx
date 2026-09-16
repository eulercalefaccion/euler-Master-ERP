import React, { useState } from 'react';
import { UserPlus, Edit2, Trash2, Search, Key, Shield, Briefcase, Phone, CheckCircle2, XCircle } from 'lucide-react';
import { useJornadas } from '../../context/JornadasContext';
import { db } from '../../services/firebaseConfig';
import { doc, setDoc, updateDoc } from 'firebase/firestore';

const CATEGORIAS_UOCRA = [
  'Oficial Especializado',
  'Oficial',
  'Medio Oficial',
  'Eventual'
];

const ROLES_SISTEMA = [
  { value: 'empleado', label: 'Empleado (Fichaje en Jornadas)' },
  { value: 'admin', label: 'Administrador' },
  { value: 'ambos', label: 'Ambos (Admin + Empleado)' }
];

export default function Colaboradores() {
  const { empleados, addEmpleado, updateEmpleado, deleteEmpleado, jornadas, showToast } = useJornadas();
  const hoyStr = new Date().toISOString().slice(0, 10);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filtroRol, setFiltroRol] = useState('todos');
  const [verInactivos, setVerInactivos] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [formData, setFormData] = useState({
    nombre: '',
    apellido: '',
    dni: '',
    telefono: '',
    usuario: '',
    password: '',
    rol: 'empleado',
    activo: true,
    // Sueldos & Funciones
    puesto: 'Instalador',
    categoriaBase: 'Oficial',
    adicionalPct: 0,
    // Habilitaciones
    esTecnicoServicios: false
  });

  // Filtrado de colaboradores
  const colaboradoresFiltrados = empleados.filter(c => {
    const estadoActivo = verInactivos ? !c.activo : c.activo !== false;
    if (!estadoActivo) return false;

    if (filtroRol !== 'todos' && c.rol !== filtroRol) return false;

    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      const match = (
        (c.nombre || '').toLowerCase().includes(q) ||
        (c.apellido || '').toLowerCase().includes(q) ||
        (c.dni || '').includes(q) ||
        (c.usuario || '').toLowerCase().includes(q) ||
        (c.puesto || '').toLowerCase().includes(q)
      );
      if (!match) return false;
    }
    return true;
  });

  const openModal = (colab = null) => {
    if (colab) {
      setEditingId(colab.id);
      setFormData({
        nombre: colab.nombre || '',
        apellido: colab.apellido || '',
        dni: colab.dni || '',
        telefono: colab.telefono || '',
        usuario: colab.usuario || '',
        password: colab.password || '',
        rol: colab.rol || 'empleado',
        activo: colab.activo !== false,
        puesto: colab.puesto || 'Instalador',
        categoriaBase: colab.categoriaBase || 'Oficial',
        adicionalPct: colab.adicionalPct || 0,
        esTecnicoServicios: colab.esTecnicoServicios || colab.puesto?.toLowerCase().includes('técnico') || false
      });
    } else {
      setEditingId(null);
      setFormData({
        nombre: '',
        apellido: '',
        dni: '',
        telefono: '',
        usuario: '',
        password: '',
        rol: 'empleado',
        activo: true,
        puesto: 'Instalador',
        categoriaBase: 'Oficial',
        adicionalPct: 0,
        esTecnicoServicios: false
      });
    }
    setShowPassword(false);
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.nombre.trim()) {
      alert('El nombre es obligatorio');
      return;
    }
    if (!formData.usuario.trim() || !formData.password.trim()) {
      alert('El usuario y contraseña son obligatorios para el acceso del colaborador');
      return;
    }

    try {
      const dataToSave = {
        nombre: formData.nombre.trim(),
        apellido: formData.apellido.trim(),
        dni: formData.dni.trim(),
        telefono: formData.telefono.trim(),
        usuario: formData.usuario.trim().toLowerCase(),
        password: formData.password.trim(),
        rol: formData.rol,
        activo: formData.activo,
        puesto: formData.puesto,
        categoriaBase: formData.categoriaBase,
        adicionalPct: Number(formData.adicionalPct) || 0,
        esTecnicoServicios: formData.esTecnicoServicios
      };

      if (editingId) {
        await updateEmpleado(editingId, dataToSave);
        // Sincronizar con usuarios de servicios técnicos si aplica
        if (formData.esTecnicoServicios) {
          try {
            await setDoc(doc(db, 'usuarios', editingId), {
              nombre: `${dataToSave.nombre} ${dataToSave.apellido}`.trim(),
              usuario: dataToSave.usuario,
              rol: 'tecnico',
              activo: dataToSave.activo,
              telefono: dataToSave.telefono
            }, { merge: true });
          } catch (syncErr) {
            console.warn('Sync técnico no crítico:', syncErr);
          }
        }
        showToast('Colaborador actualizado correctamente ✅');
      } else {
        await addEmpleado(dataToSave);
        showToast('Colaborador creado exitosamente ✅');
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error(error);
      alert('Error al guardar colaborador: ' + error.message);
    }
  };

  const handleDelete = async (colab) => {
    if (!window.confirm(`¿Seguro que deseas desactivar a ${colab.nombre} ${colab.apellido}?`)) return;
    try {
      await deleteEmpleado(colab.id);
      showToast('Colaborador desactivado');
    } catch (err) {
      console.error(err);
      alert('Error al desactivar');
    }
  };

  const handleReactivar = async (colab) => {
    try {
      await updateEmpleado(colab.id, { activo: true });
      showToast('Colaborador reactivado ✅');
    } catch (err) {
      console.error(err);
      alert('Error al reactivar');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '2rem' }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>
            Colaboradores
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Gestión única centralizada para Jornadas, Sueldos, Obras y Servicios Técnicos ({empleados.filter(e => e.activo !== false).length} activos)
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => openModal()}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <UserPlus size={18} /> Nuevo Colaborador
        </button>
      </div>

      {/* Barra de Búsqueda y Filtros */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '260px', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            className="input-field"
            placeholder="Buscar por nombre, DNI, usuario o puesto..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ paddingLeft: '36px', width: '100%' }}
          />
        </div>

        <select
          className="input-field"
          style={{ width: '180px' }}
          value={filtroRol}
          onChange={e => setFiltroRol(e.target.value)}
        >
          <option value="todos">Todos los roles</option>
          <option value="empleado">Solo Empleados</option>
          <option value="admin">Solo Administradores</option>
          <option value="ambos">Ambos (Admin+Emp)</option>
        </select>

        <button
          onClick={() => setVerInactivos(!verInactivos)}
          style={{
            padding: '8px 14px',
            borderRadius: '8px',
            border: '1px solid var(--border-light)',
            background: verInactivos ? '#fef2f2' : 'var(--bg-surface)',
            color: verInactivos ? '#ef4444' : 'var(--text-secondary)',
            fontWeight: '600',
            fontSize: '0.85rem',
            cursor: 'pointer'
          }}
        >
          {verInactivos ? '👁️ Viendo Inactivos' : '🗑️ Ver Inactivos'}
        </button>
      </div>

      {/* Tabla de Colaboradores */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg-surface-hover)', borderBottom: '1px solid var(--border-light)' }}>
              <th style={thStyle}>COLABORADOR</th>
              <th style={thStyle}>DNI</th>
              <th style={thStyle}>USUARIO APP</th>
              <th style={thStyle}>PUESTO / FUNCIÓN</th>
              <th style={thStyle}>CATEGORÍA UOCRA</th>
              <th style={thStyle}>ESTADO HOY</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>ACCIONES</th>
            </tr>
          </thead>
          <tbody>
            {colaboradoresFiltrados.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                  No se encontraron colaboradores con los filtros seleccionados.
                </td>
              </tr>
            )}
            {colaboradoresFiltrados.map(colab => {
              const jHoy = jornadas.filter(j => j.empleadoId === colab.id && j.fechaIngreso === hoyStr);
              const abierta = jHoy.find(j => j.estado === 'abierta');
              const cerrada = jHoy.find(j => j.estado === 'cerrada');

              let estadoLabel = 'Ausente';
              let dotColor = '#6b7280';
              if (abierta) {
                estadoLabel = 'En jornada';
                dotColor = abierta.semaforo === 'rojo' ? '#ef4444' : (abierta.semaforo === 'amarillo' ? '#f59e0b' : '#10b981');
              } else if (cerrada) {
                estadoLabel = 'Salió';
                dotColor = '#3b82f6';
              }

              return (
                <tr key={colab.id} style={{ borderBottom: '1px solid var(--border-light)', opacity: colab.activo === false ? 0.6 : 1 }}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: '700', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                      {colab.nombre} {colab.apellido}
                    </div>
                    {colab.telefono && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Phone size={11} /> {colab.telefono}
                      </div>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{colab.dni || '-'}</span>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--primary-600)' }}>@{colab.usuario || '-'}</span>
                      {colab.rol === 'admin' && <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: '#fee2e2', color: '#dc2626', fontWeight: '800' }}>ADMIN</span>}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>{colab.puesto || 'Instalador'}</span>
                    {colab.esTecnicoServicios && (
                      <div style={{ fontSize: '10px', color: '#2563eb', fontWeight: '700', marginTop: '2px' }}>🛠️ Técnico Services</div>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: '0.8rem', padding: '3px 8px', borderRadius: '6px', background: 'var(--bg-surface-hover)', border: '1px solid var(--border-light)' }}>
                      {colab.categoriaBase || 'Oficial'} {colab.adicionalPct > 0 ? `(+${colab.adicionalPct}%)` : ''}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: dotColor, boxShadow: `0 0 6px ${dotColor}80` }} />
                      <span style={{ fontSize: '0.8rem', fontWeight: '600', color: dotColor }}>{estadoLabel}</span>
                    </div>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                      <button onClick={() => openModal(colab)} style={btnActionStyle} title="Editar Colaborador">
                        <Edit2 size={15} />
                      </button>
                      {colab.activo !== false ? (
                        <button onClick={() => handleDelete(colab)} style={{ ...btnActionStyle, color: '#ef4444' }} title="Desactivar">
                          <Trash2 size={15} />
                        </button>
                      ) : (
                        <button onClick={() => handleReactivar(colab)} style={{ ...btnActionStyle, color: '#10b981' }} title="Reactivar">
                          <CheckCircle2 size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal Unificado de Alta y Edición */}
      {isModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '580px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700' }}>
                {editingId ? 'Editar Colaborador' : 'Nuevo Colaborador'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer' }}>✕</button>
            </div>

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Sección 1: Datos Personales */}
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: '800', textTransform: 'uppercase', color: 'var(--primary-600)', letterSpacing: '0.5px', marginBottom: '8px' }}>
                  1. Identidad y Contacto
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group">
                    <label style={labelStyle}>Nombre *</label>
                    <input required className="input-field" placeholder="Juan" value={formData.nombre} onChange={e => setFormData({ ...formData, nombre: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label style={labelStyle}>Apellido *</label>
                    <input required className="input-field" placeholder="García" value={formData.apellido} onChange={e => setFormData({ ...formData, apellido: e.target.value })} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '8px' }}>
                  <div className="form-group">
                    <label style={labelStyle}>DNI</label>
                    <input className="input-field" placeholder="30123456" value={formData.dni} onChange={e => setFormData({ ...formData, dni: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label style={labelStyle}>Teléfono (WhatsApp)</label>
                    <input className="input-field" placeholder="341-1234567" value={formData.telefono} onChange={e => setFormData({ ...formData, telefono: e.target.value })} />
                  </div>
                </div>
              </div>

              {/* Sección 2: Acceso App Jornadas */}
              <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '12px' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: '800', textTransform: 'uppercase', color: 'var(--primary-600)', letterSpacing: '0.5px', marginBottom: '8px' }}>
                  2. Acceso para Fichar en App Jornadas
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group">
                    <label style={labelStyle}>Usuario *</label>
                    <input required className="input-field" placeholder="juang" value={formData.usuario} onChange={e => setFormData({ ...formData, usuario: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label style={labelStyle}>Contraseña *</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        required
                        type={showPassword ? 'text' : 'password'}
                        className="input-field"
                        placeholder="••••"
                        value={formData.password}
                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                        style={{ paddingRight: '36px' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }}
                      >
                        {showPassword ? '🙈' : '👁️'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: '8px' }}>
                  <label style={labelStyle}>Rol del Colaborador</label>
                  <select className="input-field" value={formData.rol} onChange={e => setFormData({ ...formData, rol: e.target.value })}>
                    {ROLES_SISTEMA.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Sección 3: Datos de Sueldos & Funciones */}
              <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '12px' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: '800', textTransform: 'uppercase', color: 'var(--primary-600)', letterSpacing: '0.5px', marginBottom: '8px' }}>
                  3. Paritarias UOCRA y Liquidación
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group">
                    <label style={labelStyle}>Puesto / Función</label>
                    <input className="input-field" placeholder="Ej: Instalador en Obra" value={formData.puesto} onChange={e => setFormData({ ...formData, puesto: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label style={labelStyle}>Categoría Sindical</label>
                    <select className="input-field" value={formData.categoriaBase} onChange={e => setFormData({ ...formData, categoriaBase: e.target.value })}>
                      {CATEGORIAS_UOCRA.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '8px', alignItems: 'center' }}>
                  <div className="form-group">
                    <label style={labelStyle}>Adicional / Bonificación (%)</label>
                    <input type="number" step="0.5" className="input-field" value={formData.adicionalPct} onChange={e => setFormData({ ...formData, adicionalPct: e.target.value })} />
                  </div>
                  <div style={{ paddingTop: '16px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '600' }}>
                      <input
                        type="checkbox"
                        checked={formData.esTecnicoServicios}
                        onChange={e => setFormData({ ...formData, esTecnicoServicios: e.target.checked })}
                      />
                      🛠️ Habilitar en Servicios Técnicos
                    </label>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '12px', borderTop: '1px solid var(--border-light)', paddingTop: '14px' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  {editingId ? '💾 Guardar Cambios' : '➕ Crear Colaborador'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle = { padding: '0.85rem 1rem', fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-secondary)', textAlign: 'left', fontWeight: '700', letterSpacing: '0.5px' };
const tdStyle = { padding: '0.85rem 1rem' };
const labelStyle = { display: 'block', fontSize: '0.75rem', fontWeight: '600', marginBottom: '4px', color: 'var(--text-secondary)' };
const btnActionStyle = { padding: '6px', background: 'var(--bg-surface-hover)', border: 'none', borderRadius: '6px', cursor: 'pointer', color: 'var(--primary-600)', display: 'flex', alignItems: 'center' };
