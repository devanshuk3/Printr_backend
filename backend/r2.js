const { S3Client } = require('@aws-sdk/client-s3');
require('dotenv').config();

console.log('Initializing R2 S3 Client...');
const endpoint = process.env.R2_ENDPOINT ? process.env.R2_ENDPOINT.trim().replace(/\/$/, '') : '';

/**
 * Cloudflare R2 S3-compatible client.
 * 
 * Key config choices to minimize unnecessary Class A operations:
 * - forcePathStyle: Required for R2 (not virtual-hosted-style)
 * - followRegionRedirects: false — prevents SDK from making HeadBucket calls to resolve region
 * - requestChecksumCalculation: 'WHEN_REQUIRED' — no automatic checksum headers in pre-signed URLs
 */
const r2 = new S3Client({
  region: 'auto',
  endpoint: endpoint,
  forcePathStyle: true,
  followRegionRedirects: false, // Prevent hidden HeadBucket/region-resolution API calls
  requestChecksumCalculation: 'WHEN_REQUIRED',
  credentials: {
    accessKeyId: (process.env.R2_ACCESS_KEY_ID || '').trim(),
    secretAccessKey: (process.env.R2_SECRET_ACCESS_KEY || '').trim(),
  },
});

module.exports = r2;