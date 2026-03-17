const { S3Client } = require('@aws-sdk/client-s3');
require('dotenv').config();

console.log('Initializing R2 S3 Client...');
const endpoint = process.env.R2_ENDPOINT ? process.env.R2_ENDPOINT.trim().replace(/\/$/, '') : '';

const r2 = new S3Client({
  region: 'auto', // Cloudflare R2 preference
  endpoint: endpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId: (process.env.R2_ACCESS_KEY_ID || '').trim(),
    secretAccessKey: (process.env.R2_SECRET_ACCESS_KEY || '').trim(),
  },
});

module.exports = r2;
