import React, { useState, useEffect } from 'react';
import { Search, Filter, Plus, FileText, Wrench, MoreVertical, Building, User, Mail, Phone, X, Save, Edit2, Trash2 } from 'lucide-react';
import { db } from '../../services/firebaseConfig';
import { collection, onSnapshot, query, addDoc, updateDoc, deleteDoc, writeBatch, doc } from 'firebase/firestore';

const Clientes = () => {
  const [clientes, setClientes] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('Todos');
  const [sortOrder, setSortOrder] = useState('A-Z');
  
  // States for Side Panel
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'Propietario',
    email: '',
    phone: '',
    address: '',
    cuit: '',
    dni: '',
    contactoNombre: '',
    contactoTelefono: '',
    direccionObra: '',
    location: '',
    tipoObra: 'VIVIENDA UNIFAMILIAR',
    estadoObra: 'OBRA NUEVA',
    tipoProyecto: 'LLAVE EN MANO (CAÑERIA+EQUIPOS+MANO DE OBRA)',
    priceList: 'Consumidor Final',
    facturacionIgualCliente: true,
    facturacionNombre: '',
    facturacionCuit: '',
    facturacionDni: '',
    facturacionDireccion: '',
  });

  // Actions dropdown
  const [openMenuId, setOpenMenuId] = useState(null);

  const types = ['Todos', 'Propietario', 'Arquitecto', 'Estudio de Arquitectura', 'Constructora', 'Desarrolladora', 'Cliente SSTT'];
  const formTypes = ['Propietario', 'Arquitecto', 'Estudio de Arquitectura', 'Constructora', 'Desarrolladora', 'Cliente SSTT'];

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

  // Close menu on outside click
  useEffect(() => {
    const handleClick = () => setOpenMenuId(null);
    if (openMenuId) document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [openMenuId]);

  const filteredClientes = clientes.filter(cliente => {
    const term = searchTerm.toLowerCase();
    const nameMatch = cliente.name ? cliente.name.toLowerCase().includes(term) : false;
    const cuitMatch = cliente.cuit ? cliente.cuit.includes(term) : false;
    const phoneMatch = cliente.phone ? cliente.phone.includes(term) : false;
    const matchesSearch = nameMatch || cuitMatch || phoneMatch;
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
    setFormData(prev => {
      const next = { ...prev, [name]: value };
      if (prev.facturacionIgualCliente) {
        if (name === 'name') next.facturacionNombre = value;
        if (name === 'cuit') next.facturacionCuit = value;
        if (name === 'dni') next.facturacionDni = value;
        if (name === 'address') next.facturacionDireccion = value;
      }
      return next;
    });
  };

  const handleToggleFacturacionIgualCliente = (checked) => {
    setFormData(prev => {
      const next = { ...prev, facturacionIgualCliente: checked };
      if (checked) {
        next.facturacionNombre = prev.name;
        next.facturacionCuit = prev.cuit;
        next.facturacionDni = prev.dni;
        next.facturacionDireccion = prev.address;
      }
      return next;
    });
  };

  const openNewPanel = () => {
    setEditingId(null);
    setFormData({
      name: '',
      type: 'Propietario',
      email: '',
      phone: '',
      address: '',
      cuit: '',
      dni: '',
      contactoNombre: '',
      contactoTelefono: '',
      direccionObra: '',
      location: '',
      tipoObra: 'VIVIENDA UNIFAMILIAR',
      estadoObra: 'OBRA NUEVA',
      tipoProyecto: 'LLAVE EN MANO (CAÑERIA+EQUIPOS+MANO DE OBRA)',
      priceList: 'Consumidor Final',
      facturacionIgualCliente: true,
      facturacionNombre: '',
      facturacionCuit: '',
      facturacionDni: '',
      facturacionDireccion: '',
    });
    setIsPanelOpen(true);
  };

  const openEditPanel = (cliente) => {
    setEditingId(cliente.id);
    setFormData({
      name: cliente.name || '',
      type: cliente.type || 'Propietario',
      cuit: cliente.cuit || '',
      dni: cliente.dni || '',
      email: cliente.email || '',
      phone: cliente.phone || '',
      address: cliente.address || '',
      contactoNombre: cliente.contactoNombre || '',
      contactoTelefono: cliente.contactoTelefono || '',
      direccionObra: cliente.direccionObra || '',
      location: cliente.location || '',
      tipoObra: cliente.tipoObra || 'VIVIENDA UNIFAMILIAR',
      estadoObra: cliente.estadoObra || 'OBRA NUEVA',
      tipoProyecto: cliente.tipoProyecto || 'LLAVE EN MANO (CAÑERIA+EQUIPOS+MANO DE OBRA)',
      priceList: cliente.priceList || 'Consumidor Final',
      facturacionIgualCliente: cliente.facturacionIgualCliente !== false,
      facturacionNombre: cliente.facturacionNombre || '',
      facturacionCuit: cliente.facturacionCuit || '',
      facturacionDni: cliente.facturacionDni || '',
      facturacionDireccion: cliente.facturacionDireccion || '',
    });
    setIsPanelOpen(true);
    setOpenMenuId(null);
  };

  const handleDeleteClient = async (id, name) => {
    setOpenMenuId(null);
    if (window.confirm(`¿Seguro que deseas eliminar a "${name}"? Esta acción no se puede deshacer.`)) {
      try {
        await deleteDoc(doc(db, 'clientes', id));
      } catch (err) {
        console.error(err);
        alert('Error al eliminar: ' + err.message);
      }
    }
  };

  const handleSaveClient = async (e) => {
    e.preventDefault();
    if (!formData.name) {
      alert("El Nombre o Razón Social es obligatorio");
      return;
    }
    
    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
        facturacionNombre: formData.facturacionIgualCliente ? formData.name : formData.facturacionNombre,
        facturacionCuit: formData.facturacionIgualCliente ? formData.cuit : formData.facturacionCuit,
        facturacionDni: formData.facturacionIgualCliente ? formData.dni : formData.facturacionDni,
        facturacionDireccion: formData.facturacionIgualCliente ? formData.address : formData.facturacionDireccion,
      };

      if (editingId) {
        await updateDoc(doc(db, 'clientes', editingId), payload);
      } else {
        await addDoc(collection(db, 'clientes'), {
          ...payload,
          obrasCount: 0,
          ssttCount: 0,
          createdAt: new Date()
        });
      }
      setIsPanelOpen(false);
      setEditingId(null);
      setFormData({
        name: '',
        type: 'Propietario',
        email: '',
        phone: '',
        address: '',
        cuit: '',
        dni: '',
        contactoNombre: '',
        contactoTelefono: '',
        direccionObra: '',
        location: '',
        tipoObra: 'VIVIENDA UNIFAMILIAR',
        estadoObra: 'OBRA NUEVA',
        tipoProyecto: 'LLAVE EN MANO (CAÑERIA+EQUIPOS+MANO DE OBRA)',
        priceList: 'Consumidor Final',
        facturacionIgualCliente: true,
        facturacionNombre: '',
        facturacionCuit: '',
        facturacionDni: '',
        facturacionDireccion: '',
      });
    } catch (error) {
      console.error("Error al guardar cliente: ", error);
      alert("Error: " + error.message);
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
        if (count === 400) {
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
          <button className="btn btn-primary" onClick={openNewPanel} disabled={isSubmitting}>
            <Plus size={18} />
            Nuevo Contacto
          </button>
        </div>
      </div>

      {/* Toolbox */}
      <div className="card" style={{ padding: '1rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flexGrow: 1, maxWidth: '400px' }}>
          <Search size={18} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input 
            type="text" 
            placeholder="Buscar por nombre, CUIT o teléfono..." 
            className="input-field"
            style={{ paddingLeft: '2.5rem' }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Filter size={18} color="var(--text-secondary)" />
          <select className="input-field" style={{ width: 'auto' }} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="input-field" style={{ width: 'auto', marginLeft: '0.5rem' }} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
            <option value="A-Z">A-Z</option>
            <option value="Z-A">Z-A</option>
          </select>
        </div>
      </div>

      {/* Table */}
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

                  <td style={{ padding: '1rem', textAlign: 'center', position: 'relative' }}>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === cliente.id ? null : cliente.id); }}
                      style={{ color: 'var(--text-tertiary)', padding: '0.5rem', borderRadius: '50%', transition: 'background-color 0.2s' }} 
                      className="btn-icon"
                    >
                      <MoreVertical size={18} />
                    </button>
                    
                    {openMenuId === cliente.id && (
                      <div style={{
                        position: 'absolute', right: '1rem', top: '3rem', zIndex: 20,
                        backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)',
                        borderRadius: '8px', boxShadow: 'var(--shadow-lg)', minWidth: '160px',
                        overflow: 'hidden'
                      }}>
                        <button 
                          onClick={() => openEditPanel(cliente)}
                          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.75rem 1rem', border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.875rem', color: 'var(--text-primary)', textAlign: 'left' }}
                          className="table-row-hover"
                        >
                          <Edit2 size={14} /> Editar
                        </button>
                        <button 
                          onClick={() => handleDeleteClient(cliente.id, cliente.name)}
                          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.75rem 1rem', border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.875rem', color: '#dc2626', textAlign: 'left' }}
                          className="table-row-hover"
                        >
                          <Trash2 size={14} /> Eliminar
                        </button>
                      </div>
                    )}
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

      <div style={{
        position: 'fixed', top: 0, right: isPanelOpen ? 0 : '-700px', bottom: 0, width: '100%', maxWidth: '650px',
        backgroundColor: 'var(--bg-primary)', boxShadow: '-5px 0 25px rgba(0,0,0,0.15)', zIndex: 50,
        transition: 'right 0.3s cubic-bezier(0.4, 0, 0.2, 1)', display: 'flex', flexDirection: 'column'
      }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface-hover)' }}>
          <h3 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
            <User color="var(--primary-600)" />
            {editingId ? 'Editar Contacto' : 'Nuevo Contacto'}
          </h3>
          <button onClick={() => setIsPanelOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }} className="btn-icon">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSaveClient} style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* SECCIÓN 1: Identidad del Contacto */}
          <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h4 style={{ margin: 0, color: 'var(--primary-700)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Identidad del Contacto</h4>
            
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Nombre o Razón Social del Cliente <span style={{ color: 'var(--accent-600)' }}>*</span></label>
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
                <label className="form-label">Lista de Precios Base</label>
                <select name="priceList" value={formData.priceList} onChange={handleInputChange} className="input-field">
                  <option value="Consumidor Final">Consumidor Final</option>
                  <option value="Mayorista">Mayorista (Gremio)</option>
                  <option value="Arquitectos">Arquitectos (Especial)</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">CUIT</label>
                <input type="text" name="cuit" value={formData.cuit} onChange={handleInputChange} className="input-field" placeholder="30-12345678-9" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">DNI</label>
                <input type="text" name="dni" value={formData.dni} onChange={handleInputChange} className="input-field" placeholder="DNI del cliente" />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Teléfono Principal</label>
                <input type="text" name="phone" value={formData.phone} onChange={handleInputChange} className="input-field" placeholder="+54 9 341 1234567" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Correo Electrónico</label>
                <input type="email" name="email" value={formData.email} onChange={handleInputChange} className="input-field" placeholder="contacto@empresa.com" />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Dirección Principal / Comercial</label>
              <input type="text" name="address" value={formData.address} onChange={handleInputChange} className="input-field" placeholder="Calle, Nro, Localidad del Cliente" />
            </div>
          </div>

          {/* SECCIÓN 2: Persona de Contacto */}
          {formData.type !== 'Propietario' && (
            <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h4 style={{ margin: 0, color: 'var(--primary-700)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Persona de Contacto</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Nombre y Apellido</label>
                  <input type="text" name="contactoNombre" value={formData.contactoNombre} onChange={handleInputChange} className="input-field" placeholder="Nombre del contacto" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Teléfono de Contacto</label>
                  <input type="text" name="contactoTelefono" value={formData.contactoTelefono} onChange={handleInputChange} className="input-field" placeholder="Móvil del contacto" />
                </div>
              </div>
            </div>
          )}

          {/* SECCIÓN 3: Detalles de Obra y Servicio */}
          <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h4 style={{ margin: 0, color: 'var(--primary-700)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Detalles de Obra y Servicio</h4>
            
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Dirección de la Obra</label>
              <input type="text" name="direccionObra" value={formData.direccionObra} onChange={handleInputChange} className="input-field" placeholder="Calle, Nro, Piso, Localidad" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Localidad / Zona (Obra)</label>
                <input type="text" name="location" value={formData.location} onChange={handleInputChange} className="input-field" placeholder="Ej: Funes, Fisherton" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Tipo de Obra</label>
                <select name="tipoObra" value={formData.tipoObra} onChange={handleInputChange} className="input-field">
                  <option value="VIVIENDA UNIFAMILIAR">VIVIENDA UNIFAMILIAR</option>
                  <option value="EDIFICIO">EDIFICIO</option>
                  <option value="LOCAL COMERCIAL">LOCAL COMERCIAL</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Estado de Obra</label>
                <select name="estadoObra" value={formData.estadoObra} onChange={handleInputChange} className="input-field">
                  <option value="OBRA NUEVA">OBRA NUEVA</option>
                  <option value="OBRA REFACCION">OBRA REFACCION</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Tipo de Proyecto / Servicio</label>
                <select name="tipoProyecto" value={formData.tipoProyecto} onChange={handleInputChange} className="input-field">
                  <option value="SOLO VENTA DE EQUIPOS">SOLO VENTA DE EQUIPOS</option>
                  <option value="VENTA+INSTALACION DE EQUIPOS (TIENE CAÑERIA HECHA)">VENTA+INSTALACION DE EQUIPOS (TIENE CAÑERIA HECHA)</option>
                  <option value="SOLO CAÑERIA">SOLO CAÑERIA</option>
                  <option value="LLAVE EN MANO (CAÑERIA+EQUIPOS+MANO DE OBRA)">LLAVE EN MANO (CAÑERIA+EQUIPOS+MANO DE OBRA)</option>
                  <option value="OTRO">OTRO</option>
                </select>
              </div>
            </div>
          </div>

          {/* SECCIÓN 4: Facturación */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, color: 'var(--primary-700)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Datos de Facturación</h4>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: '500' }}>
                <input
                  type="checkbox"
                  checked={formData.facturacionIgualCliente}
                  onChange={e => handleToggleFacturacionIgualCliente(e.target.checked)}
                />
                Igual que los datos del cliente
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Nombre / Razón Social Facturación</label>
                <input type="text" name="facturacionNombre" disabled={formData.facturacionIgualCliente} value={formData.facturacionNombre} onChange={handleInputChange} className="input-field" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Dirección Facturación</label>
                <input type="text" name="facturacionDireccion" disabled={formData.facturacionIgualCliente} value={formData.facturacionDireccion} onChange={handleInputChange} className="input-field" />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">CUIT Facturación</label>
                <input type="text" name="facturacionCuit" placeholder="30-XXXXXX-X" disabled={formData.facturacionIgualCliente} value={formData.facturacionCuit} onChange={handleInputChange} className="input-field" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">DNI Facturación</label>
                <input type="text" name="facturacionDni" disabled={formData.facturacionIgualCliente} value={formData.facturacionDni} onChange={handleInputChange} className="input-field" />
              </div>
            </div>
          </div>

          <div style={{ marginTop: 'auto', paddingTop: '1.5rem', display: 'flex', gap: '1rem', justifyContent: 'flex-end', borderTop: '1px solid var(--border-light)' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsPanelOpen(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: isSubmitting ? 0.7 : 1 }}>
              <Save size={18} />
              {isSubmitting ? 'Guardando...' : (editingId ? 'Actualizar' : 'Guardar Cliente')}
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
      `}
      </style>
    </div>
  );
};

export default Clientes;
