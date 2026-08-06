const sql = require('mssql');
const { poolPromise } = require('./config/db');

async function run() {
  const pool = await poolPromise;
  const res = await pool.request().query("SELECT TOP 10 JobId, StoreId, PrinterName, Status, CreatedOn FROM PrintJobQueue WHERE Status = 'PENDING' ORDER BY CreatedOn DESC");
  console.log('Pending Jobs:', res.recordset);
  
  const cnt = await pool.request().query("SELECT Status, COUNT(*) as count FROM PrintJobQueue GROUP BY Status");
  console.log('Job counts:', cnt.recordset);

  process.exit(0);
}
run();
