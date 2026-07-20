import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, setDoc } from 'firebase/firestore';
import { sendPasswordResetEmail, getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { initializeApp } from 'firebase/app';
import { db, firebaseConfig, auth } from '../../services/firebaseConfig';
import { Settings, UserX, UserCheck, ShieldAlert, Shield, Plus, KeyRound, Edit2, X, Save } from 'lucide-react';

const Configuracion = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('tecnico');
  const [isCreating, setIsCreating] = useState(false);

  // Edit Name State
  const [editingNameId, setEditingNameId] = useState(null);
  const [editNameValue, setEditNameValue] = useState('');

  const fetchUsers = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'users'));
      const usersData = [];
      querySnapshot.forEach((doc) => {
        usersData.push({ id: doc.id, ...doc.data() });
      });
      setUsers(usersData);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleRoleChange = async (userId, newRole) => {
    setUpdatingId(userId);
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, { role: newRole });
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (error) {
      console.error('Error updating role:', error);
      alert('Error al actualizar el rol');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleToggleStatus = async (userId, currentStatus) => {
    const confirmMsg = currentStatus === false 
      ? '¿Estás seguro de reactivar a este usuario? Podrá acceder nuevamente al sistema.' 
      : '¿Estás seguro de suspender a este usuario? Ya no podrá acceder al sistema.';
    
    if (!window.confirm(confirmMsg)) return;

    setUpdatingId(userId);
    try {
      const newStatus = currentStatus === false ? true : false;
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, { isActive: newStatus });
      setUsers(users.map(u => u.id === userId ? { ...u, isActive: newStatus } : u));
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Error al actualizar el estado');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleResetPassword = async (email) => {
    if (!window.confirm(`¿Enviar un correo a ${email} con un enlace para restablecer su contraseña?`)) return;
    try {
      await sendPasswordResetEmail(auth, email);
      alert(`Enlace de restablecimiento enviado exitosamente a ${email}`);
    } catch (err) {
      console.error(err);
      alert('Error al enviar el correo. Verifique que el usuario esté correctamente registrado.');
    }
  };

  const handleSaveName = async (userId) => {
    setUpdatingId(userId);
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, { name: editNameValue });
      setUsers(users.map(u => u.id === userId ? { ...u, name: editNameValue } : u));
      setEditingNameId(null);
    } catch (err) {
      console.error(err);
      alert('Error al actualizar el nombre');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      // 1. Create secondary app to avoid logging out the current admin
      const secondaryAppName = "SecondaryApp_" + Date.now();
      const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
      const secondaryAuth = getAuth(secondaryApp);
      
      // 2. Create the user
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newEmail, newPassword);
      const uid = userCredential.user.uid;
      
      // 3. Sign out the secondary app immediately to prevent session interference
      await signOut(secondaryAuth);
      
      // 4. Save to Firestore (using MAIN app db)
      const newUserProfile = {
        email: newEmail.toLowerCase(),
        name: newName,
        role: newRole,
        isActive: true
      };
      await setDoc(doc(db, 'users', uid), newUserProfile);
      
      // 5. Update local state
      setUsers([...users, { id: uid, ...newUserProfile }]);
      setIsModalOpen(false);
      setNewEmail('');
      setNewPassword('');
      setNewName('');
      setNewRole('tecnico');
      alert('Usuario creado exitosamente.');
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        alert('Este correo ya está registrado en Firebase.');
      } else {
        alert('Error al crear usuario: ' + err.message);
      }
    } finally {
      setIsCreating(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '2rem' }}>Cargando usuarios...</div>;
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', width: '100%', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Settings color="var(--primary-600)" size={32} />
          <h1 style={{ fontSize: '1.75rem', color: 'var(--text-primary)', margin: 0 }}>Configuración de Usuarios</h1>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="btn btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}
        >
          <Plus size={18} /> Nuevo Usuario
        </button>
      </div>

      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--bg-secondary)' }}>
          <h2 style={{ fontSize: '1.1rem', margin: 0, color: 'var(--text-primary)' }}>Usuarios Registrados</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0 0' }}>
            Administra los roles, el acceso y las cuentas de todos los usuarios registrados en el sistema.
          </p>
        </div>
        
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-light)', backgroundColor: '#f8fafc' }}>
                <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '0.85rem' }}>NOMBRE</th>
                <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '0.85rem' }}>CORREO</th>
                <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '0.85rem' }}>ROL</th>
                <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '0.85rem' }}>ESTADO</th>
                <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '0.85rem', textAlign: 'right' }}>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No hay usuarios registrados.
                  </td>
                </tr>
              ) : (
                users.map(user => (
                  <tr key={user.id} style={{ borderBottom: '1px solid var(--border-light)', backgroundColor: user.isActive === false ? '#fff1f2' : 'transparent' }}>
                    <td style={{ padding: '1rem 1.5rem', fontWeight: '500', color: 'var(--text-primary)' }}>
                      {editingNameId === user.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <input 
                            type="text" 
                            className="input-field" 
                            value={editNameValue} 
                            onChange={(e) => setEditNameValue(e.target.value)}
                            style={{ padding: '0.25rem 0.5rem', width: '150px' }}
                          />
                          <button onClick={() => handleSaveName(user.id)} style={{ color: 'var(--primary-600)', background: 'none', border: 'none', cursor: 'pointer' }}><Save size={16} /></button>
                          <button onClick={() => setEditingNameId(null)} style={{ color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} /></button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span>{user.name}</span>
                          <button 
                            onClick={() => { setEditingNameId(user.id); setEditNameValue(user.name || ''); }} 
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}
                            title="Editar nombre"
                          >
                            <Edit2 size={12} />
                          </button>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      {user.email}
                    </td>
                    <td style={{ padding: '1rem 1.5rem' }}>
                      <select
                        className="input-field"
                        value={user.role || 'tecnico'}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        disabled={updatingId === user.id}
                        style={{ padding: '0.4rem', fontSize: '0.85rem', width: 'auto', minWidth: '140px' }}
                      >
                        <option value="administrador">Administrador</option>
                        <option value="operaciones">Operaciones</option>
                        <option value="tecnico">Técnico/Instalador</option>
                      </select>
                    </td>
                    <td style={{ padding: '1rem 1.5rem' }}>
                      {user.isActive === false ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.6rem', borderRadius: '999px', backgroundColor: '#ffe4e6', color: '#e11d48', fontSize: '0.75rem', fontWeight: '600' }}>
                          <ShieldAlert size={14} /> Inactivo
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.6rem', borderRadius: '999px', backgroundColor: '#dcfce7', color: '#166534', fontSize: '0.75rem', fontWeight: '600' }}>
                          <Shield size={14} /> Activo
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <button
                          onClick={() => handleResetPassword(user.email)}
                          title="Enviar correo para restablecer contraseña"
                          className="btn btn-secondary"
                          style={{ padding: '0.4rem 0.6rem', display: 'inline-flex', alignItems: 'center' }}
                        >
                          <KeyRound size={14} />
                        </button>
                        <button
                          onClick={() => handleToggleStatus(user.id, user.isActive)}
                          disabled={updatingId === user.id}
                          className={`btn ${user.isActive === false ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                        >
                          {user.isActive === false ? (
                            <><UserCheck size={14} /> Reactivar</>
                          ) : (
                            <><UserX size={14} /> Suspender</>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Crear Usuario */}
      {isModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="card" style={{ width: '100%', maxWidth: '450px', padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary-700)' }}>
                <Plus size={20} /> Crear Nuevo Usuario
              </h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}><X size={20}/></button>
            </div>
            
            <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Nombre del empleado</label>
                <input type="text" className="input-field" required value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ej: Juan Pérez" />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Correo Electrónico</label>
                <input type="email" className="input-field" required value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="juan@euler.com.ar" />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Contraseña Inicial</label>
                <input type="text" className="input-field" required value={newPassword} onChange={e => setNewPassword(e.target.value)} minLength={6} placeholder="Mínimo 6 caracteres" />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.25rem', display: 'block' }}>El usuario podrá cambiarla después usando el botón de la llave 🔑.</span>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Nivel de Acceso (Rol)</label>
                <select className="input-field" value={newRole} onChange={e => setNewRole(e.target.value)}>
                  <option value="tecnico">Técnico/Instalador</option>
                  <option value="operaciones">Operaciones</option>
                  <option value="administrador">Administrador</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)} disabled={isCreating}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={isCreating}>
                  {isCreating ? 'Creando...' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Configuracion;
