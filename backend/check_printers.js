const sql = require('mssql');
const { poolPromise } = require('./config/db');

async function run() {
  const pool = await poolPromise;
  const res = await pool.request().query('SELECT PrinterId, PrinterName, PrinterPath, PrinterIP, PrinterType, KitchenTypeValue, KitchenTypeName, IsActive FROM PrintMaster ORDER BY PrinterType');
  console.log(JSON.stringify(res.recordset, null, 2));
  process.exit(0);
}
run();
