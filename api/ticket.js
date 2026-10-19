// api/ticket.js

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Metodo non consentito.' });

  const { ticket } = req.query;
  const { AIRTABLE_BASE_ID, AIRTABLE_TOKEN, AIRTABLE_TABLE_NAME } = process.env;

  if (!ticket) return res.status(400).json({ error: 'Codice ticket mancante.' });
  if (!AIRTABLE_BASE_ID || !AIRTABLE_TOKEN || !AIRTABLE_TABLE_NAME) {
    return res.status(500).json({ error: 'Errore di configurazione del server.' });
  }

  try {
    const safeTicket = String(ticket).replace(/'/g, "\\'").toUpperCase();
    const filterFormula = encodeURIComponent(`{Ticket} = '${safeTicket}'`);
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}?filterByFormula=${filterFormula}&maxRecords=1`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Errore nella risposta di Airtable');
    }

    if (!data.records || data.records.length === 0) {
      return res.status(404).json({ error: 'Nessuna riparazione trovata con questo codice.' });
    }

    const fields = data.records[0].fields;

    // GDPR: NO devolver datos personales (cliente, telefono, email)
    return res.status(200).json({
      ticket: fields.Ticket,
      dispositivo: fields.Dispositivo || 'N/D',
      stato: fields.Stato || 'Nuova Richiesta',
      preventivo: fields.Preventivo || null,
      dataConsegna: fields.DataConsegna || 'Da definire',
      descrizione: fields.Descrizione || 'Nessuna descrizione disponibile.'
    });

  } catch (error) {
    console.error('Error en API Ticket:', error);
    return res.status(500).json({ error: 'Errore di connessione con Airtable. Riprova più tardi.' });
  }
}
