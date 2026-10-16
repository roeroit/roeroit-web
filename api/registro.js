export default async function handler(req, res) {
  // Permitir CORS (Recomendación: en producción, cambia '*' por 'https://roeroit.it')
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME } = process.env;

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_NAME) {
    return res.status(500).json({ error: 'Faltan variables de entorno en Vercel.' });
  }

  const headers = {
    Authorization: `Bearer ${AIRTABLE_TOKEN}`,
    'Content-Type': 'application/json'
  };

  // 🔍 GET: Buscar estado por número de Ticket
  if (req.method === 'GET') {
    const { ticket } = req.query;

    if (!ticket) {
      return res.status(400).json({ error: 'Debes proporcionar un número de ticket.' });
    }

    try {
      // Escapamos comillas simples para evitar inyección en la fórmula de Airtable
      const safeTicket = String(ticket).replace(/'/g, "\\'");
      const filterFormula = encodeURIComponent(`{Ticket} = '${safeTicket}'`);
      const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}?filterByFormula=${filterFormula}&maxRecords=1`;

      const response = await fetch(url, { headers });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Error al consultar Airtable');
      }

      if (!data.records || data.records.length === 0) {
        return res.status(404).json({ error: 'Ticket no encontrado.' });
      }

      const record = data.records[0].fields;

      return res.status(200).json({
        ticket: record.Ticket,
        cliente: record.Cliente,
        dispositivo: record.Dispositivo,
        stato: record.Stato || 'Nuova Richiesta',
        preventivo: record.Preventivo || null,
        dataConsegna: record.DataConsegna || null,
        descrizione: record.Descrizione || ''
      });
    } catch (error) {
      console.error('GET Error:', error);
      return res.status(500).json({ error: error.message || 'Error interno del servidor' });
    }
  }

  // 📝 POST: Registrar una nueva reparación
  if (req.method === 'POST') {
    const { cliente, telefono, email, dispositivo, descrizione, accessori } = req.body;

    if (!cliente || !telefono || !dispositivo) {
      return res.status(400).json({ error: 'Cliente, teléfono y dispositivo son obligatorios.' });
    }

    try {
      // 🔥 MEJORA 1: Ordenar por fecha de creación (createdTime) en lugar del campo Ticket.
      // Esto evita el error de ordenamiento alfabético ("99" > "1000") si el campo es Texto.
      const listUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}?sort[0][field]=createdTime&sort[0][direction]=desc&maxRecords=1`;
      
      const listRes = await fetch(listUrl, { headers });
      const listData = await listRes.json();

      let nextTicketNumber = 1001;
      if (listData.records && listData.records.length > 0) {
        const lastTicketStr = listData.records[0].fields.Ticket;
        const lastTicket = parseInt(lastTicketStr, 10);
        if (!isNaN(lastTicket)) {
          nextTicketNumber = lastTicket + 1;
        }
      }

      // 2. Crear el registro en Airtable
      const createUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}`;
      const payload = {
        records: [ // 🔥 MEJORA 2: Airtable espera un array "records", no un objeto "fields" suelto en POST
          {
            fields: {
              Ticket: String(nextTicketNumber),
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
        throw new Error(createData.error?.message || 'Error al guardar la solicitud');
      }

      // La respuesta exitosa de Airtable viene en createData.records[0].fields
      const newRecordFields = createData.records[0].fields;

      return res.status(201).json({
        success: true,
        ticket: newRecordFields.Ticket,
        message: 'Registro creato con successo'
      });
    } catch (error) {
      console.error('POST Error:', error);
      return res.status(500).json({ error: error.message || 'Error interno del servidor' });
    }
  }

  return res.status(405).json({ error: 'Metodo non consentito.' });
}
