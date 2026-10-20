import { randomBytes } from 'node:crypto';

// ============================================================
// Roero IT - API de registro
// - No escribe campos calculados (DataCreazione, Created time...)
// - Validacion estricta de inputs + honeypot + CORS restringido
// - Autodiagnostico: identifica columnas rechazadas por Airtable
// ============================================================

const MAX_LENGTHS = {
  cliente: 120,
  nomeAzienda: 120,
  telefono: 30,
  email: 254,
  dispositivo: 100,
  categoria: 80,
  descrizione: 5000,
  accessori: 1000,
  quandoServe: 50,
  contattoPreferito: 30,
};

const ALLOWED_CATEGORIES = new Set([
  'PC/Mac', 'Smartphone/Tablet', 'Console', 'Rete/WiFi', 'Server/Rete',
  'Backup/Cloud', 'SitoWeb', 'Videosorveglianza', 'Assistenza', 'Altro',
]);

const ALLOWED_QUANDO = new Set([
  'Nei prossimi giorni',
  'Il prima possibile',
  'Sto valutando',
  'Sto valutando / chiedo informazioni',
]);

const ALLOWED_CONTATTO = new Set(['WhatsApp', 'Telefono', 'Email']);

// Estas columnas NUNCA se eliminan: si una falla, hay que corregirla.
const PROTECTED_COLUMNS = new Set([
  'Ticket', 'Cliente', 'Telefono', 'Dispositivo', 'Categoria', 'Stato',
]);

const PISTAS = {
  Stato: 'Creá la opción "Nuova Richiesta" en la columna Stato de Airtable (Single select).',
  Categoria: 'Las opciones de Categoria deben coincidir exactamente con ALLOWED_CATEGORIES.',
  QuandoServe: 'Las opciones de QuandoServe deben coincidir exactamente con los values del HTML.',
  ContattoPreferito: 'Las opciones deben ser: WhatsApp, Telefono, Email.',
  DataCreazione: 'Columna calculada o fecha sin hora: NO se escribe desde la API.',
};

function allowedOrigins() {
  return (process.env.ALLOWED_ORIGINS || 'https://roeroit.it,https://www.roeroit.it')
    .split(',').map((o) => o.trim()).filter(Boolean);
}

function setCors(req, res) {
  const origin = req.headers.origin;
  const allowed = allowedOrigins();
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  return !origin || allowed.includes(origin);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cleanText(value, field, required = false) {
  if (value == null) {
    if (required) throw new Error(`missing:${field}`);
    return '';
  }
  if (typeof value !== 'string') throw new Error(`type:${field}`);
  const normalized = value.trim();
  if (required && !normalized) throw new Error(`missing:${field}`);
  if (normalized.length > MAX_LENGTHS[field]) throw new Error(`length:${field}`);
  return normalized;
}

// Extrae el nombre de la columna desde el mensaje real de Airtable.
function detectarColumnaRechazada(mensaje) {
  const patrones = [
    /Field\s+"([^"]+)"\s+cannot accept/i,
    /Unknown field name:?\s*"([^"]+)"/i,
    /Unable to find a column named\s+"?([^"\n]+)"?/i,
    /Cannot read field\s+"([^"]+)"/i,
  ];
  for (const patron of patrones) {
    const match = mensaje.match(patron);
    if (match && match[1]) return match[1].trim();
  }
  return null;
}

