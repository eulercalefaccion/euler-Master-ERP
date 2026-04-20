import React, { useState, useEffect } from 'react';
import { DragDropContext } from '@hello-pangea/dnd';
import { Plus } from 'lucide-react';
import KanbanColumn from './KanbanColumn';
import { db } from '../../services/firebaseConfig';
import { collection, onSnapshot, query, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';

const KanbanBoard = () => {
  const [data, setData] = useState({
    items: {},
    columns: {
      'pendiente': { id: 'pendiente', title: 'Presupuesto Pendiente', itemsIds: [] },
      'calculo': { id: 'calculo', title: 'En Cálculo', itemsIds: [] },
      'enviado': { id: 'enviado', title: 'Enviado al Cliente', itemsIds: [] },
      'seguimiento': { id: 'seguimiento', title: 'Seguimiento Activo', itemsIds: [] },
      'aprobado': { id: 'aprobado', title: 'Aprobado', itemsIds: [] },
      'rechazado': { id: 'rechazado', title: 'Rechazado / En Espera', itemsIds: [] }
    },
    columnOrder: ['pendiente', 'calculo', 'enviado', 'seguimiento', 'aprobado', 'rechazado']
  });

  const [clientesList, setClientesList] = useState([]);

  // Modals State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [pendingMove, setPendingMove] = useState(null);
  
  // Form State para la Seña
  const [paymentStatus, setPaymentStatus] = useState('Pendiente');
  const [paymentAmount, setPaymentAmount] = useState('');

  // Form State para Nuevo Lead
  const [isNewClient, setIsNewClient] = useState(false);
  const [newLead, setNewLead] = useState({ 
    clientId: '', 
    newClientName: '', 
    newClientPhone: '', 
    location: '', 
    source: 'WhatsApp', 
    paramSistema: 'Radiadores' 
  });

  const handleAddLead = async (e) => {
    e.preventDefault();
    
    let finalClientId = newLead.clientId;
    let finalClientName = '';

    if (isNewClient) {
       if (!newLead.newClientName) return alert("Ingresa el nombre del cliente nuevo.");
       try {
         const newClientRef = await addDoc(collection(db, 'clientes'), {
            name: newLead.newClientName,
            phone: newLead.newClientPhone || '',
            status: 'Lead',
            lastContact: new Date().toLocaleDateString('es-AR'),
            createdAt: serverTimestamp()
         });
         finalClientId = newClientRef.id;
         finalClientName = newLead.newClientName;
       } catch (err) {
         console.error("Error creando nuevo cliente:", err);
         return alert("Fallo al crear el cliente en la base de datos.");
       }
    } else {
       if (!newLead.clientId) return alert("Por favor seleccione un cliente de la lista.");
       const selectedClient = clientesList.find(c => c.id === newLead.clientId);
       finalClientName = selectedClient.name;
    }

    try {
      await addDoc(collection(db, 'presupuestos'), {
        clientId: finalClientId,
        name: finalClientName,
        location: newLead.location,
        source: newLead.source,
        paramSistema: newLead.paramSistema,
        tags: [newLead.paramSistema],
        status: 'pendiente',
        date: new Date().toLocaleDateString('es-AR'),
        amount: null,
        paymentStatus: 'Pendiente',
        createdAt: serverTimestamp()
      });
      
      setIsLeadModalOpen(false);
      setIsNewClient(false);
      setNewLead({ clientId: '', newClientName: '', newClientPhone: '', location: '', source: 'WhatsApp', paramSistema: 'Radiadores' });
    } catch (err) {
      console.error(err);
      alert('Error guardando el lead.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header Incorporado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', margin: 0 }}>Presupuestos (CRM)</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>Gestiona los leads y avance comercial. Al aprobarse, nacen las Obras.</p>
        </div>
        
        <button className="btn btn-primary" onClick={() => setIsLeadModalOpen(true)}>
          <Plus size={18} />
          Nuevo Lead
        </button>
      </div>

      <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '1rem', flex: 1, minHeight: '500px' }}>
        <DragDropContext onDragEnd={onDragEnd}>
          {data.columnOrder.map(columnId => {
            const column = data.columns[columnId];
            const items = column.itemsIds.map(itemId => data.items[itemId]).filter(Boolean); // Filtrar falsy values
            return <KanbanColumn key={column.id} column={column} items={items} />;
          })}
        </DragDropContext>
      </div>

      {isModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="card" style={{ width: '400px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ margin: 0 }}>Aprobar Presupuesto</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Al aprobar, se registrará el pago inicial y <strong style={{color: 'var(--accent-600)'}}>se generará automáticamente una Obra</strong> en Producción.
            </p>
            
            <div className="form-group">
              <label className="form-label">Estado de Pago</label>
              <select 
                className="input-field" 
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value)}
              >
                <option value="Pendiente">Pendiente de Pago</option>
                <option value="Seña Abonada">Seña Abonada</option>
                <option value="Pago Completo">Pago Completo (100%)</option>
              </select>
            </div>

            {paymentStatus !== 'Pendiente' && (
              <div className="form-group">
                <label className="form-label">Monto Abonado ($)</label>
                <input 
                  type="number" 
                  className="input-field" 
                  placeholder="Ej: 500000"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                />
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button className="btn btn-secondary" onClick={closeModal}>Cancelar</button>
              <button className="btn btn-primary" onClick={confirmMoveToAprobado}>Cerrar Venta y Generar Obra</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nuevo Lead */}
      {isLeadModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="card" style={{ width: '450px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Ingresar Nuevo Lead Comercial</h3>
            </div>
            
            <form onSubmit={handleAddLead} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              <div className="form-group" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <label className="form-label" style={{ margin: 0 }}>Cliente / Prospecto <span style={{color: 'var(--accent-600)'}}>*</span></label>
                  <label style={{ fontSize: '0.75rem', color: 'var(--primary-600)', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                     <input type="checkbox" checked={isNewClient} onChange={e => setIsNewClient(e.target.checked)} />
                     Crear Cliente Nuevo
                  </label>
                </div>
                
                {isNewClient ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.75rem', backgroundColor: 'var(--bg-surface-hover)', borderRadius: '8px', border: '1px dashed var(--primary-300)' }}>
                     <input required type="text" className="input-field" placeholder="Nombre completo del cliente" value={newLead.newClientName} onChange={e => setNewLead({...newLead, newClientName: e.target.value})} />
                     <input type="text" className="input-field" placeholder="Teléfono de contacto (opcional)" value={newLead.newClientPhone} onChange={e => setNewLead({...newLead, newClientPhone: e.target.value})} />
                  </div>
                ) : (
                  <select 
                    required 
                    className="input-field" 
                    value={newLead.clientId} 
                    onChange={(e) => setNewLead({...newLead, clientId: e.target.value})}
                  >
                    <option value="" disabled>-- Busca en el Directorio --</option>
                    {clientesList.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Localidad / Zona (Referencia)</label>
                <input required type="text" className="input-field" value={newLead.location} onChange={(e) => setNewLead({...newLead, location: e.target.value})} placeholder="Ej: Funes, Fisherton" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Canal de Llegada</label>
                  <select className="input-field" value={newLead.source} onChange={(e) => setNewLead({...newLead, source: e.target.value})}>
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Instagram">Instagram</option>
                    <option value="Referido">Referido</option>
                    <option value="Arquitecto">Arquitecto</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Sistema Solicitado</label>
                  <select className="input-field" value={newLead.paramSistema} onChange={(e) => setNewLead({...newLead, paramSistema: e.target.value})}>
                    <option value="Radiadores">Radiadores</option>
                    <option value="Piso Radiante">Piso Radiante</option>
                    <option value="SSTT Caldera">SSTT Caldera</option>
                    <option value="Hibrido">Híbrido</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsLeadModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Crear Lead</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default KanbanBoard;
