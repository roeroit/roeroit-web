// api/ticket.js
// API pública para consultar el estado de una reparación.
// NO expone datos personales del cliente (GDPR).

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  return !origin || allowed.includes(origin);
}

export default async function handler(req, res) {
  const originAllowed = setCors(req, res);

  if (req.method === 'OPTIONS') {
    return originAllowed ? res.status(204).end() : res.status(403).end();
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Metodo non consentito.' });
  }
  if (!originAllowed) {
    return res.status(403).json({ error: 'Origine non consentita.' });
  }

  const { ticket } = req.query || {};

  // Validación de formato: R- seguido de 32 caracteres hexadecimales (128 bits)
  // Los tickets viejos de 6 dígitos NO se aceptan porque son fácilmente adivinables.
  if (typeof ticket !== 'string' || !/^R-[A-F0-9]{32}$/i.test(ticket)) {
    return res.status(400).json({ error: 'Codice ticket non valido.' });
  }

  const { AIRTABLE_BASE_ID, AIRTABLE_TOKEN, AIRTABLE_TABLE_NAME } = process.env;
  if (!AIRTABLE_BASE_ID || !AIRTABLE_TOKEN || !AIRTABLE_TABLE_NAME) {
    console.error('Configurazione Airtable mancante.');
    return res.status(500).json({ error: 'Errore interno del server.' });
  }

  try {
    const normalizedTicket = ticket.toUpperCase();
    const formula = `{Ticket} = '${normalizedTicket}'`;

    const url = new URL(
      `https://api.airtable.com/v0/${encodeURIComponent(AIRTABLE_BASE_ID)}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`
    );
    url.searchParams.set('filterByFormula', formula);
    url.searchParams.set('maxRecords', '1');

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('Airtable lookup failed:', response.status, detail.slice(0, 500));
      return res.status(502).json({ error: 'Servizio temporaneamente non disponibile.' });
    }

    const data = await response.json();
    const fields = data.records?.[0]?.fields;

    if (!fields) {
      return res.status(404).json({ error: 'Nessuna riparazione trovata con questo codice.' });
    }

    // IMPORTANTE: NO exponemos datos personales (cliente, telefono, email)
    // Solo devolvemos información técnica del ticket.
    return res.status(200).json({
      ticket: fields.Ticket || normalizedTicket,
      dispositivo: fields.Dispositivo || 'N/D',
      stato: fields.Stato || 'Nuova Richiesta',
      preventivo: fields.Preventivo ?? null,
      dataConsegna: fields.DataConsegna || 'Da definire',
      // Usamos la columna DescripciónPública (lo que el cliente puede ver)
      // en lugar de Descripción (que es privada, solo para vos).
      descrizione: fields.DescrizionePubblica || '',
    });

  } catch (error) {
    console.error('Errore API ticket:', error.name || 'Error');
    return res.status(502).json({ error: 'Servizio temporaneamente non disponibile.' });
  }
}
