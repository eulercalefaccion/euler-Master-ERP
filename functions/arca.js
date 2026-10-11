/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ARCA (ex AFIP) – Facturación Electrónica vía Web Services
 *    - WSAA  : autenticación (ticket de acceso firmado con el certificado)
 *    - WSFEv1: autorización de comprobantes (CAE)
 *
 *  Secretos (Firebase Secret Manager):
 *    ARCA_KEY        -> clave privada PEM (la misma para homologación y producción)
 *    ARCA_CERT_HOMO  -> certificado PEM emitido por WSASS (homologación)
 *    ARCA_CERT_PROD  -> certificado PEM emitido por "Administración de Certificados Digitales"
 *
 *  Configuración no secreta: Firestore  configuracion/arca
 *    { entorno: 'homologacion'|'produccion', cuit, puntoVentaHomo, puntoVentaProd, ... }
 *
 *  Colecciones solo-servidor (las reglas de Firestore las bloquean para el cliente):
 *    arca_ta/{entorno}_wsfe          -> ticket de acceso cacheado (válido 12 h)
 *    arca_locks/{entorno}_{pv}_{tipo}-> lock de numeración + recuperación de emisiones interrumpidas
 * ═══════════════════════════════════════════════════════════════════════════
 */
const https = require('https');
const forge = require('node-forge');
const { XMLParser } = require('fast-xml-parser');

const URLS = {
  homologacion: {
    wsaa: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  },
  produccion: {
    wsaa: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
  },
};

// Códigos ARCA
const CBTE_TIPO = { FA: 1, NCA: 3, FB: 6, NCB: 8 };
const CBTE_LETRA = { 1: 'A', 3: 'A', 6: 'B', 8: 'B' };
const CBTE_NOMBRE = { 1: 'FACTURA', 3: 'NOTA DE CRÉDITO', 6: 'FACTURA', 8: 'NOTA DE CRÉDITO' };
const CBTE_SIGLA = { 1: 'FAA', 3: 'NCA', 6: 'FAB', 8: 'NCB' };
const DOC_TIPO = { CUIT: 80, CUIL: 86, DNI: 96, SIN_ID: 99 };
const CONDICION_IVA = {
  1: 'IVA Responsable Inscripto',
  4: 'IVA Sujeto Exento',
  5: 'Consumidor Final',
  6: 'Responsable Monotributo',
  7: 'Sujeto No Categorizado',
  13: 'Monotributista Social',
  15: 'IVA No Alcanzado',
  16: 'Monotributo Trabajador Independiente Promovido',
};
const CONDICIONES_CLASE_A = [1, 6, 13, 16];
const ALICUOTA_IVA_21_ID = 5;

// Los servidores de ARCA usan parámetros DH de 1024 bits; OpenSSL 3 (Node 18+) los rechaza
// por defecto con "dh key too small". Bajamos el nivel de seguridad SOLO para estos hosts.
const arcaAgent = new https.Agent({ keepAlive: true, ciphers: 'DEFAULT@SECLEVEL=1' });

const xmlParser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
});

// ─── Utilidades ─────────────────────────────────────────────────────────────

class ArcaError extends Error {
  constructor(message, { code = 'ARCA', detalles = null } = {}) {
    super(message);
    this.code = code;
    this.detalles = detalles;
  }
}

const asArray = (v) => (v === undefined || v === null || v === '' ? [] : Array.isArray(v) ? v : [v]);
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const money = (n) => round2(n).toFixed(2);
const xmlEscape = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Fecha/hora en Argentina (UTC-3, sin horario de verano). */
const fechaAR = (date = new Date()) => {
  const d = new Date(date.getTime() - 3 * 3600 * 1000);
  const iso = d.toISOString();
  return {
    yyyymmdd: iso.slice(0, 10).replace(/-/g, ''),
    isoDate: iso.slice(0, 10),
    isoDateTime: `${iso.slice(0, 19)}-03:00`,
  };
};
const yyyymmddToIso = (s) => (s && s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s || null);
const isoToYyyymmdd = (s) => (s ? String(s).slice(0, 10).replace(/-/g, '') : null);

