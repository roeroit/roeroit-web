// api/registro.js
import Airtable from 'airtable';

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. VALIDACIÓN HONEYPOT DEL LADO DEL SERVIDOR
  if (req.body.website && req.body.website.trim() !== '') {
    console.warn('🤖 Bot detectado y bloqueado en registro');
    return res.status(400).json({ error: 'Invalid request' });
  }

  const { cliente, telefono, email, dispositivo, categoria, descrizione, accessori } = req.body;

  if (!cliente || !telefono || !dispositivo || !categoria) {
    return res.status(400).json({ error: 'Campi obbligatori mancanti' });
  }

  // Generar código de ticket único (ej: R-839201)
  const ticket = `R-${Math.floor(100000 + Math.random() * 900000)}`;

  // Usar variables de entorno de Vercel
  const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

  base('Servizi').create([
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
        Stato: 'Nuovo',
        DataCreazione: new Date().toISOString()
      }
    }
  ], function(err, records) {
    if (err) {
      console.error('Error Airtable:', err);
      return res.status(500).json({ error: 'Errore durante il salvataggio' });
    }
    return res.status(200).json({ success: true, ticket });
  });
}
