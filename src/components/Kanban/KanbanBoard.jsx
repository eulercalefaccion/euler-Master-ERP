import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { DragDropContext } from '@hello-pangea/dnd';
import {
  Plus, X, Save, MessageSquare, DollarSign, MapPin, Calendar, Tag,
  Trash2, ListPlus, Target, History, FileText, RefreshCw, Receipt, Download, Loader, Search
} from 'lucide-react';
import KanbanColumn from './KanbanColumn';
import { db } from '../../services/firebaseConfig';
import { dbJornadas } from '../../services/firebaseJornadas';
import {
  collection, onSnapshot, query, addDoc, updateDoc, deleteDoc, doc,
  serverTimestamp, increment, setDoc, arrayUnion
} from 'firebase/firestore';
import { getTipoCambio, calcularPrecios, calcularPrecioManoDeObra, IVA } from '../../services/tipoCambioService';
import { generarPDFPresupuesto } from '../../services/pdfPresupuesto';
import { getNextSequenceValue, formatPresupuestoNumber, formatObraNumber } from '../../utils/sequenceGenerator';
import { useAuth } from '../../context/AuthContext';

// ─── Constantes ───────────────────────────────────────────────────────────────
const COEF_CANAL2 = 1.105;

const calcPrecioItem = (item, canal, tcValor) => {
  if (!tcValor) return 0;
  
  // 1. Obtener precio base sin IVA
  let basePrice = 0;
  const isMoOrServ = item.tipo === 'mano_de_obra' || item.tipo === 'servicio';
  if (isMoOrServ) {
    basePrice = (item.precioVentaUSD || 0) * tcValor;
  } else {
    const markup = item.markup || 1.4;
    basePrice = (item.costoUSD || 0) * markup * tcValor;
  }
  
  // 2. Determinar el factor según canal y tipo de ítem
  let factor = 1.0;
  if (canal === 'canal2') {
    const desc = (item.descripcion || '').toLowerCase();
    if (desc.includes('pressfitting')) {
      // Excepción especial: 50% IVA cero y 50% 1.105 => (1.0 + 1.105) / 2 = 1.0525
      factor = 1.0525;
    } else if (isMoOrServ) {
      // Mano de obra tradicional: IVA cero
      factor = 1.0;
    } else {
      // Materiales: 1.105
      factor = COEF_CANAL2; // 1.105
    }
  } else {
    // Con IVA: mostramos el precio unitario neto (sin IVA)
    factor = 1.0;
  }
  
  return Math.round(basePrice * factor);
};

const getAutoFolletoUrl = (item) => {
  if (item.folletoUrl) return item.folletoUrl;
  
  const desc = (item.descripcion || '').toLowerCase();
  
  if (desc.includes('eco nova') || desc.includes('econova') || (desc.includes('baxi') && desc.includes('nova'))) {
    return '/folletos/Caldera Baxi Eco Nova.pdf';
  }
  if (desc.includes('luna 3') || desc.includes('luna3') || (desc.includes('confort') && desc.includes('baxi'))) {
    return '/folletos/Caldera Baxi Luna 3 Confort.pdf';
  }
  if (desc.includes('duo tec') || desc.includes('duotec') || (desc.includes('duo') && desc.includes('baxi'))) {
    return '/folletos/Caldera Baxi Luna Duo Tec E.pdf';
  }
  if (desc.includes('caldaia') || desc.includes('top s')) {
    return '/folletos/Caldera Caldaia TOP S.pdf';
  }
  if (desc.includes('nepto') || desc.includes('atron') || desc.includes('demirdokum')) {
    return '/folletos/Caldera DemirDokum Nepto Atron.pdf';
  }
  if (desc.includes('flowing') || desc.includes('caldera electrica') || desc.includes('advance')) {
    return '/folletos/Caldera Electrica Flowing Advance.pdf';
  }
  if (desc.includes('nereus') && (desc.includes('radiador') || desc.includes('elemento'))) {
    return '/folletos/Radiador Nereus 500.pdf';
  }
  if (desc.includes('rehau 500') || (desc.includes('radiador') && desc.includes('rehau'))) {
    return '/folletos/Radiador REHAU 500.pdf';
  }
  if (desc.includes('raubasic')) {
    return '/folletos/Sistema RAUBASIC REHAU.pdf';
  }
  if (desc.includes('piso radiante rehau') || desc.includes('pex-a') || desc.includes('pex a')) {
    return '/folletos/Piso Radiante REHAU.pdf';
  }
  if (desc.includes('bowman') || desc.includes('intercambiador')) {
    return '/folletos/Intercambiador Bowman.pdf';
  }
  if (desc.includes('ecopool') || desc.includes('heatcraft')) {
    return '/folletos/Bomba Calor Heatcraft EcoPool.pdf';
  }
  if (desc.includes('toallero kanah') || desc.includes('kanah')) {
    return '/folletos/Toallero Kanah 800.pdf';
  }
  if (desc.includes('piso radiante') || desc.includes('losa radiante')) {
    return '/folletos/Piso Radiante Render.pdf';
  }
  
  return null;
};

const getBrochureNameFromUrl = (url, fallback) => {
  if (url.startsWith('/folletos/')) {
    const parts = url.split('/');
    const filename = parts[parts.length - 1];
    return filename.replace('.pdf', '');
  }
  return fallback;
};