function httpsPost(url, body, headers = {}, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      agent: arcaAgent,
      headers: { 'Content-Length': Buffer.byteLength(body), ...headers },
      timeout: timeoutMs,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('timeout', () => req.destroy(new Error(`Timeout conectando a ${u.hostname}`)));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function parseSoap(xml) {
  const parsed = xmlParser.parse(xml);
  const body = parsed?.Envelope?.Body;
  if (!body) throw new ArcaError('Respuesta SOAP inválida de ARCA', { detalles: xml.slice(0, 500) });
  if (body.Fault) {
    const f = body.Fault;
    throw new ArcaError(`ARCA: ${f.faultstring || 'Error SOAP'}`, { code: String(f.faultcode || 'SOAP_FAULT') });
  }
  return body;
}

// ─── Credenciales ───────────────────────────────────────────────────────────

const secretoValido = (v) => typeof v === 'string' && v.includes('-----BEGIN');

function getCredenciales(entorno) {
  const key = process.env.ARCA_KEY;
  const cert = entorno === 'produccion' ? process.env.ARCA_CERT_PROD : process.env.ARCA_CERT_HOMO;
  if (!secretoValido(key)) {
    throw new ArcaError('Falta la clave privada (secreto ARCA_KEY) en el servidor.', { code: 'SIN_CLAVE' });
  }
  if (!secretoValido(cert)) {
    throw new ArcaError(`Falta el certificado de ${entorno} (secreto ${entorno === 'produccion' ? 'ARCA_CERT_PROD' : 'ARCA_CERT_HOMO'}).`, { code: 'SIN_CERTIFICADO' });
  }
  return { keyPem: key, certPem: cert };
}

function infoCertificado(entorno) {
  try {
    const { certPem } = getCredenciales(entorno);
    const c = forge.pki.certificateFromPem(certPem);
    return {
      cargado: true,
      emisor: c.issuer.getField('CN')?.value || '',
      sujeto: c.subject.getField('CN')?.value || '',
      validoDesde: c.validity.notBefore.toISOString(),
      validoHasta: c.validity.notAfter.toISOString(),
    };
  } catch (e) {
    return { cargado: false, error: e.message };
  }
}

// ─── WSAA ───────────────────────────────────────────────────────────────────

function firmarTRA(servicio, keyPem, certPem) {
  const now = Date.now();
  const gen = fechaAR(new Date(now - 10 * 60 * 1000)).isoDateTime;
  const exp = fechaAR(new Date(now + 10 * 60 * 1000)).isoDateTime;
  const tra = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<loginTicketRequest version="1.0"><header>' +
    `<uniqueId>${Math.floor(now / 1000)}</uniqueId>` +
    `<generationTime>${gen}</generationTime>` +
    `<expirationTime>${exp}</expirationTime>` +
    `</header><service>${servicio}</service></loginTicketRequest>`;

  const cert = forge.pki.certificateFromPem(certPem);
  const key = forge.pki.privateKeyFromPem(keyPem);
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(tra, 'utf8');
  p7.addCertificate(cert);
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });
  p7.sign();
  return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
}

/**
 * Devuelve { token, sign } para el servicio pedido, usando el ticket cacheado en Firestore
 * mientras siga vigente (ARCA rechaza pedir un ticket nuevo si hay uno válido).
 */
async function obtenerTicket(db, entorno, servicio = 'wsfe') {
  const ref = db.collection('arca_ta').doc(`${entorno}_${servicio}`);
  const snap = await ref.get();
  const margenMs = 5 * 60 * 1000;
  if (snap.exists) {
    const ta = snap.data();
    if (ta.token && ta.sign && new Date(ta.expirationTime).getTime() - margenMs > Date.now()) {
      return { token: ta.token, sign: ta.sign };
    }
  }

  const { keyPem, certPem } = getCredenciales(entorno);
  const cms = firmarTRA(servicio, keyPem, certPem);
  const envelope = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">' +
    `<soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>`;

  const res = await httpsPost(URLS[entorno].wsaa, envelope, {
    'Content-Type': 'text/xml; charset=utf-8',
    SOAPAction: '""',
  });

  let body;
  try {
    body = parseSoap(res.body);
  } catch (e) {
    if (/alreadyAuthenticated/i.test(e.code) || /ya posee un TA valido/i.test(e.message)) {
      throw new ArcaError('ARCA indica que ya hay un ticket de acceso vigente que no quedó guardado. Esperá unos minutos (máx. 12 h) y reintentá.', { code: 'TA_VIGENTE' });
    }
    if (/cms\.cert\.untrusted|cms\.cert\.invalid|cms\.bad/i.test(e.code)) {
      throw new ArcaError(`El certificado de ${entorno} no es válido para ARCA (${e.message}).`, { code: 'CERT_INVALIDO' });
    }
    if (/notAuthorized|cms\.cert\.notauthorized/i.test(e.code + e.message)) {
      throw new ArcaError('El certificado no está autorizado para el servicio "wsfe". Falta asociar el certificado al web service de Facturación Electrónica en ARCA.', { code: 'SIN_AUTORIZACION' });
    }
    throw e;
  }

  const ticketXml = body?.loginCmsResponse?.loginCmsReturn;
  if (!ticketXml) throw new ArcaError('WSAA no devolvió ticket de acceso', { detalles: res.body.slice(0, 500) });
  const ticket = xmlParser.parse(ticketXml)?.loginTicketResponse;
  const token = ticket?.credentials?.token;
  const sign = ticket?.credentials?.sign;
  const expirationTime = ticket?.header?.expirationTime;
  if (!token || !sign) throw new ArcaError('Ticket de acceso incompleto');

  await ref.set({ token, sign, expirationTime, generationTime: ticket?.header?.generationTime || null });
  return { token, sign };
}

