import { randomBytes } from 'node:crypto';

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
  'Nei prossimi giorni', 'Il prima possibile', 'Sto valutando',
]);

const ALLOWED_CONTATTO = new Set([
  'WhatsApp', 'Telefono', 'Email',
]);

function allowedOrigins() {
  return (process.env.ALLOWED_ORIGINS || 'https://roeroit.it,https://www.roeroit.it')
    .split(',').map((origin) => origin.trim()).filter(Boolean);
}

function setCors(req, res) {
  const origin = req.headers.origin;
  const allowed = allowedOrigins();
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
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

export default async function handler(req, res) {
  const originAllowed = setCors(req, res);
  if (req.method === 'OPTIONS') {
    return originAllowed ? res.status(204).end() : res.status(403).end();
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Metodo non consentito.' });
  }
  if (!originAllowed) {
    return res.status(403).json({ error: 'Origine non consentita.' });
  }
  if (!isPlainObject(req.body)) {
    return res.status(400).json({ error: 'Richiesta non valida.' });
  }

  // Honeypot
  const { website } = req.body;
  if (typeof website === 'string' && website.trim() !== '') {
    return res.status(400).json({ error: 'Richiesta non valida.' });
  }

  let cliente, nomeAzienda, telefono, email, dispositivo, categoria, descrizione, accessori, quandoServe, contattoPreferito;
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
    return res.status(400).json({ error: `DEBUG VALIDACIÓN: ${error.message}` });
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'DEBUG EMAIL: Indirizzo email non valido.' });
  }
  if (!ALLOWED_CATEGORIES.has(categoria)) {
    return res.status(400).json({ error: `DEBUG CATEGORIA: "${categoria}" non è valida.` });
  }

  const { AIRTABLE_BASE_ID, AIRTABLE_TOKEN, AIRTABLE_TABLE_NAME } = process.env;
  if (!AIRTABLE_BASE_ID || !AIRTABLE_TOKEN || !AIRTABLE_TABLE_NAME) {
    return res.status(500).json({ error: 'DEBUG SERVER: Configurazione Airtable mancante.' });
  }

  const ticket = `R-${randomBytes(16).toString('hex').toUpperCase()}`;

  // Filtrar descripción para la versión pública (GDPR)
  let descrizionePubblica = '';
  if (descrizione) {
    const lineas = descrizione.split('\n');
    const lineasPublicas = lineas.filter(linea => {
      const lower = linea.toLowerCase();
      return !lower.includes('tipo cliente:') && !lower.includes('nome') && !lower.includes('telefono') && !lower.includes('email');
    });
    descrizionePubblica = lineasPublicas.join('\n').trim();
  }

  const url = `https://api.airtable.com/v0/${encodeURIComponent(AIRTABLE_BASE_ID)}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        records: [{
          fields: {
            Ticket: ticket,
            Cliente: cliente,
            NomeAzienda: nomeAzienda,
            Telefono: telefono,
            Email: email,
            Dispositivo: dispositivo,
            Categoria: categoria,
            Descrizione: descrizione,
            DescrizionePubblica: descrizionePubblica,
            Accessori: accessori,
            QuandoServe: quandoServe,
            ContattoPreferito: contattoPreferito,
            Stato: 'Nuova Richiesta',
            DataCreazione: new Date().toISOString(),
          },
        }],
      }),
    });

    // 🚨 AQUÍ ESTÁ LA MAGIA DEL DIAGNÓSTICO 🚨
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      const airtableError = detail.error?.message || detail.error?.type || await response.text();
      console.error('🚨 ERROR REAL DE AIRTABLE:', airtableError);
      
      // Le mostramos el error EXACTO al usuario en la web
      return res.status(response.status).json({ 
        error: `🚨 DEBUG AIRTABLE: ${airtableError}` 
      });
    }

    const data = await response.json();
    if (!data.records?.[0]?.id) {
      return res.status(502).json({ error: 'DEBUG: Risposta Airtable senza record ID.' });
    }

    return res.status(201).json({ success: true, ticket });
  } catch (error) {
    console.error('🚨 ERROR DE RED O SERVIDOR:', error);
    return res.status(502).json({ error: `🚨 DEBUG FETCH: ${error.message}` });
  }
}
