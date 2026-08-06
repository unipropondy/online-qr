const http = require('http');

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/print-jobs/pending',
  method: 'GET',
  headers: {
    'authorization': 'Bearer unipro-pos-bridge-token-2026',
    'x-store-id': 'STORE_001'
  }
};

const req = http.request(options, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Response:', data));
});

req.on('error', error => console.error(error));
req.end();