export default async function handler(req, res) {
  const originAllowed = setCors(req, res);

  if (req.method === 'OPTIONS') {
    return originAllowed ? res.status(204).end() : res.status(403).end();
  }
  if (!originAllowed) {
    return res.status(403).json({ error: 'Origine non consentita.' });
  }

  // Modo diagnostico TEMPORAL: /api/registro?debug=1
  const debug = req.query?.debug === '1';

  // GET = chequeo rapido de configuracion (no escribe nada)
  if (req.method === 'GET') {
    const { AIRTABLE_BASE_ID, AIRTABLE_TOKEN, AIRTABLE_TABLE_NAME } = process.env;
    return res.status(200).json({
      servicio: 'Roero IT - API registro',
      configuracion: {
        AIRTABLE_BASE_ID: AIRTABLE_BASE_ID ? 'OK' : 'FALTA',
        AIRTABLE_TOKEN: AIRTABLE_TOKEN ? 'OK (valor oculto)' : 'FALTA',
        AIRTABLE_TABLE_NAME: AIRTABLE_TABLE_NAME ? 'OK' : 'FALTA',
      },
      nota: 'DataCreazione NO se escribe: Airtable registra la creacion automaticamente.',
      uso: 'POST /api/registro | Diagnostico detallado: /api/registro?debug=1',
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Metodo non consentito.' });
  }
  if (!isPlainObject(req.body)) {
    return res.status(400).json({ error: 'Richiesta non valida.' });
  }

  // Honeypot: respuesta generica, no revelar el motivo al bot.
  const { website } = req.body;
  if (website != null && typeof website !== 'string') {
    return res.status(400).json({ error: 'Richiesta non valida.' });
  }
  if (typeof website === 'string' && website.trim() !== '') {
    return res.status(400).json({ error: 'Richiesta non valida.' });
  }

  // ---------- Validacion de campos ----------
  let cliente, nomeAzienda, telefono, email, dispositivo, categoria;
  let descrizione, accessori, quandoServe, contattoPreferito;

  try {
    cliente = cleanText(req.body.cliente, 'cliente', true);
    nomeAzienda = cleanText(req.body.nomeAzienda, 'nomeAzienda');
    telefono = cleanText(req.body.telefono, 'telefono', true);
    email = cleanText(req.body.email, 'email');
    dispositivo = cleanText(req.body.dispositivo, 'dispositivo', true);
    categoria = cleanText(req.body.categoria, 'categoria', true);
    descrizione = cleanText(req.body.descrizione, 'descrizione');
    accessori = cleanText(req.body.accessori, 'accessori');
    quandoServe = cleanText(req.body.quandoServe, 'quandoServe');
    contattoPreferito = cleanText(req.body.contattoPreferito, 'contattoPreferito');
  } catch (error) {
    const message = String(error.message || '');
    if (message.startsWith('missing:')) {
      return res.status(400).json({ error: 'Compila tutti i campi obbligatori.' });
    }
    return res.status(400).json({
      error: 'Uno o più campi non sono validi o sono troppo lunghi.',
    });
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Indirizzo email non valido.' });
  }
  if (!ALLOWED_CATEGORIES.has(categoria)) {
    return res.status(400).json({ error: `Categoria non valida: "${categoria}".` });
  }
  if (quandoServe && !ALLOWED_QUANDO.has(quandoServe)) {
    return res.status(400).json({ error: `QuandoServe non valido: "${quandoServe}".` });
  }
  if (contattoPreferito && !ALLOWED_CONTATTO.has(contattoPreferito)) {
    return res.status(400).json({ error: `ContattoPreferito non valido: "${contattoPreferito}".` });
  }

  const { AIRTABLE_BASE_ID, AIRTABLE_TOKEN, AIRTABLE_TABLE_NAME } = process.env;
  if (!AIRTABLE_BASE_ID || !AIRTABLE_TOKEN || !AIRTABLE_TABLE_NAME) {
    console.error('Configurazione Airtable mancante.');
    return res.status(500).json({ error: 'Errore interno del server.' });
  }

  const ticket = `R-${randomBytes(16).toString('hex').toUpperCase()}`;

  // Version publica de las notas (sin datos personales)
  let descrizionePubblica = '';
  if (descrizione) {
    descrizionePubblica = descrizione.split('\n').filter((linea) => {
      const lower = linea.toLowerCase();
      return !lower.includes('tipo cliente:') &&
             !lower.includes('nome') &&
             !lower.includes('telefono') &&
             !lower.includes('email');
    }).join('\n').trim();
  }

  const campos = {
    Ticket: ticket,
    Cliente: cliente,
    Telefono: telefono,
    Dispositivo: dispositivo,
    Categoria: categoria,
    Stato: 'Nuova Richiesta',
    Email: email,
    Accessori: accessori,
    Descrizione: descrizione,
    NomeAzienda: nomeAzienda,
    DescrizionePubblica: descrizionePubblica,
    QuandoServe: quandoServe,
    ContattoPreferito: contattoPreferito,
    // NO DataCreazione: campo calculado / solo lectura en Airtable.
  };

  const url = `https://api.airtable.com/v0/${encodeURIComponent(AIRTABLE_BASE_ID)}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`;

  const avisos = [];
  let fallo = null;

  // Airtable devuelve UN error a la vez. Reintentamos sin la columna
  // rechazada (solo si es opcional) hasta encontrar una escritura valida.
  for (let intento = 0; intento < 8; intento++) {
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({ records: [{ fields: campos }] }),
      });
    } catch (error) {
      fallo = { etapa: 'fetch', tipo: error.name, mensaje: error.message };
      console.error('Fallo de red hacia Airtable:', error.name);
      break;
    }

    const raw = await response.text().catch(() => '');

    if (response.ok) {
      let data;
      try { data = JSON.parse(raw); } catch { data = null; }
      if (!data?.records?.[0]?.id) {
        fallo = { etapa: 'respuesta', mensaje: 'Airtable no devolvio record ID' };
        break;
      }
      if (avisos.length) {
        console.warn('Columnas omitidas:', JSON.stringify(avisos));
      }
      return res.status(201).json({
        success: true,
        ticket,
        ...(avisos.length ? { avisos } : {}),
      });
    }

    let parsed = null;
    try { parsed = JSON.parse(raw); } catch { /* respuesta no JSON */ }

    const type = parsed?.error?.type || 'UNKNOWN';
    const mensaje = parsed?.error?.message || raw.slice(0, 400);
    console.error(`Airtable ${response.status} [${type}]: ${mensaje}`);

    // Auth, rate limit, server: no tiene sentido reintentar quitando campos.
    if (response.status !== 422) {
      fallo = { http: response.status, type, mensaje };
      break;
    }

    const columnaMala = detectarColumnaRechazada(mensaje);

    if (!columnaMala ||
        !Object.prototype.hasOwnProperty.call(campos, columnaMala) ||
        PROTECTED_COLUMNS.has(columnaMala)) {
      fallo = {
        http: 422,
        type,
        mensaje,
        columna: columnaMala || null,
        pista: PISTAS[columnaMala] || null,
      };
      break;
    }

    // Columna opcional rechazada: la omitimos y seguimos.
    avisos.push({
      columna: columnaMala,
      motivo: mensaje,
      pista: PISTAS[columnaMala] || null,
    });
    delete campos[columnaMala];
  }

  console.error('Registro fallido:', JSON.stringify({ fallo, avisos }));

  return res.status(502).json({
    error: 'Errore durante il salvataggio. Riprova più tardi.',
    ...(debug ? { debug: { fallo, avisos, columnasIntentadas: Object.keys(campos) } } : {}),
  });
}
