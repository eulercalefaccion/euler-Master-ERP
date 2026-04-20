import React, { useState, useEffect } from 'react';
import { DragDropContext } from '@hello-pangea/dnd';
import { Plus, X, Save, MessageSquare, DollarSign, MapPin, Calendar, Tag, Trash2 } from 'lucide-react';
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

  // Detail Panel
  const [selectedLead, setSelectedLead] = useState(null);
  const [detailNotes, setDetailNotes] = useState('');
  const [detailAmount, setDetailAmount] = useState('');
  const [isSavingDetail, setIsSavingDetail] = useState(false);

  const openDetail = (item) => {
    setSelectedLead(item);
    setDetailNotes(item.notas || '');
    setDetailAmount(item.amount || '');
  };

  const saveDetail = async () => {
    if (!selectedLead) return;
    setIsSavingDetail(true);
    try {
      await updateDoc(doc(db, 'presupuestos', selectedLead.id), {
        notas: detailNotes,
        amount: detailAmount ? Number(detailAmount) : null
      });
      setSelectedLead(null);
    } catch (err) {
      alert('Error: ' + err.message);
    }
    setIsSavingDetail(false);
  };

  const deleteLead = async () => {
    if (!selectedLead) return;
    if (!window.confirm(`¿Eliminar lead "${selectedLead.name}"?`)) return;
    try {
      const { deleteDoc: delDoc } = await import('firebase/firestore');
      await delDoc(doc(db, 'presupuestos', selectedLead.id));
      setSelectedLead(null);
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  useEffect(() => {
    // Escuchar Clientes para el dropdown del Nuevo Lead
    const qClientes = query(collection(db, 'clientes'));
    const unsubClientes = onSnapshot(qClientes, (snapshot) => {
      const c = snapshot.docs.map(d => ({ id: d.id, name: d.data().name }));
      c.sort((a,b) => (a.name || '').localeCompare(b.name || ''));
      setClientesList(c);
    });

    // Escuchar Presupuestos (Leads Kanban)
    const qPresupuestos = query(collection(db, 'presupuestos'));
    const unsubPresupuestos = onSnapshot(qPresupuestos, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      
      const newColumns = {
        'pendiente': { id: 'pendiente', title: 'Presupuesto Pendiente', itemsIds: [] },
        'calculo': { id: 'calculo', title: 'En Cálculo', itemsIds: [] },
        'enviado': { id: 'enviado', title: 'Enviado al Cliente', itemsIds: [] },
        'seguimiento': { id: 'seguimiento', title: 'Seguimiento Activo', itemsIds: [] },
        'aprobado': { id: 'aprobado', title: 'Aprobado', itemsIds: [] },
        'rechazado': { id: 'rechazado', title: 'Rechazado / En Espera', itemsIds: [] }
      };
      
      const newItems = {};
      docs.forEach(d => {
        const tags = Array.isArray(d.tags) ? d.tags : [d.paramSistema || 'S/D'];
        newItems[d.id] = { ...d, tags };
        
        if (newColumns[d.status]) {
          newColumns[d.status].itemsIds.push(d.id);
        } else {
          newColumns['pendiente'].itemsIds.push(d.id);
        }
      });

      setData({
        items: newItems,
        columns: newColumns,
        columnOrder: ['pendiente', 'calculo', 'enviado', 'seguimiento', 'aprobado', 'rechazado']
      });
    });

    return () => {
      unsubClientes();
      unsubPresupuestos();
    };
  }, []);

  const onDragEnd = async (result) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const startColumn = data.columns[source.droppableId];
    const finishColumn = data.columns[destination.droppableId];

    if (startColumn === finishColumn) return;

    if (finishColumn.id === 'aprobado') {
      setPendingMove(result);
      setIsModalOpen(true);
      return;
    }

    try {
      await updateDoc(doc(db, 'presupuestos', draggableId), {
        status: finishColumn.id
      });
    } catch (err) {
      console.error("Error al mover presupuesto", err);
    }
  };

  const confirmMoveToAprobado = async () => {
    if (!pendingMove) return;
    const { draggableId, destination } = pendingMove;

    try {
      const itemToApprove = data.items[draggableId];
      
      await updateDoc(doc(db, 'presupuestos', draggableId), {
        status: destination.droppableId,
        paymentStatus: paymentStatus,
        amount: paymentAmount ? parseInt(paymentAmount) : (itemToApprove.amount || 0)
      });

      await addDoc(collection(db, 'obras'), {
        name: `Obra ${itemToApprove.name} - ${itemToApprove.paramSistema || ''}`,
        location: itemToApprove.location || 'S/D',
        clientId: itemToApprove.clientId || '',
        clientName: itemToApprove.name || 'S/D',
        system: itemToApprove.paramSistema || 'S/D',
        phase: 'Obra',
        estado: 'Pendiente de Inicio',
        progress: 0,
        operarios: '',
        bitacoraPreview: 'Nacimiento de Obra. Generada automáticamente tras aprobar el Presupuesto comercial.',
        createdAt: serverTimestamp(),
        startDate: new Date().toLocaleDateString('es-AR')
      });

    } catch (err) {
      console.error("Error al confirmar venta:", err);
      alert("Hubo un fallo en la base de datos al cerrar el presupuesto.");
    }

    closeModal();
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setPendingMove(null);
    setPaymentStatus('Pendiente');
    setPaymentAmount('');
  };

  const [isSavingLead, setIsSavingLead] = useState(false);

  const handleAddLead = async () => {
    console.log('handleAddLead fired', { isNewClient, newLead });
    
    if (isSavingLead) return;
    setIsSavingLead(true);

    let finalClientId = newLead.clientId;
    let finalClientName = '';

    try {
      if (isNewClient) {
         if (!newLead.newClientName) { setIsSavingLead(false); return alert("Ingresa el nombre del cliente nuevo."); }
         const newClientRef = await addDoc(collection(db, 'clientes'), {
            name: newLead.newClientName,
            phone: newLead.newClientPhone || '',
            status: 'Lead',
            lastContact: new Date().toLocaleDateString('es-AR'),
            createdAt: serverTimestamp()
         });
         finalClientId = newClientRef.id;
         finalClientName = newLead.newClientName;
         console.log('New client created:', finalClientId);
      } else {
         if (!newLead.clientId) { setIsSavingLead(false); return alert("Por favor seleccione un cliente de la lista."); }
         const selectedClient = clientesList.find(c => c.id === newLead.clientId);
         finalClientName = selectedClient.name;
      }

      await addDoc(collection(db, 'presupuestos'), {
        clientId: finalClientId,
        name: finalClientName,
        location: newLead.location || 'S/D',
        source: newLead.source,
        paramSistema: newLead.paramSistema,
        tags: [newLead.paramSistema],
        status: 'pendiente',
        date: new Date().toLocaleDateString('es-AR'),
        amount: null,
        paymentStatus: 'Pendiente',
        createdAt: serverTimestamp()
      });
      
      console.log('Lead created successfully');
      setIsLeadModalOpen(false);
      setIsNewClient(false);
      setNewLead({ clientId: '', newClientName: '', newClientPhone: '', location: '', source: 'WhatsApp', paramSistema: 'Radiadores' });
    } catch (err) {
      console.error('Error en handleAddLead:', err);
      alert('Error: ' + err.message);
    }
    setIsSavingLead(false);
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
            return <KanbanColumn key={column.id} column={column} items={items} onCardClick={openDetail} />;
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
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
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
                     <input type="text" className="input-field" placeholder="Nombre completo del cliente" value={newLead.newClientName} onChange={e => setNewLead({...newLead, newClientName: e.target.value})} />
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
                <button type="button" className="btn btn-primary" onClick={handleAddLead} disabled={isSavingLead}>
                  {isSavingLead ? 'Guardando...' : 'Crear Lead'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lead Detail Panel */}
      {selectedLead && (
        <>
          <div 
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 40 }}
            onClick={() => setSelectedLead(null)}
          />
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: '480px',
            backgroundColor: 'var(--bg-primary)', boxShadow: '-5px 0 25px rgba(0,0,0,0.15)', zIndex: 50,
            display: 'flex', flexDirection: 'column', animation: 'slideIn 0.25s ease'
          }}>
            {/* Panel Header */}
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface-hover)' }}>
              <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: '600' }}>Ficha del Lead</h3>
              <button onClick={() => setSelectedLead(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '0.25rem' }}>
                <X size={22} />
              </button>
            </div>

            {/* Panel Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {/* Client Info */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700' }}>{selectedLead.name}</h2>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><MapPin size={14}/> {selectedLead.location || 'S/D'}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Calendar size={14}/> {selectedLead.date}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Tag size={14}/> {selectedLead.paramSistema || 'S/D'}</span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                  <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem', borderRadius: '4px', backgroundColor: '#dbeafe', color: '#1e40af', fontWeight: '600' }}>
                    {selectedLead.source || 'WhatsApp'}
                  </span>
                  <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem', borderRadius: '4px', backgroundColor: '#f0fdf4', color: '#166534', fontWeight: '600' }}>
                    {selectedLead.status}
                  </span>
                </div>
              </div>

              {/* Amount */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <DollarSign size={16}/> Monto del Presupuesto ($)
                </label>
                <input 
                  type="number" className="input-field" placeholder="Ej: 2500000"
                  value={detailAmount} onChange={e => setDetailAmount(e.target.value)}
                />
              </div>

              {/* Notes */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <MessageSquare size={16}/> Notas / Comentarios
                </label>
                <textarea 
                  className="input-field" rows={6} placeholder="Escribí notas, historial de conversaciones, detalles técnicos, etc."
                  value={detailNotes} onChange={e => setDetailNotes(e.target.value)}
                  style={{ resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

            </div>

            {/* Panel Footer */}
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button type="button" onClick={deleteLead} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600' }}>
                <Trash2 size={16}/> Eliminar Lead
              </button>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setSelectedLead(null)}>Cerrar</button>
                <button type="button" className="btn btn-primary" onClick={saveDetail} disabled={isSavingDetail} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Save size={16}/> {isSavingDetail ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
};

export default KanbanBoard;