// ─── WSFEv1 ─────────────────────────────────────────────────────────────────

async function wsfeCall(entorno, metodo, innerXml) {
  const envelope = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">' +
    `<soap:Header/><soap:Body><ar:${metodo}>${innerXml}</ar:${metodo}></soap:Body></soap:Envelope>`;
  const res = await httpsPost(URLS[entorno].wsfe, envelope, {
    'Content-Type': 'text/xml; charset=utf-8',
    SOAPAction: `"http://ar.gov.afip.dif.FEV1/${metodo}"`,
  });
  const body = parseSoap(res.body);
  const result = body?.[`${metodo}Response`]?.[`${metodo}Result`];
  if (!result) throw new ArcaError(`Respuesta inesperada de ${metodo}`, { detalles: res.body.slice(0, 500) });
  return result;
}

const authXml = (ticket, cuit) =>
  `<ar:Auth><ar:Token>${ticket.token}</ar:Token><ar:Sign>${ticket.sign}</ar:Sign><ar:Cuit>${cuit}</ar:Cuit></ar:Auth>`;

const erroresDe = (result) => asArray(result?.Errors?.Err).map((e) => ({ code: String(e.Code), msg: String(e.Msg) }));

async function feDummy(entorno) {
  const r = await wsfeCall(entorno, 'FEDummy', '');
  return { appServer: r.AppServer, dbServer: r.DbServer, authServer: r.AuthServer };
}

async function ultimoAutorizado(entorno, ticket, cuit, ptoVta, cbteTipo) {
  const r = await wsfeCall(entorno, 'FECompUltimoAutorizado',
    `${authXml(ticket, cuit)}<ar:PtoVta>${ptoVta}</ar:PtoVta><ar:CbteTipo>${cbteTipo}</ar:CbteTipo>`);
  const errs = erroresDe(r);
  if (errs.length) throw new ArcaError(`ARCA: ${errs.map((e) => `[${e.code}] ${e.msg}`).join(' | ')}`, { code: 'WSFE', detalles: errs });
  return Number(r.CbteNro || 0);
}

async function consultarComprobante(entorno, ticket, cuit, ptoVta, cbteTipo, nro) {
  const r = await wsfeCall(entorno, 'FECompConsultar',
    `${authXml(ticket, cuit)}<ar:FeCompConsReq><ar:CbteTipo>${cbteTipo}</ar:CbteTipo><ar:CbteNro>${nro}</ar:CbteNro><ar:PtoVta>${ptoVta}</ar:PtoVta></ar:FeCompConsReq>`);
  const errs = erroresDe(r);
  if (errs.some((e) => e.code === '602')) return null; // no existe
  if (errs.length) throw new ArcaError(`ARCA: ${errs.map((e) => `[${e.code}] ${e.msg}`).join(' | ')}`, { code: 'WSFE', detalles: errs });
  return r.ResultGet || null;
}

async function puntosDeVenta(entorno, ticket, cuit) {
  const r = await wsfeCall(entorno, 'FEParamGetPtosVenta', authXml(ticket, cuit));
  return {
    puntos: asArray(r?.ResultGet?.PtoVenta).map((p) => ({
      nro: Number(p.Nro), emisionTipo: p.EmisionTipo, bloqueado: p.Bloqueado, fchBaja: p.FchBaja,
    })),
    errores: erroresDe(r),
  };
}

/**
 * Arma y envía FECAESolicitar para UN comprobante.
 * @returns {{resultado, cae, caeVto, observaciones, errores, eventos, raw}}
 */
