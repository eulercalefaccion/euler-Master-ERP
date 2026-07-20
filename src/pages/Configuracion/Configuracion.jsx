import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../services/firebaseConfig';
import { Settings, UserX, UserCheck, ShieldAlert, Shield } from 'lucide-react';

const Configuracion = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

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

  if (loading) {
    return <div style={{ padding: '2rem' }}>Cargando usuarios...</div>;
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
        <Settings color="var(--primary-600)" size={32} />
        <h1 style={{ fontSize: '1.75rem', color: 'var(--text-primary)', margin: 0 }}>Configuración de Usuarios</h1>
      </div>

      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--bg-secondary)' }}>
          <h2 style={{ fontSize: '1.1rem', margin: 0, color: 'var(--text-primary)' }}>Usuarios Registrados</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0 0' }}>
            Administra los roles y el acceso al sistema de todos los usuarios registrados.
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
                      {user.name}
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
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Configuracion;
