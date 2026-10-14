export default async function handler(req, res) {
  const { ticket } = req.query;

  if (!ticket) {
    return res.status(400).json({ error: 'Codice ticket mancante' });
  }

  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

  try {
    const response = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Servizi?filterByFormula={Ticket}='${ticket.toUpperCase()}'`,
      {
        headers: {
          Authorization: `Bearer ${AIRTABLE_TOKEN}`,
        },
      }
    );

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Errore di connessione con Airtable' });
  }
}
