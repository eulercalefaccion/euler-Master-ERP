import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, setDoc } from 'firebase/firestore';
import { sendPasswordResetEmail, getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { initializeApp } from 'firebase/app';
import { db, firebaseConfig, auth } from '../../services/firebaseConfig';
import { useAuth, isSuperAdminEmail } from '../../context/AuthContext';
import { Settings, UserX, UserCheck, ShieldAlert, Shield, Plus, KeyRound, Edit2, X, Save, Building, Landmark, Trash2, CheckCircle } from 'lucide-react';

import { getEmpresas, crearEmpresa, actualizarEmpresa, eliminarEmpresa } from '../../services/empresasService';
import { getCuentasBancarias, crearCuentaBancaria, actualizarCuentaBancaria, eliminarCuentaBancaria } from '../../services/bancosService';

const Configuracion = () => {
  const { currentUser, isSuperAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('usuarios'); // usuarios, empresas, bancos
  
  // Users state
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [isModalUserOpen, setIsModalUserOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('tecnico');
  const [isCreating, setIsCreating] = useState(false);
  const [editingNameId, setEditingNameId] = useState(null);
  const [editNameValue, setEditNameValue] = useState('');

  // Empresas State
  const [empresas, setEmpresas] = useState([]);
  const [isModalEmpresaOpen, setIsModalEmpresaOpen] = useState(false);
  const [empresaForm, setEmpresaForm] = useState({
    nombre: '',
    razonSocial: '',
    cuit: '',
    condicionFiscal: 'Responsable Inscripto',
    puntosVenta: '1, 6',
    direccion: ''
  });

  // Bancos State
  const [bancos, setBancos] = useState([]);
  const [isModalBancoOpen, setIsModalBancoOpen] = useState(false);
  const [bancoForm, setBancoForm] = useState({
    nombreBanco: '',
    tipoCuenta: 'Cuenta Corriente',
    numeroCuenta: '',
    cbu: '',
    alias: '',
    moneda: 'ARS',
    saldoInicial: 0,
    empresaId: 'euler-calefaccion'
  });

  const cargarDatosConfig = async () => {
    try {
      // Users
      const querySnapshot = await getDocs(collection(db, 'users'));
      const usersData = [];
      querySnapshot.forEach((doc) => {
        usersData.push({ id: doc.id, ...doc.data() });
      });
      setUsers(usersData);

      // Empresas
      setEmpresas(await getEmpresas());

      // Bancos
      setBancos(await getCuentasBancarias());
    } catch (error) {
      console.error('Error cargando configuración:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarDatosConfig();
  }, []);

  // Handlers Empresas
  const handleGuardarEmpresa = async (e) => {
    e.preventDefault();
    if (!empresaForm.nombre || !empresaForm.cuit) return;
    try {
      const pvArray = String(empresaForm.puntosVenta).split(',').map(n => Number(n.trim())).filter(Boolean);
      await crearEmpresa({
        ...empresaForm,
        puntosVenta: pvArray.length > 0 ? pvArray : [1]
      });
      setIsModalEmpresaOpen(false);
      setEmpresaForm({ nombre: '', razonSocial: '', cuit: '', condicionFiscal: 'Responsable Inscripto', puntosVenta: '1, 6', direccion: '' });
      await cargarDatosConfig();
      alert('Empresa creada correctamente.');
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handleEliminarEmpresa = async (id, nombre) => {
    if (!window.confirm(`¿Estás seguro de eliminar la empresa ${nombre}?`)) return;
    try {
      await eliminarEmpresa(id);
      await cargarDatosConfig();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  // Handlers Bancos
  const handleGuardarBanco = async (e) => {
    e.preventDefault();
    if (!bancoForm.nombreBanco || !bancoForm.numeroCuenta) return;
    try {
      await crearCuentaBancaria(bancoForm);
      setIsModalBancoOpen(false);
      setBancoForm({ nombreBanco: '', tipoCuenta: 'Cuenta Corriente', numeroCuenta: '', cbu: '', alias: '', moneda: 'ARS', saldoInicial: 0, empresaId: 'euler-calefaccion' });
      await cargarDatosConfig();
      alert('Cuenta bancaria / caja creada correctamente.');
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handleEliminarBanco = async (id, nombre) => {
    if (!window.confirm(`¿Estás seguro de eliminar la cuenta ${nombre}?`)) return;
    try {
      await eliminarCuentaBancaria(id);
      await cargarDatosConfig();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  // Handlers Usuarios
  const handleRoleChange = async (userId, newRole) => {
    const targetUser = users.find(u => u.id === userId);
    if ((newRole === 'administrador' || targetUser?.role === 'administrador') && !isSuperAdmin) {
      alert('Solo el dueño del sistema (Nicolás) tiene autorización para asignar o modificar el rol de Administrador.');
      return;
    }

    setUpdatingId(userId);
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, { role: newRole });
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (error) {
      console.error('Error updating role:', error);
      alert('Error al actualizar el rol.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleToggleStatus = async (userId, currentStatus) => {
    const targetUser = users.find(u => u.id === userId);
    if (targetUser && isSuperAdminEmail(targetUser.email)) {
      alert('La cuenta principal del dueño está protegida y no puede ser suspendida.');
      return;
    }
    if (targetUser?.role === 'administrador' && !isSuperAdmin) {
      alert('Solo el dueño del sistema (Nicolás) puede suspender o reactivar administradores.');
      return;
    }

    const confirmMsg = currentStatus === false 
      ? '¿Estás seguro de reactivar a este usuario?' 
      : '¿Estás seguro de suspender a este usuario?';
    
    if (!window.confirm(confirmMsg)) return;

    setUpdatingId(userId);
    try {
      const newStatus = currentStatus === false ? true : false;
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, { isActive: newStatus });
      setUsers(users.map(u => u.id === userId ? { ...u, isActive: newStatus } : u));
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Error al actualizar estado.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (newRole === 'administrador' && !isSuperAdmin) {
      alert('Solo el dueño del sistema (Nicolás) puede crear usuarios con rol de Administrador.');
      return;
    }

    setIsCreating(true);
    try {
      const secondaryAppName = "SecondaryApp_" + Date.now();
      const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
      const secondaryAuth = getAuth(secondaryApp);
      
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newEmail, newPassword);
      const uid = userCredential.user.uid;
      await signOut(secondaryAuth);
      
      const newUserProfile = {
        email: newEmail.toLowerCase().trim(),
        name: newName,
        role: newRole,
        isActive: true
      };
      await setDoc(doc(db, 'users', uid), newUserProfile);
      
      setUsers([...users, { id: uid, ...newUserProfile }]);
      setIsModalUserOpen(false);
      setNewEmail(''); setNewPassword(''); setNewName(''); setNewRole('tecnico');
      alert('Usuario creado exitosamente.');
    } catch (err) {
      console.error(err);
      alert('Error al crear usuario: ' + err.message);
    } finally {
      setIsCreating(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '2rem' }}>Cargando configuración del sistema...</div>;
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', width: '100%', position: 'relative' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Settings color="var(--primary-600)" size={32} />
          <div>
            <h1 style={{ fontSize: '1.75rem', color: 'var(--text-primary)', margin: 0 }}>Configuración General del ERP</h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0 0' }}>
              Gestión de Usuarios, Empresas Emisoras y Cuentas Bancarias / Cajas.
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--border-light)', gap: '1rem', marginBottom: '1.5rem' }}>
        <button 
          onClick={() => setActiveTab('usuarios')} 
          style={{ padding: '0.6rem 1.25rem', border: 'none', background: 'none', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', color: activeTab === 'usuarios' ? 'var(--primary-600)' : '#64748b', borderBottom: activeTab === 'usuarios' ? '2px solid var(--primary-600)' : 'none' }}
        >
          <Shield size={18} /> Usuarios ({users.length})
        </button>
        <button 
          onClick={() => setActiveTab('empresas')} 
          style={{ padding: '0.6rem 1.25rem', border: 'none', background: 'none', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', color: activeTab === 'empresas' ? 'var(--primary-600)' : '#64748b', borderBottom: activeTab === 'empresas' ? '2px solid var(--primary-600)' : 'none' }}
        >
          <Building size={18} /> Empresas Emisoras ({empresas.length})
        </button>
        <button 
          onClick={() => setActiveTab('bancos')} 
          style={{ padding: '0.6rem 1.25rem', border: 'none', background: 'none', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', color: activeTab === 'bancos' ? 'var(--primary-600)' : '#64748b', borderBottom: activeTab === 'bancos' ? '2px solid var(--primary-600)' : 'none' }}
        >
          <Landmark size={18} /> Bancos y Cajas ({bancos.length})
        </button>
      </div>

      {/* TAB USUARIOS */}
      {activeTab === 'usuarios' && (
        <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: '1.1rem', margin: 0, color: 'var(--text-primary)' }}>Usuarios Registrados</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0 0' }}>Administración de permisos y roles del personal.</p>
            </div>
            <button onClick={() => setIsModalUserOpen(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Plus size={16} /> Nuevo Usuario
            </button>
          </div>
          
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-light)', backgroundColor: '#f8fafc' }}>
                <th style={{ padding: '0.75rem 1.25rem' }}>Nombre</th>
                <th style={{ padding: '0.75rem 1.25rem' }}>Correo</th>
                <th style={{ padding: '0.75rem 1.25rem' }}>Rol</th>
                <th style={{ padding: '0.75rem 1.25rem' }}>Estado</th>
                <th style={{ padding: '0.75rem 1.25rem', textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '0.75rem 1.25rem', fontWeight: '600' }}>{user.name}</td>
                  <td style={{ padding: '0.75rem 1.25rem' }}>{user.email}</td>
                  <td style={{ padding: '0.75rem 1.25rem' }}>
                    <select className="input-field" value={user.role || 'tecnico'} onChange={e => handleRoleChange(user.id, e.target.value)} style={{ width: 'auto' }}>
                      {isSuperAdmin && <option value="administrador">Administrador</option>}
                      <option value="operaciones">Operaciones</option>
                      <option value="tecnico">Técnico/Instalador</option>
                    </select>
                  </td>
                  <td style={{ padding: '0.75rem 1.25rem' }}>
                    <span style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '600', backgroundColor: user.isActive !== false ? '#d1fae5' : '#fee2e2', color: user.isActive !== false ? '#059669' : '#dc2626' }}>
                      {user.isActive !== false ? 'Activo' : 'Suspendido'}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1.25rem', textAlign: 'right' }}>
                    <button onClick={() => handleToggleStatus(user.id, user.isActive)} className="btn btn-secondary" style={{ fontSize: '0.75rem' }}>
                      {user.isActive !== false ? 'Suspender' : 'Reactivar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB EMPRESAS */}
      {activeTab === 'empresas' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Empresas Emisoras de Comprobantes</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0 0' }}>Alta, baja y modificación de empresas registradas (CUIT, Condición Fiscal, Puntos de Venta).</p>
            </div>
            <button onClick={() => setIsModalEmpresaOpen(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Plus size={16} /> Nueva Empresa
            </button>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid var(--border-light)' }}>
                <th style={{ padding: '0.75rem 1.25rem' }}>Nombre Fantasía</th>
                <th style={{ padding: '0.75rem 1.25rem' }}>Razón Social</th>
                <th style={{ padding: '0.75rem 1.25rem' }}>CUIT</th>
                <th style={{ padding: '0.75rem 1.25rem' }}>Condición Fiscal</th>
                <th style={{ padding: '0.75rem 1.25rem' }}>Puntos Venta</th>
                <th style={{ padding: '0.75rem 1.25rem', textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {empresas.map(emp => (
                <tr key={emp.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '0.75rem 1.25rem', fontWeight: '700' }}>{emp.nombre}</td>
                  <td style={{ padding: '0.75rem 1.25rem' }}>{emp.razonSocial || emp.nombre}</td>
                  <td style={{ padding: '0.75rem 1.25rem', fontFamily: 'monospace' }}>{emp.cuit}</td>
                  <td style={{ padding: '0.75rem 1.25rem' }}>{emp.condicionFiscal}</td>
                  <td style={{ padding: '0.75rem 1.25rem' }}>
                    {Array.isArray(emp.puntosVenta) ? emp.puntosVenta.join(', ') : emp.puntosVenta}
                  </td>
                  <td style={{ padding: '0.75rem 1.25rem', textAlign: 'right' }}>
                    <button onClick={() => handleEliminarEmpresa(emp.id, emp.nombre)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB BANCOS */}
      {activeTab === 'bancos' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Bancos & Cuentas de Tesorería</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0 0' }}>Gestión de Cuentas Corrientes, Cajas de Efectivo y Saldos Iniciales.</p>
            </div>
            <button onClick={() => setIsModalBancoOpen(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Plus size={16} /> Nueva Cuenta / Caja
            </button>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid var(--border-light)' }}>
                <th style={{ padding: '0.75rem 1.25rem' }}>Banco / Nombre</th>
                <th style={{ padding: '0.75rem 1.25rem' }}>Tipo Cuenta</th>
                <th style={{ padding: '0.75rem 1.25rem' }}>CBU / Alias</th>
                <th style={{ padding: '0.75rem 1.25rem' }}>Moneda</th>
                <th style={{ padding: '0.75rem 1.25rem', textAlign: 'right' }}>Saldo Actual ($)</th>
                <th style={{ padding: '0.75rem 1.25rem', textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {bancos.map(bco => (
                <tr key={bco.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '0.75rem 1.25rem', fontWeight: '700' }}>{bco.nombreBanco}</td>
                  <td style={{ padding: '0.75rem 1.25rem' }}>{bco.tipoCuenta} ({bco.numeroCuenta})</td>
                  <td style={{ padding: '0.75rem 1.25rem', fontSize: '0.75rem' }}>
                    <div>{bco.alias}</div>
                    <div style={{ color: 'var(--text-secondary)' }}>{bco.cbu}</div>
                  </td>
                  <td style={{ padding: '0.75rem 1.25rem', fontWeight: '600' }}>{bco.moneda}</td>
                  <td style={{ padding: '0.75rem 1.25rem', textAlign: 'right', fontWeight: '700', color: '#059669' }}>
                    $ {Number(bco.saldoActual || 0).toLocaleString('es-AR')}
                  </td>
                  <td style={{ padding: '0.75rem 1.25rem', textAlign: 'right' }}>
                    <button onClick={() => handleEliminarBanco(bco.id, bco.nombreBanco)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL CREAR EMPRESA */}
      {isModalEmpresaOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="card" style={{ width: '100%', maxWidth: '500px', padding: '1.5rem' }}>
            <h3 style={{ margin: '0 0 1rem' }}>Crear Nueva Empresa Emisora</h3>
            <form onSubmit={handleGuardarEmpresa} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.85rem' }}>Nombre Fantasía</label>
                <input type="text" className="input-field" value={empresaForm.nombre} onChange={e => setEmpresaForm({...empresaForm, nombre: e.target.value})} required placeholder="Ej: Euler Climatización SAS" />
              </div>
              <div>
                <label style={{ fontSize: '0.85rem' }}>Razón Social</label>
                <input type="text" className="input-field" value={empresaForm.razonSocial} onChange={e => setEmpresaForm({...empresaForm, razonSocial: e.target.value})} placeholder="Euler Climatización S.A.S." />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.85rem' }}>CUIT</label>
                  <input type="text" className="input-field" value={empresaForm.cuit} onChange={e => setEmpresaForm({...empresaForm, cuit: e.target.value})} required placeholder="30-71654321-9" />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem' }}>Puntos de Venta (separados por coma)</label>
                  <input type="text" className="input-field" value={empresaForm.puntosVenta} onChange={e => setEmpresaForm({...empresaForm, puntosVenta: e.target.value})} placeholder="1, 6, 15" />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalEmpresaOpen(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Guardar Empresa</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CREAR BANCO */}
      {isModalBancoOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="card" style={{ width: '100%', maxWidth: '500px', padding: '1.5rem' }}>
            <h3 style={{ margin: '0 0 1rem' }}>Crear Nueva Cuenta Bancaria / Caja</h3>
            <form onSubmit={handleGuardarBanco} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.85rem' }}>Nombre Entidad / Caja</label>
                <input type="text" className="input-field" value={bancoForm.nombreBanco} onChange={e => setBancoForm({...bancoForm, nombreBanco: e.target.value})} required placeholder="Ej: Banco Santander CC ARS" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.85rem' }}>Tipo Cuenta</label>
                  <select className="input-field" value={bancoForm.tipoCuenta} onChange={e => setBancoForm({...bancoForm, tipoCuenta: e.target.value})}>
                    <option value="Cuenta Corriente">Cuenta Corriente</option>
                    <option value="Caja de Ahorros">Caja de Ahorros</option>
                    <option value="Caja de Efectivo">Caja de Efectivo</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem' }}>N° Cuenta / Identificador</label>
                  <input type="text" className="input-field" value={bancoForm.numeroCuenta} onChange={e => setBancoForm({...bancoForm, numeroCuenta: e.target.value})} required placeholder="CC-12345" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.85rem' }}>Alias</label>
                  <input type="text" className="input-field" value={bancoForm.alias} onChange={e => setBancoForm({...bancoForm, alias: e.target.value})} placeholder="EULER.SANTANDER" />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem' }}>Saldo Inicial ($)</label>
                  <input type="number" className="input-field" value={bancoForm.saldoInicial} onChange={e => setBancoForm({...bancoForm, saldoInicial: Number(e.target.value)})} placeholder="100000" />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalBancoOpen(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Guardar Cuenta</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default Configuracion;
