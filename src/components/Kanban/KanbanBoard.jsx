import React, { useState, useEffect, useCallback } from 'react';
import { DragDropContext } from '@hello-pangea/dnd';
import {
  Plus, X, Save, MessageSquare, DollarSign, MapPin, Calendar, Tag,
  Trash2, ListPlus, Target, History, FileText, RefreshCw, Receipt, Download, Loader
} from 'lucide-react';
import KanbanColumn from './KanbanColumn';
import { db } from '../../services/firebaseConfig';
import { dbJornadas } from '../../services/firebaseJornadas';
import {
  collection, onSnapshot, query, addDoc, updateDoc, deleteDoc, doc,
  serverTimestamp, increment, setDoc
} from 'firebase/firestore';
import { getTipoCambio, calcularPrecios, calcularPrecioManoDeObra, IVA } from '../../services/tipoCambioService';
import { generarPDFPresupuesto } from '../../services/pdfPresupuesto';

// ─── Constantes ───────────────────────────────────────────────────────────────
const COEF_CANAL2 = 10.5;

const calcPrecioItem = (item, canal, tcValor) => {
  if (!tcValor) return 0;
  if (item.tipo === 'mano_de_obra' || item.tipo === 'servicio') {
    // Mano de obra: con IVA o sin IVA (canal 2 = IVA 0)
    const base = (item.precioVentaUSD || 0) * tcValor;
    return Math.round(canal === 'canal2' ? base : base * IVA);
  } else {
    // Material / kit
    if (canal === 'canal2') {
      return Math.round((item.costoUSD || 0) * COEF_CANAL2 * tcValor);
    }
    const markup = item.markup || 1.4;
    return Math.round((item.costoUSD || 0) * markup * tcValor * IVA);
  }
};

