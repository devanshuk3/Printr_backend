const { S3Client } = require('@aws-sdk/client-s3');
require('dotenv').config();

console.log('Initializing R2 S3 Client...');
if (!process.env.R2_ENDPOINT) {
  console.error('CRITICAL: R2_ENDPOINT is missing!');
}

const r2 = new S3Client({
  region: 'us-east-1', // Fixed for SigV4 compliance in many environments
  endpoint: process.env.R2_ENDPOINT,
  forcePathStyle: true, // Crucial for R2 account-specific endpoints
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

module.exports = r2;
