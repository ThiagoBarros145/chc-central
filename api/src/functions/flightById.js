const { app } = require('@azure/functions');
const { getPool, sql } = require('../db');

app.http('flightById', {
  methods: ['PUT', 'DELETE'],
  authLevel: 'anonymous',
  route: 'flights/{id}',
  handler: async (request, context) => {
    try {
      const pool = await getPool();
      const id = request.params.id;

      if (request.method === 'PUT') {
        const body = await request.json();
        const result = await pool.request()
          .input('id', sql.Int, id)
          .input('baseId', sql.Int, body.baseId)
          .input('aircraftId', sql.Int, body.aircraftId)
          .input('departure', sql.DateTime, body.departure)
          .input('arrival', sql.DateTime, body.arrival)
          .input('status', sql.NVarChar, body.status)
          .query(`UPDATE Flights
                  SET baseId = @baseId, aircraftId = @aircraftId,
                      departure = @departure, arrival = @arrival, status = @status
                  OUTPUT INSERTED.*
                  WHERE id = @id`);
        if (result.recordset.length === 0) {
          return { status: 404, jsonBody: { error: 'Flight not found' } };
        }
        return { jsonBody: result.recordset[0] };
      }

      if (request.method === 'DELETE') {
        const result = await pool.request()
          .input('id', sql.Int, id)
          .query('DELETE FROM Flights WHERE id = @id');
        if (result.rowsAffected[0] === 0) {
          return { status: 404, jsonBody: { error: 'Flight not found' } };
        }
        return { status: 204 };
      }
    } catch (err) {
      context.error(err);
      return { status: 500, jsonBody: { error: err.message } };
    }
  }
});
