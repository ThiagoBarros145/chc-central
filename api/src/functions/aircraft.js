const { app } = require('@azure/functions');
const { getPool } = require('../db');

app.http('aircraft', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'aircraft',
  handler: async (request, context) => {
    try {
      const pool = await getPool();
      const result = await pool.request().query('SELECT * FROM Aircraft');
      return { jsonBody: result.recordset };
    } catch (err) {
      context.error(err);
      return { status: 500, jsonBody: { error: err.message } };
    }
  }
});
