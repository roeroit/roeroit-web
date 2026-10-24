// api/registro.js (VERSIÓN FINAL - PRODUCCIÓN)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito.' });

  // 1. VALIDACIÓN HONEYPOT DEL LADO DEL SERVIDOR
  if (req.body.website && req.body.website.trim() !== '') {
    console.warn('🤖 Bot detectado y bloqueado en registro');
    return res.status(400).json({ error: 'Invalid request' });
  }

  const { cliente, telefono, email, dispositivo, categoria, descrizione, accessori } = req.body;
  const urgente = req.body.urgente === true;
  const { AIRTABLE_BASE_ID, AIRTABLE_TOKEN, AIRTABLE_TABLE_NAME } = process.env;

  if (!cliente || !telefono || !dispositivo || !categoria) {
    return res.status(400).json({ error: 'Campi obbligatori mancanti.' });
  }
  if (!AIRTABLE_BASE_ID || !AIRTABLE_TOKEN || !AIRTABLE_TABLE_NAME) {
    return res.status(500).json({ error: 'Errore di configurazione del server.' });
  }

  // Generar código de ticket único (ej: R-839201)
  const ticket = `R-${Math.floor(100000 + Math.random() * 900000)}`;

  try {
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        records: [
          {
            fields: {
              Ticket: ticket,
              Cliente: cliente,
              Telefono: telefono,
              Email: email || '',
              Dispositivo: dispositivo,
              Categoria: categoria,
              Descrizione: descrizione,
              Accessori: accessori || '',
              Stato: 'Nuova Richiesta',
              Urgente: urgente
            }
          }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Error Airtable:', data.error?.message);
      return res.status(response.status).json({ error: 'Errore durante il salvataggio. Riprova più tardi.' });
    }

    return res.status(200).json({ success: true, ticket });

  } catch (error) {
    console.error('Error en API Registro:', error);
    return res.status(500).json({ error: 'Errore durante il salvataggio. Riprova più tardi.' });
  }
}
