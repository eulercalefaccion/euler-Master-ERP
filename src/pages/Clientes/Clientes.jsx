import React, { useState, useEffect } from 'react';
import { Search, Filter, Plus, FileText, Wrench, MoreVertical, Building, User, Mail, Phone, X, Save } from 'lucide-react';
import { db } from '../../services/firebaseConfig';
import { collection, onSnapshot, query, addDoc, writeBatch, doc } from 'firebase/firestore';

const Clientes = () => {
  const [clientes, setClientes] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('Todos');
  const [sortOrder, setSortOrder] = useState('A-Z');
  
  // States for Side Panel
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '', type: 'Propietario', cuit: '', email: '', phone: '', address: '', priceList: 'Consumidor Final'
  });

  const types = ['Todos', 'Propietario', 'Arquitecto', 'Estudio de Arquitectura', 'Constructora', 'Cliente SSTT'];
  const formTypes = ['Propietario', 'Arquitecto', 'Estudio de Arquitectura', 'Constructora', 'Cliente SSTT'];

  useEffect(() => {
    const q = query(collection(db, 'clientes')); 
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setClientes(docs);
    });

    return () => unsubscribe();
  }, []);

  const filteredClientes = clientes.filter(cliente => {
    const term = searchTerm.toLowerCase();
    const nameMatch = cliente.name ? cliente.name.toLowerCase().includes(term) : false;
    const cuitMatch = cliente.cuit ? cliente.cuit.includes(term) : false;
    const matchesSearch = nameMatch || cuitMatch;
    
    const matchesType = filterType === 'Todos' || cliente.type === filterType;
    return matchesSearch && matchesType;
  }).sort((a, b) => {
    const nameA = a.name || '';
    const nameB = b.name || '';
    if (sortOrder === 'A-Z') return nameA.localeCompare(nameB);
    if (sortOrder === 'Z-A') return nameB.localeCompare(nameA);
    return 0;
  });

  const getTypeIcon = (type) => {
    if (!type) return <User size={16} />;
    if (type.includes('Arquitectura') || type.includes('Constructora')) return <Building size={16} />;
    return <User size={16} />;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveClient = async (e) => {
    e.preventDefault();
    if (!formData.name) {
      alert("El Nombre o Razón Social es obligatorio");
      return;
    }
    
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'clientes'), {
        ...formData,
        obrasCount: 0,
        ssttCount: 0,
        createdAt: new Date()
      });
      setIsPanelOpen(false);
      setFormData({
        name: '', type: 'Propietario', cuit: '', email: '', phone: '', address: '', priceList: 'Consumidor Final'
      });
    } catch (error) {
      console.error("Error al guardar cliente: ", error);
      alert("Hubo un error al guardar el cliente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImportGesdatta = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/clientes_gesdatta.json');
      const data = await response.json();
      
      const batches = [];
      let currentBatch = writeBatch(db);
      let count = 0;
      
      data.forEach(client => {
        const docRef = doc(collection(db, 'clientes'));
        currentBatch.set(docRef, { ...client, createdAt: new Date() });
        count++;
        if (count === 400) { // Firebase max limit per batch is 500, we use 400 for safety
          batches.push(currentBatch);
          currentBatch = writeBatch(db);
          count = 0;
        }
      });
      if (count > 0) batches.push(currentBatch);
      
      for (const b of batches) {
         await b.commit();
      }
      
      alert('¡Sincronización a la Nube Completada de ' + data.length + ' clientes! Refresca si no los ves.');
    } catch (e) {
      console.error("Error importando:", e);
      alert('Error en importación. Ver consola.');
    }
    setIsSubmitting(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', margin: 0 }}>Directorio de Contactos</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Base unificada: {clientes.length} contactos en total
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn btn-secondary" onClick={handleImportGesdatta} disabled={isSubmitting}>
             Re-Importar Nube
          </button>
          <button className="btn btn-primary" onClick={() => setIsPanelOpen(true)} disabled={isSubmitting}>
            <Plus size={18} />
            Nuevo Contacto
          </button>
        </div>
      </div>

      {/* Toolbox (Buscador y Filtros) */}
      <div className="card" style={{ padding: '1rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flexGrow: 1, maxWidth: '400px' }}>
          <Search size={18} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input 
            type="text" 
            placeholder="Buscar por nombre, razón social o CUIT..." 
            className="input-field"
            style={{ paddingLeft: '2.5rem' }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Filter size={18} color="var(--text-secondary)" />
          <select 
            className="input-field" 
            style={{ width: 'auto' }}
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select 
            className="input-field" 
            style={{ width: 'auto', marginLeft: '0.5rem' }}
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          >
            <option value="A-Z">A-Z</option>
            <option value="Z-A">Z-A</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ backgroundColor: 'var(--bg-surface-hover)', borderBottom: '1px solid var(--border-light)' }}>
              <tr>
                <th style={{ padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: '600' }}>Contacto</th>
                <th style={{ padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: '600' }}>Detalles</th>
                <th style={{ padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: '600' }}>Historial</th>
                <th style={{ padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: '600', textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredClientes.map(cliente => (
                <tr key={cliente.id} style={{ borderBottom: '1px solid var(--border-light)', transition: 'background-color 0.15s' }} className="table-row-hover">
                  <td style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: 'var(--primary-50)', color: 'var(--primary-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {getTypeIcon(cliente.type)}
                      </div>
                      <div>
                        <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{cliente.name || 'Sin nombre'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.125rem' }}>{cliente.type || 'Tipo No Definido'} • CUIT: {cliente.cuit || '-'}</div>
                      </div>
                    </div>
                  </td>
                  
                  <td style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                        <Mail size={14} /> {cliente.email || '-'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                        <Phone size={14} /> {cliente.phone || '-'}
                      </div>
                    </div>
                  </td>

                  <td style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <div title="Obras Vinculadas" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem', color: cliente.obrasCount > 0 ? 'var(--primary-600)' : 'var(--text-tertiary)', fontWeight: '500' }}>
                        <FileText size={16} /> {cliente.obrasCount || 0}
                      </div>
                      <div title="Servicios Técnicos (SSTT)" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem', color: cliente.ssttCount > 0 ? 'var(--warning)' : 'var(--text-tertiary)', fontWeight: '500' }}>
                        <Wrench size={16} /> {cliente.ssttCount || 0}
                      </div>
                    </div>
                  </td>

                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    <button style={{ color: 'var(--text-tertiary)', padding: '0.5rem', borderRadius: '50%', transition: 'background-color 0.2s' }} className="btn-icon">
                      <MoreVertical size={18} />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredClientes.length === 0 && (
                <tr>
                  <td colSpan="4" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No se encontraron contactos con esos filtros en la base de datos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Side Panel overlay */}
      {isPanelOpen && (
        <div 
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 40 }}
          onClick={() => setIsPanelOpen(false)}
        />
      )}

      {/* Side Panel (Slide out) */}
      <div style={{
        position: 'fixed', top: 0, right: isPanelOpen ? 0 : '-500px', bottom: 0, width: '100%', maxWidth: '450px',
        backgroundColor: 'var(--bg-primary)', boxShadow: '-5px 0 25px rgba(0,0,0,0.1)', zIndex: 50,
        transition: 'right 0.3s cubic-bezier(0.4, 0, 0.2, 1)', display: 'flex', flexDirection: 'column'
      }}>
        {/* Panel Header */}
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface-hover)' }}>
          <h3 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
            <User color="var(--primary-600)" />
            Nuevo Contacto
          </h3>
          <button 
            onClick={() => setIsPanelOpen(false)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}
            className="btn-icon"
          >
            <X size={24} />
          </button>
        </div>

        {/* Panel Body (Form) */}
        <form onSubmit={handleSaveClient} style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Nombre / Razón Social <span style={{color: 'var(--accent-600)'}}>*</span></label>
            <input type="text" name="name" value={formData.name} onChange={handleInputChange} className="input-field" placeholder="Ej: Constructora San Juan S.A." required />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Tipo de Cliente</label>
              <select name="type" value={formData.type} onChange={handleInputChange} className="input-field">
                {formTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">CUIT / DNI</label>
              <input type="text" name="cuit" value={formData.cuit} onChange={handleInputChange} className="input-field" placeholder="30-12345678-9" />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Correo Electrónico</label>
            <input type="email" name="email" value={formData.email} onChange={handleInputChange} className="input-field" placeholder="contacto@empresa.com" />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Teléfono</label>
            <input type="text" name="phone" value={formData.phone} onChange={handleInputChange} className="input-field" placeholder="+54 9 341 1234567" />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Dirección Fiscal / Principal</label>
            <input type="text" name="address" value={formData.address} onChange={handleInputChange} className="input-field" placeholder="Calle Falsa 123, Ciudad" />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Lista de Precios Base</label>
            <select name="priceList" value={formData.priceList} onChange={handleInputChange} className="input-field">
              <option value="Consumidor Final">Consumidor Final</option>
              <option value="Mayorista">Mayorista (Gremio)</option>
              <option value="Arquitectos">Arquitectos (Especial)</option>
            </select>
          </div>

          {/* Panel Footer (Buttons inside form to act as submit) */}
          <div style={{ marginTop: 'auto', paddingTop: '1.5rem', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsPanelOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: isSubmitting ? 0.7 : 1 }}>
              <Save size={18} />
              {isSubmitting ? 'Guardando...' : 'Guardar Cliente'}
            </button>
          </div>
        </form>

      </div>
      
      <style>{`
        .table-row-hover:hover {
          background-color: var(--bg-surface-hover);
        }
        .btn-icon:hover {
          background-color: var(--border-light);
          color: var(--text-primary) !important;
        }
      `}</style>
    </div>
  );
};

export default Clientes;
