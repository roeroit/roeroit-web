// api/registro.js
import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito.' });

  const { AIRTABLE_BASE_ID, AIRTABLE_TOKEN, AIRTABLE_TABLE_NAME } = process.env;

  if (!AIRTABLE_BASE_ID || !AIRTABLE_TOKEN || !AIRTABLE_TABLE_NAME) {
    return res.status(500).json({ error: 'Errore di configurazione del server.' });
  }

  const headers = {
    Authorization: `Bearer ${AIRTABLE_TOKEN}`,
    'Content-Type': 'application/json'
  };

  try {
    const { cliente, telefono, email, dispositivo, descrizione, accessori } = req.body;

    if (!cliente || !telefono || !dispositivo) {
      return res.status(400).json({ error: 'Cliente, telefono e dispositivo sono obbligatori.' });
    }

    // Generación de ticket seguro: R-XXXXXX
    const CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    let ticketCode = 'R-';
    const randomBytes = crypto.randomBytes(6);
    for (let i = 0; i < 6; i++) {
      ticketCode += CHARS[randomBytes[i] % CHARS.length];
    }

    // Verificar que el ticket no exista (muy improbable, pero por seguridad)
    const checkUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}?filterByFormula=${encodeURIComponent(`{Ticket} = '${ticketCode}'`)}&maxRecords=1`;
    const checkRes = await fetch(checkUrl, { headers });
    const checkData = await checkRes.json();
    
    if (checkData.records && checkData.records.length > 0) {
      const randomBytes2 = crypto.randomBytes(6);
      ticketCode = 'R-';
      for (let i = 0; i < 6; i++) {
        ticketCode += CHARS[randomBytes2[i] % CHARS.length];
      }
    }

    // Crear el registro en Airtable
    const createUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}`;
    const payload = {
      records: [
        {
          fields: {
            Ticket: ticketCode,
            Cliente: cliente,
            Telefono: telefono,
            Email: email || '',
            Dispositivo: dispositivo,
            Descrizione: descrizione || '',
            Accessori: accessori || '',
            Stato: 'Nuova Richiesta'
          }
        }
      ]
    };

    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    const createData = await createRes.json();

    if (!createRes.ok) {
      console.error('Airtable POST Error:', createData);
      throw new Error(createData.error?.message || 'Errore durante il salvataggio');
    }

    const newRecordFields = createData.records[0].fields;

    return res.status(201).json({
      success: true,
      ticket: newRecordFields.Ticket,
      message: 'Richiesta inviata con successo'
    });

  } catch (error) {
    console.error('Error en API Registro:', error);
    return res.status(500).json({ error: error.message || 'Errore interno del server' });
  }
}