async function solicitarCAE(entorno, ticket, cuit, c) {
  const ivaXml = c.impIva > 0 || c.impNeto > 0
    ? `<ar:Iva><ar:AlicIva><ar:Id>${ALICUOTA_IVA_21_ID}</ar:Id><ar:BaseImp>${money(c.impNeto)}</ar:BaseImp><ar:Importe>${money(c.impIva)}</ar:Importe></ar:AlicIva></ar:Iva>`
    : '';
  const asocXml = c.cbteAsoc
    ? `<ar:CbtesAsoc><ar:CbteAsoc><ar:Tipo>${c.cbteAsoc.tipo}</ar:Tipo><ar:PtoVta>${c.cbteAsoc.ptoVta}</ar:PtoVta><ar:Nro>${c.cbteAsoc.nro}</ar:Nro><ar:Cuit>${cuit}</ar:Cuit><ar:CbteFch>${c.cbteAsoc.fecha}</ar:CbteFch></ar:CbteAsoc></ar:CbtesAsoc>`
    : '';
  const servXml = c.concepto === 1 ? '' :
    `<ar:FchServDesde>${c.fchServDesde}</ar:FchServDesde><ar:FchServHasta>${c.fchServHasta}</ar:FchServHasta><ar:FchVtoPago>${c.fchVtoPago}</ar:FchVtoPago>`;

  const inner = authXml(ticket, cuit) +
    '<ar:FeCAEReq><ar:FeCabReq>' +
    `<ar:CantReg>1</ar:CantReg><ar:PtoVta>${c.ptoVta}</ar:PtoVta><ar:CbteTipo>${c.cbteTipo}</ar:CbteTipo>` +
    '</ar:FeCabReq><ar:FeDetReq><ar:FECAEDetRequest>' +
    `<ar:Concepto>${c.concepto}</ar:Concepto>` +
    `<ar:DocTipo>${c.docTipo}</ar:DocTipo><ar:DocNro>${c.docNro}</ar:DocNro>` +
    `<ar:CbteDesde>${c.nro}</ar:CbteDesde><ar:CbteHasta>${c.nro}</ar:CbteHasta>` +
    `<ar:CbteFch>${c.fecha}</ar:CbteFch>` +
    `<ar:ImpTotal>${money(c.impTotal)}</ar:ImpTotal><ar:ImpTotConc>0.00</ar:ImpTotConc>` +
    `<ar:ImpNeto>${money(c.impNeto)}</ar:ImpNeto><ar:ImpOpEx>0.00</ar:ImpOpEx>` +
    `<ar:ImpTrib>0.00</ar:ImpTrib><ar:ImpIVA>${money(c.impIva)}</ar:ImpIVA>` +
    servXml +
    '<ar:MonId>PES</ar:MonId><ar:MonCotiz>1</ar:MonCotiz>' +
    `<ar:CondicionIVAReceptorId>${c.condicionIvaReceptor}</ar:CondicionIVAReceptorId>` +
    asocXml + ivaXml +
    '</ar:FECAEDetRequest></ar:FeDetReq></ar:FeCAEReq>';

  const r = await wsfeCall(entorno, 'FECAESolicitar', inner);
  const det = asArray(r?.FeDetResp?.FECAEDetResponse)[0] || {};
  return {
    resultado: det.Resultado || r?.FeCabResp?.Resultado || 'R',
    cae: det.CAE || null,
    caeVto: det.CAEFchVto || null,
    observaciones: asArray(det?.Observaciones?.Obs).map((o) => ({ code: String(o.Code), msg: String(o.Msg) })),
    errores: erroresDe(r),
    eventos: asArray(r?.Events?.Evt).map((e) => ({ code: String(e.Code), msg: String(e.Msg) })),
  };
}

/** Datos del QR obligatorio (RG 4892). */
function urlQR({ fechaIso, cuit, ptoVta, cbteTipo, nro, impTotal, docTipo, docNro, cae }) {
  const payload = {
    ver: 1,
    fecha: fechaIso,
    cuit: Number(cuit),
    ptoVta: Number(ptoVta),
    tipoCmp: Number(cbteTipo),
    nroCmp: Number(nro),
    importe: round2(impTotal),
    moneda: 'PES',
    ctz: 1,
    tipoDocRec: Number(docTipo),
    nroDocRec: Number(docNro),
    tipoCodAut: 'E',
    codAut: Number(cae),
  };
  return `https://www.afip.gob.ar/fe/qr/?p=${Buffer.from(JSON.stringify(payload)).toString('base64')}`;
}

module.exports = {
  ArcaError,
  CBTE_TIPO,
  CBTE_LETRA,
  CBTE_NOMBRE,
  CBTE_SIGLA,
  DOC_TIPO,
  CONDICION_IVA,
  CONDICIONES_CLASE_A,
  round2,
  xmlEscape,
  fechaAR,
  yyyymmddToIso,
  isoToYyyymmdd,
  infoCertificado,
  obtenerTicket,
  feDummy,
  ultimoAutorizado,
  consultarComprobante,
  puntosDeVenta,
  solicitarCAE,
  urlQR,
};
