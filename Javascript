const sql = require('mssql');

let poolPromise = null;

function getPool() {
  if (!poolPromise) {
    const connectionString = process.env.SQL_CONNECTION_STRING;
    if (!connectionString) {
      throw new Error('Variável de ambiente SQL_CONNECTION_STRING não configurada.');
    }
    poolPromise = new sql.ConnectionPool(connectionString)
      .connect()
      .catch((err) => {
        poolPromise = null;
        throw err;
      });
  }
  return poolPromise;
}

module.exports = { sql, getPool };
