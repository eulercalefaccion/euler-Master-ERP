import React, { useState, useRef } from 'react';
import { Camera, Video, UploadCloud, X, CheckCircle, Loader, MapPin, User } from 'lucide-react';
import './FormularioPublico.css';
import MapPicker from '../../components/MapPicker/MapPicker';

import { db, storage, auth } from '../../services/firebaseConfig';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { signInAnonymously } from 'firebase/auth';
import { getNextSequenceValue, formatPresupuestoNumber } from '../../utils/sequenceGenerator';

const FormularioPublico = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});

  const [formData, setFormData] = useState({
    nombre: '',
    apellido: '',
    tipoContacto: '',
    telefono: '',
    email: '',
    documento: '',
    
    dirCalle: '',
    dirAltura: '',
    dirLocalidad: '',
    dirProvincia: 'Santa Fe',
    ubicacionLat: null,
    ubicacionLng: null,
    
    sistema: '',
    sistemaOtro: '',
    
    profesionalPropietarioNombre: '',
    quienAbona: '',
    profesionalPropietarioTelefono: ''
  });

  const [archivos, setArchivos] = useState([]);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const videoInputRef = useRef(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleLocationSelect = (pos) => {
    setFormData(prev => ({ ...prev, ubicacionLat: pos.lat, ubicacionLng: pos.lng }));
  };

  const getDireccionCompleta = () => {
    const { dirCalle, dirAltura, dirLocalidad, dirProvincia } = formData;
    return [dirCalle, dirAltura, dirLocalidad, dirProvincia].filter(Boolean).join(', ');
  };

  const handleFileChange = (e) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      const validFiles = newFiles.filter(file => file.size <= 200 * 1024 * 1024); // max 200MB
      
      if (validFiles.length < newFiles.length) {
        alert("Algunos archivos superan el límite de 200MB y no fueron agregados.");
      }
      
      setArchivos(prev => [...prev, ...validFiles]);
    }
    // reset input
    e.target.value = '';
  };

  const removeFile = (indexToRemove) => {
    setArchivos(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const isProfesional = ['Arquitecto/Estudio de Arquitectura', 'Constructora', 'Desarrolladora'].includes(formData.tipoContacto);

  const uploadFiles = async () => {
    const uploadedUrls = [];
    
    const uploadPromises = archivos.map((file, i) => {
      return new Promise((resolve, reject) => {
        const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const storageRef = ref(storage, `public_leads_attachments/${fileName}`);
        const uploadTask = uploadBytesResumable(storageRef, file);

        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setUploadProgress(prev => ({ ...prev, [i]: progress }));
          },
          (error) => {
            console.error("Error uploading file:", error);
            reject(error);
          },
          async () => {
            try {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              uploadedUrls.push({
                name: file.name,
                url: downloadURL,
                type: file.type,
                size: file.size
              });
              resolve();
            } catch (e) {
              console.error("Error getting download URL:", e);
              reject(e);
            }
          }
        );
      });
    });

    await Promise.all(uploadPromises);
    return uploadedUrls;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Intentar login anónimo si no hay usuario (para permisos de Storage/Firestore)
      if (!auth.currentUser) {
        await signInAnonymously(auth);
      }

      // 1. Subir archivos
      const urlsAdjuntos = await uploadFiles();

      // 2. Obtener próximo número de presupuesto
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

      // 3. Preparar datos para el CRM
      const leadData = {
        name: `${formData.nombre} ${formData.apellido}`.trim(),
        telefono: formData.telefono,
        email: formData.email,
        cuit: formData.documento,
        tipoCliente: formData.tipoContacto,
        
        direccionObra: getDireccionCompleta(),
        location: getDireccionCompleta(), // Usado por KanbanBoard
        latitudObra: formData.ubicacionLat,
        longitudObra: formData.ubicacionLng,
        
        paramSistema: formData.sistema === 'OTRO (COMPLETE ESCRIBIENDO)' ? formData.sistemaOtro : formData.sistema,
        
        // Datos específicos de profesional
        contactoNombre: isProfesional ? formData.profesionalPropietarioNombre : '',
        contactoTelefono: isProfesional ? formData.profesionalPropietarioTelefono : '',
        quienAbona: isProfesional ? formData.quienAbona : '',
        
        // Datos internos
        status: 'presupuesto', // Columna: Presupuesto Pendiente
        canal: 'iva',
        canalLlegada: 'Formulario Web',
        presupuestoNumber: presupuestoNumber,
        createdAt: serverTimestamp(),
        date: new Date().toLocaleDateString('es-AR'),
        amount: 0,
        quoteItems: [],
        
        archivos: urlsAdjuntos
      };

      // 4. Guardar Lead en presupuestos
      await addDoc(collection(db, 'presupuestos'), leadData);

      // 5. Notificación interna (ERP)
      await addDoc(collection(db, 'notifications'), {
        title: '¡Nuevo Presupuesto Pendiente!',
        message: `Recibiste una solicitud web de ${leadData.name} (${leadData.paramSistema}).`,
        type: 'new_lead',
        read: false,
        createdAt: serverTimestamp()
      });

      setIsSuccess(true);
    } catch (error) {
      console.error("Error al enviar formulario:", error);
      alert("Hubo un error al procesar tu solicitud. Por favor intentá nuevamente más tarde.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="public-form-container">
        <div className="public-form-header">
          <img src="/logo_euler.png" alt="Euler Calefacción" />
        </div>
        <div className="success-screen">
          <CheckCircle size={64} className="success-icon" />
          <h2 className="success-title">¡Gracias por tu solicitud!</h2>
          <p className="success-text">
            Recibimos tus datos correctamente. En breve nos comunicaremos con vos por WhatsApp o email para enviarte el presupuesto.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="public-form-container">
      <div className="public-form-header">
        <img src="/logo_euler.png" alt="Euler Calefacción" />
      </div>

      <div className="public-form-content">
        <form onSubmit={handleSubmit}>
          
          {/* SECCIÓN 1: Tus Datos */}
          <div className="form-section">
            <h3 className="form-section-title"><User size={20} /> Tus datos</h3>
            
            <div className="form-group">
              <label className="form-label">Nombre <span className="required">*</span></label>
              <input type="text" name="nombre" className="form-input" required value={formData.nombre} onChange={handleChange} placeholder="Ej: Juan" />
            </div>
            
            <div className="form-group">
              <label className="form-label">Apellido <span className="required">*</span></label>
              <input type="text" name="apellido" className="form-input" required value={formData.apellido} onChange={handleChange} placeholder="Ej: Pérez" />
            </div>

            <div className="form-group">
              <label className="form-label">Tipo de contacto <span className="required">*</span></label>
              <select name="tipoContacto" className="form-select" required value={formData.tipoContacto} onChange={handleChange}>
                <option value="" disabled>Seleccionar...</option>
                <option value="Consumidor Final / Dueño">Consumidor Final / Dueño</option>
                <option value="Arquitecto/Estudio de Arquitectura">Arquitecto / Estudio de Arquitectura</option>
                <option value="Constructora">Constructora</option>
                <option value="Desarrolladora">Desarrolladora</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Teléfono / WhatsApp <span className="required">*</span></label>
              <input type="tel" name="telefono" className="form-input" required value={formData.telefono} onChange={handleChange} placeholder="Ej: +54 9 341 1234567" />
            </div>

            <div className="form-group">
              <label className="form-label">Email <span className="required">*</span></label>
              <input type="email" name="email" className="form-input" required value={formData.email} onChange={handleChange} placeholder="ejemplo@correo.com" />
            </div>

            <div className="form-group">
              <label className="form-label">DNI o CUIT <span className="required">*</span></label>
              <input type="text" name="documento" className="form-input" required value={formData.documento} onChange={handleChange} placeholder="Ej: 20-33444555-9" />
            </div>
          </div>

          {/* SECCIÓN 2: La Obra */}
          <div className="form-section">
            <h3 className="form-section-title"><MapPin size={20} /> La obra</h3>
            
            <div className="form-group">
              <label className="form-label">Calle <span className="required">*</span></label>
              <input type="text" name="dirCalle" className="form-input" required value={formData.dirCalle} onChange={handleChange} placeholder="Ej: San Martín" />
            </div>

            <div className="form-group">
              <label className="form-label">Altura / Número <span className="required">*</span></label>
              <input type="text" name="dirAltura" className="form-input" required value={formData.dirAltura} onChange={handleChange} placeholder="Ej: 1234" />
            </div>

            <div className="form-group">
              <label className="form-label">Localidad <span className="required">*</span></label>
              <input type="text" name="dirLocalidad" className="form-input" required value={formData.dirLocalidad} onChange={handleChange} placeholder="Ej: Rosario" />
            </div>

            <div className="form-group">
              <label className="form-label">Provincia <span className="required">*</span></label>
              <input type="text" name="dirProvincia" className="form-input" required value={formData.dirProvincia} onChange={handleChange} />
            </div>

            <div className="form-group" style={{ marginTop: '1.5rem' }}>
              <label className="form-label">Ubicación en el mapa</label>
              <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.5rem' }}>Tocá el mapa para ajustar la ubicación exacta de la obra.</p>
              <MapPicker 
                address={`${formData.dirCalle} ${formData.dirAltura}, ${formData.dirLocalidad}`} 
                onLocationSelect={handleLocationSelect} 
              />
            </div>

            <div className="form-group" style={{ marginTop: '1.5rem' }}>
              <label className="form-label">Sistema a cotizar <span className="required">*</span></label>
              <select name="sistema" className="form-select" required value={formData.sistema} onChange={handleChange}>
                <option value="" disabled>Seleccionar...</option>
                <option value="Calefacción por radiadores">Calefacción por radiadores</option>
                <option value="Piso radiante">Piso radiante</option>
                <option value="Agua caliente sanitaria">Agua caliente sanitaria</option>
                <option value="OTRO (COMPLETE ESCRIBIENDO)">OTRO (COMPLETE ESCRIBIENDO)</option>
              </select>
            </div>

            {formData.sistema === 'OTRO (COMPLETE ESCRIBIENDO)' && (
              <div className="form-group">
                <label className="form-label">Especificar otro sistema <span className="required">*</span></label>
                <input type="text" name="sistemaOtro" className="form-input" required value={formData.sistemaOtro} onChange={handleChange} />
              </div>
            )}
          </div>

          {/* SECCIÓN 3: Campos Dinámicos (Profesionales) */}
          {isProfesional && (
            <div className="form-section" style={{ background: '#f8fafc', borderColor: '#cbd5e1' }}>
              <h3 className="form-section-title" style={{ borderBottomColor: '#e2e8f0' }}>Datos adicionales</h3>
              
              <div className="form-group">
                <label className="form-label">Nombre del propietario / Referencia de obra <span className="required">*</span></label>
                <input type="text" name="profesionalPropietarioNombre" className="form-input" required value={formData.profesionalPropietarioNombre} onChange={handleChange} placeholder="Ej: Obra Familia González" />
              </div>

              <div className="form-group">
                <label className="form-label">¿Quién abona? <span className="required">*</span></label>
                <select name="quienAbona" className="form-select" required value={formData.quienAbona} onChange={handleChange}>
                  <option value="" disabled>Seleccionar...</option>
                  <option value="El profesional">El profesional</option>
                  <option value="El propietario">El propietario</option>
                  <option value="A definir">A definir</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Teléfono del propietario <span className="optional">(Opcional)</span></label>
                <input type="tel" name="profesionalPropietarioTelefono" className="form-input" value={formData.profesionalPropietarioTelefono} onChange={handleChange} placeholder="Ej: +54 9 341 1112222" />
              </div>
            </div>
          )}

          {/* SECCIÓN 4: Archivos */}
          <div className="form-section">
            <h3 className="form-section-title"><UploadCloud size={20} /> Adjuntar archivos <span className="optional" style={{ fontSize: '0.85rem', fontWeight: 'normal' }}>(Opcional)</span></h3>
            <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1rem' }}>Podés adjuntar fotos, videos, planos (PDF, DWG), etc. (Máx 200MB por archivo).</p>
            
            <div className="file-upload-zone" onClick={() => fileInputRef.current?.click()}>
              <UploadCloud size={32} color="#94a3b8" />
              <span style={{ fontWeight: '500', color: '#334155' }}>Tocá acá para seleccionar archivos</span>
            </div>

            <div className="file-upload-buttons">
              <button type="button" className="btn-upload" onClick={() => cameraInputRef.current?.click()}>
                <Camera size={16} /> Sacar foto
              </button>
              <button type="button" className="btn-upload" onClick={() => videoInputRef.current?.click()}>
                <Video size={16} /> Grabar video
              </button>
            </div>

            {/* Inputs ocultos */}
            <input type="file" multiple ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} />
            <input type="file" accept="image/*" capture="environment" ref={cameraInputRef} style={{ display: 'none' }} onChange={handleFileChange} />
            <input type="file" accept="video/*" capture="environment" ref={videoInputRef} style={{ display: 'none' }} onChange={handleFileChange} />

            {/* Lista de archivos seleccionados */}
            {archivos.length > 0 && (
              <div className="file-list">
                {archivos.map((file, idx) => (
                  <div key={idx} className="file-item">
                    <div className="file-item-info">
                      {isSubmitting ? (
                        <Loader size={14} className="animate-spin" />
                      ) : (
                        <CheckCircle size={14} color="#10b981" />
                      )}
                      <span className="file-item-name" title={file.name}>{file.name}</span>
                    </div>
                    {!isSubmitting && (
                      <button type="button" className="btn-remove-file" onClick={() => removeFile(idx)}>
                        <X size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="form-submit-container">
            <button type="submit" className="btn-submit" disabled={isSubmitting}>
              {isSubmitting ? <><Loader className="animate-spin" size={20} /> Procesando...</> : 'Enviar Solicitud'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

export default FormularioPublico;