// ─── Componente principal ──────────────────────────────────────────────────────
const KanbanBoard = () => {
  const { currentUser } = useAuth();
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
  const [estandares, setEstandares]       = useState([]);   // estandares
  const [tc, setTc]                       = useState(null);
  const [tcLoading, setTcLoading]         = useState(true);

  // Filters
  const [searchCRM, setSearchCRM] = useState('');
  const [dateCRM, setDateCRM] = useState('');

  // Modals
  const [isStandardsModalOpen, setIsStandardsModalOpen] = useState(false);
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
    clientId: '',
    tipoCliente: 'consumidor_final', // 'consumidor_final' | 'arquitecto' | 'constructora' | 'desarrolladora'
    newClientName: '',
    email: '',
    telefono: '',
    dni: '',
    cuit: '',
    direccionCliente: '',
    contactoNombre: '',
    contactoTelefono: '',
    direccionObra: '',
    location: '',
    source: 'WhatsApp',
    paramSistema: 'Radiadores',
    tipoObra: 'VIVIENDA UNIFAMILIAR',
    estadoObra: 'OBRA NUEVA',
    tipoProyecto: 'LLAVE EN MANO (CAÑERIA+EQUIPOS+MANO DE OBRA)',
    facturacionIgualCliente: true,
    facturacionNombre: '',
    facturacionCuit: '',
    facturacionDni: '',
    facturacionDireccion: '',
    notasLead: '',
  });
  const [isSavingLead, setIsSavingLead] = useState(false);
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const [isProductSearchFocused, setIsProductSearchFocused] = useState(false);
  const [activeReplaceItemId, setActiveReplaceItemId] = useState(null);
  const [replaceSearchQuery, setReplaceSearchQuery] = useState('');

  useEffect(() => {
    if (!isLeadModalOpen) {
      setClientSearchQuery('');
      setIsDropdownOpen(false);
      setIsSearchFocused(false);
    }
  }, [isLeadModalOpen]);

  const handleSelectClient = (clientId) => {
    setClientSearchQuery('');
    if (!clientId) {
      setNewLead(prev => ({
        ...prev,
        clientId: '',
        newClientName: '',
        email: '',
        telefono: '',
        cuit: '',
        direccionCliente: '',
        dni: '',
        facturacionNombre: '',
        facturacionCuit: '',
        facturacionDni: '',
        facturacionDireccion: '',
      }));
      return;
    }
    const client = clientesList.find(c => c.id === clientId);
    if (!client) return;
    
    let tipoCliente = 'consumidor_final';
    if (client.type === 'Arquitecto' || client.type === 'Estudio de Arquitectura') {
      tipoCliente = 'arquitecto';
    } else if (client.type === 'Constructora') {
      tipoCliente = 'constructora';
    } else if (client.type === 'Desarrolladora') {
      tipoCliente = 'desarrolladora';
    }
    
    setNewLead(prev => {
      const next = {
        ...prev,
        clientId: client.id,
        tipoCliente,
        newClientName: client.name || '',
        email: client.email || '',
        telefono: client.phone || '',
        cuit: client.cuit || '',
        dni: client.dni || '',
        direccionCliente: client.address || '',
      };
      if (prev.facturacionIgualCliente) {
        next.facturacionNombre = client.name || '';
        next.facturacionCuit = client.cuit || '';
        next.facturacionDni = client.dni || '';
        next.facturacionDireccion = client.address || '';
      }
      return next;
    });
  };

  const handleToggleFacturacionIgualCliente = (checked) => {
    setNewLead(prev => {
      const next = { ...prev, facturacionIgualCliente: checked };
      if (checked) {
        next.facturacionNombre = prev.newClientName;
        next.facturacionCuit = prev.cuit;
        next.facturacionDni = prev.dni;
        next.facturacionDireccion = prev.direccionCliente;
      }
      return next;
    });
  };

  const handleUpdateNewLeadField = (field, value) => {
    setNewLead(prev => {
      const next = { ...prev, [field]: value };
      if (prev.facturacionIgualCliente) {
        if (field === 'newClientName') next.facturacionNombre = value;
        if (field === 'cuit') next.facturacionCuit = value;
        if (field === 'dni') next.facturacionDni = value;
        if (field === 'direccionCliente') next.facturacionDireccion = value;
      }
      return next;
    });
  };

  // Detail panel
  const [selectedLead, setSelectedLead]     = useState(null);

  useEffect(() => {
    setProductSearchQuery('');
    setIsProductDropdownOpen(false);
    setIsProductSearchFocused(false);
    setActiveReplaceItemId(null);
    setReplaceSearchQuery('');
  }, [selectedLead]);

  const [detailNotes, setDetailNotes]       = useState('');
  const [builderItems, setBuilderItems]     = useState([]);
  const [canal, setCanal]                   = useState('iva');   // 'iva' | 'canal2'
  const [isSavingDetail, setIsSavingDetail] = useState(false);
  const [detailTab, setDetailTab]           = useState('cotizador'); // 'cotizador' | 'datos' | 'historial'
  const [editLeadFields, setEditLeadFields] = useState(null);

  // Revision modal
  const [revChangeNote, setRevChangeNote] = useState('');

  // PDF
  const [isPDFModalOpen, setIsPDFModalOpen]   = useState(false);
  const [pdfProgress, setPdfProgress]         = useState(0);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [selectedFolletos, setSelectedFolletos] = useState([]);
  // Lista de folletos disponibles (artículos con folletoUrl en lista_precios o folletos locales por palabra clave)
  const folletosDisponibles = useMemo(() => {
    const uniqueUrls = new Set();
    const result = [];
    
    listaItems.forEach(i => {
      if (i.activo === false) return;
      const url = i.folletoUrl || getAutoFolletoUrl(i);
      if (url && !uniqueUrls.has(url)) {
        uniqueUrls.add(url);
        result.push({
          id: i.id,
          descripcion: getBrochureNameFromUrl(url, i.descripcion),
          folletoUrl: url
        });
      }
    });
    
    return result;
  }, [listaItems]);

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
      const c = snap.docs.map(d => ({ id: d.id, ...d.data() }));
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

    const unsubEstandares = onSnapshot(collection(db, 'estandares'), snap => {
      setEstandares(snap.docs.map(d => ({ id: d.id, ...d.data() })));
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
        if (d.deleted) return;
        const tags = Array.isArray(d.tags) ? d.tags : [d.paramSistema || 'S/D'];
        newItems[d.id] = { ...d, tags };
        (newCols[d.status] || newCols['pendiente']).itemsIds.push(d.id);
      });
      setData(prev => ({ ...prev, items: newItems, columns: newCols }));
    });

    return () => { 
      unsubClientes(); 
      unsubLista(); 
      unsubEstandares();
      unsubPresupuestos(); 
    };
  }, []);

  // ─── Helpers ────────────────────────────────────────────────────────────────
  const calcTotal = items => items.reduce((s, i) => s + (i.subtotal || 0), 0);

  const openDetail = item => {
    setSelectedLead(item);
    setDetailNotes(item.notas || '');
    setBuilderItems(item.quoteItems || []);
    setCanal(item.canal || 'iva');
    setDetailTab('cotizador');
    setEditLeadFields({
      name: item.name || '',
      tipoCliente: item.tipoCliente || 'consumidor_final',
      email: item.email || '',
      telefono: item.telefono || '',
      dni: item.dni || '',
      cuit: item.cuit || '',
      direccionCliente: item.direccionCliente || '',
      contactoNombre: item.contactoNombre || '',
      contactoTelefono: item.contactoTelefono || '',
      direccionObra: item.direccionObra || '',
      location: item.location || '',
      source: item.source || 'WhatsApp',
      paramSistema: item.paramSistema || 'Radiadores',
      tipoObra: item.tipoObra || 'VIVIENDA UNIFAMILIAR',
      estadoObra: item.estadoObra || 'OBRA NUEVA',
      tipoProyecto: item.tipoProyecto || 'LLAVE EN MANO (CAÑERIA+EQUIPOS+MANO DE OBRA)',
      facturacionIgualCliente: item.facturacionIgualCliente !== false,
      facturacionNombre: item.facturacionNombre || '',
      facturacionCuit: item.facturacionCuit || '',
      facturacionDni: item.facturacionDni || '',
      facturacionDireccion: item.facturacionDireccion || '',
    });
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
    setProductSearchQuery('');
  };

  const handleLoadStandard = () => {
    if (builderItems.length > 0) {
      const confirmReplace = window.confirm(
        "Esto reemplazará todos los artículos actuales de la cotización. ¿Deseas continuar?"
      );
      if (!confirmReplace) return;
    }
    
    setIsStandardsModalOpen(true);
  };

  const confirmLoadStandard = (standard) => {
    setIsStandardsModalOpen(false);
    const tcValor = tc?.valor || 1;

    const newItems = standard.items.map((estItem, index) => {
      let found = listaItems.find(i => i.id === estItem.itemId);
      if (!found && estItem.itemId !== 'unknown') {
         found = listaItems.find(i => (i.descripcion || '').toLowerCase() === (estItem.descripcion || '').toLowerCase());
      }

      const qty = estItem.defaultQty;

      if (found) {
        const unitPrice = calcPrecioItem(found, canal, tcValor);
        return {
          id: `${Date.now()}_${index}_${Math.random().toString(36).substr(2, 5)}`,
          listaItemId:    found.id,
          descripcion:    found.descripcion,
          tipo:           found.tipo || estItem.tipo,
          costoUSD:       found.costoUSD || null,
          markup:         found.markup || null,
          precioVentaUSD: found.precioVentaUSD || null,
          unidad:         found.unidad || estItem.unidad,
          quantity:       qty,
          unitPrice,
          subtotal:       Math.round(unitPrice * qty)
        };
      } else {
        return {
          id: `${Date.now()}_${index}_${Math.random().toString(36).substr(2, 5)}`,
          listaItemId:    'custom_fallback_' + index,
          descripcion:    estItem.descripcion,
          tipo:           estItem.tipo,
          costoUSD:       null,
          markup:         null,
          precioVentaUSD: null,
          unidad:         estItem.unidad,
          quantity:       qty,
          unitPrice:      0,
          subtotal:       0
        };
      }
    });

    setBuilderItems(newItems);
  };

  const handleReplaceItem = (id, catalogItem) => {
    if (!catalogItem || !tc) return;
    const unitPrice = calcPrecioItem(catalogItem, canal, tc.valor);
    
    setBuilderItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      return {
        ...item,
        listaItemId:    catalogItem.id,
        descripcion:    catalogItem.descripcion,
        tipo:           catalogItem.tipo || 'material',
        costoUSD:       catalogItem.costoUSD || null,
        markup:         catalogItem.markup || null,
        precioVentaUSD: catalogItem.precioVentaUSD || null,
        unidad:         catalogItem.unidad || 'unidad',
        unitPrice,
        subtotal:       Math.round(unitPrice * item.quantity),
      };
    }));
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

  // ─── Soft Delete ────────────────────────────────────────────────────────────
  const handleSoftDeleteLead = async () => {
    if (!selectedLead) return;
    if (!window.confirm(`¿Seguro que deseas mover este presupuesto a la papelera?`)) return;
    try {
      await updateDoc(doc(db, 'presupuestos', selectedLead.id), { deleted: true });
      setSelectedLead(null);
    } catch (e) { alert('Error: ' + e.message); }
  };

  // ─── Save detail (without new revision) ─────────────────────────────────────
  const saveDetail = async () => {
    if (!selectedLead || !editLeadFields) return;
    setIsSavingDetail(true);
    try {
      const amount = calcTotal(builderItems);
      
      const updatedFields = {
        notas: detailNotes,
        amount,
        quoteItems: builderItems,
        canal,
        
        name: editLeadFields.name,
        tipoCliente: editLeadFields.tipoCliente,
        email: editLeadFields.email,
        telefono: editLeadFields.telefono,
        dni: editLeadFields.dni,
        cuit: editLeadFields.cuit,
        direccionCliente: editLeadFields.direccionCliente,
        contactoNombre: editLeadFields.contactoNombre,
        contactoTelefono: editLeadFields.contactoTelefono,
        direccionObra: editLeadFields.direccionObra,
        location: editLeadFields.location,
        source: editLeadFields.source,
        paramSistema: editLeadFields.paramSistema,
        tipoObra: editLeadFields.tipoObra,
        estadoObra: editLeadFields.estadoObra,
        tipoProyecto: editLeadFields.tipoProyecto,
        tags: [editLeadFields.paramSistema],
        
        facturacionIgualCliente: editLeadFields.facturacionIgualCliente,
        facturacionNombre: editLeadFields.facturacionIgualCliente ? editLeadFields.name : editLeadFields.facturacionNombre,
        facturacionCuit: editLeadFields.facturacionIgualCliente ? editLeadFields.cuit : editLeadFields.facturacionCuit,
        facturacionDni: editLeadFields.facturacionIgualCliente ? editLeadFields.dni : editLeadFields.facturacionDni,
        facturacionDireccion: editLeadFields.facturacionIgualCliente ? editLeadFields.direccionCliente : editLeadFields.facturacionDireccion,
      };

      await updateDoc(doc(db, 'presupuestos', selectedLead.id), updatedFields);
      setSelectedLead(prev => ({ ...prev, ...updatedFields }));
      alert('Cambios guardados con éxito.');
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
    if (!selectedLead || !editLeadFields) return;
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
      const baseNum = (selectedLead.presupuestoNumber || '').split('_V')[0];
      const newPresupuestoNumber = `${baseNum}_V${newRevision}`;
      
      const updatedFields = {
        notas: detailNotes,
        amount,
        quoteItems: builderItems,
        canal,
        revision: newRevision,
        presupuestoNumber: newPresupuestoNumber,
        cambiosRealizados: revChangeNote.trim(),
        revisionsHistory: history,
        
        name: editLeadFields.name,
        tipoCliente: editLeadFields.tipoCliente,
        email: editLeadFields.email,
        telefono: editLeadFields.telefono,
        dni: editLeadFields.dni,
        cuit: editLeadFields.cuit,
        direccionCliente: editLeadFields.direccionCliente,
        contactoNombre: editLeadFields.contactoNombre,
        contactoTelefono: editLeadFields.contactoTelefono,
        direccionObra: editLeadFields.direccionObra,
        location: editLeadFields.location,
        source: editLeadFields.source,
        paramSistema: editLeadFields.paramSistema,
        tipoObra: editLeadFields.tipoObra,
        estadoObra: editLeadFields.estadoObra,
        tipoProyecto: editLeadFields.tipoProyecto,
        tags: [editLeadFields.paramSistema],
        
        facturacionIgualCliente: editLeadFields.facturacionIgualCliente,
        facturacionNombre: editLeadFields.facturacionIgualCliente ? editLeadFields.name : editLeadFields.facturacionNombre,
        facturacionCuit: editLeadFields.facturacionIgualCliente ? editLeadFields.cuit : editLeadFields.facturacionCuit,
        facturacionDni: editLeadFields.facturacionIgualCliente ? editLeadFields.dni : editLeadFields.facturacionDni,
        facturacionDireccion: editLeadFields.facturacionIgualCliente ? editLeadFields.direccionCliente : editLeadFields.facturacionDireccion,
      };

      await updateDoc(doc(db, 'presupuestos', selectedLead.id), updatedFields);
      setSelectedLead(prev => ({ ...prev, ...updatedFields }));
      setIsRevModalOpen(false);
      setRevChangeNote('');
      alert('Revisión guardada con éxito.');
    } catch (err) { alert('Error: ' + err.message); }
    setIsSavingDetail(false);
  };

  // ─── Delete lead ────────────────────────────────────────────────────────────
  const handleDownloadHistoricalPDF = async (rev) => {
    setIsGeneratingPDF(true);
    setPdfProgress(0);
    try {
      const historicalPresupuestoData = {
        ...selectedLead,
        quoteItems: rev.quoteItems || [],
        canal: rev.canal || 'iva',
        notas: rev.notas || '',
        cambiosRealizados: rev.cambiosRealizados || '',
        revision: rev.revisionNumber || 0,
        amount: rev.amount || 0,
        date: new Date(rev.savedAt).toLocaleDateString('es-AR')
      };
      
      const autoSelectedUrls = [];
      (rev.quoteItems || []).forEach(bi => {
        const catalogItem = listaItems.find(li => li.id === bi.listaItemId || li.descripcion === bi.descripcion);
        if (catalogItem) {
          const url = catalogItem.folletoUrl || getAutoFolletoUrl(catalogItem);
          if (url) {
            autoSelectedUrls.push(url);
          }
        }
      });
      const folletoUrls = [...new Set(autoSelectedUrls)].map(url => ({ url }));

      await generarPDFPresupuesto(historicalPresupuestoData, folletoUrls, (p) => setPdfProgress(p));
    } catch (err) {
      console.error(err);
      alert('Error al generar PDF: ' + err.message);
    } finally {
      setIsGeneratingPDF(false);
      setPdfProgress(0);
    }
  };

  // ─── Drag and Drop (Kanban) ─────────────────────────────────────────────────
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

    if (source.droppableId === 'aprobado') {
      alert("No se puede mover un presupuesto fuera de 'Aprobado'.");
      return;
    }

    if (finishCol.id === 'aprobado') {
      const itemToMove = data.items[draggableId];
      if (!itemToMove || !itemToMove.quoteItems || itemToMove.quoteItems.length === 0) {
        alert("No se puede aprobar un presupuesto vacío. Debe contener al menos un artículo.");
        return;
      }
      
      setPendingMove(result);
      setIsApprovalOpen(true);
      return;
    }
    try {
      const moveEvent = {
        status: finishCol.id,
        date: new Date().toISOString(),
        user: currentUser?.email || 'Desconocido'
      };
      await updateDoc(doc(db, 'presupuestos', draggableId), {
        status: finishCol.id,
        statusHistory: arrayUnion(moveEvent)
      });
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
      const moveEvent = {
        status: 'aprobado',
        date: new Date().toISOString(),
        user: currentUser?.email || 'Desconocido'
      };
      await updateDoc(doc(db, 'presupuestos', draggableId), {
        status: 'aprobado',
        paymentStatus: paymentStatus,
        amount: paymentAmount ? parseInt(paymentAmount) : (item.amount || 0),
        statusHistory: arrayUnion(moveEvent)
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

      // 3.5 Generar número de OT secuencial
      let otNumber = '';
      try {
        const seq = await getNextSequenceValue('obrasSeq');
        otNumber = formatObraNumber(seq);
      } catch (e) {
        console.error("Error generando OT sequence:", e);
        otNumber = `OT-${new Date().getFullYear()}-FALLBACK-${Math.floor(Math.random()*1000)}`;
      }

      // 4. Crear obra en ERP
      const obraRef = await addDoc(collection(db, 'obras'), {
        otNumber:       otNumber,
        name:           obraNombre,
        location:       item.direccionObra || item.location || 'S/D',
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
        presupuestoOrigen: item.presupuestoNumber || '', // Trazabilidad estricta
        canal:          item.canal || 'iva',
        jornadasObraId: jornadasObraId,
        bitacoraPreview: `Vinculado al Presupuesto: ${item.presupuestoNumber || 'S/N'}. Aprobado.`,
        bitacoraHistory: [{ texto: `Obra creada desde Presupuesto ${item.presupuestoNumber || ''}. Aprobado el ${new Date().toLocaleDateString('es-AR')}. OT generada: ${otNumber}`, fecha: new Date().toISOString() }],
        fechaInicio:    '',
        fechaFinEstimada: '',
        fechaFinReal:   '',
        archivos:       (item.archivos || []).map(a => ({ ...a, subidoEn: new Date().toISOString() })),
        createdAt:      serverTimestamp(),

        // Copy new CRM fields to Obra
        tipoCliente:    item.tipoCliente || 'consumidor_final',
        email:          item.email || '',
        telefono:       item.telefono || '',
        dni:            item.dni || '',
        cuit:           item.cuit || '',
        direccionCliente: item.direccionCliente || '',
        contactoNombre: item.contactoNombre || '',
        contactoTelefono: item.contactoTelefono || '',
        direccionObra:  item.direccionObra || '',
        tipoObra:       item.tipoObra || 'VIVIENDA UNIFAMILIAR',
        estadoObra:     item.estadoObra || 'OBRA NUEVA',
        tipoProyecto:   item.tipoProyecto || 'LLAVE EN MANO (CAÑERIA+EQUIPOS+MANO DE OBRA)',
        
        // Facturación
        facturacionIgualCliente: item.facturacionIgualCliente !== false,
        facturacionNombre: item.facturacionNombre || '',
        facturacionCuit: item.facturacionCuit || '',
        facturacionDni: item.facturacionDni || '',
        facturacionDireccion: item.facturacionDireccion || '',
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

  const handleCloseModal = () => {
    // Check for unsaved changes in Cotizador
    if (selectedLead && detailTab === 'cotizador') {
      const originalItems = selectedLead.quoteItems || [];
      const currentItems = builderItems || [];
      
      let hasChanges = false;
      if (originalItems.length !== currentItems.length) {
        hasChanges = true;
      } else {
        for (let i = 0; i < currentItems.length; i++) {
          const orig = originalItems[i];
          const curr = currentItems[i];
          if (orig.id !== curr.id || orig.quantity !== curr.quantity || orig.unitPrice !== curr.unitPrice || orig.descripcion !== curr.descripcion) {
            hasChanges = true;
            break;
          }
        }
      }
      
      if (hasChanges) {
        const confirmClose = window.confirm("¡Atención! Tienes cambios sin guardar en el Cotizador. ¿Deseas salir y perder los cambios?");
        if (!confirmClose) return;
      }
    }
    
    setSelectedLead(null);
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
        
        let mappedType = 'Propietario';
        if (newLead.tipoCliente === 'arquitecto') mappedType = 'Arquitecto';
        else if (newLead.tipoCliente === 'constructora') mappedType = 'Constructora';
        else if (newLead.tipoCliente === 'desarrolladora') mappedType = 'Constructora';
        
        const ref = await addDoc(collection(db, 'clientes'), {
          name: newLead.newClientName,
          phone: newLead.telefono || '',
          email: newLead.email || '',
          cuit: newLead.cuit || '',
          dni: newLead.dni || '',
          address: newLead.direccionCliente || '',
          type: mappedType,
          status: 'Lead',
          lastContact: new Date().toLocaleDateString('es-AR'),
          createdAt: serverTimestamp(),
          // New mirrored fields
          contactoNombre: newLead.contactoNombre || '',
          contactoTelefono: newLead.contactoTelefono || '',
          direccionObra: newLead.direccionObra || '',
          location: newLead.location || '',
          tipoObra: newLead.tipoObra,
          estadoObra: newLead.estadoObra,
          tipoProyecto: newLead.tipoProyecto,
          facturacionIgualCliente: newLead.facturacionIgualCliente,
          facturacionNombre: newLead.facturacionIgualCliente ? newLead.newClientName : (newLead.facturacionNombre || ''),
          facturacionCuit: newLead.facturacionIgualCliente ? (newLead.cuit || '') : (newLead.facturacionCuit || ''),
          facturacionDni: newLead.facturacionIgualCliente ? (newLead.dni || '') : (newLead.facturacionDni || ''),
          facturacionDireccion: newLead.facturacionIgualCliente ? (newLead.direccionCliente || '') : (newLead.facturacionDireccion || ''),
        });
        finalClientId = ref.id;
        finalClientName = newLead.newClientName;
      } else {
        if (!newLead.clientId) { setIsSavingLead(false); return alert('Seleccioná un cliente de la lista.'); }
        finalClientName = (clientesList.find(c => c.id === newLead.clientId) || {}).name || '';
      }
      
      let presupuestoNumber = '';
      try {
        const seq = await getNextSequenceValue('presupuestosSeq');
        presupuestoNumber = formatPresupuestoNumber(seq);
      } catch (e) {
        console.error("Error generando PRE sequence:", e);
        const now = new Date();
        const dateStr = `${now.getFullYear().toString().slice(-2)}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
        presupuestoNumber = `PRE-${dateStr}-FALLBACK`;
      }
      
      await addDoc(collection(db, 'presupuestos'), {
        clientId: finalClientId,
        name: finalClientName,
        presupuestoNumber,
        revision: 0,
        revisionsHistory: [],
        quoteItems: [],
        canal: 'iva',
        location: newLead.location || 'S/D',
        source: newLead.source,
        paramSistema: newLead.paramSistema,
        tags: [newLead.paramSistema],
        status: 'pendiente',
        date: new Date().toLocaleDateString('es-AR'),
        amount: 0,
        paymentStatus: 'Pendiente',
        createdAt: serverTimestamp(),
        
        // CRM fields
        tipoCliente: newLead.tipoCliente,
        email: newLead.email || '',
        telefono: newLead.telefono || '',
        dni: newLead.dni || '',
        cuit: newLead.cuit || '',
        direccionCliente: newLead.direccionCliente || '',
        contactoNombre: newLead.contactoNombre || '',
        contactoTelefono: newLead.contactoTelefono || '',
        direccionObra: newLead.direccionObra || '',
        tipoObra: newLead.tipoObra,
        estadoObra: newLead.estadoObra,
        tipoProyecto: newLead.tipoProyecto,
        
        // Facturación
        facturacionIgualCliente: newLead.facturacionIgualCliente,
        facturacionNombre: newLead.facturacionIgualCliente ? finalClientName : (newLead.facturacionNombre || ''),
        facturacionCuit: newLead.facturacionIgualCliente ? (newLead.cuit || '') : (newLead.facturacionCuit || ''),
        facturacionDni: newLead.facturacionIgualCliente ? (newLead.dni || '') : (newLead.facturacionDni || ''),
        facturacionDireccion: newLead.facturacionIgualCliente ? (newLead.direccionCliente || '') : (newLead.facturacionDireccion || ''),
        notasLead: newLead.notasLead || '',
      });
      
      setIsLeadModalOpen(false);
      setIsNewClient(false);
      setNewLead({
        clientId: '',
        tipoCliente: 'consumidor_final',
        newClientName: '',
        email: '',
        telefono: '',
        dni: '',
        cuit: '',
        direccionCliente: '',
        contactoNombre: '',
        contactoTelefono: '',
        direccionObra: '',
        location: '',
        source: 'WhatsApp',
        paramSistema: 'Radiadores',
        tipoObra: 'VIVIENDA UNIFAMILIAR',
        estadoObra: 'OBRA NUEVA',
        tipoProyecto: 'LLAVE EN MANO (CAÑERIA+EQUIPOS+MANO DE OBRA)',
        facturacionIgualCliente: true,
        facturacionNombre: '',
        facturacionCuit: '',
        facturacionDni: '',
        facturacionDireccion: '',
        notasLead: '',
      });
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', margin: 0 }}>Presupuestos (CRM)</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Dólar BNA: {tcLoading ? '...' : tc ? `$ ${tc.valor.toLocaleString('es-AR')}` : 'Sin datos'}
            {tc && <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>— actualizado {new Date(tc.ultimaConsultaApi).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
          <div style={{ position: 'relative', flexGrow: 1, maxWidth: '300px' }}>
            <Search size={18} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input
              type="text"
              placeholder="Buscar por cliente, dirección..."
              className="input-field"
              style={{ paddingLeft: '2.5rem' }}
              value={searchCRM}
              onChange={e => setSearchCRM(e.target.value)}
            />
          </div>
          <div style={{ position: 'relative', maxWidth: '180px' }}>
            <Calendar size={18} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input
              type="date"
              className="input-field"
              style={{ paddingLeft: '2.5rem' }}
              value={dateCRM}
              onChange={e => setDateCRM(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" onClick={() => setIsLeadModalOpen(true)}>
            <Plus size={18} /> Nuevo Lead
          </button>
        </div>
      </div>

      {/* ── Kanban Board ── */}
      <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '1rem', flex: 1, minHeight: '500px' }}>
        <DragDropContext onDragEnd={onDragEnd}>
          {data.columnOrder.map(colId => {
            const col = data.columns[colId];
            const items = col.itemsIds.map(id => data.items[id]).filter(Boolean).filter(item => {
              if (searchCRM) {
                const term = searchCRM.toLowerCase();
                const text = `${item.name || ''} ${item.clientName || ''} ${item.location || ''} ${item.direccionObra || ''} ${item.direccionCliente || ''} ${item.presupuestoNumber || ''} ${item.email || ''} ${item.contactoNombre || ''}`.toLowerCase();
                if (!text.includes(term)) return false;
              }
              if (dateCRM) {
                let match = false;
                const dCrmParts = dateCRM.split('-'); // YYYY-MM-DD
                if (dCrmParts.length === 3) {
                  const [y, m, d] = dCrmParts;
                  const targetStr1 = `${d}/${m}/${y}`;
                  const targetStr2 = `${parseInt(d)}/${parseInt(m)}/${y}`;
                  if ((item.date || '') === targetStr1 || (item.date || '') === targetStr2) {
                    match = true;
                  }
                  if (!match && item.createdAt) {
                    const cDate = item.createdAt.toDate ? item.createdAt.toDate() : new Date(item.createdAt);
                    if (cDate.getFullYear() == y && (cDate.getMonth() + 1) == parseInt(m) && cDate.getDate() == parseInt(d)) {
                      match = true;
                    }
                  }
                }
                if (!match) return false;
              }
              return true;
            });
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
          MODAL: Seleccionar Estándar
      ────────────────────────────────────────────────────────────────────── */}
      {isStandardsModalOpen && (
        <div style={{ position:'fixed',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000 }}>
          <div className="card" style={{ width:'500px',maxWidth:'95vw',display:'flex',flexDirection:'column',gap:'1.25rem' }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid var(--border-light)',paddingBottom:'0.75rem' }}>
              <h3 style={{ margin:0,fontSize:'1.1rem',fontWeight:'600', display:'flex', alignItems:'center', gap:'0.5rem' }}>
                ⚡ Cargar Estándar
              </h3>
              <button onClick={() => setIsStandardsModalOpen(false)} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--text-tertiary)' }}><X size={20}/></button>
            </div>
            
            <div style={{ display:'flex',flexDirection:'column',gap:'0.5rem', maxHeight:'60vh', overflowY:'auto' }}>
              {estandares.length === 0 ? (
                <div style={{ textAlign:'center', padding:'2rem', color:'var(--text-tertiary)', fontSize:'0.9rem' }}>
                  No hay estándares creados. Ve a la sección "Estándares" en el menú para crear uno.
                </div>
              ) : (
                estandares.map(est => (
                  <button 
                    key={est.id}
                    onClick={() => confirmLoadStandard(est)}
                    style={{
                      padding:'1rem', textAlign:'left', borderRadius:'8px', border:'1px solid var(--border-light)',
                      background:'white', cursor:'pointer', display:'flex', flexDirection:'column', gap:'0.25rem',
                      transition:'all 0.2s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary-400)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-light)'}
                  >
                    <span style={{ fontWeight:'600', fontSize:'0.95rem', color:'var(--text-primary)' }}>{est.nombre}</span>
                    <span style={{ fontSize:'0.8rem', color:'var(--text-secondary)' }}>Contiene {est.items?.length || 0} artículos</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────
          MODAL: Nuevo Lead
      ────────────────────────────────────────────────────────────────────── */}
      {isLeadModalOpen && (
        <div style={{ position:'fixed',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000 }}>
          <div className="card" style={{ width:'700px',maxWidth:'95vw',maxHeight:'90vh',display:'flex',flexDirection:'column',gap:'1.25rem',overflowY:'auto' }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid var(--border-light)',paddingBottom:'0.75rem' }}>
              <h3 style={{ margin:0,fontSize:'1.25rem',fontWeight:'600' }}>Ingresar Nuevo Lead Comercial</h3>
              <button onClick={() => setIsLeadModalOpen(false)} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--text-tertiary)' }}><X size={20}/></button>
            </div>
            
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1.25rem' }}>
              
              {/* COLUMNA IZQUIERDA: Identidad del Cliente */}
              <div style={{ display:'flex',flexDirection:'column',gap:'1rem' }}>
                <div style={{ background:'var(--bg-surface-hover)',padding:'0.75rem',borderRadius:'8px',border:'1px solid var(--border-light)' }}>
                  <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.5rem' }}>
                    <span style={{ fontSize:'0.85rem',fontWeight:'600',color:'var(--text-primary)' }}>Tipo de Cliente</span>
                  </div>
                  <div style={{ display:'flex',gap:'0.5rem',flexWrap:'wrap' }}>
                    {[
                      { val: 'consumidor_final', label: 'Cons. Final / Dueño' },
                      { val: 'arquitecto', label: 'Arquitecto' },
                      { val: 'constructora', label: 'Constructora' },
                      { val: 'desarrolladora', label: 'Desarrolladora' }
                    ].map(opt => (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() => handleUpdateNewLeadField('tipoCliente', opt.val)}
                        style={{
                          padding:'0.35rem 0.65rem',
                          borderRadius:'6px',
                          fontSize:'0.75rem',
                          fontWeight:'600',
                          border:'1px solid',
                          borderColor: newLead.tipoCliente === opt.val ? 'var(--primary-600)' : 'var(--border-strong)',
                          background: newLead.tipoCliente === opt.val ? 'var(--primary-50)' : 'white',
                          color: newLead.tipoCliente === opt.val ? 'var(--primary-700)' : 'var(--text-secondary)',
                          cursor:'pointer',
                          transition:'all 0.15s'
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom:0 }}>
                  <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.25rem' }}>
                    <label className="form-label" style={{ margin:0 }}>Cliente <span style={{ color:'var(--accent-600)' }}>*</span></label>
                    <label style={{ fontSize:'0.75rem',color:'var(--primary-600)',fontWeight:'600',cursor:'pointer',display:'flex',alignItems:'center',gap:'0.25rem' }}>
                      <input type="checkbox" checked={isNewClient} onChange={e => setIsNewClient(e.target.checked)} /> Crear Nuevo
                    </label>
                  </div>
                  {isNewClient ? (
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Nombre o Razón Social"
                      value={newLead.newClientName}
                      onChange={e => handleUpdateNewLeadField('newClientName', e.target.value)}
                    />
                  ) : (() => {
                    const selectedClient = clientesList.find(c => c.id === newLead.clientId);
                    const displayValue = isSearchFocused ? clientSearchQuery : (selectedClient?.name || '');
                    return (
                      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="🔍 Seleccione o escriba para buscar cliente..."
                          value={displayValue}
                          onChange={e => {
                            setClientSearchQuery(e.target.value);
                            setIsDropdownOpen(true);
                          }}
                          onFocus={() => {
                            setIsSearchFocused(true);
                            setIsDropdownOpen(true);
                          }}
                          onBlur={() => {
                            setTimeout(() => {
                              setIsSearchFocused(false);
                              setIsDropdownOpen(false);
                            }, 200);
                          }}
                          onClick={() => {
                            setIsDropdownOpen(true);
                          }}
                          style={{ fontSize: '0.85rem' }}
                        />
                        
                        {isDropdownOpen && (
                          <div style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            maxHeight: '220px',
                            overflowY: 'auto',
                            background: 'white',
                            border: '1px solid var(--border-strong)',
                            borderRadius: '6px',
                            zIndex: 1000,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            marginTop: '4px'
                          }}>
                            {(() => {
                              const filtered = clientesList.filter(c => {
                                if (!clientSearchQuery || clientSearchQuery.trim().length < 2) return true;
                                const query = clientSearchQuery.toLowerCase().trim();
                                const nameMatch = (c.name || '').toLowerCase().includes(query);
                                const contactNameMatch = (c.contactoNombre || '').toLowerCase().includes(query);
                                const factNameMatch = (c.facturacionNombre || '').toLowerCase().includes(query);
                                
                                const cleanQuery = query.replace(/[^a-zA-Z0-9]/g, '');
                                const cleanCuit = (c.cuit || '').replace(/[^a-zA-Z0-9]/g, '');
                                const cleanFactCuit = (c.facturacionCuit || '').replace(/[^a-zA-Z0-9]/g, '');
                                
                                const cuitMatch = (c.cuit || '').toLowerCase().includes(query) ||
                                                  cleanCuit.includes(cleanQuery) ||
                                                  (c.facturacionCuit || '').toLowerCase().includes(query) ||
                                                  cleanFactCuit.includes(cleanQuery);
                                                  
                                const dniMatch = (c.dni || '').toLowerCase().includes(query) ||
                                                 (c.facturacionDni || '').toLowerCase().includes(query);
                                                 
                                return nameMatch || contactNameMatch || factNameMatch || cuitMatch || dniMatch;
                              });

                              if (filtered.length === 0) {
                                return (
                                  <div style={{
                                    padding: '0.6rem 0.85rem',
                                    color: 'var(--text-tertiary)',
                                    fontSize: '0.875rem',
                                    textAlign: 'center'
                                  }}>
                                    No se encontraron clientes
                                  </div>
                                );
                              }

                              return filtered.map(c => (
                                <div
                                  key={c.id}
                                  onMouseDown={() => {
                                    handleSelectClient(c.id);
                                  }}
                                  style={{
                                    padding: '0.5rem 0.85rem',
                                    cursor: 'pointer',
                                    fontSize: '0.875rem',
                                    borderBottom: '1px solid var(--border-light)',
                                    backgroundColor: newLead.clientId === c.id ? 'var(--primary-50)' : 'transparent',
                                    color: newLead.clientId === c.id ? 'var(--primary-700)' : 'var(--text-primary)',
                                    fontWeight: newLead.clientId === c.id ? '600' : 'normal',
                                    transition: 'background 0.1s'
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-surface-hover)'}
                                  onMouseLeave={e => e.currentTarget.style.backgroundColor = newLead.clientId === c.id ? 'var(--primary-50)' : 'transparent'}
                                >
                                  <div style={{ fontWeight: '600' }}>{c.name}</div>
                                  {(c.cuit || c.dni) && (
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.15rem' }}>
                                      {c.cuit ? `CUIT: ${c.cuit}` : ''} {c.dni ? `| DNI: ${c.dni}` : ''}
                                    </div>
                                  )}
                                </div>
                              ));
                            })()}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.75rem' }}>
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label className="form-label">Teléfono principal</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Ej: +549..."
                      value={newLead.telefono}
                      onChange={e => handleUpdateNewLeadField('telefono', e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label className="form-label">Email</label>
                    <input
                      type="email"
                      className="input-field"
                      placeholder="correo@ejemplo.com"
                      value={newLead.email}
                      onChange={e => handleUpdateNewLeadField('email', e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.75rem' }}>
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label className="form-label">CUIT</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="30-XXXXXX-X"
                      value={newLead.cuit}
                      onChange={e => handleUpdateNewLeadField('cuit', e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label className="form-label">DNI</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="DNI del cliente"
                      value={newLead.dni}
                      onChange={e => handleUpdateNewLeadField('dni', e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom:0 }}>
                  <label className="form-label">Dirección Principal / Comercial</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Calle, Nro, Localidad del Cliente"
                    value={newLead.direccionCliente}
                    onChange={e => handleUpdateNewLeadField('direccionCliente', e.target.value)}
                  />
                </div>
              </div>

              {/* COLUMNA DERECHA: Datos del Proyecto, Contacto y Obra */}
              <div style={{ display:'flex',flexDirection:'column',gap:'1rem' }}>
                
                {/* Persona de contacto (condicional constructora/desarrolladora/arquitecto) */}
                {newLead.tipoCliente !== 'consumidor_final' && (
                  <div style={{ background:'var(--primary-50)',padding:'0.75rem',borderRadius:'8px',border:'1px solid var(--primary-100)',display:'flex',flexDirection:'column',gap:'0.75rem' }}>
                    <span style={{ fontSize:'0.8rem',fontWeight:'700',color:'var(--primary-700)' }}>Persona de Contacto</span>
                    <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.5rem' }}>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Nombre y Apellido"
                        style={{ background:'white' }}
                        value={newLead.contactoNombre}
                        onChange={e => handleUpdateNewLeadField('contactoNombre', e.target.value)}
                      />
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Teléfono del contacto"
                        style={{ background:'white' }}
                        value={newLead.contactoTelefono}
                        onChange={e => handleUpdateNewLeadField('contactoTelefono', e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <div className="form-group" style={{ marginBottom:0 }}>
                  <label className="form-label">Dirección de la Obra</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Calle, Nro, Piso, Localidad"
                    value={newLead.direccionObra}
                    onChange={e => handleUpdateNewLeadField('direccionObra', e.target.value)}
                  />
                </div>

                <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.75rem' }}>
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label className="form-label">Localidad / Zona (Obra)</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Ej: Funes, Fisherton"
                      value={newLead.location}
                      onChange={e => handleUpdateNewLeadField('location', e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label className="form-label">Sistema Solicitado</label>
                    <select
                      className="input-field"
                      value={newLead.paramSistema}
                      onChange={e => handleUpdateNewLeadField('paramSistema', e.target.value)}
                    >
                      <option>Radiadores</option>
                      <option>Piso Radiante</option>
                      <option>SSTT Caldera</option>
                      <option>Híbrido</option>
                    </select>
                  </div>
                </div>

                <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.75rem' }}>
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label className="form-label">Canal de Llegada</label>
                    <select
                      className="input-field"
                      value={newLead.source}
                      onChange={e => handleUpdateNewLeadField('source', e.target.value)}
                    >
                      <option>WhatsApp</option>
                      <option>Instagram</option>
                      <option>Referido</option>
                      <option>Arquitecto</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label className="form-label">Tipo de Obra</label>
                    <select
                      className="input-field"
                      value={newLead.tipoObra}
                      onChange={e => handleUpdateNewLeadField('tipoObra', e.target.value)}
                    >
                      <option value="VIVIENDA UNIFAMILIAR">VIVIENDA UNIFAMILIAR</option>
                      <option value="EDIFICIO">EDIFICIO</option>
                      <option value="LOCAL COMERCIAL">LOCAL COMERCIAL</option>
                    </select>
                  </div>
                </div>

                <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.75rem' }}>
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label className="form-label">Estado de Obra</label>
                    <select
                      className="input-field"
                      value={newLead.estadoObra}
                      onChange={e => handleUpdateNewLeadField('estadoObra', e.target.value)}
                    >
                      <option value="OBRA NUEVA">OBRA NUEVA</option>
                      <option value="OBRA REFACCION">OBRA REFACCION</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label className="form-label">Tipo de Proyecto / Servicio</label>
                    <select
                      className="input-field"
                      value={newLead.tipoProyecto}
                      onChange={e => handleUpdateNewLeadField('tipoProyecto', e.target.value)}
                    >
                      <option value="SOLO VENTA DE EQUIPOS">SOLO VENTA DE EQUIPOS</option>
                      <option value="VENTA+INSTALACION DE EQUIPOS (TIENE CAÑERIA HECHA)">VENTA+INSTALACION DE EQUIPOS (TIENE CAÑERIA HECHA)</option>
                      <option value="SOLO CAÑERIA">SOLO CAÑERIA</option>
                      <option value="LLAVE EN MANO (CAÑERIA+EQUIPOS+MANO DE OBRA)">LLAVE EN MANO (CAÑERIA+EQUIPOS+MANO DE OBRA)</option>
                      <option value="OTRO">OTRO</option>
                    </select>
                  </div>
                </div>
              </div>

            </div>

            {/* SECCIÓN FACTURACIÓN EN EL MODAL */}
            <div style={{ borderTop:'1px solid var(--border-light)',paddingTop:'1rem',marginTop:'0.5rem' }}>
              <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.75rem' }}>
                <h4 style={{ margin:0,fontSize:'0.9rem',fontWeight:'600',color:'var(--text-primary)' }}>Datos de Facturación</h4>
                <label style={{ fontSize:'0.8rem',color:'var(--text-secondary)',cursor:'pointer',display:'flex',alignItems:'center',gap:'0.35rem',fontWeight:'500' }}>
                  <input
                    type="checkbox"
                    checked={newLead.facturacionIgualCliente}
                    onChange={e => handleToggleFacturacionIgualCliente(e.target.checked)}
                  />
                  Igual que los datos del cliente
                </label>
              </div>

              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1.25rem' }}>
                <div style={{ display:'flex',flexDirection:'column',gap:'0.75rem' }}>
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label className="form-label">Nombre / Razón Social Facturación</label>
                    <input
                      type="text"
                      className="input-field"
                      disabled={newLead.facturacionIgualCliente}
                      value={newLead.facturacionNombre}
                      onChange={e => handleUpdateNewLeadField('facturacionNombre', e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label className="form-label">Dirección Facturación</label>
                    <input
                      type="text"
                      className="input-field"
                      disabled={newLead.facturacionIgualCliente}
                      value={newLead.facturacionDireccion}
                      onChange={e => handleUpdateNewLeadField('facturacionDireccion', e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display:'flex',flexDirection:'column',gap:'0.75rem' }}>
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label className="form-label">CUIT Facturación</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="30-XXXXXX-X"
                      disabled={newLead.facturacionIgualCliente}
                      value={newLead.facturacionCuit}
                      onChange={e => handleUpdateNewLeadField('facturacionCuit', e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label className="form-label">DNI Facturación</label>
                    <input
                      type="text"
                      className="input-field"
                      disabled={newLead.facturacionIgualCliente}
                      value={newLead.facturacionDni}
                      onChange={e => handleUpdateNewLeadField('facturacionDni', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display:'flex',justifyContent:'flex-end',gap:'0.5rem',borderTop:'1px solid var(--border-light)',paddingTop:'0.75rem',marginTop:'0.5rem' }}>
              <button className="btn btn-secondary" onClick={() => setIsLeadModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleAddLead} disabled={isSavingLead}>
                {isSavingLead ? 'Guardando...' : 'Crear Lead'}
              </button>
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
          <div style={{ position:'fixed',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,0,0,0.5)',zIndex:40 }} onClick={handleCloseModal} />
          <div style={{
            position:'fixed',top:0,right:0,bottom:0,width:'calc(100vw - 250px)',
            backgroundColor:'var(--bg-primary)',boxShadow:'-5px 0 25px rgba(0,0,0,0.15)',
            zIndex:50,display:'flex',flexDirection:'column',animation:'slideIn 0.25s ease',
          }}>
            {/* ── HEADER COMPACTO ── */}
            <div style={{ padding:'0.75rem 1rem',borderBottom:'1px solid var(--border-light)',display:'flex',justifyContent:'space-between',alignItems:'center',backgroundColor:'var(--bg-surface-hover)' }}>
              <div style={{ display:'flex',alignItems:'center',gap:'1.5rem' }}>
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
                <div style={{ display:'flex',gap:'0.5rem' }}>
                  <button onClick={() => setDetailTab('cotizador')} style={{ padding:'0.35rem 0.75rem',fontSize:'0.85rem',fontWeight:'600',color:detailTab==='cotizador'?'var(--primary-600)':'var(--text-secondary)',backgroundColor:detailTab==='cotizador'?'var(--primary-50)':'transparent',border:'none',borderRadius:'6px',cursor:'pointer',transition:'all 0.2s' }}>💰 Cotizador</button>
                  <button onClick={() => setDetailTab('datos')} style={{ padding:'0.35rem 0.75rem',fontSize:'0.85rem',fontWeight:'600',color:detailTab==='datos'?'var(--primary-600)':'var(--text-secondary)',backgroundColor:detailTab==='datos'?'var(--primary-50)':'transparent',border:'none',borderRadius:'6px',cursor:'pointer',transition:'all 0.2s' }}>📋 Datos del Lead</button>
                  <button onClick={() => setDetailTab('historial')} style={{ padding:'0.35rem 0.75rem',fontSize:'0.85rem',fontWeight:'600',color:detailTab==='historial'?'var(--primary-600)':'var(--text-secondary)',backgroundColor:detailTab==='historial'?'var(--primary-50)':'transparent',border:'none',borderRadius:'6px',cursor:'pointer',transition:'all 0.2s' }}>🕰️ Historial {(selectedLead.revisionsHistory?.length||0)>0?` (${selectedLead.revisionsHistory.length})`:''}</button>
                </div>
              </div>
              <div style={{ display:'flex',alignItems:'center',gap:'1rem' }}>
                <div style={{ display:'flex',gap:'0.75rem',fontSize:'0.75rem',color:'var(--text-secondary)' }}>
                  <span style={{ fontWeight:'700',color:'var(--text-primary)' }}>{selectedLead.name}</span>
                  <span>|</span>
                  <span style={{ display:'flex',alignItems:'center',gap:'0.15rem' }}><MapPin size={13}/> {selectedLead.location || 'S/D'}</span>
                  <span>|</span>
                  <span style={{ display:'flex',alignItems:'center',gap:'0.15rem' }}><Calendar size={13}/> {selectedLead.date}</span>
                </div>
                <button onClick={handleCloseModal} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--text-tertiary)',padding:'0.25rem' }}><X size={22} /></button>
              </div>
            </div>

            {/* Panel body */}
            <div style={{ flex:1,minHeight:0,overflowY:'auto',direction:'rtl' }}>
              <div style={{ padding:'1rem',display:'flex',flexDirection:'column',gap:'0.75rem',direction:'ltr',minHeight:'100%' }}>

              {detailTab === 'cotizador' && (
                <>
                  {/* ── Canal 2 toggle ── */}
                  <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',background:'var(--bg-surface)',border:'1px solid var(--border-light)',borderRadius:'8px',padding:'0.4rem 0.75rem' }}>
                    <div>
                      <div style={{ fontWeight:'600',fontSize:'0.8rem' }}>
                        Modo: <span style={{ color: canal === 'iva' ? '#1d4ed8' : '#d97706' }}>{canal === 'iva' ? 'Con IVA 21% discriminado' : 'Canal 2 (Sin IVA)'}</span>
                      </div>
                    </div>
                    <button
                      onClick={handleToggleCanal}
                      style={{
                        padding:'0.25rem 0.75rem',borderRadius:'6px',fontWeight:'700',fontSize:'0.75rem',
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
                    <div style={{ backgroundColor:'var(--primary-50)',padding:'0.5rem 0.75rem',borderBottom:'1px solid var(--primary-100)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <h4 style={{ margin:0,display:'flex',alignItems:'center',gap:'0.5rem',color:'var(--primary-700)', fontSize:'0.875rem' }}>
                        <ListPlus size={16}/> Cotizador — {canal === 'iva' ? 'Precios c/IVA' : 'Canal 2 (sin IVA)'}
                      </h4>
                      <button
                        onClick={handleLoadStandard}
                        className="btn"
                        style={{
                          padding:'0.25rem 0.6rem',
                          fontSize:'0.75rem',
                          fontWeight:'700',
                          margin:0,
                          border:'1px solid var(--primary-300)',
                          color:'var(--primary-700)',
                          backgroundColor:'var(--primary-50)',
                          borderRadius:'5px',
                          cursor:'pointer',
                          transition:'all 0.2s',
                          display:'flex',
                          alignItems:'center',
                          gap:'0.2rem'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.backgroundColor = 'var(--primary-100)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.backgroundColor = 'var(--primary-50)';
                        }}
                      >
                        ⚡ Cargar Estándar
                      </button>
                    </div>

                    {/* Selector de ítem */}
                    <div style={{ padding:'0.5rem 0.75rem',display:'flex',gap:'0.5rem',alignItems:'flex-end',backgroundColor:'#fafafa',borderBottom:'1px solid var(--border-light)' }}>
                      <div style={{ flex:1 }}>
                        <label className="form-label" style={{ fontSize:'0.75rem' }}>Seleccionar del Catálogo</label>
                        {(() => {
                          const selectedItem = listaItems.find(i => i.id === selectedItemId);
                          const displayValue = isProductSearchFocused ? productSearchQuery : (selectedItem?.descripcion || '');
                          return (
                            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                              <input
                                type="text"
                                className="input-field"
                                placeholder="🔍 Seleccione o escriba para buscar artículo..."
                                value={displayValue}
                                onChange={e => {
                                  setProductSearchQuery(e.target.value);
                                  setIsProductDropdownOpen(true);
                                }}
                                onFocus={() => {
                                  setIsProductSearchFocused(true);
                                  setIsProductDropdownOpen(true);
                                }}
                                onBlur={() => {
                                  setTimeout(() => {
                                    setIsProductSearchFocused(false);
                                    setIsProductDropdownOpen(false);
                                  }, 200);
                                }}
                                onClick={() => {
                                  setIsProductDropdownOpen(true);
                                }}
                                style={{ fontSize: '0.85rem' }}
                              />
                              
                              {isProductDropdownOpen && (
                                <div style={{
                                  position: 'absolute',
                                  top: '100%',
                                  left: 0,
                                  right: 0,
                                  maxHeight: '220px',
                                  overflowY: 'auto',
                                  background: 'white',
                                  border: '1px solid var(--border-strong)',
                                  borderRadius: '6px',
                                  zIndex: 1000,
                                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                  marginTop: '4px'
                                }}>
                                  {(() => {
                                    const filterItems = (items) => {
                                      return items.filter(i => {
                                        if (!productSearchQuery || productSearchQuery.trim().length < 2) return true;
                                        const query = productSearchQuery.toLowerCase().trim();
                                        const descMatch = (i.descripcion || '').toLowerCase().includes(query);
                                        const catMatch = (i.categoria || '').toLowerCase().includes(query);
                                        const codeMatch = (i.id || '').toLowerCase().includes(query);
                                        return descMatch || catMatch || codeMatch;
                                      });
                                    };

                                    const filteredMaterials = filterItems(materialesItems);
                                    const filteredMO = filterItems(manoDeObraItems);

                                    if (filteredMaterials.length === 0 && filteredMO.length === 0) {
                                      return (
                                        <div style={{
                                          padding: '0.6rem 0.85rem',
                                          color: 'var(--text-tertiary)',
                                          fontSize: '0.875rem',
                                          textAlign: 'center'
                                        }}>
                                          No se encontraron artículos
                                        </div>
                                      );
                                    }

                                    return (
                                      <>
                                        {filteredMaterials.length > 0 && (
                                          <div>
                                            <div style={{
                                              padding: '0.35rem 0.85rem',
                                              backgroundColor: 'var(--bg-surface-hover)',
                                              fontSize: '0.7rem',
                                              fontWeight: '700',
                                              color: 'var(--text-tertiary)',
                                              textTransform: 'uppercase',
                                              borderBottom: '1px solid var(--border-light)'
                                            }}>
                                              ── Materiales y Equipos ──
                                            </div>
                                            {filteredMaterials.map(i => (
                                              <div
                                                key={i.id}
                                                onMouseDown={() => {
                                                  setSelectedItemId(i.id);
                                                  setProductSearchQuery('');
                                                }}
                                                style={{
                                                  padding: '0.5rem 0.85rem',
                                                  cursor: 'pointer',
                                                  fontSize: '0.875rem',
                                                  borderBottom: '1px solid var(--border-light)',
                                                  backgroundColor: selectedItemId === i.id ? 'var(--primary-50)' : 'transparent',
                                                  color: selectedItemId === i.id ? 'var(--primary-700)' : 'var(--text-primary)',
                                                  fontWeight: selectedItemId === i.id ? '600' : 'normal',
                                                  transition: 'background 0.1s',
                                                  textAlign: 'left'
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-surface-hover)'}
                                                onMouseLeave={e => e.currentTarget.style.backgroundColor = selectedItemId === i.id ? 'var(--primary-50)' : 'transparent'}
                                              >
                                                <div style={{ fontWeight: '600' }}>{i.descripcion}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.15rem' }}>
                                                  {i.costoUSD ? `Costo: U$D ${i.costoUSD}` : ''} {i.categoria ? `| Categoría: ${i.categoria}` : ''}
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                        {filteredMO.length > 0 && (
                                          <div>
                                            <div style={{
                                              padding: '0.35rem 0.85rem',
                                              backgroundColor: 'var(--bg-surface-hover)',
                                              fontSize: '0.7rem',
                                              fontWeight: '700',
                                              color: 'var(--text-tertiary)',
                                              textTransform: 'uppercase',
                                              borderBottom: '1px solid var(--border-light)',
                                              borderTop: '1px solid var(--border-light)'
                                            }}>
                                              ── Mano de Obra ──
                                            </div>
                                            {filteredMO.map(i => (
                                              <div
                                                key={i.id}
                                                onMouseDown={() => {
                                                  setSelectedItemId(i.id);
                                                  setProductSearchQuery('');
                                                }}
                                                style={{
                                                  padding: '0.5rem 0.85rem',
                                                  cursor: 'pointer',
                                                  fontSize: '0.875rem',
                                                  borderBottom: '1px solid var(--border-light)',
                                                  backgroundColor: selectedItemId === i.id ? 'var(--primary-50)' : 'transparent',
                                                  color: selectedItemId === i.id ? 'var(--primary-700)' : 'var(--text-primary)',
                                                  fontWeight: selectedItemId === i.id ? '600' : 'normal',
                                                  transition: 'background 0.1s',
                                                  textAlign: 'left'
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-surface-hover)'}
                                                onMouseLeave={e => e.currentTarget.style.backgroundColor = selectedItemId === i.id ? 'var(--primary-50)' : 'transparent'}
                                              >
                                                <div style={{ fontWeight: '600' }}>{i.descripcion}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.15rem' }}>
                                                  {i.precioVentaUSD ? `Precio Venta: U$D ${i.precioVentaUSD}` : ''}
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>
                          );
                        })()}
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
                    <div style={{ borderBottom:'1px solid var(--border-light)' }}>
                      <table style={{ width:'100%',borderCollapse:'collapse',fontSize:'0.825rem' }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-primary)' }}>
                          <tr style={{ backgroundColor:'var(--bg-surface-hover)',borderTop:'1px solid var(--border-light)',borderBottom:'1px solid var(--border-light)' }}>
                            <th style={{ padding:'0.45rem 0.5rem',textAlign:'center',width:'4%' }}>#</th>
                            <th style={{ padding:'0.45rem 0.5rem',textAlign:'left',width:'38%' }}>Artículo</th>
                            <th style={{ padding:'0.45rem 0.5rem',textAlign:'center',width:'12%' }}>Tipo</th>
                            <th style={{ padding:'0.45rem 0.5rem',textAlign:'center',width:'12%' }}>Cant</th>
                            <th style={{ padding:'0.45rem 0.5rem',textAlign:'right',width:'17%' }}>P.Unit</th>
                            <th style={{ padding:'0.45rem 0.5rem',textAlign:'right',width:'17%' }}>Subtotal</th>
                            <th style={{ padding:'0.45rem 0.5rem',textAlign:'center',width:'5%' }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {builderItems.map((item, index) => (
                            <tr key={item.id} style={{ borderBottom:'1px solid #e2e8f0', backgroundColor: item.tipo === 'mano_de_obra' || item.tipo === 'servicio' ? '#f0f9ff' : 'white' }}>
                              <td style={{ padding:'0.35rem 0.5rem',textAlign:'center',fontWeight:'600',color:'var(--text-tertiary)',fontSize:'0.75rem' }}>
                                {index + 1}
                              </td>
                              <td style={{ padding:'0.35rem 0.5rem',fontWeight:'500',position:'relative' }}>
                                {activeReplaceItemId === item.id ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                      <input
                                        type="text"
                                        className="input-field"
                                        placeholder="🔍 Escribe 2+ letras para buscar..."
                                        value={replaceSearchQuery}
                                        onChange={e => setReplaceSearchQuery(e.target.value)}
                                        autoFocus
                                        style={{ fontSize: '0.75rem', padding: '0.15rem 0.35rem', margin: 0 }}
                                      />
                                      <button
                                        onClick={() => {
                                          setActiveReplaceItemId(null);
                                          setReplaceSearchQuery('');
                                        }}
                                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600' }}
                                      >
                                        Cancelar
                                      </button>
                                    </div>
                                    
                                    {/* Lista flotante de artículos alternativos */}
                                    <div style={{
                                      position: 'absolute',
                                      top: '100%',
                                      left: '0.5rem',
                                      right: '0.5rem',
                                      maxHeight: '150px',
                                      overflowY: 'auto',
                                      background: 'white',
                                      border: '1px solid var(--border-strong)',
                                      borderRadius: '4px',
                                      zIndex: 100,
                                      boxShadow: '0 4px 10px rgba(0,0,0,0.15)'
                                    }}>
                                      {(() => {
                                        const filtered = listaItems.filter(i => {
                                          if (!replaceSearchQuery || replaceSearchQuery.trim().length < 2) return true;
                                          const q = replaceSearchQuery.toLowerCase().trim();
                                          return (i.descripcion || '').toLowerCase().includes(q) || (i.categoria || '').toLowerCase().includes(q);
                                        });

                                        if (filtered.length === 0) {
                                          return (
                                            <div style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                                              No se encontraron artículos
                                            </div>
                                          );
                                        }

                                        return filtered.map(i => (
                                          <div
                                            key={i.id}
                                            onMouseDown={() => {
                                              handleReplaceItem(item.id, i);
                                              setActiveReplaceItemId(null);
                                              setReplaceSearchQuery('');
                                            }}
                                            style={{
                                              padding: '0.4rem 0.6rem',
                                              cursor: 'pointer',
                                              fontSize: '0.75rem',
                                              borderBottom: '1px solid var(--border-light)',
                                              textAlign: 'left',
                                              color: 'var(--text-primary)'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-surface-hover)'}
                                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                          >
                                            <div style={{ fontWeight: '600' }}>{i.descripcion}</div>
                                            <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)' }}>
                                              {i.costoUSD ? `Costo: U$D ${i.costoUSD}` : ''} {i.precioVentaUSD ? `| Precio: U$D ${i.precioVentaUSD}` : ''} {i.categoria ? `[${i.categoria}]` : ''}
                                            </div>
                                          </div>
                                        ));
                                      })()}
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div>{item.descripcion}</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.15rem' }}>
                                      <span style={{ fontSize:'0.65rem',color:'var(--text-tertiary)' }}>
                                        {item.unidad}
                                        {item.costoUSD && ` · U$D ${item.costoUSD}`}
                                      </span>
                                      <button
                                        onClick={() => {
                                          setActiveReplaceItemId(item.id);
                                          setReplaceSearchQuery('');
                                        }}
                                        style={{
                                          background: 'none',
                                          border: 'none',
                                          cursor: 'pointer',
                                          color: 'var(--primary-600)',
                                          fontSize: '0.65rem',
                                          padding: 0,
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '0.1rem',
                                          marginLeft: '0.5rem',
                                          fontWeight: '700'
                                        }}
                                        title="Reemplazar producto"
                                      >
                                        🔄 Reemplazar ▾
                                      </button>
                                    </div>
                                  </>
                                )}
                              </td>
                              <td style={{ padding:'0.35rem 0.5rem',textAlign:'center' }}>
                                <span style={{ fontSize:'0.6rem',padding:'0.1rem 0.35rem',borderRadius:'6px',backgroundColor: (item.tipo === 'mano_de_obra' || item.tipo === 'servicio' ? '#dbeafe' : '#f0fdf4'),color:(item.tipo === 'mano_de_obra' || item.tipo === 'servicio' ? '#1d4ed8':'#166534'),fontWeight:'600' }}>
                                  {(item.tipo === 'mano_de_obra' || item.tipo === 'servicio') ? 'MO' : 'Mat'}
                                </span>
                              </td>
                              <td style={{ padding:'0.35rem 0.5rem' }}>
                                <input type="number" value={item.quantity} onChange={e => updateItem(item.id, 'quantity', e.target.value)} style={{ width:'100%',padding:'0.15rem 0.25rem',fontSize:'0.8rem',border:'1px solid #cbd5e1',borderRadius:'4px',textAlign:'center' }} />
                              </td>
                              <td style={{ padding:'0.35rem 0.5rem' }}>
                                <input type="number" value={item.unitPrice} onChange={e => updateItem(item.id, 'unitPrice', e.target.value)} style={{ width:'100%',padding:'0.15rem 0.25rem',fontSize:'0.8rem',border:'1px solid #cbd5e1',borderRadius:'4px',textAlign:'right' }} />
                              </td>
                              <td style={{ padding:'0.35rem 0.5rem',textAlign:'right',fontWeight:'600' }}>
                                $ {item.subtotal.toLocaleString('es-AR')}
                              </td>
                              <td style={{ padding:'0.35rem 0.5rem',textAlign:'center' }}>
                                <button onClick={() => removeItem(item.id)} style={{ background:'none',border:'none',color:'#ef4444',cursor:'pointer',padding:'0.2rem' }}><X size={14}/></button>
                              </td>
                            </tr>
                          ))}
                          {builderItems.length === 0 && (
                            <tr><td colSpan="7" style={{ padding:'2rem',textAlign:'center',color:'#94a3b8',fontStyle:'italic' }}>Agrega artículos al presupuesto</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

              {detailTab === 'datos' && editLeadFields && (
                <div style={{ display:'flex',flexDirection:'column',gap:'1.25rem' }}>
                  
                  {/* SECCIÓN 1: Identidad del Cliente */}
                  <div style={{ borderBottom:'1px solid var(--border-light)',paddingBottom:'1rem' }}>
                    <h4 style={{ margin:'0 0 0.75rem 0',color:'var(--primary-700)',fontSize:'0.9rem',textTransform:'uppercase',letterSpacing:'0.05em' }}>Identidad del Cliente</h4>
                    
                    <div className="form-group">
                      <label className="form-label">Nombre / Razón Social del Cliente</label>
                      <input
                        type="text"
                        className="input-field"
                        value={editLeadFields.name}
                        onChange={e => {
                          const val = e.target.value;
                          setEditLeadFields(prev => {
                            const next = { ...prev, name: val };
                            if (prev.facturacionIgualCliente) next.facturacionNombre = val;
                            return next;
                          });
                        }}
                      />
                    </div>
                    
                    <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem',marginTop:'0.75rem' }}>
                      <div className="form-group" style={{ marginBottom:0 }}>
                        <label className="form-label">Tipo de Cliente</label>
                        <select
                          className="input-field"
                          value={editLeadFields.tipoCliente}
                          onChange={e => setEditLeadFields({ ...editLeadFields, tipoCliente: e.target.value })}
                        >
                          <option value="consumidor_final">Consumidor Final / Dueño</option>
                          <option value="arquitecto">Arquitecto</option>
                          <option value="constructora">Constructora</option>
                          <option value="desarrolladora">Desarrolladora</option>
                        </select>
                      </div>
                      <div className="form-group" style={{ marginBottom:0 }}>
                        <label className="form-label">CUIT</label>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="30-XXXXXX-X"
                          value={editLeadFields.cuit}
                          onChange={e => {
                            const val = e.target.value;
                            setEditLeadFields(prev => {
                              const next = { ...prev, cuit: val };
                              if (prev.facturacionIgualCliente) next.facturacionCuit = val;
                              return next;
                            });
                          }}
                        />
                      </div>
                    </div>
                    
                    <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem',marginTop:'1rem' }}>
                      <div className="form-group" style={{ marginBottom:0 }}>
                        <label className="form-label">DNI</label>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="DNI de la persona"
                          value={editLeadFields.dni}
                          onChange={e => {
                            const val = e.target.value;
                            setEditLeadFields(prev => {
                              const next = { ...prev, dni: val };
                              if (prev.facturacionIgualCliente) next.facturacionDni = val;
                              return next;
                            });
                          }}
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom:0 }}>
                        <label className="form-label">Email</label>
                        <input
                          type="email"
                          className="input-field"
                          placeholder="correo@ejemplo.com"
                          value={editLeadFields.email}
                          onChange={e => setEditLeadFields({ ...editLeadFields, email: e.target.value })}
                        />
                      </div>
                    </div>
                    
                    <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem',marginTop:'1rem' }}>
                      <div className="form-group" style={{ marginBottom:0 }}>
                        <label className="form-label">Teléfono / Móvil</label>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="Teléfono principal"
                          value={editLeadFields.telefono}
                          onChange={e => setEditLeadFields({ ...editLeadFields, telefono: e.target.value })}
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom:0 }}>
                        <label className="form-label">Dirección Principal/Comercial</label>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="Dirección del cliente"
                          value={editLeadFields.direccionCliente}
                          onChange={e => {
                            const val = e.target.value;
                            setEditLeadFields(prev => {
                              const next = { ...prev, direccionCliente: val };
                              if (prev.facturacionIgualCliente) next.facturacionDireccion = val;
                              return next;
                            });
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* SECCIÓN 2: Persona de Contacto */}
                  {editLeadFields.tipoCliente !== 'consumidor_final' && (
                    <div style={{ borderBottom:'1px solid var(--border-light)',paddingBottom:'1rem' }}>
                      <h4 style={{ margin:'0 0 0.75rem 0',color:'var(--primary-700)',fontSize:'0.9rem',textTransform:'uppercase',letterSpacing:'0.05em' }}>Persona de Contacto</h4>
                      <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem' }}>
                        <div className="form-group" style={{ marginBottom:0 }}>
                          <label className="form-label">Nombre y Apellido</label>
                          <input
                            type="text"
                            className="input-field"
                            placeholder="Nombre del contacto"
                            value={editLeadFields.contactoNombre}
                            onChange={e => setEditLeadFields({ ...editLeadFields, contactoNombre: e.target.value })}
                          />
                        </div>
                        <div className="form-group" style={{ marginBottom:0 }}>
                          <label className="form-label">Teléfono de Contacto</label>
                          <input
                            type="text"
                            className="input-field"
                            placeholder="Móvil del contacto"
                            value={editLeadFields.contactoTelefono}
                            onChange={e => setEditLeadFields({ ...editLeadFields, contactoTelefono: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SECCIÓN 3: Detalles de la Obra y Comercial */}
                  <div style={{ borderBottom:'1px solid var(--border-light)',paddingBottom:'1rem' }}>
                    <h4 style={{ margin:'0 0 0.75rem 0',color:'var(--primary-700)',fontSize:'0.9rem',textTransform:'uppercase',letterSpacing:'0.05em' }}>Ubicación y Sistema</h4>
                    <div className="form-group">
                      <label className="form-label">Dirección de la Obra</label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Calle, nro y localidad de la obra"
                        value={editLeadFields.direccionObra}
                        onChange={e => setEditLeadFields({ ...editLeadFields, direccionObra: e.target.value })}
                      />
                    </div>
                    <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem',marginTop:'0.75rem' }}>
                      <div className="form-group" style={{ marginBottom:0 }}>
                        <label className="form-label">Localidad / Zona de Obra</label>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="Ej: Funes"
                          value={editLeadFields.location}
                          onChange={e => setEditLeadFields({ ...editLeadFields, location: e.target.value })}
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom:0 }}>
                        <label className="form-label">Sistema Solicitado</label>
                        <select
                          className="input-field"
                          value={editLeadFields.paramSistema}
                          onChange={e => setEditLeadFields({ ...editLeadFields, paramSistema: e.target.value })}
                        >
                          <option>Radiadores</option>
                          <option>Piso Radiante</option>
                          <option>SSTT Caldera</option>
                          <option>Híbrido</option>
                        </select>
                      </div>
                    </div>
                    <div className="form-group" style={{ marginTop:'0.75rem' }}>
                      <label className="form-label">Notas u observaciones del cliente</label>
                      <textarea
                        className="input-field"
                        style={{ minHeight:'80px', resize:'vertical' }}
                        value={editLeadFields.notasLead || ''}
                        onChange={e => setEditLeadFields({ ...editLeadFields, notasLead: e.target.value })}
                        placeholder="Ej: Incluir la galería para calefaccionar..."
                      />
                    </div>
                    <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem',marginTop:'1rem' }}>
                      <div className="form-group" style={{ marginBottom:0 }}>
                        <label className="form-label">Canal de Llegada</label>
                        <select
                          className="input-field"
                          value={editLeadFields.source}
                          onChange={e => setEditLeadFields({ ...editLeadFields, source: e.target.value })}
                        >
                          <option>WhatsApp</option>
                          <option>Instagram</option>
                          <option>Referido</option>
                          <option>Arquitecto</option>
                        </select>
                      </div>
                      <div className="form-group" style={{ marginBottom:0 }}>
                        <label className="form-label">Tipo de Obra</label>
                        <select
                          className="input-field"
                          value={editLeadFields.tipoObra}
                          onChange={e => setEditLeadFields({ ...editLeadFields, tipoObra: e.target.value })}
                        >
                          <option value="VIVIENDA UNIFAMILIAR">VIVIENDA UNIFAMILIAR</option>
                          <option value="EDIFICIO">EDIFICIO</option>
                          <option value="LOCAL COMERCIAL">LOCAL COMERCIAL</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem',marginTop:'1rem' }}>
                      <div className="form-group" style={{ marginBottom:0 }}>
                        <label className="form-label">Estado de Obra</label>
                        <select
                          className="input-field"
                          value={editLeadFields.estadoObra}
                          onChange={e => setEditLeadFields({ ...editLeadFields, estadoObra: e.target.value })}
                        >
                          <option value="OBRA NUEVA">OBRA NUEVA</option>
                          <option value="OBRA REFACCION">OBRA REFACCION</option>
                        </select>
                      </div>
                      <div className="form-group" style={{ marginBottom:0 }}>
                        <label className="form-label">Tipo de Proyecto / Servicio</label>
                        <select
                          className="input-field"
                          value={editLeadFields.tipoProyecto}
                          onChange={e => setEditLeadFields({ ...editLeadFields, tipoProyecto: e.target.value })}
                        >
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
                  <div>
                    <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.75rem' }}>
                      <h4 style={{ margin:0,color:'var(--primary-700)',fontSize:'0.9rem',textTransform:'uppercase',letterSpacing:'0.05em' }}>Datos de Facturación</h4>
                      <label style={{ fontSize:'0.8rem',display:'flex',alignItems:'center',gap:'0.35rem',cursor:'pointer',fontWeight:'500',color:'var(--text-secondary)' }}>
                        <input
                          type="checkbox"
                          checked={editLeadFields.facturacionIgualCliente}
                          onChange={e => {
                            const checked = e.target.checked;
                            setEditLeadFields(prev => {
                              const next = { ...prev, facturacionIgualCliente: checked };
                              if (checked) {
                                next.facturacionNombre = prev.name;
                                next.facturacionCuit = prev.cuit;
                                next.facturacionDni = prev.dni;
                                next.facturacionDireccion = prev.direccionCliente;
                              }
                              return next;
                            });
                          }}
                        />
                        Igual que los datos del cliente
                      </label>
                    </div>
                    
                    <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem' }}>
                      <div className="form-group" style={{ marginBottom:0 }}>
                        <label className="form-label">Nombre / Razón Social Facturación</label>
                        <input
                          type="text"
                          className="input-field"
                          disabled={editLeadFields.facturacionIgualCliente}
                          value={editLeadFields.facturacionNombre}
                          onChange={e => setEditLeadFields({ ...editLeadFields, facturacionNombre: e.target.value })}
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom:0 }}>
                        <label className="form-label">Dirección de Facturación</label>
                        <input
                          type="text"
                          className="input-field"
                          disabled={editLeadFields.facturacionIgualCliente}
                          value={editLeadFields.facturacionDireccion}
                          onChange={e => setEditLeadFields({ ...editLeadFields, facturacionDireccion: e.target.value })}
                        />
                      </div>
                    </div>
                    
                    <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem',marginTop:'1rem' }}>
                      <div className="form-group" style={{ marginBottom:0 }}>
                        <label className="form-label">CUIT Facturación</label>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="30-XXXXXX-X"
                          disabled={editLeadFields.facturacionIgualCliente}
                          value={editLeadFields.facturacionCuit}
                          onChange={e => setEditLeadFields({ ...editLeadFields, facturacionCuit: e.target.value })}
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom:0 }}>
                        <label className="form-label">DNI Facturación</label>
                        <input
                          type="text"
                          className="input-field"
                          disabled={editLeadFields.facturacionIgualCliente}
                          value={editLeadFields.facturacionDni}
                          onChange={e => setEditLeadFields({ ...editLeadFields, facturacionDni: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  {/* SECCIÓN 5: Archivos Adjuntos */}
                  {selectedLead.archivos && selectedLead.archivos.length > 0 && (
                    <div style={{ borderBottom:'1px solid var(--border-light)',paddingBottom:'1rem', marginTop: '0.5rem' }}>
                      <h4 style={{ margin:'0 0 0.75rem 0',color:'var(--primary-700)',fontSize:'0.9rem',textTransform:'uppercase',letterSpacing:'0.05em' }}>Archivos Adjuntos ({selectedLead.archivos.length})</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {selectedLead.archivos.map((archivo, index) => (
                          <div key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                              <span style={{ fontSize: '1.2rem' }}>
                                {archivo.tipo === 'image' ? '🖼️' : archivo.tipo === 'video' ? '🎥' : '📄'}
                              </span>
                              <span style={{ fontSize: '0.85rem', fontWeight: '500', color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={archivo.nombre || archivo.name}>
                                {archivo.nombre || archivo.name}
                              </span>
                            </div>
                            <a href={archivo.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', fontWeight: '600', color: '#2563eb', textDecoration: 'none', padding: '0.2rem 0.5rem', backgroundColor: '#eff6ff', borderRadius: '4px', border: '1px solid #bfdbfe' }}>
                              Ver / Descargar
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              )}

              {detailTab === 'historial' && (
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{ fontWeight:'700',color:'var(--primary-600)' }}>
                              $ {(rev.amount || 0).toLocaleString('es-AR')}
                            </span>
                            <button 
                              onClick={() => handleDownloadHistoricalPDF(rev)}
                              title="Descargar PDF de esta versión"
                              disabled={isGeneratingPDF}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-600)', display: 'flex', alignItems: 'center', opacity: isGeneratingPDF ? 0.5 : 1 }}
                            >
                              {isGeneratingPDF ? <Loader size={16} className="spin" /> : <Download size={16} />}
                            </button>
                          </div>
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
              )}
              </div>
            </div>

            {/* ── Fixed block for Cotizador (Notas y Totales) ── */}
            {detailTab === 'cotizador' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', padding: '1rem 1.5rem', borderTop: '2px solid var(--primary-200)', backgroundColor: '#fff', alignItems: 'center' }}>
                {/* Notas */}
                <div>
                  <label className="form-label" style={{ display:'flex',alignItems:'center',gap:'0.35rem', marginBottom: '0.35rem' }}>
                    <MessageSquare size={16}/> Comentarios y Condiciones
                  </label>
                  <textarea
                    className="input-field" rows={2}
                    placeholder="Notas comerciales, tiempo de entrega, validez..."
                    value={detailNotes} onChange={e => setDetailNotes(e.target.value)}
                    style={{ resize:'vertical',fontFamily:'inherit', margin: 0 }}
                  />
                </div>
                
                {/* Totals */}
                <div style={{ backgroundColor: '#f8fafc', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  {canal === 'iva' ? (
                    <div style={{ display: 'flex', width: '100%', justifyContent: 'space-around', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <span style={{ fontWeight: '500', color: 'var(--text-secondary)' }}>Subtotal:</span>
                        <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>$ {calcTotal(builderItems).toLocaleString('es-AR')}</span>
                      </div>
                      <div style={{ width: '1px', height: '14px', backgroundColor: 'var(--border-light)' }}></div>
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <span style={{ fontWeight: '500', color: 'var(--text-secondary)' }}>IVA (21%):</span>
                        <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>$ {Math.round(calcTotal(builderItems) * 0.21).toLocaleString('es-AR')}</span>
                      </div>
                      <div style={{ width: '1px', height: '14px', backgroundColor: 'var(--border-light)' }}></div>
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <span style={{ fontWeight: '800', color: 'var(--primary-800)' }}>TOTAL:</span>
                        <span style={{ fontWeight: '800', color: 'var(--primary-700)' }}>$ {Math.round(calcTotal(builderItems) * 1.21).toLocaleString('es-AR')}</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: '800', color: 'var(--primary-800)' }}>TOTAL PRESUPUESTO (Canal 2 sin factura):</span>
                      <span style={{ fontWeight: '800', color: 'var(--primary-700)', fontSize: '0.95rem' }}>$ {calcTotal(builderItems).toLocaleString('es-AR')}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Panel footer */}
            <div style={{ padding:'1rem 1.5rem',borderTop:'1px solid var(--border-light)',display:'flex',justifyContent:'space-between',alignItems:'center',backgroundColor:'#f8fafc',flexWrap:'wrap',gap:'0.5rem' }}>
              <button onClick={deleteLead} style={{ display:'flex',alignItems:'center',gap:'0.35rem',background:'none',border:'none',color:'#dc2626',cursor:'pointer',fontSize:'0.8rem',fontWeight:'600' }}>
                <Trash2 size={16}/> Eliminar Lead
              </button>
              {detailTab !== 'historial' && (
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <button 
                    onClick={handleSoftDeleteLead}
                    disabled={isSavingDetail}
                    style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '0.4rem 0.9rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', fontWeight: '600' }}
                  >
                    <Trash2 size={15} /> Mover a Papelera
                  </button>
                  <div style={{ display:'flex',gap:'0.5rem',flexWrap:'wrap' }}>
                    {/* Botón Generar PDF */}
                  <button
                    onClick={() => {
                      const autoSelectedUrls = [];
                      builderItems.forEach(bi => {
                        const catalogItem = listaItems.find(li => li.id === bi.listaItemId || li.descripcion === bi.descripcion);
                        if (catalogItem) {
                          const url = catalogItem.folletoUrl || getAutoFolletoUrl(catalogItem);
                          if (url) {
                            autoSelectedUrls.push(url);
                          }
                        }
                      });
                      setSelectedFolletos([...new Set(autoSelectedUrls)]);
                      setIsPDFModalOpen(true);
                    }}
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
                    const checked = selectedFolletos.includes(item.folletoUrl);
                    return (
                      <label key={item.folletoUrl} style={{ display:'flex',alignItems:'center',gap:'0.5rem',padding:'0.5rem 0.75rem',borderRadius:'6px',cursor:'pointer',background:checked?'#eff6ff':'transparent',border:checked?'1px solid #bfdbfe':'1px solid transparent',fontSize:'0.8rem' }}>
                        <input type="checkbox" checked={checked}
                          onChange={e => setSelectedFolletos(prev =>
                            e.target.checked ? [...prev, item.folletoUrl] : prev.filter(url => url !== item.folletoUrl)
                          )}
                        />
                        <span style={{ flex:1 }}>{item.descripcion}</span>
                      </label>
                    );
                  })}
                </div>
              )}
              {folletosDisponibles.length > 0 && (
                <button onClick={() => setSelectedFolletos(folletosDisponibles.map(i => i.folletoUrl))} style={{ marginTop:'0.5rem',background:'none',border:'none',color:'#0369a1',fontSize:'0.75rem',cursor:'pointer',fontWeight:'600' }}>
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
                      .filter(f => selectedFolletos.includes(f.folletoUrl))
                      .map(f => ({ nombre: f.descripcion, url: f.folletoUrl }));
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
