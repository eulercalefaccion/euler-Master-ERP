import React, { useState, useEffect } from 'react';
import { DragDropContext } from '@hello-pangea/dnd';
import { Plus, X, Save, MessageSquare, DollarSign, MapPin, Calendar, Tag, Trash2, ListPlus, Target, History } from 'lucide-react';
import KanbanColumn from './KanbanColumn';
import { db } from '../../services/firebaseConfig';
import { collection, onSnapshot, query, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { fetchDolarVenta } from '../../services/dolarService';

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
  const [stockItems, setStockItems] = useState([]);
  const [dolarValue, setDolarValue] = useState(null);

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
  const [builderItems, setBuilderItems] = useState([]);
  const [isSavingDetail, setIsSavingDetail] = useState(false);
  const [viewHistory, setViewHistory] = useState(false);

  // Quote Builder State
  const [selectedStockId, setSelectedStockId] = useState('');
  const [selectedStockQty, setSelectedStockQty] = useState(1);

  const calculateTotal = (items) => {
    return items.reduce((acc, item) => acc + (item.subtotal || 0), 0);
  };

  const openDetail = (item) => {
    setSelectedLead(item);
    setDetailNotes(item.notas || '');
    setBuilderItems(item.quoteItems || []);
    setViewHistory(false);
  };

  const saveDetail = async (isNewRevision = false) => {
    if (!selectedLead) return;
    setIsSavingDetail(true);
    try {
      const docRef = doc(db, 'presupuestos', selectedLead.id);
      let newRevision = selectedLead.revision || 0;
      let newHistory = selectedLead.revisionsHistory || [];
      const currentAmount = calculateTotal(builderItems);
      
      if (isNewRevision) {
        newHistory.push({
           revisionNumber: newRevision,
           revisionTitle: newRevision === 0 ? 'Original' : `Rev ${newRevision}`,
           quoteItems: selectedLead.quoteItems || [],
           amount: selectedLead.amount || 0,
           notas: selectedLead.notas || '',
           savedAt: new Date().toISOString()
        });
        newRevision += 1;
      }

      await updateDoc(docRef, {
        notas: detailNotes,
        amount: currentAmount,
        quoteItems: builderItems,
        revision: newRevision,
        revisionsHistory: newHistory
      });

      setSelectedLead(prev => ({ 
        ...prev, 
        notas: detailNotes, 
        amount: currentAmount, 
        quoteItems: builderItems,
        revision: newRevision,
        revisionsHistory: newHistory
      }));

      // If new revision, alert
      if (isNewRevision) alert(`Revisión Rev ${newRevision} creada exitosamente.`);

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
    // Dolar fetch
    fetchDolarVenta().then(val => setDolarValue(val));

    // Clientes
    const qClientes = query(collection(db, 'clientes'));
    const unsubClientes = onSnapshot(qClientes, (snapshot) => {
      const c = snapshot.docs.map(d => ({ id: d.id, name: d.data().name }));
      c.sort((a,b) => (a.name || '').localeCompare(b.name || ''));
      setClientesList(c);
    });

    // Stock for Quote Builder
    const qStock = query(collection(db, 'stock'));
    const unsubStock = onSnapshot(qStock, (snapshot) => {
      const s = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      s.sort((a,b) => (a.name || '').localeCompare(b.name || ''));
      setStockItems(s);
    });

    // Presupuestos
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

      setData(prev => ({
        ...prev,
        items: newItems,
        columns: newColumns
      }));
    });

    return () => {
      unsubClientes();
      unsubStock();
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
        bitacoraPreview: `Vinculado al Presupuesto: ${itemToApprove.presupuestoNumber || 'S/N'}. Aprobado.`,
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
      } else {
         if (!newLead.clientId) { setIsSavingLead(false); return alert("Por favor seleccione un cliente de la lista."); }
         const selectedClient = clientesList.find(c => c.id === newLead.clientId);
         finalClientName = selectedClient.name;
      }

      // Generate Auto Number: PRE-AAMMDD-XXX
      const now = new Date();
      const randomStr = Math.floor(Math.random()*1000).toString().padStart(3, '0');
      const dateStr = `${now.getFullYear().toString().slice(-2)}${(now.getMonth()+1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
      const presupuestoNumber = `PRE-${dateStr}-${randomStr}`;

      await addDoc(collection(db, 'presupuestos'), {
        clientId: finalClientId,
        name: finalClientName,
        presupuestoNumber,
        revision: 0,
        revisionsHistory: [],
        quoteItems: [],
        location: newLead.location || 'S/D',
        source: newLead.source,
        paramSistema: newLead.paramSistema,
        tags: [newLead.paramSistema],
        status: 'pendiente',
        date: new Date().toLocaleDateString('es-AR'),
        amount: 0,
        paymentStatus: 'Pendiente',
        createdAt: serverTimestamp()
      });
      
      setIsLeadModalOpen(false);
      setIsNewClient(false);
      setNewLead({ clientId: '', newClientName: '', newClientPhone: '', location: '', source: 'WhatsApp', paramSistema: 'Radiadores' });
    } catch (err) {
      console.error('Error en handleAddLead:', err);
      alert('Error: ' + err.message);
    }
    setIsSavingLead(false);
  };

  // Quote Builder Logic
  const handleAddQuoteItem = () => {
    const stockItem = stockItems.find(s => s.id === selectedStockId);
    if (!stockItem) return;

    let unitPrice = 0;
    // Calculate recommended price based on USD cost, profit setting and Dolar API
    if (stockItem.costUSD && dolarValue) {
      const margin = stockItem.profitCF ? (Number(stockItem.profitCF) / 100) : 0;
      unitPrice = stockItem.costUSD * (1 + margin) * dolarValue;
    }

    const newItem = {
      id: Date.now().toString(),
      stockId: stockItem.id,
      name: stockItem.name,
      quantity: Number(selectedStockQty),
      unitPrice: Math.round(unitPrice),
      subtotal: Math.round(unitPrice * Number(selectedStockQty))
    };

    setBuilderItems([...builderItems, newItem]);
    setSelectedStockId('');
    setSelectedStockQty(1);
  };

  const updateQuoteItem = (id, field, value) => {
    setBuilderItems(builderItems.map(item => {
      if (item.id === id) {
        const newVal = Number(value) || 0;
        const sub = field === 'quantity' ? Math.round(newVal * item.unitPrice) : Math.round(newVal * item.quantity);
        return { ...item, [field]: newVal, subtotal: sub };
      }
      return item;
    }));
  };

  const removeQuoteItem = (id) => {
    setBuilderItems(builderItems.filter(i => i.id !== id));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', margin: 0 }}>Presupuestos (CRM)</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Gestiona leads, presupuesta con Dólar BNA (actual: U$D {dolarValue ? '$'+dolarValue : 'Cargando...'}) y genera Obras.
          </p>
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
            const items = column.itemsIds.map(itemId => data.items[itemId]).filter(Boolean);
            return <KanbanColumn key={column.id} column={column} items={items} onCardClick={openDetail} />;
          })}
        </DragDropContext>
      </div>

      {isModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000}}>
          <div className="card" style={{ width: '400px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ margin: 0 }}>Aprobar Presupuesto</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Al aprobar, se registrará el pago inicial y <strong style={{color: 'var(--accent-600)'}}>se generará automáticamente una Obra</strong> en Producción.
            </p>
            <div className="form-group">
              <label className="form-label">Estado de Pago</label>
              <select className="input-field" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
                <option value="Pendiente">Pendiente de Pago</option>
                <option value="Seña Abonada">Seña Abonada</option>
                <option value="Pago Completo">Pago Completo (100%)</option>
              </select>
            </div>
            {paymentStatus !== 'Pendiente' && (
              <div className="form-group">
                <label className="form-label">Monto Abonado ($)</label>
                <input type="number" className="input-field" placeholder="Ej: 500000" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
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
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '450px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ margin: 0 }}>Ingresar Nuevo Lead Comercial</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <label className="form-label" style={{ margin: 0 }}>Cliente <span style={{color: 'var(--accent-600)'}}>*</span></label>
                  <label style={{ fontSize: '0.75rem', color: 'var(--primary-600)', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                     <input type="checkbox" checked={isNewClient} onChange={e => setIsNewClient(e.target.checked)} /> Crear Nuevo
                  </label>
                </div>
                {isNewClient ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.75rem', backgroundColor: 'var(--bg-surface-hover)', borderRadius: '8px', border: '1px dashed var(--primary-300)' }}>
                     <input type="text" className="input-field" placeholder="Nombre completo" value={newLead.newClientName} onChange={e => setNewLead({...newLead, newClientName: e.target.value})} />
                     <input type="text" className="input-field" placeholder="Teléfono" value={newLead.newClientPhone} onChange={e => setNewLead({...newLead, newClientPhone: e.target.value})} />
                  </div>
                ) : (
                  <select required className="input-field" value={newLead.clientId} onChange={(e) => setNewLead({...newLead, clientId: e.target.value})}>
                    <option value="" disabled>-- Busca en el Directorio --</option>
                    {clientesList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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

      {/* Lead Detail Panel (Ampliado con Cotizador) */}
      {selectedLead && (
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 40 }} onClick={() => setSelectedLead(null)} />
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: '750px',
            backgroundColor: 'var(--bg-primary)', boxShadow: '-5px 0 25px rgba(0,0,0,0.15)', zIndex: 50,
            display: 'flex', flexDirection: 'column', animation: 'slideIn 0.25s ease'
          }}>
            {/* Panel Header */}
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface-hover)' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  Ficha del Lead: {selectedLead.presupuestoNumber || 'S/N'} 
                  <span style={{ fontSize: '0.75rem', padding: '0.1rem 0.5rem', backgroundColor: '#e2e8f0', color: '#475569', borderRadius: '12px' }}>
                    Rev {selectedLead.revision || 0}
                  </span>
                </h3>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {selectedLead.revisionsHistory && selectedLead.revisionsHistory.length > 0 && (
                  <button onClick={() => setViewHistory(!viewHistory)} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.25rem 0.5rem', backgroundColor: '#eef2ff', color: '#4f46e5', border: '1px solid #c7d2fe', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600' }}>
                    <History size={16} /> {viewHistory ? 'Ver Cotizador' : 'Ver Historial'}
                  </button>
                )}
                <button onClick={() => setSelectedLead(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '0.25rem' }}>
                  <X size={22} />
                </button>
              </div>
            </div>

            {/* Panel Body Scrollable */}
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
                  <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem', borderRadius: '4px', backgroundColor: '#dbeafe', color: '#1e40af', fontWeight: '600' }}>{selectedLead.source || 'WhatsApp'}</span>
                  <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem', borderRadius: '4px', backgroundColor: '#f0fdf4', color: '#166534', fontWeight: '600' }}>{selectedLead.status}</span>
                </div>
              </div>

              {viewHistory ? (
                /* Historial de Revisiones */
                <div style={{ border: '1px solid var(--border-light)', borderRadius: '8px', padding: '1rem' }}>
                  <h4 style={{ margin: '0 0 1rem 0' }}>Historial de Revisiones</h4>
                  {selectedLead.revisionsHistory.map((rev, idx) => (
                    <div key={idx} style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid #e2e8f0' }}>
                      <div style={{ fontWeight: '600', marginBottom: '0.25rem', color: 'var(--primary-700)' }}>{rev.revisionTitle} (Total: ${rev.amount?.toLocaleString('es-AR')})</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Guardado el: {new Date(rev.savedAt).toLocaleString('es-AR')}</div>
                      <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>Ítems Cotizados: {rev.quoteItems?.length || 0}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {/* SECCION COTIZADOR */}
                  <div style={{ border: '1px solid var(--primary-100)', borderRadius: '8px', overflow: 'hidden' }}>
                    <div style={{ backgroundColor: 'var(--primary-50)', padding: '1rem', borderBottom: '1px solid var(--primary-100)' }}>
                      <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary-700)' }}><ListPlus size={18}/> Cotizador de Materiales & Equipos</h4>
                    </div>
                    <div style={{ padding: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-end', backgroundColor: '#fafafa' }}>
                      <div style={{ flex: 1 }}>
                         <label className="form-label" style={{ fontSize: '0.75rem' }}>Seleccionar del Catálogo/Stock</label>
                         <select className="input-field" value={selectedStockId} onChange={e => setSelectedStockId(e.target.value)}>
                           <option value="">-- Buscar artículo --</option>
                           {stockItems.map(si => <option key={si.id} value={si.id}>{si.name} {si.costUSD ? `(U$D ${si.costUSD})` : ''}</option>)}
                         </select>
                      </div>
                      <div style={{ width: '80px' }}>
                         <label className="form-label" style={{ fontSize: '0.75rem' }}>Cant.</label>
                         <input type="number" min="1" className="input-field" value={selectedStockQty} onChange={e => setSelectedStockQty(e.target.value)} />
                      </div>
                      <button type="button" className="btn btn-secondary" onClick={handleAddQuoteItem} disabled={!selectedStockId}>Añadir</button>
                    </div>

                    {/* Tabla de Items */}
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                          <tr style={{ backgroundColor: 'var(--bg-surface-hover)', borderTop: '1px solid var(--border-light)', borderBottom: '1px solid var(--border-light)' }}>
                            <th style={{ padding: '0.75rem', textAlign: 'left', width: '45%' }}>Artículo</th>
                            <th style={{ padding: '0.75rem', textAlign: 'center', width: '15%' }}>Cant</th>
                            <th style={{ padding: '0.75rem', textAlign: 'right', width: '20%' }}>P.Unit (ARS)</th>
                            <th style={{ padding: '0.75rem', textAlign: 'right', width: '20%' }}>Subtotal</th>
                            <th style={{ padding: '0.75rem', textAlign: 'center' }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {builderItems.map(item => (
                            <tr key={item.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                              <td style={{ padding: '0.5rem 0.75rem', fontWeight: '500' }}>{item.name}</td>
                              <td style={{ padding: '0.5rem' }}>
                                <input type="number" value={item.quantity} onChange={e => updateQuoteItem(item.id, 'quantity', e.target.value)} style={{ width: '100%', padding: '0.25rem', border: '1px solid #cbd5e1', borderRadius: '4px', textAlign: 'center' }} />
                              </td>
                              <td style={{ padding: '0.5rem' }}>
                                <input type="number" value={item.unitPrice} onChange={e => updateQuoteItem(item.id, 'unitPrice', e.target.value)} style={{ width: '100%', padding: '0.25rem', border: '1px solid #cbd5e1', borderRadius: '4px', textAlign: 'right' }} />
                              </td>
                              <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: '600' }}>${item.subtotal.toLocaleString('es-AR')}</td>
                              <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                <button type="button" onClick={() => removeQuoteItem(item.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><X size={16}/></button>
                              </td>
                            </tr>
                          ))}
                          {builderItems.length === 0 && (
                            <tr><td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Agrega artículos al presupuesto</td></tr>
                          )}
                        </tbody>
                        <tfoot>
                          <tr style={{ backgroundColor: '#f8fafc', fontWeight: '700', fontSize: '1rem' }}>
                            <td colSpan="3" style={{ padding: '1rem', textAlign: 'right' }}>MONTO TOTAL PRESUPUESTO:</td>
                            <td colSpan="2" style={{ padding: '1rem', textAlign: 'left', color: 'var(--primary-700)' }}>${calculateTotal(builderItems).toLocaleString('es-AR')}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <MessageSquare size={16}/> Comentarios y Condiciones (Para el PDF)
                    </label>
                    <textarea 
                      className="input-field" rows={4} placeholder="Escribí notas comerciales, tiempo de entrega, validez..."
                      value={detailNotes} onChange={e => setDetailNotes(e.target.value)}
                      style={{ resize: 'vertical', fontFamily: 'inherit' }}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Panel Footer */}
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc' }}>
              <button type="button" onClick={deleteLead} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600' }}>
                <Trash2 size={16}/> Eliminar Lead
              </button>
              
              {!viewHistory && (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => saveDetail(false)} disabled={isSavingDetail}>
                    Guardar Cambios
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => saveDetail(true)} disabled={isSavingDetail} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Save size={16}/> {isSavingDetail ? 'Guardando...' : 'Guardar Nueva Revisión'}
                  </button>
                </div>
              )}
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
