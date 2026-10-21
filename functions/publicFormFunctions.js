/**
 * Formulario público de solicitud de presupuesto (euler-master-erp-app.netlify.app/solicitud).
 *
 * El formulario lo completan clientes SIN cuenta en el ERP. Las reglas de Firestore
 * no permiten (con razón) que un usuario anónimo lea `presupuestos` ni escriba
 * `metadata/counters`, así que todo el alta se hace acá con el Admin SDK:
 *   1. Número correlativo PRE-AAAA-NNNN (transacción sobre metadata/counters).
 *   2. Detección de cliente existente por CUIT / email.
 *   3. Alta del lead en `presupuestos` + evento en la bitácora de sus obras previas.
 *   4. Notificación interna.
 */
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

const HttpsError = functions.https.HttpsError;

const MAX_STR = 500;
const MAX_NOTAS = 5000;
const MAX_ARCHIVOS = 30;

const str = (v, max = MAX_STR) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strOrNull = (v, max = MAX_STR) => str(v, max) || null;
const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function sanitizeArchivos(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX_ARCHIVOS)
    .filter((a) => a && typeof a.url === 'string'
      && a.url.startsWith('https://firebasestorage.googleapis.com/'))
    .map((a) => ({
      name: str(a.name, 300),
      url: a.url.slice(0, 2000),
      type: str(a.type, 100),
      size: numOrNull(a.size) || 0,
    }));
}

async function nextPresupuestoNumber(db) {
  const counterRef = db.collection('metadata').doc('counters');
  const seq = await db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    if (!snap.exists) {
      tx.set(counterRef, { presupuestosSeq: 1443, obrasSeq: 356 });
      return 1443;
    }
    let next = (snap.data().presupuestosSeq || 0) + 1;
    if (next < 1443) next = 1443;
    tx.update(counterRef, { presupuestosSeq: next });
    return next;
  });
  return `PRE-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`;
}

exports.crearSolicitudPresupuesto = functions
  .runWith({ timeoutSeconds: 60, memory: '256MB' })
  .https.onCall(async (data) => {
    const db = admin.firestore();
    const lead = (data && data.lead) || {};

    const nombre = str(lead.nombre);
    const apellido = str(lead.apellido);
    const email = str(lead.email).toLowerCase();
    const cuit = str(lead.cuit, 50);
    const telefono = str(lead.telefono, 50);
    const paramSistema = str(lead.paramSistema);

    if (!nombre || !apellido || !email || !cuit || !telefono || !paramSistema) {
      throw new HttpsError('invalid-argument', 'Faltan datos obligatorios en la solicitud.');
    }

    const estudio = strOrNull(lead.estudioArquitectura);
    const isProf = ['Arquitecto/Estudio de Arquitectura', 'Constructora', 'Desarrolladora']
      .includes(str(lead.tipoContacto));
    const name = isProf && estudio
      ? `${estudio} - ${nombre} ${apellido}`.trim()
      : `${nombre} ${apellido}`.trim();

    // 1. Número de presupuesto
    let presupuestoNumber;
    try {
      presupuestoNumber = await nextPresupuestoNumber(db);
    } catch (e) {
      console.error('[FormularioPublico] Error generando secuencia PRE:', e);
      const now = new Date();
      const d = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      presupuestoNumber = `PRE-${d}-FALLBACK`;
    }

    // 2. ¿Cliente existente? (por CUIT, si no por email)
    const leadsRef = db.collection('presupuestos');
    let existing = (await leadsRef.where('cuit', '==', cuit).get()).docs;
    if (existing.length === 0) {
      existing = (await leadsRef.where('email', '==', email).get()).docs;
      if (existing.length === 0 && str(lead.email) !== email) {
        // Leads viejos guardados con mayúsculas
        existing = (await leadsRef.where('email', '==', str(lead.email)).get()).docs;
      }
    }

    const nowIso = new Date().toISOString();
    const direccion = str(lead.direccionObra);

    const leadData = {
      name,
      telefono,
      email,
      cuit,
      tipoCliente: str(lead.tipoCliente),
      estudioArquitectura: estudio,
      empresaOEstudio: estudio,
      tipoObra: str(lead.tipoObra),
      estadoObra: str(lead.estadoObra),

      direccionObra: direccion,
      location: direccion, // Usado por KanbanBoard
      latitudObra: numOrNull(lead.latitudObra),
      longitudObra: numOrNull(lead.longitudObra),

      paramSistema,
      notasLead: str(lead.notasLead, MAX_NOTAS),

      // Datos específicos de profesional o dueño (contacto secundario)
      contactoNombre: str(lead.contactoNombre),
      contactoTelefono: str(lead.contactoTelefono, 50),

      // Datos internos
      status: 'pendiente', // Columna: Presupuesto Pendiente
      canal: 'iva',
      canalLlegada: 'Formulario Web',
      presupuestoNumber,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      date: new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }),
      amount: 0,
      quoteItems: [],
      // KPI: Bitácora de eventos con timestamp exacto del envío
      statusHistory: [{
        status: 'pendiente',
        date: nowIso,
        user: 'sistema',
        displayName: 'Formulario Web',
        descripcion: 'Solicitud recibida por formulario web del cliente',
      }],
      bitacora: [{
        tipo: 'solicitud_web',
        icono: '📋',
        descripcion: 'Cliente completó el formulario de solicitud de presupuesto vía web',
        fecha: nowIso,
        usuario: 'Formulario Web',
        email: 'sistema',
      }],
      archivos: sanitizeArchivos(lead.archivos),
    };

    if (existing.length > 0) {
      leadData.bitacora.push({
        tipo: 'cliente_existente',
        icono: '🔗',
        descripcion: `Cliente ya registrado en el sistema (${existing.length} obras previas). Vinculado por CUIT/Email.`,
        fecha: nowIso,
        usuario: 'Sistema',
        email: 'sistema',
      });
    }

    // 3. Guardar lead
    const newRef = await leadsRef.add(leadData);

    // Evento en la bitácora de las obras existentes del cliente
    if (existing.length > 0) {
      const batch = db.batch();
      existing.forEach((d) => batch.update(d.ref, {
        bitacora: admin.firestore.FieldValue.arrayUnion({
          tipo: 'nueva_obra_solicitada',
          icono: '🔗',
          descripcion: `El cliente solicitó una nueva obra desde la web (Presupuesto: ${presupuestoNumber}).`,
          fecha: nowIso,
          usuario: 'Sistema',
          email: 'sistema',
        }),
      }));
      try {
        await batch.commit();
      } catch (e) {
        console.error('[FormularioPublico] Error actualizando bitácora de obras previas:', e);
      }
    }

    // 4. Notificación interna (ERP)
    try {
      await db.collection('notifications').add({
        title: '¡Nuevo Presupuesto Pendiente!',
        message: `Recibiste una solicitud web de ${name} (${paramSistema}).`,
        type: 'new_lead',
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.error('[FormularioPublico] Error creando notificación:', e);
    }

    return { id: newRef.id, presupuestoNumber };
  });