// ─── Componente principal ──────────────────────────────────────────────────────
const KanbanBoard = () => {
  const [data, setData] = useState({
    items: {},
    columns: {
      'pendiente':   { id: 'pendiente',   title: 'Presupuesto Pendiente',  itemsIds: [] },
      'calculo':     { id: 'calculo',     title: 'En Cálculo',             itemsIds: [] },
      'enviado':     { id: 'enviado',     title: 'Enviado al Cliente',      itemsIds: [] },
      'seguimiento': { id: 'seguimiento', title: 'Seguimiento Activo',     itemsIds: [] },
      'aprobado':    { id: 'aprobado',    title: 'Aprobado',               itemsIds: [] },
      'rechazado':   { id: 'rechazado',   title: 'Rechazado / En Espera', itemsIds: [] },
    },
    columnOrder: ['pendiente', 'calculo', 'enviado', 'seguimiento', 'aprobado', 'rechazado'],
  });

  const [clientesList, setClientesList]   = useState([]);
  const [listaItems, setListaItems]       = useState([]);   // lista_precios
  const [tc, setTc]                       = useState(null);
  const [tcLoading, setTcLoading]         = useState(true);

  // Modals
  const [isApprovalOpen, setIsApprovalOpen] = useState(false);
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [isRevModalOpen, setIsRevModalOpen]   = useState(false);
  const [pendingMove, setPendingMove]         = useState(null);

  // Approval form
  const [paymentStatus, setPaymentStatus] = useState('Pendiente');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [isApproving, setIsApproving]     = useState(false);

  // New lead form
  const [isNewClient, setIsNewClient] = useState(false);
  const [newLead, setNewLead] = useState({
    clientId: '', newClientName: '', newClientPhone: '',
    location: '', source: 'WhatsApp', paramSistema: 'Radiadores',
  });
  const [isSavingLead, setIsSavingLead] = useState(false);

  // Detail panel
  const [selectedLead, setSelectedLead]     = useState(null);
  const [detailNotes, setDetailNotes]       = useState('');
  const [builderItems, setBuilderItems]     = useState([]);
  const [canal, setCanal]                   = useState('iva');   // 'iva' | 'canal2'
  const [isSavingDetail, setIsSavingDetail] = useState(false);
  const [viewHistory, setViewHistory]       = useState(false);

  // Revision modal
  const [revChangeNote, setRevChangeNote] = useState('');

  // PDF
  const [isPDFModalOpen, setIsPDFModalOpen]   = useState(false);
  const [pdfProgress, setPdfProgress]         = useState(0);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [selectedFolletos, setSelectedFolletos] = useState([]);
  // Lista de folletos disponibles (artículos con folletoUrl en lista_precios)
  const folletosDisponibles = listaItems.filter(i => i.folletoUrl && i.activo !== false);

  // Quote builder add-item selectors
  const [selectedItemId, setSelectedItemId]   = useState('');
  const [selectedItemQty, setSelectedItemQty] = useState(1);

  // ─── Data fetching ──────────────────────────────────────────────────────────
  useEffect(() => {
    // TC
    (async () => {
      try { setTc(await getTipoCambio()); } catch (e) { console.error(e); }
      setTcLoading(false);
    })();

    // Clientes
    const unsubClientes = onSnapshot(query(collection(db, 'clientes')), snap => {
      const c = snap.docs.map(d => ({ id: d.id, name: d.data().name }));
      c.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setClientesList(c);
    });

    // Lista precios (reemplaza 'stock' vacío)
    const unsubLista = onSnapshot(collection(db, 'lista_precios'), snap => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      items.sort((a, b) => {
        // Materiales primero, luego mano de obra
        if (a.tipo === 'mano_de_obra' && b.tipo !== 'mano_de_obra') return 1;
        if (a.tipo !== 'mano_de_obra' && b.tipo === 'mano_de_obra') return -1;
        return (a.descripcion || '').localeCompare(b.descripcion || '');
      });
      setListaItems(items);
    });

    // Presupuestos
    const unsubPresupuestos = onSnapshot(query(collection(db, 'presupuestos')), snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const newCols = {
        'pendiente':   { id: 'pendiente',   title: 'Presupuesto Pendiente',  itemsIds: [] },
        'calculo':     { id: 'calculo',     title: 'En Cálculo',             itemsIds: [] },
        'enviado':     { id: 'enviado',     title: 'Enviado al Cliente',      itemsIds: [] },
        'seguimiento': { id: 'seguimiento', title: 'Seguimiento Activo',     itemsIds: [] },
        'aprobado':    { id: 'aprobado',    title: 'Aprobado',               itemsIds: [] },
        'rechazado':   { id: 'rechazado',   title: 'Rechazado / En Espera', itemsIds: [] },
      };
      const newItems = {};
      docs.forEach(d => {
        const tags = Array.isArray(d.tags) ? d.tags : [d.paramSistema || 'S/D'];
        newItems[d.id] = { ...d, tags };
        (newCols[d.status] || newCols['pendiente']).itemsIds.push(d.id);
      });
      setData(prev => ({ ...prev, items: newItems, columns: newCols }));
    });

    return () => { unsubClientes(); unsubLista(); unsubPresupuestos(); };
  }, []);

  // ─── Helpers ────────────────────────────────────────────────────────────────
  const calcTotal = items => items.reduce((s, i) => s + (i.subtotal || 0), 0);

  const openDetail = item => {
    setSelectedLead(item);
    setDetailNotes(item.notas || '');
    setBuilderItems(item.quoteItems || []);
    setCanal(item.canal || 'iva');
    setViewHistory(false);
  };

  // ─── Canal 2 toggle ─────────────────────────────────────────────────────────
  const handleToggleCanal = async () => {
    if (!selectedLead) return;
    const newCanal = canal === 'iva' ? 'canal2' : 'iva';
    setCanal(newCanal);
    // Recalculate all items
    if (tc) {
      const recalc = builderItems.map(item => {
        const newPrice = calcPrecioItem(item, newCanal, tc.valor);
        return { ...item, unitPrice: newPrice, subtotal: Math.round(newPrice * item.quantity) };
      });
      setBuilderItems(recalc);
    }
    // Persist canal
    try {
      await updateDoc(doc(db, 'presupuestos', selectedLead.id), { canal: newCanal });
      setSelectedLead(prev => ({ ...prev, canal: newCanal }));
    } catch (e) { console.error(e); }
  };

  // ─── Quote Builder ──────────────────────────────────────────────────────────
  const handleAddItem = () => {
    const listaItem = listaItems.find(s => s.id === selectedItemId);
    if (!listaItem || !tc) return;

    const unitPrice = calcPrecioItem(listaItem, canal, tc.valor);
    const qty = Number(selectedItemQty) || 1;

    const newItem = {
      id: Date.now().toString(),
      listaItemId:    listaItem.id,
      descripcion:    listaItem.descripcion,
      tipo:           listaItem.tipo || 'material',
      costoUSD:       listaItem.costoUSD || null,
      markup:         listaItem.markup || null,
      precioVentaUSD: listaItem.precioVentaUSD || null,
      unidad:         listaItem.unidad || 'unidad',
      quantity:       qty,
      unitPrice,
      subtotal:       Math.round(unitPrice * qty),
    };
    setBuilderItems(prev => [...prev, newItem]);
    setSelectedItemId('');
    setSelectedItemQty(1);
  };

  const updateItem = (id, field, value) => {
    setBuilderItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const num = Number(value) || 0;
      const sub = field === 'quantity'
        ? Math.round(num * item.unitPrice)
        : Math.round(num * item.quantity);
      return { ...item, [field]: num, subtotal: sub };
    }));
  };

  const removeItem = id => setBuilderItems(prev => prev.filter(i => i.id !== id));

  // ─── Save detail (without new revision) ─────────────────────────────────────
  const saveDetail = async () => {
    if (!selectedLead) return;
    setIsSavingDetail(true);
    try {
      const amount = calcTotal(builderItems);
      await updateDoc(doc(db, 'presupuestos', selectedLead.id), {
        notas: detailNotes, amount, quoteItems: builderItems, canal,
      });
      setSelectedLead(prev => ({ ...prev, notas: detailNotes, amount, quoteItems: builderItems, canal }));
    } catch (err) { alert('Error: ' + err.message); }
    setIsSavingDetail(false);
  };

  // ─── New Revision (with change note) ────────────────────────────────────────
  const handleOpenRevModal = () => {
    setRevChangeNote('');
    setIsRevModalOpen(true);
  };

  const handleConfirmRevision = async () => {
    if (!revChangeNote.trim()) { alert('Describí brevemente qué cambió en esta revisión.'); return; }
    if (!selectedLead) return;
    setIsSavingDetail(true);
    try {
      const amount = calcTotal(builderItems);
      const prevRev = selectedLead.revision || 0;
      const history = [...(selectedLead.revisionsHistory || []), {
        revisionNumber:   prevRev,
        revisionTitle:    prevRev === 0 ? 'Original' : `Rev ${prevRev}`,
        quoteItems:       selectedLead.quoteItems || [],
        amount:           selectedLead.amount || 0,
        notas:            selectedLead.notas || '',
        canal:            selectedLead.canal || 'iva',
        cambiosRealizados: revChangeNote.trim(),
        savedAt:          new Date().toISOString(),
      }];
      const newRevision = prevRev + 1;
      await updateDoc(doc(db, 'presupuestos', selectedLead.id), {
        notas: detailNotes, amount, quoteItems: builderItems, canal,
        revision: newRevision, revisionsHistory: history,
      });
      setSelectedLead(prev => ({
        ...prev, notas: detailNotes, amount, quoteItems: builderItems, canal,
        revision: newRevision, revisionsHistory: history,
      }));
      setIsRevModalOpen(false);
      setRevChangeNote('');
    } catch (err) { alert('Error: ' + err.message); }
    setIsSavingDetail(false);
  };

  // ─── Delete lead ────────────────────────────────────────────────────────────
  const deleteLead = async () => {
    if (!selectedLead) return;
    if (!window.confirm(`¿Eliminar lead "${selectedLead.name}"?`)) return;
    try {
      await deleteDoc(doc(db, 'presupuestos', selectedLead.id));
      setSelectedLead(null);
    } catch (err) { alert('Error: ' + err.message); }
  };

  // ─── Drag & drop ────────────────────────────────────────────────────────────
  const onDragEnd = async result => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;
    const finishCol = data.columns[destination.droppableId];
    if (data.columns[source.droppableId] === finishCol) return;

    if (finishCol.id === 'aprobado') {
      setPendingMove(result);
      setIsApprovalOpen(true);
      return;
    }
    try {
      await updateDoc(doc(db, 'presupuestos', draggableId), { status: finishCol.id });
    } catch (err) { console.error(err); }
  };

  // ─── Approval: reserva stock + crea obra ERP + crea obra Jornadas ──────────
  const confirmApproval = async () => {
    if (!pendingMove) return;
    const { draggableId } = pendingMove;
    const item = data.items[draggableId];
    if (!item) return;
    setIsApproving(true);

    try {
      // 1. Actualizar presupuesto a "aprobado"
      await updateDoc(doc(db, 'presupuestos', draggableId), {
        status: 'aprobado',
        paymentStatus: paymentStatus,
        amount: paymentAmount ? parseInt(paymentAmount) : (item.amount || 0),
      });

      // 2. Reservar stock en lista_precios
      for (const qi of (item.quoteItems || [])) {
        if (qi.listaItemId) {
          try {
            await updateDoc(doc(db, 'lista_precios', qi.listaItemId), {
              stockReservado: increment(qi.quantity || 0),
            });
          } catch (e) { console.warn('No se pudo reservar stock para', qi.descripcion, e); }
        }
      }

      // 3. Crear obra en Euler Jornadas
      const jornadasObraId = `ob_erp_${Date.now()}`;
      const obraNombre = `${item.name} — ${item.paramSistema || 'Instalación'}`;
      try {
        await setDoc(doc(dbJornadas, 'obras', jornadasObraId), {
          id:            jornadasObraId,
          nombre:        obraNombre,
          activa:        true,
          lat:           null,
          lng:           null,
          radio:         200,
          radioTolerancia: 50,
          erpObraId:     null, // se actualizará después
          creadaDesdeERP: true,
          creadaEn:      new Date().toISOString(),
        });
      } catch (e) { console.warn('Error al crear obra en Jornadas:', e); }

      // 4. Crear obra en ERP
      const obraRef = await addDoc(collection(db, 'obras'), {
        name:           obraNombre,
        location:       item.location || 'S/D',
        clientId:       item.clientId || '',
        clientName:     item.name || 'S/D',
        system:         item.paramSistema || 'S/D',
        phase:          'Obra',
        estado:         'Pendiente de Inicio',
        progress:       0,
        operarios:      '',
        personal:       [],
        quoteItems:     item.quoteItems || [],
        presupuestoId:  draggableId,
        presupuestoNum: item.presupuestoNumber || '',
        canal:          item.canal || 'iva',
        jornadasObraId: jornadasObraId,
        bitacoraPreview: `Vinculado al Presupuesto: ${item.presupuestoNumber || 'S/N'}. Aprobado.`,
        bitacoraHistory: [{ texto: `Obra creada desde Presupuesto ${item.presupuestoNumber || ''}. Aprobado el ${new Date().toLocaleDateString('es-AR')}.`, fecha: new Date().toISOString() }],
        fechaInicio:    '',
        fechaFinEstimada: '',
        fechaFinReal:   '',
        archivos:       [],
        createdAt:      serverTimestamp(),
      });

      // 5. Actualizar obra en Jornadas con el ID del ERP
      try {
        await updateDoc(doc(dbJornadas, 'obras', jornadasObraId), { erpObraId: obraRef.id });
      } catch (e) { console.warn('No se pudo actualizar erpObraId en Jornadas:', e); }

    } catch (err) {
      console.error('Error al confirmar venta:', err);
      alert('Error en la base de datos al cerrar el presupuesto: ' + err.message);
    }

    closeApprovalModal();
    setIsApproving(false);
  };

  const closeApprovalModal = () => {
    setIsApprovalOpen(false);
    setPendingMove(null);
    setPaymentStatus('Pendiente');
    setPaymentAmount('');
  };

  // ─── Add new lead ────────────────────────────────────────────────────────────
  const handleAddLead = async () => {
    if (isSavingLead) return;
    setIsSavingLead(true);
    let finalClientId = newLead.clientId;
    let finalClientName = '';
    try {
      if (isNewClient) {
        if (!newLead.newClientName) { setIsSavingLead(false); return alert('Ingresá el nombre del cliente nuevo.'); }
        const ref = await addDoc(collection(db, 'clientes'), {
          name: newLead.newClientName, phone: newLead.newClientPhone || '',
          status: 'Lead', lastContact: new Date().toLocaleDateString('es-AR'), createdAt: serverTimestamp(),
        });
        finalClientId = ref.id;
        finalClientName = newLead.newClientName;
      } else {
        if (!newLead.clientId) { setIsSavingLead(false); return alert('Seleccioná un cliente de la lista.'); }
        finalClientName = (clientesList.find(c => c.id === newLead.clientId) || {}).name || '';
      }
      const now = new Date();
      const dateStr = `${now.getFullYear().toString().slice(-2)}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
      const presupuestoNumber = `PRE-${dateStr}-${Math.floor(Math.random()*1000).toString().padStart(3,'0')}`;
      await addDoc(collection(db, 'presupuestos'), {
        clientId: finalClientId, name: finalClientName, presupuestoNumber,
        revision: 0, revisionsHistory: [], quoteItems: [], canal: 'iva',
        location: newLead.location || 'S/D', source: newLead.source,
        paramSistema: newLead.paramSistema, tags: [newLead.paramSistema],
        status: 'pendiente', date: new Date().toLocaleDateString('es-AR'),
        amount: 0, paymentStatus: 'Pendiente', createdAt: serverTimestamp(),
      });
      setIsLeadModalOpen(false);
      setIsNewClient(false);
      setNewLead({ clientId:'', newClientName:'', newClientPhone:'', location:'', source:'WhatsApp', paramSistema:'Radiadores' });
    } catch (err) { console.error(err); alert('Error: ' + err.message); }
    setIsSavingLead(false);
  };

  // ─── Helpers UI ─────────────────────────────────────────────────────────────
  const materialesItems = listaItems.filter(i => i.tipo !== 'mano_de_obra' && i.tipo !== 'servicio' && i.activo !== false);
  const manoDeObraItems = listaItems.filter(i => (i.tipo === 'mano_de_obra' || i.tipo === 'servicio') && i.activo !== false);

  const inp = {
    width: '100%', padding: '0.5rem 0.75rem',
    border: '1px solid var(--border-strong)', borderRadius: '8px',
    fontSize: '0.875rem', outline: 'none', background: 'var(--bg-primary)',
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', margin: 0 }}>Presupuestos (CRM)</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Dólar BNA: {tcLoading ? '...' : tc ? `$ ${tc.valor.toLocaleString('es-AR')}` : 'Sin datos'}
            {tc && <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>— actualizado {new Date(tc.ultimaConsultaApi).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsLeadModalOpen(true)}>
          <Plus size={18} /> Nuevo Lead
        </button>
      </div>

      {/* ── Kanban Board ── */}
      <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '1rem', flex: 1, minHeight: '500px' }}>
        <DragDropContext onDragEnd={onDragEnd}>
          {data.columnOrder.map(colId => {
            const col = data.columns[colId];
            const items = col.itemsIds.map(id => data.items[id]).filter(Boolean);
            return <KanbanColumn key={col.id} column={col} items={items} onCardClick={openDetail} />;
          })}
        </DragDropContext>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────
          MODAL: Aprobar presupuesto
      ────────────────────────────────────────────────────────────────────── */}
      {isApprovalOpen && (
        <div style={{ position:'fixed',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000 }}>
          <div className="card" style={{ width:'440px',display:'flex',flexDirection:'column',gap:'1rem' }}>
            <h3 style={{ margin:0,display:'flex',alignItems:'center',gap:'0.5rem' }}>
              <Target size={20} color="var(--success)" /> Aprobar Presupuesto
            </h3>
            <p style={{ fontSize:'0.875rem',color:'var(--text-secondary)',margin:0 }}>
              Al aprobar:
              <br />• Se crea la <strong>Obra en el ERP</strong> y en <strong>Euler Jornadas</strong>
              <br />• Los artículos del presupuesto quedan <strong>reservados en stock</strong>
            </p>
            <div className="form-group">
              <label className="form-label">Estado de Pago</label>
              <select className="input-field" value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}>
                <option value="Pendiente">Pendiente de Pago</option>
                <option value="Seña Abonada">Seña Abonada</option>
                <option value="Pago Completo">Pago Completo (100%)</option>
              </select>
            </div>
            {paymentStatus !== 'Pendiente' && (
              <div className="form-group">
                <label className="form-label">Monto Abonado ($)</label>
                <input type="number" className="input-field" placeholder="Ej: 500000" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} />
              </div>
            )}
            <div style={{ display:'flex',justifyContent:'flex-end',gap:'0.5rem' }}>
              <button className="btn btn-secondary" onClick={closeApprovalModal} disabled={isApproving}>Cancelar</button>
              <button className="btn btn-primary" onClick={confirmApproval} disabled={isApproving}>
                {isApproving ? 'Procesando...' : '✓ Cerrar Venta y Generar Obra'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────
          MODAL: Nuevo Lead
      ────────────────────────────────────────────────────────────────────── */}
      {isLeadModalOpen && (
        <div style={{ position:'fixed',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000 }}>
          <div className="card" style={{ width:'450px',display:'flex',flexDirection:'column',gap:'1rem' }}>
            <h3 style={{ margin:0 }}>Ingresar Nuevo Lead Comercial</h3>
            <div style={{ display:'flex',flexDirection:'column',gap:'1rem' }}>
              <div className="form-group" style={{ marginBottom:0 }}>
                <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.25rem' }}>
                  <label className="form-label" style={{ margin:0 }}>Cliente <span style={{ color:'var(--accent-600)' }}>*</span></label>
                  <label style={{ fontSize:'0.75rem',color:'var(--primary-600)',fontWeight:'600',cursor:'pointer',display:'flex',alignItems:'center',gap:'0.25rem' }}>
                    <input type="checkbox" checked={isNewClient} onChange={e => setIsNewClient(e.target.checked)} /> Crear Nuevo
                  </label>
                </div>
                {isNewClient ? (
                  <div style={{ display:'flex',flexDirection:'column',gap:'0.5rem',padding:'0.75rem',backgroundColor:'var(--bg-surface-hover)',borderRadius:'8px',border:'1px dashed var(--primary-300)' }}>
                    <input type="text" className="input-field" placeholder="Nombre completo" value={newLead.newClientName} onChange={e => setNewLead({...newLead, newClientName: e.target.value})} />
                    <input type="text" className="input-field" placeholder="Teléfono" value={newLead.newClientPhone} onChange={e => setNewLead({...newLead, newClientPhone: e.target.value})} />
                  </div>
                ) : (
                  <select required className="input-field" value={newLead.clientId} onChange={e => setNewLead({...newLead, clientId: e.target.value})}>
                    <option value="" disabled>-- Busca en el Directorio --</option>
                    {clientesList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
              </div>
              <div className="form-group" style={{ marginBottom:0 }}>
                <label className="form-label">Localidad / Zona</label>
                <input type="text" className="input-field" value={newLead.location} onChange={e => setNewLead({...newLead, location: e.target.value})} placeholder="Ej: Funes, Fisherton" />
              </div>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem' }}>
                <div className="form-group" style={{ marginBottom:0 }}>
                  <label className="form-label">Canal de Llegada</label>
                  <select className="input-field" value={newLead.source} onChange={e => setNewLead({...newLead, source: e.target.value})}>
                    <option>WhatsApp</option><option>Instagram</option><option>Referido</option><option>Arquitecto</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom:0 }}>
                  <label className="form-label">Sistema Solicitado</label>
                  <select className="input-field" value={newLead.paramSistema} onChange={e => setNewLead({...newLead, paramSistema: e.target.value})}>
                    <option>Radiadores</option><option>Piso Radiante</option><option>SSTT Caldera</option><option>Híbrido</option>
                  </select>
                </div>
              </div>
              <div style={{ display:'flex',justifyContent:'flex-end',gap:'0.5rem' }}>
                <button className="btn btn-secondary" onClick={() => setIsLeadModalOpen(false)}>Cancelar</button>
                <button className="btn btn-primary" onClick={handleAddLead} disabled={isSavingLead}>
                  {isSavingLead ? 'Guardando...' : 'Crear Lead'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────
          MODAL: Nueva Revisión — ¿Qué cambió?
      ────────────────────────────────────────────────────────────────────── */}
      {isRevModalOpen && (
        <div style={{ position:'fixed',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000 }}>
          <div className="card" style={{ width:'480px',display:'flex',flexDirection:'column',gap:'1rem' }}>
            <h3 style={{ margin:0,display:'flex',alignItems:'center',gap:'0.5rem' }}>
              <History size={18} /> Nueva Revisión — {selectedLead?.presupuestoNumber}
            </h3>
            <p style={{ margin:0,fontSize:'0.875rem',color:'var(--text-secondary)' }}>
              El número de presupuesto no cambia. Describí qué cambió en esta versión para que quede registrado en el historial.
            </p>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">¿Qué cambió? <span style={{ color:'var(--accent-600)' }}>*</span></label>
              <textarea
                style={{ ...inp, minHeight:'80px', resize:'vertical' }}
                placeholder="Ej: Se reemplazó caldera Baxi Luna 3 por Baxi Eco Nova. Se eliminó radiador del baño principal."
                value={revChangeNote}
                onChange={e => setRevChangeNote(e.target.value)}
                autoFocus
              />
            </div>
            <div style={{ display:'flex',justifyContent:'flex-end',gap:'0.5rem' }}>
              <button className="btn btn-secondary" onClick={() => setIsRevModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleConfirmRevision} disabled={isSavingDetail}>
                <Save size={16} /> {isSavingDetail ? 'Guardando...' : 'Crear Revisión'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────
          PANEL LATERAL: Detalle del Lead
      ────────────────────────────────────────────────────────────────────── */}
      {selectedLead && (
        <>
          <div style={{ position:'fixed',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,0,0,0.5)',zIndex:40 }} onClick={() => setSelectedLead(null)} />
          <div style={{
            position:'fixed',top:0,right:0,bottom:0,width:'100%',maxWidth:'800px',
            backgroundColor:'var(--bg-primary)',boxShadow:'-5px 0 25px rgba(0,0,0,0.15)',
            zIndex:50,display:'flex',flexDirection:'column',animation:'slideIn 0.25s ease',
          }}>
            {/* Panel header */}
            <div style={{ padding:'1.5rem',borderBottom:'1px solid var(--border-light)',display:'flex',justifyContent:'space-between',alignItems:'center',backgroundColor:'var(--bg-surface-hover)' }}>
              <div>
                <h3 style={{ margin:0,fontSize:'1.125rem',fontWeight:'600',display:'flex',alignItems:'center',gap:'0.5rem' }}>
                  {selectedLead.presupuestoNumber || 'S/N'}
                  <span style={{ fontSize:'0.75rem',padding:'0.15rem 0.5rem',backgroundColor:'#e2e8f0',color:'#475569',borderRadius:'12px' }}>
                    Rev {selectedLead.revision || 0}
                  </span>
                  {(selectedLead.canal || 'iva') === 'canal2' && (
                    <span style={{ fontSize:'0.7rem',padding:'0.15rem 0.5rem',backgroundColor:'#fef3c7',color:'#92400e',borderRadius:'12px',fontWeight:'700' }}>
                      💵 Canal 2
                    </span>
                  )}
                </h3>
              </div>
              <div style={{ display:'flex',gap:'0.5rem' }}>
                {/* Historial siempre visible */}
                <button onClick={() => setViewHistory(!viewHistory)} style={{ display:'flex',alignItems:'center',gap:'0.25rem',padding:'0.25rem 0.5rem',backgroundColor: viewHistory ? '#4f46e5' : '#eef2ff',color: viewHistory ? 'white' : '#4f46e5',border:'1px solid #c7d2fe',borderRadius:'4px',cursor:'pointer',fontSize:'0.8rem',fontWeight:'600' }}>
                  <History size={16} /> {viewHistory ? 'Ver Cotizador' : `Historial${(selectedLead.revisionsHistory?.length || 0) > 0 ? ` (${selectedLead.revisionsHistory.length})` : ''}`}
                </button>
                <button onClick={() => setSelectedLead(null)} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--text-tertiary)',padding:'0.25rem' }}>
                  <X size={22} />
                </button>
              </div>
            </div>

            {/* Panel body */}
            <div style={{ flex:1,overflowY:'auto',padding:'1.5rem',display:'flex',flexDirection:'column',gap:'1.5rem' }}>
              {/* Info del cliente */}
              <div style={{ display:'flex',flexDirection:'column',gap:'0.5rem' }}>
                <h2 style={{ margin:0,fontSize:'1.25rem',fontWeight:'700' }}>{selectedLead.name}</h2>
                <div style={{ display:'flex',gap:'1rem',flexWrap:'wrap',fontSize:'0.8rem',color:'var(--text-secondary)' }}>
                  <span style={{ display:'flex',alignItems:'center',gap:'0.25rem' }}><MapPin size={14}/> {selectedLead.location || 'S/D'}</span>
                  <span style={{ display:'flex',alignItems:'center',gap:'0.25rem' }}><Calendar size={14}/> {selectedLead.date}</span>
                  <span style={{ display:'flex',alignItems:'center',gap:'0.25rem' }}><Tag size={14}/> {selectedLead.paramSistema || 'S/D'}</span>
                </div>
              </div>

              {viewHistory ? (
                /* ── Historial de revisiones ── */
                <div style={{ border:'1px solid var(--border-light)',borderRadius:'8px',overflow:'hidden' }}>
                  <div style={{ padding:'0.75rem 1rem',background:'var(--bg-surface-hover)',fontWeight:'700',fontSize:'0.875rem',color:'var(--text-primary)' }}>
                    📋 Historial de Versiones
                  </div>

                  {/* Versión actual (siempre al tope) */}
                  <div style={{ padding:'1rem',borderTop:'1px solid var(--border-light)',fontSize:'0.875rem',background:'#f0f9ff' }}>
                    <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'0.5rem' }}>
                      <div>
                        <span style={{ fontWeight:'700',color:'#0369a1' }}>✏️ Versión actual (en edición)</span>
                        <span style={{ marginLeft:'0.75rem',color:'var(--text-secondary)',fontSize:'0.75rem' }}>Rev {selectedLead.revision || 0}</span>
                        {canal === 'canal2' && <span style={{ marginLeft:'0.5rem',fontSize:'0.7rem',backgroundColor:'#fef3c7',color:'#92400e',padding:'0.1rem 0.4rem',borderRadius:'8px' }}>Canal 2</span>}
                      </div>
                      <span style={{ fontWeight:'700',color:'#0369a1' }}>
                        $ {calcTotal(builderItems || []).toLocaleString('es-AR')}
                      </span>
                    </div>
                    <div style={{ fontSize:'0.75rem',color:'var(--text-secondary)' }}>
                      {builderItems.length} ítems
                      {builderItems.length > 0 && ': ' + builderItems.slice(0,3).map(i => `${i.descripcion} (×${i.quantity})`).join(' · ')}
                      {builderItems.length > 3 && ` ... +${builderItems.length - 3} más`}
                    </div>
                    {detailNotes && (
                      <div style={{ marginTop:'0.4rem',fontSize:'0.75rem',color:'#64748b',fontStyle:'italic' }}>📝 {detailNotes.substring(0, 120)}{detailNotes.length > 120 ? '...' : ''}</div>
                    )}
                  </div>

                  {/* Versiones anteriores */}
                  {(selectedLead.revisionsHistory?.length || 0) === 0 ? (
                    <div style={{ padding:'1rem',textAlign:'center',color:'#94a3b8',fontSize:'0.875rem',fontStyle:'italic' }}>
                      Aún no hay revisiones anteriores guardadas.
                      <br/><span style={{ fontSize:'0.75rem' }}>Usá "Guardar Nueva Revisión" para crear una nueva versión.</span>
                    </div>
                  ) : (
                    selectedLead.revisionsHistory.slice().reverse().map((rev, idx) => (
                      <div key={idx} style={{ padding:'1rem',borderTop:'1px solid var(--border-light)',fontSize:'0.875rem' }}>
                        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'0.5rem' }}>
                          <div>
                            <span style={{ fontWeight:'700',color:'var(--primary-700)' }}>{rev.revisionTitle}</span>
                            <span style={{ marginLeft:'0.75rem',color:'var(--text-secondary)',fontSize:'0.75rem' }}>
                              {new Date(rev.savedAt).toLocaleString('es-AR')}
                            </span>
                            {rev.canal === 'canal2' && <span style={{ marginLeft:'0.5rem',fontSize:'0.7rem',backgroundColor:'#fef3c7',color:'#92400e',padding:'0.1rem 0.4rem',borderRadius:'8px' }}>Canal 2</span>}
                          </div>
                          <span style={{ fontWeight:'700',color:'var(--primary-600)' }}>
                            $ {(rev.amount || 0).toLocaleString('es-AR')}
                          </span>
                        </div>
                        {rev.cambiosRealizados && (
                          <div style={{ background:'#fefce8',border:'1px solid #fde68a',borderRadius:'6px',padding:'0.5rem 0.75rem',fontSize:'0.8rem',color:'#92400e',marginBottom:'0.5rem' }}>
                            <strong>Cambios:</strong> {rev.cambiosRealizados}
                          </div>
                        )}
                        <div style={{ fontSize:'0.75rem',color:'var(--text-secondary)' }}>
                          {(rev.quoteItems || []).length} ítems cotizados
                          {rev.quoteItems?.length > 0 && ': ' + rev.quoteItems.slice(0,3).map(i => `${i.descripcion} (×${i.quantity})`).join(' · ')}
                          {rev.quoteItems?.length > 3 && ` ... +${rev.quoteItems.length - 3} más`}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <>
                  {/* ── Canal 2 toggle ── */}
                  <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',background:'var(--bg-surface)',border:'1px solid var(--border-light)',borderRadius:'10px',padding:'0.75rem 1rem' }}>
                    <div>
                      <div style={{ fontWeight:'600',fontSize:'0.875rem' }}>
                        Modo de precio
                      </div>
                      <div style={{ fontSize:'0.75rem',color:'var(--text-secondary)' }}>
                        {canal === 'iva'
                          ? '🧾 Con IVA 21% discriminado (factura A)'
                          : `💵 Sin IVA — Canal 2 (materiales × ${COEF_CANAL2}, MO sin IVA)`
                        }
                      </div>
                    </div>
                    <button
                      onClick={handleToggleCanal}
                      style={{
                        padding:'0.4rem 1rem',borderRadius:'8px',fontWeight:'700',fontSize:'0.8rem',
                        cursor:'pointer',border:'none',transition:'all 0.2s',
                        background: canal === 'iva' ? '#1d4ed8' : '#d97706',
                        color: 'white',
                      }}
                    >
                      {canal === 'iva' ? '🧾 Con IVA' : '💵 Sin Factura'}
                    </button>
                  </div>

                  {/* ── Cotizador ── */}
                  <div style={{ border:'1px solid var(--primary-100)',borderRadius:'8px',overflow:'hidden' }}>
                    <div style={{ backgroundColor:'var(--primary-50)',padding:'1rem',borderBottom:'1px solid var(--primary-100)' }}>
                      <h4 style={{ margin:0,display:'flex',alignItems:'center',gap:'0.5rem',color:'var(--primary-700)' }}>
                        <ListPlus size={18}/> Cotizador — {canal === 'iva' ? 'Precios c/IVA' : 'Canal 2 (sin IVA)'}
                      </h4>
                    </div>

                    {/* Selector de ítem */}
                    <div style={{ padding:'1rem',display:'flex',gap:'0.5rem',alignItems:'flex-end',backgroundColor:'#fafafa' }}>
                      <div style={{ flex:1 }}>
                        <label className="form-label" style={{ fontSize:'0.75rem' }}>Seleccionar del Catálogo</label>
                        <select className="input-field" value={selectedItemId} onChange={e => setSelectedItemId(e.target.value)}>
                          <option value="">-- Buscar artículo --</option>
                          {materialesItems.length > 0 && (
                            <optgroup label="── Materiales y Equipos ──">
                              {materialesItems.map(i => (
                                <option key={i.id} value={i.id}>
                                  {i.descripcion}
                                  {i.costoUSD ? ` — U$D ${i.costoUSD}` : ''}
                                  {i.categoria ? ` [${i.categoria}]` : ''}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {manoDeObraItems.length > 0 && (
                            <optgroup label="── Mano de Obra ──">
                              {manoDeObraItems.map(i => (
                                <option key={i.id} value={i.id}>
                                  {i.descripcion}
                                  {i.precioVentaUSD ? ` — U$D ${i.precioVentaUSD}` : ''}
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                      </div>
                      <div style={{ width:'80px' }}>
                        <label className="form-label" style={{ fontSize:'0.75rem' }}>Cant.</label>
                        <input type="number" min="1" className="input-field" value={selectedItemQty} onChange={e => setSelectedItemQty(e.target.value)} />
                      </div>
                      <button
                        className="btn btn-secondary"
                        onClick={handleAddItem}
                        disabled={!selectedItemId || !tc}
                        title={!tc ? 'Cargando tipo de cambio...' : ''}
                      >
                        Añadir
                      </button>
                    </div>
                    {!tc && (
                      <div style={{ padding:'0.5rem 1rem',background:'#fef9c3',fontSize:'0.75rem',color:'#854d0e',display:'flex',alignItems:'center',gap:'0.5rem' }}>
                        <RefreshCw size={12} /> Cargando tipo de cambio para calcular precios...
                      </div>
                    )}

                    {/* Tabla */}
                    <div style={{ overflowX:'auto' }}>
                      <table style={{ width:'100%',borderCollapse:'collapse',fontSize:'0.875rem' }}>
                        <thead>
                          <tr style={{ backgroundColor:'var(--bg-surface-hover)',borderTop:'1px solid var(--border-light)',borderBottom:'1px solid var(--border-light)' }}>
                            <th style={{ padding:'0.75rem',textAlign:'left',width:'42%' }}>Artículo</th>
                            <th style={{ padding:'0.75rem',textAlign:'center',width:'12%' }}>Tipo</th>
                            <th style={{ padding:'0.75rem',textAlign:'center',width:'12%' }}>Cant</th>
                            <th style={{ padding:'0.75rem',textAlign:'right',width:'17%' }}>P.Unit</th>
                            <th style={{ padding:'0.75rem',textAlign:'right',width:'17%' }}>Subtotal</th>
                            <th style={{ padding:'0.75rem',textAlign:'center',width:'5%' }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {builderItems.map(item => (
                            <tr key={item.id} style={{ borderBottom:'1px solid #e2e8f0', backgroundColor: item.tipo === 'mano_de_obra' || item.tipo === 'servicio' ? '#f0f9ff' : 'white' }}>
                              <td style={{ padding:'0.5rem 0.75rem',fontWeight:'500' }}>
                                <div>{item.descripcion}</div>
                                <div style={{ fontSize:'0.7rem',color:'var(--text-tertiary)' }}>
                                  {item.unidad}
                                  {item.costoUSD && ` · U$D ${item.costoUSD}`}
                                </div>
                              </td>
                              <td style={{ padding:'0.5rem',textAlign:'center' }}>
                                <span style={{ fontSize:'0.65rem',padding:'0.1rem 0.4rem',borderRadius:'8px',backgroundColor: (item.tipo === 'mano_de_obra' || item.tipo === 'servicio') ? '#dbeafe' : '#f0fdf4',color:(item.tipo === 'mano_de_obra' || item.tipo === 'servicio') ? '#1d4ed8':'#166534',fontWeight:'600' }}>
                                  {(item.tipo === 'mano_de_obra' || item.tipo === 'servicio') ? 'MO' : 'Mat'}
                                </span>
                              </td>
                              <td style={{ padding:'0.5rem' }}>
                                <input type="number" value={item.quantity} onChange={e => updateItem(item.id, 'quantity', e.target.value)} style={{ width:'100%',padding:'0.25rem',border:'1px solid #cbd5e1',borderRadius:'4px',textAlign:'center' }} />
                              </td>
                              <td style={{ padding:'0.5rem' }}>
                                <input type="number" value={item.unitPrice} onChange={e => updateItem(item.id, 'unitPrice', e.target.value)} style={{ width:'100%',padding:'0.25rem',border:'1px solid #cbd5e1',borderRadius:'4px',textAlign:'right' }} />
                              </td>
                              <td style={{ padding:'0.5rem 0.75rem',textAlign:'right',fontWeight:'600' }}>
                                $ {item.subtotal.toLocaleString('es-AR')}
                              </td>
                              <td style={{ padding:'0.5rem',textAlign:'center' }}>
                                <button onClick={() => removeItem(item.id)} style={{ background:'none',border:'none',color:'#ef4444',cursor:'pointer' }}><X size={16}/></button>
                              </td>
                            </tr>
                          ))}
                          {builderItems.length === 0 && (
                            <tr><td colSpan="6" style={{ padding:'2rem',textAlign:'center',color:'#94a3b8',fontStyle:'italic' }}>Agrega artículos al presupuesto</td></tr>
                          )}
                        </tbody>
                        <tfoot>
                          <tr style={{ backgroundColor:'#f8fafc',fontWeight:'700',fontSize:'1rem' }}>
                            <td colSpan="4" style={{ padding:'1rem',textAlign:'right',color:'var(--text-secondary)',fontSize:'0.875rem' }}>
                              TOTAL PRESUPUESTO
                              <span style={{ marginLeft:'0.5rem',fontSize:'0.7rem',fontWeight:'400' }}>
                                ({canal === 'iva' ? 'con IVA 21%' : 'sin IVA — Canal 2'})
                              </span>:
                            </td>
                            <td colSpan="2" style={{ padding:'1rem',textAlign:'left',color:'var(--primary-700)' }}>
                              $ {calcTotal(builderItems).toLocaleString('es-AR')}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {/* ── Notas ── */}
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label className="form-label" style={{ display:'flex',alignItems:'center',gap:'0.35rem' }}>
                      <MessageSquare size={16}/> Comentarios y Condiciones
                    </label>
                    <textarea
                      className="input-field" rows={4}
                      placeholder="Notas comerciales, tiempo de entrega, validez..."
                      value={detailNotes} onChange={e => setDetailNotes(e.target.value)}
                      style={{ resize:'vertical',fontFamily:'inherit' }}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Panel footer */}
            <div style={{ padding:'1rem 1.5rem',borderTop:'1px solid var(--border-light)',display:'flex',justifyContent:'space-between',alignItems:'center',backgroundColor:'#f8fafc',flexWrap:'wrap',gap:'0.5rem' }}>
              <button onClick={deleteLead} style={{ display:'flex',alignItems:'center',gap:'0.35rem',background:'none',border:'none',color:'#dc2626',cursor:'pointer',fontSize:'0.8rem',fontWeight:'600' }}>
                <Trash2 size={16}/> Eliminar Lead
              </button>
              {!viewHistory && (
                <div style={{ display:'flex',gap:'0.5rem',flexWrap:'wrap' }}>
                  {/* Botón Generar PDF */}
                  <button
                    onClick={() => { setSelectedFolletos([]); setIsPDFModalOpen(true); }}
                    style={{ display:'flex',alignItems:'center',gap:'0.35rem',padding:'0.4rem 0.9rem',borderRadius:'8px',border:'1px solid #e2e8f0',background:'#f0f9ff',color:'#0369a1',fontWeight:'600',fontSize:'0.8rem',cursor:'pointer' }}
                  >
                    <FileText size={15}/> Generar PDF
                  </button>
                  <button className="btn btn-secondary" onClick={saveDetail} disabled={isSavingDetail}>
                    Guardar Cambios
                  </button>
                  <button className="btn btn-primary" onClick={handleOpenRevModal} disabled={isSavingDetail} style={{ display:'flex',alignItems:'center',gap:'0.35rem' }}>
                    <Save size={16}/> {isSavingDetail ? 'Guardando...' : 'Guardar Nueva Revisión'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ──────────────────────────────────────────────────────────────────────
          MODAL: Generar PDF del Presupuesto
      ────────────────────────────────────────────────────────────────────── */}
      {isPDFModalOpen && selectedLead && (
        <div style={{ position:'fixed',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2100 }}>
          <div className="card" style={{ width:'520px',maxHeight:'80vh',display:'flex',flexDirection:'column',gap:'1rem',overflow:'hidden' }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center' }}>
              <h3 style={{ margin:0,display:'flex',alignItems:'center',gap:'0.5rem' }}>
                <FileText size={18} color="#0369a1"/> Generar PDF — {selectedLead.presupuestoNumber}
              </h3>
              <button onClick={() => setIsPDFModalOpen(false)} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--text-tertiary)' }}><X size={20}/></button>
            </div>

            {/* Resumen del presupuesto */}
            <div style={{ background:'#f0f9ff',border:'1px solid #bae6fd',borderRadius:'8px',padding:'0.75rem 1rem',fontSize:'0.875rem' }}>
              <div style={{ fontWeight:'700',color:'#0369a1',marginBottom:'0.25rem' }}>{selectedLead.name}</div>
              <div style={{ color:'#475569',display:'flex',gap:'1rem',flexWrap:'wrap' }}>
                <span>Rev {selectedLead.revision || 0}</span>
                <span>{selectedLead.canal === 'canal2' ? '💵 Canal 2 (sin IVA)' : '🧾 Con IVA 21%'}</span>
                <span style={{ fontWeight:'700' }}>Total: $ {(calcTotal(builderItems) || selectedLead.amount || 0).toLocaleString('es-AR')}</span>
              </div>
            </div>

            {/* Folletos */}
            <div style={{ flex:1,overflowY:'auto' }}>
              <div style={{ fontWeight:'600',fontSize:'0.875rem',marginBottom:'0.5rem',color:'var(--text-primary)' }}>
                📄 Incluir folletos de productos ({folletosDisponibles.length} disponibles)
              </div>
              {folletosDisponibles.length === 0 ? (
                <div style={{ padding:'0.75rem',background:'#f8fafc',borderRadius:'8px',fontSize:'0.8rem',color:'#64748b',textAlign:'center' }}>
                  No hay folletos configurados. Para agregar folletos, asigná una URL de PDF en el campo <strong>folletoUrl</strong> de cada artículo en Lista de Precios.
                </div>
              ) : (
                <div style={{ display:'flex',flexDirection:'column',gap:'0.25rem',maxHeight:'220px',overflowY:'auto' }}>
                  {folletosDisponibles.map(item => {
                    const checked = selectedFolletos.includes(item.id);
                    return (
                      <label key={item.id} style={{ display:'flex',alignItems:'center',gap:'0.5rem',padding:'0.5rem 0.75rem',borderRadius:'6px',cursor:'pointer',background:checked?'#eff6ff':'transparent',border:checked?'1px solid #bfdbfe':'1px solid transparent',fontSize:'0.8rem' }}>
                        <input type="checkbox" checked={checked}
                          onChange={e => setSelectedFolletos(prev =>
                            e.target.checked ? [...prev, item.id] : prev.filter(id => id !== item.id)
                          )}
                        />
                        <span style={{ flex:1 }}>{item.descripcion}</span>
                        <span style={{ fontSize:'0.7rem',color:'#64748b' }}>{item.categoria}</span>
                      </label>
                    );
                  })}
                </div>
              )}
              {folletosDisponibles.length > 0 && (
                <button onClick={() => setSelectedFolletos(folletosDisponibles.map(i => i.id))} style={{ marginTop:'0.5rem',background:'none',border:'none',color:'#0369a1',fontSize:'0.75rem',cursor:'pointer',fontWeight:'600' }}>
                  Seleccionar todos
                </button>
              )}
            </div>

            {/* Barra de progreso */}
            {isGeneratingPDF && (
              <div style={{ background:'#f0f9ff',borderRadius:'8px',padding:'0.75rem 1rem' }}>
                <div style={{ display:'flex',justifyContent:'space-between',fontSize:'0.8rem',marginBottom:'0.25rem' }}>
                  <span style={{ color:'#0369a1',fontWeight:'600',display:'flex',alignItems:'center',gap:'0.4rem' }}><Loader size={14}/> Generando PDF...</span>
                  <span>{Math.round(pdfProgress * 100)}%</span>
                </div>
                <div style={{ height:'6px',background:'#e0f2fe',borderRadius:'3px',overflow:'hidden' }}>
                  <div style={{ width:`${pdfProgress*100}%`,height:'100%',background:'#0284c7',transition:'width 0.3s',borderRadius:'3px' }}/>
                </div>
              </div>
            )}

            <div style={{ display:'flex',justifyContent:'flex-end',gap:'0.5rem' }}>
              <button className="btn btn-secondary" onClick={() => setIsPDFModalOpen(false)} disabled={isGeneratingPDF}>Cancelar</button>
              <button
                disabled={isGeneratingPDF}
                onClick={async () => {
                  setIsGeneratingPDF(true);
                  setPdfProgress(0);
                  try {
                    const presupuestoData = {
                      ...selectedLead,
                      clientName: selectedLead.name,
                      quoteItems: builderItems.length > 0 ? builderItems : (selectedLead.quoteItems || []),
                      notas: detailNotes || selectedLead.notas || '',
                    };
                    const folletoUrls = folletosDisponibles
                      .filter(i => selectedFolletos.includes(i.id))
                      .map(i => ({ nombre: i.descripcion, url: i.folletoUrl }));
                    await generarPDFPresupuesto(presupuestoData, folletoUrls, (p) => setPdfProgress(p));
                    setIsPDFModalOpen(false);
                  } catch(err) {
                    alert('Error al generar PDF: ' + err.message);
                    console.error(err);
                  }
                  setIsGeneratingPDF(false);
                }}
                style={{ display:'flex',alignItems:'center',gap:'0.35rem',padding:'0.5rem 1.25rem',backgroundColor:'#0369a1',color:'white',border:'none',borderRadius:'8px',fontWeight:'700',cursor:'pointer',fontSize:'0.875rem' }}
              >
                <Download size={16}/> {isGeneratingPDF ? 'Generando...' : `Generar y Descargar PDF`}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
    </div>
  );
};

export default KanbanBoard;
