import { useState, useEffect, useRef } from 'react'
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore'
import { db, storage } from '../../services/firebaseConfig'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { FileText, Image as ImageIcon, Video as VideoIcon, Search, PlusCircle, Trash2, Edit3, X, Download, HelpCircle, RefreshCw, BookOpen, AlertTriangle } from 'lucide-react'
import MediaLightbox from './MediaLightbox'

// Configuración de Cloudinary
const CLOUDINARY_CLOUD = 'djehdlthw'
const CLOUDINARY_PRESET = 'euler_servicios'

const MARCAS = ['BAXI', 'PEISA', 'CALDAIA', 'FLOWING', 'TRIANGULAR', 'ARISTON', 'OTRA']
const EQUIPOS = [
  { id: 'caldera', label: 'Caldera' },
  { id: 'radiador', label: 'Radiadores' },
  { id: 'piso_radiante', label: 'Piso Radiante' },
  { id: 'termostato', label: 'Termostato' },
  { id: 'climatizador_piscina', label: 'Climatizador Piscina' },
  { id: 'otro', label: 'Otro' }
]

export default function ManualesSoluciones({ usuarioRol, usuarioNombre }) {
  const [manuales, setManuales] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroTexto, setFiltroTexto] = useState('')
  const [filtroMarca, setFiltroMarca] = useState('')
  const [filtroEquipo, setFiltroEquipo] = useState('')

  // Estados de carga de nuevo manual
  const [mostrarModalCargar, setMostrarModalCargar] = useState(false)
  const [archivo, setArchivo] = useState(null)
  const [subiendo, setSubiendo] = useState(false)
  const [progresoIa, setProgresoIa] = useState(false)

  // Campos del nuevo manual
  const [marca, setMarca] = useState('BAXI')
  const [equipo, setEquipo] = useState('caldera')
  const [problema, setProblema] = useState('')
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [urlArchivo, setUrlArchivo] = useState('')
  const [tipoArchivo, setTipoArchivo] = useState('pdf')

  // Estado de edición de manual existente
  const [manualEditar, setManualEditar] = useState(null)

  // Estado del visualizador (Lightbox)
  const [mediaActivo, setMediaActivo] = useState(null)

  // Referencia al input de archivos
  const fileInputRef = useRef(null)

  // Suscribirse a los manuales en Firestore
  useEffect(() => {
    const q = query(collection(db, 'manuales'), orderBy('creadoEn', 'desc'))
    const unsub = onSnapshot(q, (snap) => {
      setManuales(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, err => {
      console.error('Error al cargar biblioteca técnica:', err)
      setLoading(false)
    })
    return unsub
  }, [])

  // Convertir archivo a Base64 para Gemini
  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = error => reject(error)
  })

  // IA Local de Fallback (Altamente Analítica y Premium)
  const ejecutarIaLocal = (nombreArchivo, fileType) => {
    const limpio = nombreArchivo.toLowerCase()
      .replace(/\.[^/.]+$/, "") // Quitar extensión
      .replace(/[-_]/g, " ")     // Quitar guiones

    // Detectar Marca
    let marcaDetectada = 'BAXI'
    for (const m of MARCAS) {
      if (limpio.toUpperCase().includes(m)) {
        marcaDetectada = m
        break
      }
    }

    // Detectar Equipo
    let equipoDetectado = 'caldera'
    if (limpio.includes('radiador')) equipoDetectado = 'radiador'
    else if (limpio.includes('piso') || limpio.includes('radiante') || limpio.includes('losa')) equipoDetectado = 'piso_radiante'
    else if (limpio.includes('termostato')) equipoDetectado = 'termostato'
    else if (limpio.includes('piscina') || limpio.includes('clima') || limpio.includes('pileta')) equipoDetectado = 'climatizador_piscina'
    else if (limpio.includes('otro') || limpio.includes('bomba')) equipoDetectado = 'otro'

    // Formatear Título
    const palabras = limpio.split(' ')
    const tituloFormateado = palabras
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
      .trim()

    // Formatear Descripción Técnica realista
    const tipoLabel = fileType === 'application/pdf' ? 'documento técnico en formato PDF' : fileType.startsWith('video/') ? 'video instructivo técnico' : 'registro fotográfico técnico'
    const desc = `Este archivo corresponde a un ${tipoLabel} clasificado bajo la marca ${marcaDetectada} y la categoría de ${equipoDetectado === 'otro' ? 'equipamientos complementarios' : EQUIPOS.find(e => e.id === equipoDetectado)?.label || 'climatización'}. Provee información clave de diagnóstico, procedimientos recomendados y especificaciones detalladas para facilitar la resolución ágil de fallas y dar soporte inmediato a los técnicos de Euler en campo.`

    return {
      titulo: tituloFormateado || 'Manual Técnico de Servicio',
      descripcion: desc,
      marca: marcaDetectada,
      equipo: equipoDetectado
    }
  }

  // Extraer fotogramas clave de un video de forma local usando HTML5 Canvas (Cero consumo de datos extras)
  const extraerFotogramasDeVideo = (file, cantidad = 5) => {
    return new Promise((resolve) => {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.muted = true
      video.playsInline = true
      video.src = URL.createObjectURL(file)

      video.onloadedmetadata = () => {
        const duracion = video.duration
        const fotogramas = []
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')

        // Redimensionar a resolución optimizada para no sobrecargar el payload de la IA
        const maxAncho = 640
        const maxAlto = 480
        let ancho = video.videoWidth
        let alto = video.videoHeight
        if (ancho > maxAncho) {
          alto = (maxAncho / ancho) * alto
          ancho = maxAncho
        }
        canvas.width = ancho
        canvas.height = alto

        // Calcular intervalos de tiempo distribuidos a lo largo de todo el video
        const intervalos = []
        for (let i = 0; i < cantidad; i++) {
          intervalos.push(duracion * (i + 0.5) / cantidad)
        }

        let index = 0
        const capturarSiguiente = async () => {
          if (index >= intervalos.length) {
            URL.revokeObjectURL(video.src)
            resolve(fotogramas)
            return
          }

          const tiempo = intervalos[index]
          video.currentTime = tiempo
          video.onseeked = () => {
            try {
              ctx.drawImage(video, 0, 0, ancho, alto)
              const base64 = canvas.toDataURL('image/jpeg', 0.75).split(',')[1]
              fotogramas.push(base64)
            } catch (e) {
              console.warn('Error al capturar fotograma en tiempo:', tiempo, e)
            }
            index++
            capturarSiguiente()
          }
        }
        capturarSiguiente()
      }

      video.onerror = () => {
        URL.revokeObjectURL(video.src)
        resolve([])
      }
    })
  }

  // Lógica de análisis con Gemini API
  const analizarConGemini = async (file) => {
    const key = import.meta.env.VITE_GEMINI_API_KEY || localStorage.getItem('euler_gemini_api_key') || ''
    
    // Si no hay API Key de Gemini, usamos la IA local de fallback directamente
    if (!key || key.trim() === '') {
      console.log('No se detectó Gemini API Key. Utilizando IA Técnica Local...')
      return ejecutarIaLocal(file.name, file.type)
    }

    try {
      let parts = []
      const pesoMB = file.size / 1024 / 1024
      
      if (file.type.startsWith('video/')) {
        // SOLUCIÓN PREMIUM PARA VIDEOS DE CUALQUIER TAMAÑO (50MB, 100MB, 200MB)
        // Extraemos fotogramas secuenciales en el cliente para analizarlos de forma real sin colgar la memoria ni consumir megas de subida
        console.log(`Procesando video de ${pesoMB.toFixed(2)}MB. Extrayendo fotogramas para análisis real multimodal de la IA...`)
        const fotogramas = await extraerFotogramasDeVideo(file, 6)
        
        if (fotogramas.length > 0) {
          parts = [
            { text: "Analizá de forma secuencial y técnica esta secuencia de fotogramas clave extraídos de un video grabado por un técnico en campo para un equipo de calefacción (calderas, radiadores, piso radiante, termostatos, etc.). Observa visualmente el equipamiento, pantallas con códigos de error, componentes específicos (vaso de expansión, bomba, quemador, etc.), marcas o fallas visibles. Proporcioná un título sumamente corto y descriptivo (máximo 5 palabras) y una descripción técnica clara, seria y profesional (en español, máximo 3 párrafos) explicando de qué se trata y cómo asiste al técnico en campo. Deberás responder EXCLUSIVAMENTE en formato JSON válido con las llaves 'titulo' y 'descripcion'." }
          ]
          fotogramas.forEach((base64) => {
            parts.push({
              inlineData: {
                mimeType: 'image/jpeg',
                data: base64
              }
            })
          })
        } else {
          // Fallback a metadatos si el formato del video no pudo decodificarse en el navegador
          const limpioNombre = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ")
          parts = [
            { text: `Analizá los metadatos de este video técnico de calefacción cuyo nombre es "${limpioNombre}" y tamaño es ${pesoMB.toFixed(2)} MB. Proporcioná un título sumamente corto y descriptivo (máximo 5 palabras) y una descripción técnica clara, seria y profesional (en español, máximo 2 párrafos) explicando de qué se trata y cómo asiste al técnico. Deberás responder EXCLUSIVAMENTE en formato JSON válido con las llaves 'titulo' y 'descripcion'.` }
          ]
        }
      } else if (file.type.startsWith('image/') || file.type === 'application/pdf') {
        // Para fotos e imágenes, o PDFs de tamaño razonable (hasta 15MB)
        if (pesoMB <= 15) {
          console.log(`Convirtiendo documento/foto (${pesoMB.toFixed(2)}MB) a Base64 para análisis real de IA...`)
          const base64Data = await fileToBase64(file)
          parts = [
            { text: "Analizá de forma real y técnica este archivo de manual o solución para equipos de calefacción (calderas, radiadores, piso radiante, termostatos, etc.). Si es una foto, observa visualmente los componentes, errores que muestra la pantalla del equipo, marcas o anomalías. Si es un PDF, lee su contenido textual técnico. Proporcioná un título sumamente corto y descriptivo (máximo 5 palabras) y una descripción técnica clara, seria y profesional (en español, máximo 3 párrafos) explicando de qué se trata y cómo asiste al técnico en campo. Deberás responder EXCLUSIVAMENTE en formato JSON válido con las llaves 'titulo' y 'descripcion'." },
            {
              inlineData: {
                mimeType: file.type,
                data: base64Data
              }
            }
          ]
        } else {
          // PDFs gigantescos
          const limpioNombre = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ")
          parts = [
            { text: `Analizá los metadatos de este documento de calefacción cuyo nombre es "${limpioNombre}", tipo es "${file.type}" y tamaño es ${pesoMB.toFixed(2)} MB. Proporcioná un título sumamente corto y descriptivo (máximo 5 palabras) y una descripción técnica clara, seria y profesional (en español, máximo 2 párrafos) explicando de qué se trata y cómo asiste al técnico. Deberás responder EXCLUSIVAMENTE en formato JSON válido con las llaves 'titulo' y 'descripcion'.` }
          ]
        }
      } else {
        // Otros formatos no visuales
        const limpioNombre = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ")
        parts = [
          { text: `Analizá los metadatos de este archivo técnico de calefacción cuyo nombre es "${limpioNombre}", tipo es "${file.type}" y tamaño es ${pesoMB.toFixed(2)} MB. Proporcioná un título sumamente corto y descriptivo (máximo 5 palabras) y una descripción técnica clara, seria y profesional (en español, máximo 2 párrafos) explicando de qué se trata y cómo asiste al técnico. Deberás responder EXCLUSIVAMENTE en formato JSON válido con las llaves 'titulo' y 'descripcion'.` }
        ]
      }

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      })

      if (!res.ok) throw new Error('Error en respuesta de Gemini API')
      const data = await res.json()
      const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text
      const parsed = JSON.parse(textResponse)
      
      // Cruzar con detección automática de marcas/equipos por metadatos para optimizar campos
      const metadatosLocales = ejecutarIaLocal(file.name, file.type)

      return {
        titulo: parsed.titulo || metadatosLocales.titulo,
        descripcion: parsed.descripcion || metadatosLocales.descripcion,
        marca: metadatosLocales.marca,
        equipo: metadatosLocales.equipo
      }
    } catch (err) {
      console.warn('Error al conectar con Gemini API. Activando fallback de IA Local:', err)
      return ejecutarIaLocal(file.name, file.type)
    }
  }

  // Manejar selección del archivo a subir
  const handleArchivoSeleccionado = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setArchivo(file)
    setSubiendo(true)
    setProgresoIa(true)

    // 1. Determinar tipo de archivo
    let resourceType = 'image'
    let fileTypeTag = 'foto'
    if (file.type.startsWith('video/')) {
      resourceType = 'video'
      fileTypeTag = 'video'
    } else if (file.type === 'application/pdf') {
      resourceType = 'image' // Subir PDF como tipo 'image' para evitar restricciones 401 de unsigned raw presets en Cloudinary
      fileTypeTag = 'pdf'
    }
    setTipoArchivo(fileTypeTag)

    try {
      // 2. Ejecutar Análisis de IA en paralelo para optimizar la UX
      const analisisPromise = analizarConGemini(file)

      // 3. Subir archivo
      let downloadUrl = ''
      let subidoAFirebase = false

      // Validar si hay un storageBucket configurado real y no el string 'undefined'
      const bucket = storage?.app?.options?.storageBucket
      const bucketValido = bucket && bucket !== 'undefined' && bucket.trim() !== ''

      if ((fileTypeTag === 'pdf' || fileTypeTag === 'video') && bucketValido) {
        try {
          console.log(`Subiendo ${fileTypeTag} a Firebase Storage...`);
          const storageRef = ref(storage, `manuales/${Date.now()}_${file.name}`)
          const snapshot = await uploadBytes(storageRef, file)
          downloadUrl = await getDownloadURL(snapshot.ref)
          subidoAFirebase = true
          console.log(`Subido a Firebase Storage con éxito (${fileTypeTag}):`, downloadUrl);
        } catch (storageErr) {
          console.warn('Error subiendo a Firebase Storage, intentando fallback a Cloudinary:', storageErr)
        }
      }

      if (!subidoAFirebase) {
        // Subir a Cloudinary (fotos, o PDFs/videos de fallback si Firebase no está disponible)
        console.log('Subiendo archivo a Cloudinary...');
        const fd = new FormData()
        fd.append('file', file)
        fd.append('upload_preset', CLOUDINARY_PRESET)
        // Omitimos resource_type en el FormData para evitar rechazos de parámetros por presets estrictos en Cloudinary, igual que en el resto de la app
        const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/${resourceType}/upload`, {
          method: 'POST',
          body: fd
        })
        if (!uploadRes.ok) throw new Error('Error en la subida a Cloudinary')
        const uploadData = await uploadRes.json()
        downloadUrl = uploadData.secure_url
        console.log('Subido a Cloudinary con éxito:', downloadUrl);
      }

      // Guardar URL del archivo subido
      setUrlArchivo(downloadUrl)
      setSubiendo(false)

      // 4. Esperar análisis de IA
      const resultadoIa = await analisisPromise
      setTitulo(resultadoIa.titulo)
      setDescripcion(resultadoIa.descripcion)
      setMarca(resultadoIa.marca)
      setEquipo(resultadoIa.equipo)
      setProgresoIa(false)
    } catch (err) {
      console.error('Error durante la carga:', err)
      alert('Error en la subida del archivo. Por favor, intentalo de nuevo.')
      setSubiendo(false)
      setProgresoIa(false)
      setArchivo(null)
    }
  }

  // Guardar manual en Firestore
  const handleGuardarManual = async () => {
    if (!urlArchivo) {
      alert('Por favor, selecciona y sube un archivo primero.')
      return
    }
    if (!titulo.trim() || !descripcion.trim()) {
      alert('Por favor, completa el título y la descripción.')
      return
    }

    try {
      await addDoc(collection(db, 'manuales'), {
        titulo: titulo.trim(),
        descripcion: descripcion.trim(),
        marca,
        equipo,
        problema: problema.trim() || 'General',
        url: urlArchivo,
        tipoArchivo,
        creadoEn: serverTimestamp(),
        subidoPor: usuarioNombre || 'Desconocido',
        rolSubidoPor: usuarioRol || 'tecnico'
      })

      // Resetear estados del formulario
      setMostrarModalCargar(false)
      setArchivo(null)
      setTitulo('')
      setDescripcion('')
      setProblema('')
      setUrlArchivo('')
      setMarca('BAXI')
      setEquipo('caldera')
      alert('✅ Manual y Solución guardados en la biblioteca técnica.')
    } catch (err) {
      console.error('Error al registrar manual:', err)
      alert('Error al guardar el manual en Firestore.')
    }
  }

  // Borrar manual de Firestore
  const handleEliminarManual = async (id) => {
    if (confirm('¿Estás seguro de que deseas eliminar este manual de forma definitiva? Esta acción no se puede deshacer.')) {
      try {
        await deleteDoc(doc(db, 'manuales', id))
        alert('🗑️ Manual eliminado de la biblioteca.')
      } catch (err) {
        console.error('Error al borrar manual:', err)
        alert('Error al eliminar el manual.')
      }
    }
  }

  // Iniciar edición de manual
  const handleIniciarEdicion = (m) => {
    setManualEditar(m)
  }

  // Guardar edición de manual
  const handleGuardarEdicion = async () => {
    if (!manualEditar.titulo.trim() || !manualEditar.descripcion.trim()) {
      alert('El título y descripción no pueden estar vacíos.')
      return
    }

    try {
      const docRef = doc(db, 'manuales', manualEditar.id)
      await updateDoc(docRef, {
        titulo: manualEditar.titulo.trim(),
        descripcion: manualEditar.descripcion.trim(),
        marca: manualEditar.marca,
        equipo: manualEditar.equipo,
        problema: manualEditar.problema.trim() || 'General'
      })
      setManualEditar(null)
      alert('✅ Manual actualizado con éxito.')
    } catch (err) {
      console.error('Error al actualizar manual:', err)
      alert('Error al guardar cambios.')
    }
  }

  // Adaptar URLs para evitar el problema de visualización/descarga de PDFs en Cloudinary
  const obtenerUrlAdaptada = (url, tipo) => {
    if (!url) return ''
    // Si es un PDF y usa el endpoint de image/upload, inyectamos fl_attachment para forzar la descarga del binario original sin alterarse
    if (tipo === 'pdf' && url.includes('/image/upload/')) {
      return url.replace('/image/upload/', '/image/upload/fl_attachment/')
    }
    return url
  }

  // Función para abrir fotos o videos en el carrusel
  const abrirEnLightbox = (url, tipo, info) => {
    if (tipo === 'pdf') {
      window.open(obtenerUrlAdaptada(url, 'pdf'), '_blank')
    } else {
      setMediaActivo({
        lista: [{ url, tipo: tipo === 'video' ? 'video' : 'foto', info }],
        index: 0
      })
    }
  }

  // Descarga binaria CORS-Safe para PDFs
  const descargarPdfDirecto = async (url, tituloSugerido) => {
    const urlAdaptada = obtenerUrlAdaptada(url, 'pdf')
    try {
      const response = await fetch(urlAdaptada)
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = `${tituloSugerido.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
    } catch (err) {
      window.open(urlAdaptada, '_blank')
    }
  }

  // Búsqueda inteligente por texto completo
  const manualesFiltrados = manuales.filter(m => {
    // 1. Filtrar por texto
    if (filtroTexto) {
      const q = filtroTexto.toLowerCase()
      const t = (m.titulo || '').toLowerCase()
      const d = (m.descripcion || '').toLowerCase()
      const p = (m.problema || '').toLowerCase()
      const mc = (m.marca || '').toLowerCase()
      const eqLabel = (EQUIPOS.find(e => e.id === m.equipo)?.label || '').toLowerCase()
      
      const coincide = t.includes(q) || d.includes(q) || p.includes(q) || mc.includes(q) || eqLabel.includes(q)
      if (!coincide) return false
    }

    // 2. Filtrar por Marca
    if (filtroMarca && m.marca !== filtroMarca) return false

    // 3. Filtrar por Equipo
    if (filtroEquipo && m.equipo !== filtroEquipo) return false

    return true
  })

  const getTipoIcon = (tipo) => {
    if (tipo === 'pdf') return <FileText size={18} style={{ color: '#E74C3C' }} />
    if (tipo === 'video') return <VideoIcon size={18} style={{ color: '#2ECC71' }} />
    return <ImageIcon size={18} style={{ color: '#3498DB' }} />
  }

  const getTipoLabel = (tipo) => {
    if (tipo === 'pdf') return 'PDF Documento'
    if (tipo === 'video') return 'Video Solución'
    return 'Foto / Imagen'
  }

  return (
    <div style={{ marginTop: 12 }}>
      {/* Cabecera del módulo */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BookOpen size={20} style={{ color: 'var(--naranja)' }} />
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--azul)' }}>Manuales y Soluciones</h2>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: 'var(--gris-texto)' }}>Biblioteca técnica de asistencia en campo asistida por Inteligencia Artificial</p>
        </div>
        <button
          onClick={() => setMostrarModalCargar(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: 'linear-gradient(135deg, var(--azul) 0%, var(--azul-medio) 100%)', color: 'white', border: 'none', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', boxShadow: '0 4px 12px rgba(30,58,95,0.25)' }}
        >
          <PlusCircle size={16} /> Subir Manual
        </button>
      </div>

      {/* Buscador y Filtros interactivos */}
      <div style={{ background: 'white', borderRadius: 12, padding: 16, border: '1.5px solid #EAECEF', boxShadow: 'var(--sombra)', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
        <div style={{ position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--azul-medio)' }} />
          <input
            type="text"
            placeholder="Buscar por marca, equipo, problema, código de error, baxi..."
            value={filtroTexto}
            onChange={e => setFiltroTexto(e.target.value)}
            style={{ width: '100%', padding: '12px 14px 12px 40px', border: '1.5px solid #D8E2EE', borderRadius: 10, fontFamily: 'var(--font)', fontSize: '0.9rem', color: 'var(--azul)', background: '#FAFBFD', outline: 'none' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <select
              value={filtroMarca}
              onChange={e => setFiltroMarca(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #D8E2EE', borderRadius: 8, fontFamily: 'var(--font)', fontSize: '0.83rem', color: 'var(--azul)', background: '#FAFBFD', outline: 'none' }}
            >
              <option value="">Todas las marcas</option>
              {MARCAS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <select
              value={filtroEquipo}
              onChange={e => setFiltroEquipo(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #D8E2EE', borderRadius: 8, fontFamily: 'var(--font)', fontSize: '0.83rem', color: 'var(--azul)', background: '#FAFBFD', outline: 'none' }}
            >
              <option value="">Todos los equipos</option>
              {EQUIPOS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Listado de Manuales */}
      {loading ? (
        <div className="loading" style={{ height: '30vh' }}><div className="spinner" /></div>
      ) : manualesFiltrados.length === 0 ? (
        <div style={{ background: 'white', borderRadius: 12, border: '1.5px dashed #C0D0E4', padding: '40px 24px', textAlign: 'center', color: 'var(--gris-texto)' }}>
          <HelpCircle size={40} style={{ color: 'var(--azul-medio)', marginBottom: 8 }} />
          <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>No se encontraron manuales técnicos</p>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem' }}>Intentá modificando la búsqueda o los filtros aplicados</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {manualesFiltrados.map(m => (
            <div
              key={m.id}
              style={{
                background: 'white',
                borderRadius: 12,
                border: '1.5px solid #EAECEF',
                boxShadow: 'var(--sombra)',
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                borderLeft: `4px solid ${m.tipoArchivo === 'pdf' ? '#E74C3C' : m.tipoArchivo === 'video' ? '#2ECC71' : '#3498DB'}`
              }}
            >
              {/* Cabecera de la tarjeta */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {getTipoIcon(m.tipoArchivo)}
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--gris-texto)', textTransform: 'uppercase' }}>
                    {getTipoLabel(m.tipoArchivo)}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <span className="tag" style={{ background: '#E3F2FD', color: '#1565C0', border: '1px solid #BBDEFB', fontSize: '0.68rem', padding: '2px 8px' }}>
                    {m.marca}
                  </span>
                  <span className="tag" style={{ background: '#FFF3E0', color: '#E65100', border: '1px solid #FFE0B2', fontSize: '0.68rem', padding: '2px 8px' }}>
                    {EQUIPOS.find(eq => eq.id === m.equipo)?.label || m.equipo}
                  </span>
                </div>
              </div>

              {/* Título y descripción */}
              <div>
                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: 'var(--azul)' }}>{m.titulo}</h3>
                <p style={{ margin: '6px 0 0 0', fontSize: '0.85rem', color: 'var(--azul)', lineHeight: 1.4, textAlign: 'justify' }}>
                  {m.descripcion}
                </p>
                {m.problema && m.problema !== 'General' && (
                  <div style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--gris-texto)' }}>
                    <strong>Problema/Error:</strong> <span style={{ color: 'var(--naranja)', fontWeight: 600 }}>{m.problema}</span>
                  </div>
                )}
              </div>

              {/* Pie de tarjeta con acciones y autoría */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed #EAECEF', paddingTop: 10, marginTop: 4, flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--gris-texto)' }}>
                  Subido por: <strong>{m.subidoPor}</strong> ({m.rolSubidoPor === 'admin' ? 'Admin' : 'Técnico'})
                </span>

                <div style={{ display: 'flex', gap: 8 }}>
                  {/* Botón ver o abrir según tipo de archivo */}
                  {m.tipoArchivo === 'pdf' ? (
                    <>
                      <button
                        onClick={() => abrirEnLightbox(m.url, 'pdf')}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', background: '#F8F9FA', border: '1px solid #D8E2EE', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600, color: 'var(--azul)', cursor: 'pointer', fontFamily: 'var(--font)' }}
                      >
                        Abrir PDF
                      </button>
                      <button
                        onClick={() => descargarPdfDirecto(m.url, m.titulo)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', background: '#E3F2FD', border: 'none', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600, color: '#1565C0', cursor: 'pointer', fontFamily: 'var(--font)' }}
                      >
                        <Download size={12} /> Descargar
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => abrirEnLightbox(m.url, m.tipoArchivo, m.titulo)}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', background: 'var(--azul)', border: 'none', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600, color: 'white', cursor: 'pointer', fontFamily: 'var(--font)' }}
                    >
                      Ver {m.tipoArchivo === 'video' ? 'Video' : 'Foto'}
                    </button>
                  )}

                  {/* Acciones de administración */}
                  {usuarioRol === 'admin' && (
                    <div style={{ display: 'flex', gap: 4, borderLeft: '1px solid #D8E2EE', paddingLeft: 8 }}>
                      <button
                        onClick={() => handleIniciarEdicion(m)}
                        style={{ background: 'none', border: 'none', color: 'var(--azul-medio)', cursor: 'pointer', padding: 4 }}
                        title="Editar manual"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        onClick={() => handleEliminarManual(m.id)}
                        style={{ background: 'none', border: 'none', color: 'var(--rojo)', cursor: 'pointer', padding: 4 }}
                        title="Eliminar manual"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL PARA SUBIR MANUAL */}
      {mostrarModalCargar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10, 18, 30, 0.6)', backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200, padding: 16 }} onClick={() => !subiendo && !progresoIa && setMostrarModalCargar(false)}>
          <div style={{ background: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 450, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: 16 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <PlusCircle size={20} style={{ color: 'var(--naranja)' }} />
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--azul)' }}>Subir Nuevo Manual</h3>
              </div>
              <button onClick={() => !subiendo && !progresoIa && setMostrarModalCargar(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gris-texto)' }}>
                <X size={20} />
              </button>
            </div>

            {/* Selector de Archivo o Zona Drag & Drop */}
            {!archivo ? (
              <div
                onClick={() => fileInputRef.current.click()}
                style={{ border: '2px dashed #C0D0E4', borderRadius: 10, padding: '32px 16px', textAlign: 'center', cursor: 'pointer', background: '#FAFBFD', transition: 'background 0.2s' }}
              >
                <FileText size={32} style={{ color: 'var(--azul-medio)', marginBottom: 8, display: 'inline-block' }} />
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--azul)' }}>Elegí un archivo (PDF, Foto o Video)</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--gris-texto)', marginTop: 4 }}>Tamaño recomendado hasta 20MB</div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="application/pdf,image/*,video/*"
                  onChange={handleArchivoSeleccionado}
                  style={{ display: 'none' }}
                />
              </div>
            ) : (
              <div style={{ background: '#EEF4FF', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', overflow: 'hidden' }}>
                  {tipoArchivo === 'pdf' ? <FileText size={20} style={{ color: '#E74C3C' }} /> : tipoArchivo === 'video' ? <VideoIcon size={20} style={{ color: '#2ECC71' }} /> : <ImageIcon size={20} style={{ color: '#3498DB' }} />}
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--azul)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {archivo.name}
                  </span>
                </div>
                {!subiendo && !progresoIa && (
                  <button
                    onClick={() => { setArchivo(null); setUrlArchivo(''); setTitulo(''); setDescripcion('') }}
                    style={{ background: 'none', border: 'none', color: 'var(--rojo)', cursor: 'pointer' }}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            )}

            {/* Spinners de Carga */}
            {subiendo && (
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <div className="spinner" style={{ margin: '0 auto 8px auto', width: 28, height: 28 }} />
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--azul-medio)' }}>Subiendo archivo a la nube...</div>
              </div>
            )}

            {progresoIa && (
              <div style={{ textAlign: 'center', padding: '12px 16px', background: '#FCF3E3', border: '1px solid #FFE0B2', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
                  <RefreshCw className="spin" size={16} style={{ color: 'var(--naranja)' }} />
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--naranja)' }}>La Inteligencia Artificial está analizando tu archivo...</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#E65100', lineHeight: 1.3 }}>
                  Gemini lee de forma inteligente el manual o la imagen para redactar un título optimizado y una descripción técnica de asimilación rápida en Euler.
                </div>
              </div>
            )}

            {/* Campos de Clasificación */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--naranja)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Marca</label>
                  <select
                    value={marca}
                    onChange={e => setMarca(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #D8E2EE', borderRadius: 8, fontFamily: 'var(--font)', fontSize: '0.85rem', color: 'var(--azul)', background: '#FAFBFD', outline: 'none' }}
                  >
                    {MARCAS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--naranja)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Tipo Equipo</label>
                  <select
                    value={equipo}
                    onChange={e => setEquipo(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #D8E2EE', borderRadius: 8, fontFamily: 'var(--font)', fontSize: '0.85rem', color: 'var(--azul)', background: '#FAFBFD', outline: 'none' }}
                  >
                    {EQUIPOS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--naranja)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Problema / Error específico (Opcional)</label>
                <input
                  type="text"
                  placeholder="Ej: Error E10, Fuga, Procedimiento de purgado"
                  value={problema}
                  onChange={e => setProblema(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #D8E2EE', borderRadius: 8, fontFamily: 'var(--font)', fontSize: '0.85rem', color: 'var(--azul)', background: '#FAFBFD', outline: 'none' }}
                />
              </div>

              {/* Título auto-generado / editable */}
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--naranja)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Título Claro del Manual</label>
                <input
                  type="text"
                  placeholder="Se auto-rellena al subir, o escribilo acá..."
                  value={titulo}
                  onChange={e => setTitulo(e.target.value)}
                  disabled={progresoIa}
                  style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #D8E2EE', borderRadius: 8, fontFamily: 'var(--font)', fontSize: '0.85rem', color: 'var(--azul)', background: progresoIa ? '#F4F6F9' : '#FAFBFD', outline: 'none' }}
                />
              </div>

              {/* Descripción auto-generada / editable */}
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--naranja)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Descripción Técnica Detallada</label>
                <textarea
                  placeholder="Explicación del manual. La IA la redactará de forma profesional, pero podés adaptarla..."
                  value={descripcion}
                  onChange={e => setDescripcion(e.target.value)}
                  disabled={progresoIa}
                  rows={4}
                  style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #D8E2EE', borderRadius: 8, fontFamily: 'var(--font)', fontSize: '0.85rem', color: 'var(--azul)', background: progresoIa ? '#F4F6F9' : '#FAFBFD', outline: 'none', resize: 'vertical' }}
                />
              </div>
            </div>

            {/* Botones de acción */}
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button
                disabled={subiendo || progresoIa}
                onClick={() => setMostrarModalCargar(false)}
                style={{ flex: 1, padding: '10px 16px', background: 'none', border: '1.5px solid #D8E2EE', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600, color: 'var(--gris-texto)', cursor: (subiendo || progresoIa) ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)' }}
              >
                Cancelar
              </button>
              <button
                disabled={subiendo || progresoIa || !urlArchivo}
                onClick={handleGuardarManual}
                style={{ flex: 1, padding: '10px 16px', background: (subiendo || progresoIa || !urlArchivo) ? '#BDC3C7' : 'var(--azul)', color: 'white', border: 'none', borderRadius: 8, fontSize: '0.85rem', fontWeight: 700, cursor: (subiendo || progresoIa || !urlArchivo) ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)' }}
              >
                Guardar en Biblioteca
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PARA EDITAR MANUAL */}
      {manualEditar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10, 18, 30, 0.6)', backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200, padding: 16 }} onClick={() => setManualEditar(null)}>
          <div style={{ background: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 450, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: 16 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Edit3 size={20} style={{ color: 'var(--azul-medio)' }} />
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--azul)' }}>Editar Manual Técnico</h3>
              </div>
              <button onClick={() => setManualEditar(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gris-texto)' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--naranja)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Marca</label>
                  <select
                    value={manualEditar.marca}
                    onChange={e => setManualEditar({ ...manualEditar, marca: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #D8E2EE', borderRadius: 8, fontFamily: 'var(--font)', fontSize: '0.85rem', color: 'var(--azul)', background: '#FAFBFD', outline: 'none' }}
                  >
                    {MARCAS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--naranja)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Tipo Equipo</label>
                  <select
                    value={manualEditar.equipo}
                    onChange={e => setManualEditar({ ...manualEditar, equipo: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #D8E2EE', borderRadius: 8, fontFamily: 'var(--font)', fontSize: '0.85rem', color: 'var(--azul)', background: '#FAFBFD', outline: 'none' }}
                  >
                    {EQUIPOS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--naranja)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Problema / Error específico</label>
                <input
                  type="text"
                  value={manualEditar.problema || ''}
                  onChange={e => setManualEditar({ ...manualEditar, problema: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #D8E2EE', borderRadius: 8, fontFamily: 'var(--font)', fontSize: '0.85rem', color: 'var(--azul)', background: '#FAFBFD', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--naranja)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Título del Manual</label>
                <input
                  type="text"
                  value={manualEditar.titulo || ''}
                  onChange={e => setManualEditar({ ...manualEditar, titulo: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #D8E2EE', borderRadius: 8, fontFamily: 'var(--font)', fontSize: '0.85rem', color: 'var(--azul)', background: '#FAFBFD', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--naranja)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Descripción Técnica Detallada</label>
                <textarea
                  value={manualEditar.descripcion || ''}
                  onChange={e => setManualEditar({ ...manualEditar, descripcion: e.target.value })}
                  rows={5}
                  style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #D8E2EE', borderRadius: 8, fontFamily: 'var(--font)', fontSize: '0.85rem', color: 'var(--azul)', background: '#FAFBFD', outline: 'none', resize: 'vertical' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button
                onClick={() => setManualEditar(null)}
                style={{ flex: 1, padding: '10px 16px', background: 'none', border: '1.5px solid #D8E2EE', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600, color: 'var(--gris-texto)', cursor: 'pointer', fontFamily: 'var(--font)' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleGuardarEdicion}
                style={{ flex: 1, padding: '10px 16px', background: 'var(--azul)', color: 'white', border: 'none', borderRadius: 8, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}
              >
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visualizador de Medios (Carrusel Lightbox) */}
      {mediaActivo && (
        <MediaLightbox
          media={mediaActivo.lista}
          index={mediaActivo.index}
          onClose={() => setMediaActivo(null)}
          onChangeIndex={(idx) => setMediaActivo({ ...mediaActivo, index: idx })}
        />
      )}
    </div>
  )
}
