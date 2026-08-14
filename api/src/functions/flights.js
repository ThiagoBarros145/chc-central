const { app } = require('@azure/functions');
const { getPool, sql } = require('../db');

app.http('flights', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: 'flights',
  handler: async (request, context) => {
    try {
      const pool = await getPool();

      if (request.method === 'GET') {
        const result = await pool.request().query('SELECT * FROM Flights');
        return { jsonBody: result.recordset };
      }

      if (request.method === 'POST') {
        const body = await request.json();
        const result = await pool.request()
          .input('baseId', sql.Int, body.baseId)
          .input('aircraftId', sql.Int, body.aircraftId)
          .input('departure', sql.DateTime, body.departure)
          .input('arrival', sql.DateTime, body.arrival)
          .input('status', sql.NVarChar, body.status)
          .query(`INSERT INTO Flights (baseId, aircraftId, departure, arrival, status)
                  OUTPUT INSERTED.*
                  VALUES (@baseId, @aircraftId, @departure, @arrival, @status)`);
        return { status: 201, jsonBody: result.recordset[0] };
      }
    } catch (err) {
      context.error(err);
      return { status: 500, jsonBody: { error: err.message } };
    }
  }
});
