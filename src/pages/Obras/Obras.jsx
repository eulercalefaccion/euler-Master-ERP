import React, { useState, useEffect, useRef } from 'react';
import {
  HardHat, Search, Plus, MapPin, User, Thermometer, X, Save, Edit2,
  ChevronRight, PlayCircle, Package, Upload, FileText, Users, Calendar,
  ClipboardList, Trash2, Download, Eye
} from 'lucide-react';
import { db, storage } from '../../services/firebaseConfig';
import {
  collection, onSnapshot, query, addDoc, updateDoc, doc,
  serverTimestamp, increment, arrayUnion, arrayRemove
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

/* ─────────────────────────────────────────────────────── */
/*  Constants                                              */
/* ─────────────────────────────────────────────────────── */
const phases  = ['Todas', 'Obra', 'Instalación', 'Finalizada'];
const estados = [
  'Pendiente de Inicio', 'En Proceso', 'Finalizada',
  'Instalación Pendiente', 'Instalación en Proceso', 'Instalación Finalizada'
];
const sistemas = ['Radiadores', 'Piso Radiante', 'SSTT Caldera', 'Híbrido'];

const inp = {
  width: '100%', padding: '0.5rem 0.75rem',
  border: '1px solid var(--border-strong)', borderRadius: '8px',
  fontSize: '0.875rem', outline: 'none', background: 'var(--bg-primary)'
};

const TABS = [
  { id: 'general',    label: '📋 General'   },
  { id: 'materiales', label: '🧱 Materiales' },
  { id: 'personal',   label: '👷 Personal'  },
  { id: 'archivos',   label: '📁 Archivos'  },
  { id: 'bitacora',   label: '📝 Bitácora'  },
];

/* ─────────────────────────────────────────────────────── */
/*  Helpers                                                */
/* ─────────────────────────────────────────────────────── */
const getStatusBadge = (estado) => {
  const colors = {
    'Pendiente de Inicio':      { bg: '#f1f5f9', color: '#475569' },
    'En Proceso':               { bg: '#dbeafe', color: '#1d4ed8' },
    'Finalizada':               { bg: '#d1fae5', color: '#059669' },
    'Instalación Pendiente':    { bg: '#fef3c7', color: '#d97706' },
    'Instalación en Proceso':   { bg: '#dbeafe', color: '#1d4ed8' },
    'Instalación Finalizada':   { bg: '#d1fae5', color: '#059669' },
  };
  const c = colors[estado] || colors['Pendiente de Inicio'];
  return (
    <span className="badge" style={{ backgroundColor: c.bg, color: c.color, fontWeight: '600' }}>
      {estado}
    </span>
  );
};

const fileIcon = (tipo) => {
  if (tipo === 'imagen')    return '🖼️';
  if (tipo === 'video')     return '🎥';
  return '📄';
};

const detectTipo = (mimeType) => {
  if (!mimeType) return 'documento';
  if (mimeType.startsWith('image/')) return 'imagen';
  if (mimeType.startsWith('video/')) return 'video';
  return 'documento';
};

const fmt = (v) =>
  v !== undefined && v !== null
    ? Number(v).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';

/* ─────────────────────────────────────────────────────── */
/*  Component                                              */
/* ─────────────────────────────────────────────────────── */
const Obras = () => {
  /* ── state ── */
  const [obras, setObras]             = useState([]);
  const [searchTerm, setSearchTerm]   = useState('');
  const [filterPhase, setFilterPhase] = useState('Todas');

  const [selectedObra, setSelectedObra] = useState(null);
  const [editForm, setEditForm]         = useState({});
  const [activeTab, setActiveTab]       = useState('general');
  const [isSaving, setIsSaving]         = useState(false);

  // bitácora
  const [newBitacora, setNewBitacora] = useState('');

  // personal
  const [newPersonal, setNewPersonal] = useState({ nombre: '', rol: '' });
  const [isAddingPersonal, setIsAddingPersonal] = useState(false);

  // archivos
  const fileInputRef                          = useRef(null);
  const [uploadProgress, setUploadProgress]   = useState(null);
  const [isUploading, setIsUploading]         = useState(false);

  // iniciar obra dialog
  const [showIniciarDialog, setShowIniciarDialog] = useState(false);
  const [isInitiating, setIsInitiating]           = useState(false);

  // nueva obra modal
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newObra, setNewObra] = useState({
    name: '', location: '', clientName: '', system: 'Radiadores',
    phase: 'Obra', estado: 'Pendiente de Inicio', operarios: '', progress: 0
  });

  /* ── Firestore listener ── */
  useEffect(() => {
    const qObras = query(collection(db, 'obras'));
    const unsub = onSnapshot(qObras, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setObras(data);
      if (selectedObra) {
        const updated = data.find(o => o.id === selectedObra.id);
        if (updated) {
          setSelectedObra(updated);
          setEditForm(f => ({ ...updated, fechaInicio: f.fechaInicio !== undefined ? f.fechaInicio : (updated.fechaInicio || ''), fechaFinEstimada: f.fechaFinEstimada !== undefined ? f.fechaFinEstimada : (updated.fechaFinEstimada || ''), fechaFinReal: f.fechaFinReal !== undefined ? f.fechaFinReal : (updated.fechaFinReal || '') }));
        }
      }
    });
    return () => unsub();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Derived ── */
  const filteredObras = obras.filter(obra => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      (obra.name      && obra.name.toLowerCase().includes(term)) ||
      (obra.clientName && obra.clientName.toLowerCase().includes(term));
    if (filterPhase === 'Todas') return matchesSearch;
    if (filterPhase === 'Finalizada')
      return matchesSearch && (obra.estado === 'Instalación Finalizada' || obra.estado === 'Finalizada');
    return matchesSearch && obra.phase === filterPhase;
  });

  /* ── Open detail ── */
  const openDetail = (obra) => {
    setSelectedObra(obra);
    setEditForm({ ...obra });
    setActiveTab('general');
    setNewBitacora('');
    setNewPersonal({ nombre: '', rol: '' });
    setUploadProgress(null);
  };

  /* ── Save general fields ── */
  const handleSaveEdit = async () => {
    if (!selectedObra) return;
    setIsSaving(true);
    try {
      const updates = {
        name:             editForm.name            || '',
        location:         editForm.location        || '',
        clientName:       editForm.clientName      || '',
        system:           editForm.system          || '',
        phase:            editForm.phase           || 'Obra',
        estado:           editForm.estado          || 'Pendiente de Inicio',
        operarios:        editForm.operarios       || '',
        progress:         parseInt(editForm.progress) || 0,
        fechaInicio:      editForm.fechaInicio     || '',
        fechaFinEstimada: editForm.fechaFinEstimada || '',
        fechaFinReal:     editForm.fechaFinReal    || '',
      };
      await updateDoc(doc(db, 'obras', selectedObra.id), updates);
    } catch (err) {
      alert('Error al guardar: ' + err.message);
    }
    setIsSaving(false);
  };

  /* ── Save bitácora entry ── */
  const handleAddBitacora = async () => {
    if (!newBitacora.trim() || !selectedObra) return;
    setIsSaving(true);
    try {
      const entry = { texto: newBitacora.trim(), fecha: new Date().toISOString() };
      const existing = selectedObra.bitacoraHistory || [];
      await updateDoc(doc(db, 'obras', selectedObra.id), {
        bitacoraPreview: newBitacora.trim(),
        bitacoraHistory: [entry, ...existing],
      });
      setNewBitacora('');
    } catch (err) {
      alert('Error al guardar bitácora: ' + err.message);
    }
    setIsSaving(false);
  };

  /* ── Create new obra ── */
  const handleCreateObra = async () => {
    if (!newObra.name) { alert('Nombre es requerido'); return; }
    setIsSaving(true);
    try {
      await addDoc(collection(db, 'obras'), {
        ...newObra,
        progress: parseInt(newObra.progress) || 0,
        bitacoraPreview: 'Obra creada manualmente.',
        bitacoraHistory: [{ texto: 'Obra creada manualmente.', fecha: new Date().toISOString() }],
        personal: [],
        archivos: [],
        createdAt: serverTimestamp(),
      });
      setIsNewModalOpen(false);
      setNewObra({ name: '', location: '', clientName: '', system: 'Radiadores', phase: 'Obra', estado: 'Pendiente de Inicio', operarios: '', progress: 0 });
    } catch (err) {
      alert('Error: ' + err.message);
    }
    setIsSaving(false);
  };

  /* ── Iniciar Obra ── */
  const handleIniciarObra = async () => {
    if (!selectedObra) return;
    setIsInitiating(true);
    try {
      const items = selectedObra.quoteItems || [];
      const stockUpdates = items
        .filter(item => item.listaItemId)
        .map(item =>
          updateDoc(doc(db, 'lista_precios', item.listaItemId), {
            stock:          increment(-(Number(item.quantity) || 0)),
            stockReservado: increment(-(Number(item.quantity) || 0)),
          })
        );
      await Promise.all(stockUpdates);

      const entry = { texto: 'Obra iniciada — stock descontado', fecha: new Date().toISOString() };
      const existing = selectedObra.bitacoraHistory || [];
      await updateDoc(doc(db, 'obras', selectedObra.id), {
        estado: 'En Proceso',
        bitacoraPreview: entry.texto,
        bitacoraHistory: [entry, ...existing],
      });
      setShowIniciarDialog(false);
    } catch (err) {
      alert('Error al iniciar obra: ' + err.message);
    }
    setIsInitiating(false);
  };

  /* ── Personal: add ── */
  const handleAddPersonal = async () => {
    if (!newPersonal.nombre.trim() || !selectedObra) return;
    setIsAddingPersonal(true);
    try {
      await updateDoc(doc(db, 'obras', selectedObra.id), {
        personal: arrayUnion({ nombre: newPersonal.nombre.trim(), rol: newPersonal.rol.trim() })
      });
      setNewPersonal({ nombre: '', rol: '' });
    } catch (err) {
      alert('Error al agregar personal: ' + err.message);
    }
    setIsAddingPersonal(false);
  };

  /* ── Personal: remove ── */
  const handleRemovePersonal = async (person) => {
    if (!selectedObra) return;
    try {
      await updateDoc(doc(db, 'obras', selectedObra.id), {
        personal: arrayRemove(person)
      });
    } catch (err) {
      alert('Error al eliminar: ' + err.message);
    }
  };

  /* ── Archivos: upload ── */
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file || !selectedObra) return;
    const tipo   = detectTipo(file.type);
    const storageRef = ref(storage, `obras/${selectedObra.id}/${Date.now()}_${file.name}`);
    const task   = uploadBytesResumable(storageRef, file);
    setIsUploading(true);
    setUploadProgress(0);
    task.on('state_changed',
      (snap) => setUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      (err) => { alert('Error al subir: ' + err.message); setIsUploading(false); setUploadProgress(null); },
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          const archivo = {
            nombre:   file.name,
            url,
            tipo,
            subidoEn: new Date().toISOString(),
            storagePath: storageRef.fullPath,
          };
          await updateDoc(doc(db, 'obras', selectedObra.id), {
            archivos: arrayUnion(archivo)
          });
        } catch (err) {
          alert('Error al registrar archivo: ' + err.message);
        }
        setIsUploading(false);
        setUploadProgress(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    );
  };

  /* ── Archivos: delete ── */
  const handleDeleteArchivo = async (archivo) => {
    if (!selectedObra) return;
    if (!window.confirm(`¿Eliminar "${archivo.nombre}"?`)) return;
    try {
      if (archivo.storagePath) {
        const storageRef = ref(storage, archivo.storagePath);
        await deleteObject(storageRef).catch(() => {}); // ignore if already gone
      }
      await updateDoc(doc(db, 'obras', selectedObra.id), {
        archivos: arrayRemove(archivo)
      });
    } catch (err) {
      alert('Error al eliminar archivo: ' + err.message);
    }
  };

  /* ─────────────────────────────────────────────────────── */
  /*  Tab content renderers                                  */
  /* ─────────────────────────────────────────────────────── */

  const renderGeneral = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label">Nombre de la Obra <span style={{ color: 'var(--accent-600)' }}>*</span></label>
        <input type="text" style={inp} value={editForm.name || ''} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Cliente</label>
          <input type="text" style={inp} value={editForm.clientName || ''} onChange={e => setEditForm({ ...editForm, clientName: e.target.value })} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Ubicación</label>
          <input type="text" style={inp} value={editForm.location || ''} onChange={e => setEditForm({ ...editForm, location: e.target.value })} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Sistema</label>
          <select style={inp} value={editForm.system || ''} onChange={e => setEditForm({ ...editForm, system: e.target.value })}>
            {sistemas.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Operarios asignados</label>
          <input type="text" style={inp} placeholder="Nombres separados por coma" value={editForm.operarios || ''} onChange={e => setEditForm({ ...editForm, operarios: e.target.value })} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Fase</label>
          <select style={inp} value={editForm.phase || 'Obra'} onChange={e => setEditForm({ ...editForm, phase: e.target.value })}>
            <option value="Obra">Obra</option>
            <option value="Instalación">Instalación</option>
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Estado</label>
          <select style={inp} value={editForm.estado || ''} onChange={e => setEditForm({ ...editForm, estado: e.target.value })}>
            {estados.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Progreso %</label>
          <input type="number" min="0" max="100" style={inp} value={editForm.progress || 0} onChange={e => setEditForm({ ...editForm, progress: e.target.value })} />
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ background: 'var(--bg-surface)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '6px' }}>
          <span style={{ fontWeight: '600' }}>Progreso: {editForm.progress || 0}%</span>
          <span style={{ color: 'var(--text-secondary)' }}>{editForm.phase}</span>
        </div>
        <div style={{ width: '100%', background: 'var(--border-light)', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ width: `${editForm.progress || 0}%`, height: '100%', background: 'var(--primary-500)', borderRadius: '4px', transition: 'width 0.3s' }} />
        </div>
      </div>

      {/* Dates */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Fecha Inicio</label>
          <input type="date" style={inp} value={editForm.fechaInicio || ''} onChange={e => setEditForm({ ...editForm, fechaInicio: e.target.value })} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Fin Estimado</label>
          <input type="date" style={inp} value={editForm.fechaFinEstimada || ''} onChange={e => setEditForm({ ...editForm, fechaFinEstimada: e.target.value })} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Fin Real</label>
          <input type="date" style={inp} value={editForm.fechaFinReal || ''} onChange={e => setEditForm({ ...editForm, fechaFinReal: e.target.value })} />
        </div>
      </div>

      {/* Save */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" onClick={handleSaveEdit} disabled={isSaving} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <Save size={16} /> {isSaving ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      </div>
    </div>
  );

  const renderMateriales = () => {
    const items  = selectedObra?.quoteItems || [];
    const total  = items.reduce((acc, i) => acc + (Number(i.subtotal) || 0), 0);
    const presId = selectedObra?.presupuestoId || selectedObra?.quoteId;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {presId && (
          <div style={{ padding: '0.75rem 1rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', fontSize: '0.875rem', color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileText size={15} />
            Materiales vinculados al Presupuesto <strong>#{presId}</strong>
          </div>
        )}
        {items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            No hay materiales registrados para esta obra.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface-hover)' }}>
                  {['Descripción', 'Tipo', 'Cant.', 'Unidad', 'P. Unit.', 'Subtotal'].map(h => (
                    <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: '600', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-light)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '0.6rem 0.75rem' }}>{item.descripcion || '—'}</td>
                    <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-secondary)' }}>{item.tipo || '—'}</td>
                    <td style={{ padding: '0.6rem 0.75rem', fontWeight: '500' }}>{item.quantity ?? '—'}</td>
                    <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-secondary)' }}>{item.unidad || '—'}</td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>$ {fmt(item.unitPrice)}</td>
                    <td style={{ padding: '0.6rem 0.75rem', fontWeight: '600' }}>$ {fmt(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--bg-surface-hover)' }}>
                  <td colSpan={5} style={{ padding: '0.75rem', fontWeight: '700', textAlign: 'right' }}>TOTAL</td>
                  <td style={{ padding: '0.75rem', fontWeight: '700', color: 'var(--primary-600)' }}>$ {fmt(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    );
  };

  const renderPersonal = () => {
    const personal = selectedObra?.personal || [];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Operarios text field */}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Operarios (texto libre)</label>
          <input type="text" style={inp} placeholder="Ej: Juan, Pedro, María" value={editForm.operarios || ''} onChange={e => setEditForm({ ...editForm, operarios: e.target.value })} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button className="btn btn-secondary" onClick={handleSaveEdit} disabled={isSaving} style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}>
              <Save size={13} /> Guardar
            </button>
          </div>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border-light)', margin: '0.25rem 0' }} />

        {/* Add person */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: '8px', padding: '1rem', border: '1px solid var(--border-light)' }}>
          <p style={{ margin: '0 0 0.75rem 0', fontWeight: '600', fontSize: '0.875rem' }}>Agregar miembro al equipo</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.75rem', alignItems: 'end' }}>
            <div>
              <label className="form-label">Nombre</label>
              <input type="text" style={inp} value={newPersonal.nombre} onChange={e => setNewPersonal({ ...newPersonal, nombre: e.target.value })} placeholder="Nombre completo" />
            </div>
            <div>
              <label className="form-label">Rol</label>
              <input type="text" style={inp} value={newPersonal.rol} onChange={e => setNewPersonal({ ...newPersonal, rol: e.target.value })} placeholder="Ej: Plomero, Ayudante" />
            </div>
            <button className="btn btn-primary" onClick={handleAddPersonal} disabled={isAddingPersonal || !newPersonal.nombre.trim()} style={{ whiteSpace: 'nowrap' }}>
              <Plus size={15} /> Agregar
            </button>
          </div>
        </div>

        {/* List */}
        {personal.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            No hay personal registrado en esta obra.
          </div>
        ) : (
          <div style={{ border: '1px solid var(--border-light)', borderRadius: '8px', overflow: 'hidden' }}>
            {personal.map((p, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderBottom: i < personal.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                <div>
                  <div style={{ fontWeight: '500', fontSize: '0.875rem' }}>{p.nombre}</div>
                  {p.rol && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{p.rol}</div>}
                </div>
                <button onClick={() => handleRemovePersonal(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '0.25rem' }} title="Eliminar">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderArchivos = () => {
    const archivos = selectedObra?.archivos || [];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Upload area */}
        <div style={{ border: '2px dashed var(--border-strong)', borderRadius: '10px', padding: '1.5rem', textAlign: 'center', background: 'var(--bg-surface)' }}>
          <Upload size={28} style={{ color: 'var(--text-tertiary)', marginBottom: '0.5rem' }} />
          <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Subir imágenes, videos, PDFs o documentos
          </p>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
            onChange={handleFileUpload}
          />
          <button
            className="btn btn-secondary"
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            disabled={isUploading}
          >
            <Upload size={15} /> {isUploading ? 'Subiendo...' : 'Seleccionar archivo'}
          </button>

          {/* Progress bar */}
          {isUploading && uploadProgress !== null && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px', color: 'var(--text-secondary)' }}>
                <span>Subiendo...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div style={{ width: '100%', background: 'var(--border-light)', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${uploadProgress}%`, background: 'var(--primary-500)', height: '100%', borderRadius: '3px', transition: 'width 0.2s' }} />
              </div>
            </div>
          )}
        </div>

        {/* Files list */}
        {archivos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            No hay archivos subidos para esta obra.
          </div>
        ) : (
          <div style={{ border: '1px solid var(--border-light)', borderRadius: '8px', overflow: 'hidden' }}>
            {archivos.map((arc, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderBottom: i < archivos.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                  <span style={{ fontSize: '1.25rem' }}>{fileIcon(arc.tipo)}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: '500', fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px' }}>{arc.nombre}</div>
                    {arc.subidoEn && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                        {new Date(arc.subidoEn).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                  <a href={arc.url} target="_blank" rel="noopener noreferrer" title="Descargar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-600)', padding: '0.25rem', display: 'flex', alignItems: 'center' }}>
                    <Download size={16} />
                  </a>
                  <button onClick={() => handleDeleteArchivo(arc)} title="Eliminar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '0.25rem' }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderBitacora = () => {
    const history = selectedObra?.bitacoraHistory || [];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Nueva anotación</label>
          <textarea
            style={{ ...inp, minHeight: '80px', resize: 'vertical' }}
            value={newBitacora}
            onChange={e => setNewBitacora(e.target.value)}
            placeholder="Escribe una novedad, avance o problema..."
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={handleAddBitacora} disabled={isSaving || !newBitacora.trim()} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Save size={15} /> {isSaving ? 'Guardando...' : 'Agregar entrada'}
          </button>
        </div>

        {/* History */}
        {history.length > 0 ? (
          <div style={{ border: '1px solid var(--border-light)', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ padding: '0.6rem 1rem', background: 'var(--bg-surface-hover)', fontWeight: '600', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Historial
            </div>
            {history.slice(0, 20).map((entry, i) => (
              <div key={i} style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border-light)', fontSize: '0.875rem' }}>
                <div style={{ color: 'var(--text-primary)', marginBottom: '2px' }}>{entry.texto}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                  {new Date(entry.fecha).toLocaleString('es-AR')}
                </div>
              </div>
            ))}
          </div>
        ) : (
          !selectedObra?.bitacoraPreview ? (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              No hay entradas en la bitácora.
            </div>
          ) : (
            <div style={{ padding: '0.75rem 1rem', background: '#f9fafb', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.875rem', fontStyle: 'italic', color: 'var(--text-secondary)' }}>
              "{selectedObra.bitacoraPreview}"
            </div>
          )
        )}
      </div>
    );
  };

  /* ─────────────────────────────────────────────────────── */
  /*  Render                                                 */
  /* ─────────────────────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', overflowX: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', margin: 0 }}>Gestión de Obras</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            {obras.length} obras • {obras.filter(o => o.estado === 'En Proceso' || o.estado === 'Instalación en Proceso').length} en curso
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsNewModalOpen(true)}>
          <Plus size={18} /> Nueva Obra
        </button>
      </div>

      {/* ── Toolbar ── */}
      <div className="card" style={{ padding: '1rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flexGrow: 1, maxWidth: '400px' }}>
          <Search size={18} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input
            type="text"
            placeholder="Buscar por nombre de obra o cliente..."
            className="input-field"
            style={{ paddingLeft: '2.5rem' }}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {phases.map(fase => (
            <button
              key={fase}
              onClick={() => setFilterPhase(fase)}
              className={filterPhase === fase ? 'btn btn-primary' : 'btn btn-secondary'}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.875rem' }}
            >
              {fase}
            </button>
          ))}
        </div>
      </div>

      {/* ── Card Grid ── */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem', paddingBottom: '2rem' }}>
        {filteredObras.map(obra => (
          <div
            key={obra.id}
            className="card hover-card"
            onClick={() => openDetail(obra)}
            style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', cursor: 'pointer' }}
          >
            <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface-hover)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: '600', margin: 0, paddingRight: '1rem' }}>{obra.name}</h3>
                {getStatusBadge(obra.estado)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                <MapPin size={14} /> {obra.location || 'Sin ubicación'}
              </div>
            </div>
            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: '600' }}>Cliente</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.875rem', fontWeight: '500' }}>
                    <User size={14} color="var(--primary-600)" /> {obra.clientName || 'No asignado'}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: '600' }}>Operarios</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.875rem' }}>
                    <HardHat size={14} color="var(--accent-600)" /> {obra.operarios || 'Sin asignar'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', backgroundColor: 'var(--bg-primary)', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                <Thermometer size={16} color="var(--warning)" />
                <span style={{ fontSize: '0.875rem', fontWeight: '500' }}>{obra.system || 'S/D'}</span>
              </div>
            </div>
            <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--border-light)', backgroundColor: '#fafafa' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                <span>Progreso ({obra.phase})</span>
                <span style={{ fontWeight: '600' }}>{obra.progress || 0}%</span>
              </div>
              <div style={{ width: '100%', backgroundColor: 'var(--border-light)', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${obra.progress || 0}%`, backgroundColor: obra.phase === 'Obra' ? 'var(--primary-500)' : 'var(--success)', height: '100%', transition: 'width 0.3s' }} />
              </div>
            </div>
          </div>
        ))}
        {filteredObras.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', gridColumn: '1 / -1' }}>
            No hay obras para mostrar.
          </div>
        )}
      </div>

      {/* ── Detail Panel ── */}
      {selectedObra && (
        <>
          {/* Overlay */}
          <div
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 40 }}
            onClick={() => setSelectedObra(null)}
          />

          {/* Panel */}
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0,
            width: '100%', maxWidth: '750px',
            backgroundColor: 'var(--bg-primary)',
            boxShadow: '-5px 0 25px rgba(0,0,0,0.15)',
            zIndex: 50,
            display: 'flex', flexDirection: 'column',
            animation: 'slideIn 0.25s ease'
          }}>
            {/* Panel Header */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface-hover)', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <HardHat color="var(--primary-600)" size={20} />
                    {selectedObra.name}
                  </h3>
                  <div style={{ marginTop: '0.25rem' }}>{getStatusBadge(selectedObra.estado)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {/* Iniciar Obra button */}
                  {selectedObra.estado === 'Pendiente de Inicio' && (
                    <button
                      className="btn btn-primary"
                      onClick={() => setShowIniciarDialog(true)}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#16a34a', borderColor: '#16a34a', fontSize: '0.875rem' }}
                    >
                      <PlayCircle size={16} /> Iniciar Obra
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedObra(null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '0.25rem' }}
                  >
                    <X size={22} />
                  </button>
                </div>
              </div>
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--bg-primary)', flexShrink: 0, overflowX: 'auto' }}>
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: '0.75rem 1.1rem',
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: activeTab === tab.id ? '600' : '400',
                    color: activeTab === tab.id ? 'var(--primary-600)' : 'var(--text-secondary)',
                    borderBottom: activeTab === tab.id ? '2px solid var(--primary-600)' : '2px solid transparent',
                    marginBottom: '-1px',
                    whiteSpace: 'nowrap',
                    transition: 'color 0.15s',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
              {activeTab === 'general'    && renderGeneral()}
              {activeTab === 'materiales' && renderMateriales()}
              {activeTab === 'personal'   && renderPersonal()}
              {activeTab === 'archivos'   && renderArchivos()}
              {activeTab === 'bitacora'   && renderBitacora()}
            </div>
          </div>
        </>
      )}

      {/* ── Iniciar Obra Confirmation Dialog ── */}
      {showIniciarDialog && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div className="card" style={{ width: '420px', display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <PlayCircle size={24} color="#16a34a" />
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Confirmar inicio de obra</h3>
            </div>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              Se cambiará el estado a <strong>En Proceso</strong> y se descontará el stock de todos los materiales vinculados al presupuesto de esta obra.
            </p>
            {(selectedObra?.quoteItems || []).filter(i => i.listaItemId).length > 0 && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '0.75rem', fontSize: '0.8rem', color: '#166534' }}>
                <Package size={13} style={{ display: 'inline', marginRight: '0.35rem' }} />
                {(selectedObra?.quoteItems || []).filter(i => i.listaItemId).length} ítem(s) con stock serán descontados.
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.25rem' }}>
              <button className="btn btn-secondary" onClick={() => setShowIniciarDialog(false)} disabled={isInitiating}>
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={handleIniciarObra}
                disabled={isInitiating}
                style={{ background: '#16a34a', borderColor: '#16a34a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <PlayCircle size={15} /> {isInitiating ? 'Iniciando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Nueva Obra ── */}
      {isNewModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '500px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Nueva Obra</h3>
              <button onClick={() => setIsNewModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}><X size={20} /></button>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Nombre de la Obra <span style={{ color: 'var(--accent-600)' }}>*</span></label>
              <input required type="text" className="input-field" value={newObra.name} onChange={e => setNewObra({ ...newObra, name: e.target.value })} placeholder="Ej: Dpto Pellegrini 1500" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Cliente / Dueño</label>
                <input type="text" className="input-field" value={newObra.clientName} onChange={e => setNewObra({ ...newObra, clientName: e.target.value })} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Ubicación</label>
                <input type="text" className="input-field" value={newObra.location} onChange={e => setNewObra({ ...newObra, location: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Sistema</label>
                <select className="input-field" value={newObra.system} onChange={e => setNewObra({ ...newObra, system: e.target.value })}>
                  {sistemas.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Operarios</label>
                <input type="text" className="input-field" value={newObra.operarios} onChange={e => setNewObra({ ...newObra, operarios: e.target.value })} placeholder="Nombres separados por coma" />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button className="btn btn-secondary" onClick={() => setIsNewModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleCreateObra} disabled={isSaving}>
                <Save size={16} /> {isSaving ? 'Creando...' : 'Crear Obra'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .hover-card { transition: transform 0.2s, box-shadow 0.2s; }
        .hover-card:hover { transform: translateY(-4px); box-shadow: var(--shadow-md); }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
    </div>
  );
};

export default Obras;
