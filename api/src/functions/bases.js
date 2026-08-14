const { app } = require('@azure/functions');
const { getPool } = require('../db');

app.http('bases', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'bases',
  handler: async (request, context) => {
    try {
      const pool = await getPool();
      const result = await pool.request().query('SELECT * FROM Bases');
      return { jsonBody: result.recordset };
    } catch (err) {
      context.error(err);
      return { status: 500, jsonBody: { error: err.message } };
    }
  }
});
