import React, { useState } from 'react';
import { X, Search } from 'lucide-react';
import { db } from '../../../services/firebaseConfig';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

const CATEGORIAS_INGRESO = ['Cobro Seña', 'Cobro Certificación', 'Saldo Final', 'Otros Ingresos'];
const CATEGORIAS_EGRESO = ['Materiales', 'Ferretería/Insumos', 'Mano de Obra', 'Herramientas', 'Movilidad/Combustible', 'Gastos Administrativos', 'Otros Egresos'];

const NuevaTransaccionModal = ({ onClose, obrasActivas }) => {
  const [formData, setFormData] = useState({
    tipo: 'egreso',
    monto: '',
    categoria: CATEGORIAS_EGRESO[0],
    obraId: '',
    descripcion: '',
    fecha: new Date().toISOString().split('T')[0]
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleTipoChange = (nuevoTipo) => {
    setFormData({
      ...formData,
      tipo: nuevoTipo,
      categoria: nuevoTipo === 'ingreso' ? CATEGORIAS_INGRESO[0] : CATEGORIAS_EGRESO[0]
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.monto || !formData.categoria || !formData.fecha) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'transacciones'), {
        tipo: formData.tipo,
        monto: parseFloat(formData.monto),
        categoria: formData.categoria,
        obraId: formData.obraId || null,
        obraName: formData.obraId ? obrasActivas.find(o => o.id === formData.obraId)?.name || '' : '',
        descripcion: formData.descripcion,
        fecha: formData.fecha,
        createdAt: serverTimestamp()
      });
      onClose();
    } catch (error) {
      console.error("Error al registrar transacción:", error);
      alert("Hubo un error al registrar el movimiento.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentCategories = formData.tipo === 'ingreso' ? CATEGORIAS_INGRESO : CATEGORIAS_EGRESO;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem', backdropFilter: 'blur(4px)' }}>
      <div style={{ backgroundColor: 'white', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '500px', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        
        {/* Header */}
        <div style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600' }}>Nuevo Movimiento</h2>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Ingreso o egreso contable</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '1.5rem', overflowY: 'auto' }}>
          <form id="transaccion-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            
            {/* Tipo Switch */}
            <div style={{ display: 'flex', backgroundColor: 'var(--bg-surface-hover)', padding: '0.25rem', borderRadius: 'var(--radius-md)' }}>
              <button
                type="button"
                onClick={() => handleTipoChange('ingreso')}
                style={{
                  flex: 1, padding: '0.5rem', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: '600',
                  backgroundColor: formData.tipo === 'ingreso' ? 'white' : 'transparent',
                  color: formData.tipo === 'ingreso' ? '#059669' : 'var(--text-secondary)',
                  boxShadow: formData.tipo === 'ingreso' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                + Ingreso
              </button>
              <button
                type="button"
                onClick={() => handleTipoChange('egreso')}
                style={{
                  flex: 1, padding: '0.5rem', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: '600',
                  backgroundColor: formData.tipo === 'egreso' ? 'white' : 'transparent',
                  color: formData.tipo === 'egreso' ? '#dc2626' : 'var(--text-secondary)',
                  boxShadow: formData.tipo === 'egreso' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                - Egreso
              </button>
            </div>

            {/* Fecha y Monto */}
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label>Fecha del movimiento</label>
                <input 
                  type="date" 
                  className="input-field" 
                  value={formData.fecha}
                  onChange={(e) => setFormData({...formData, fecha: e.target.value})}
                  required 
                />
              </div>
              <div className="form-group">
                <label>Monto ($)</label>
                <input 
                  type="number" 
                  className="input-field" 
                  placeholder="0.00" 
                  step="0.01"
                  min="0.1"
                  value={formData.monto}
                  onChange={(e) => setFormData({...formData, monto: e.target.value})}
                  required 
                  style={{ fontWeight: '600', color: formData.tipo === 'ingreso' ? '#059669' : '#dc2626' }}
                />
              </div>
            </div>

            {/* Categoría */}
            <div className="form-group">
              <label>Categoría</label>
              <select className="input-field" value={formData.categoria} onChange={(e) => setFormData({...formData, categoria: e.target.value})}>
                {currentCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Obra (Opcional) */}
            <div className="form-group">
              <label>Obra / Proyecto Asociado (Opcional)</label>
              <div className="input-group">
                <span className="input-icon"><Search size={18} /></span>
                <select 
                  className="input-field" 
                  value={formData.obraId}
                  onChange={(e) => setFormData({...formData, obraId: e.target.value})}
                  style={{ paddingLeft: '2.5rem' }}
                >
                  <option value="">-- Gasto global o no asociado --</option>
                  {obrasActivas.map(obra => (
                    <option key={obra.id} value={obra.id}>{obra.name || obra.clientName}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Descripción */}
            <div className="form-group">
              <label>Descripción / Concepto</label>
              <textarea 
                className="input-field" 
                rows="2" 
                placeholder="Ej. Compra caños 3/4 IPS en ferretería central..."
                value={formData.descripcion}
                onChange={(e) => setFormData({...formData, descripcion: e.target.value})}
              ></textarea>
            </div>

          </form>
        </div>

        {/* Footer */}
        <div style={{ padding: '1.5rem', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end', gap: '1rem', backgroundColor: 'var(--bg-surface-hover)' }}>
          <button type="button" onClick={onClose} className="btn-secondary" disabled={isSubmitting}>
            Cancelar
          </button>
          <button type="submit" form="transaccion-form" className="btn-primary" disabled={isSubmitting} style={{ backgroundColor: formData.tipo === 'ingreso' ? '#059669' : '#dc2626', borderColor: formData.tipo === 'ingreso' ? '#047857' : '#b91c1c' }}>
            {isSubmitting ? 'Guardando...' : `Registrar ${formData.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}`}
          </button>
        </div>

      </div>
    </div>
  );
};

export default NuevaTransaccionModal;
