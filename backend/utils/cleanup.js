const cron = require('node-cron');
const r2 = require('../r2');
const { ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');

/**
 * Cleanup expired files from R2.
 * 
 * IMPORTANT: ListObjectsV2 and DeleteObjects are Class A operations on Cloudflare R2.
 * Each invocation costs at minimum 1 LIST call. Keep the cron schedule conservative
 * to avoid racking up Class A ops. For automatic expiry without API calls,
 * consider using R2 Lifecycle Rules in the Cloudflare Dashboard instead.
 */
const cleanupOldFiles = async () => {
  console.log('[Cleanup] Starting: Searching for files older than 2 hours...');

  try {
    const bucketName = process.env.R2_BUCKET_NAME;
    if (!bucketName) {
      console.log('[Cleanup] Skipped: R2_BUCKET_NAME not configured.');
      return;
    }

    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const allObjectsToDelete = [];

    // Paginate through all objects (1 LIST call per 1000 objects)
    let continuationToken = undefined;
    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: bucketName,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      });

      const listedObjects = await r2.send(listCommand);

      if (listedObjects.Contents && listedObjects.Contents.length > 0) {
        const expired = listedObjects.Contents
          .filter((obj) => new Date(obj.LastModified) < twoHoursAgo)
          .map((obj) => ({ Key: obj.Key }));
        allObjectsToDelete.push(...expired);
      }

      continuationToken = listedObjects.IsTruncated ? listedObjects.NextContinuationToken : undefined;
    } while (continuationToken);

    if (allObjectsToDelete.length === 0) {
      console.log('[Cleanup] No expired files found.');
      return;
    }

    // R2 DeleteObjects supports max 1000 keys per call
    for (let i = 0; i < allObjectsToDelete.length; i += 1000) {
      const batch = allObjectsToDelete.slice(i, i + 1000);
      const deleteCommand = new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: { Objects: batch },
      });

      await r2.send(deleteCommand);
      console.log(`[Cleanup] Deleted batch of ${batch.length} expired files.`);
    }

    console.log(`[Cleanup] Done. Total deleted: ${allObjectsToDelete.length}`);
  } catch (error) {
    console.error('[Cleanup] Error:', error.message || error);
  }
};

// Run every 2 hours — deletes files older than 2 hours.
// Each run = 1 LIST call + 1 DELETE call (if expired files exist).
// At 2h interval: ~12 LIST ops/day.
const startCleanupTask = () => {
  // Run immediately on startup to catch any stale files (e.g. from yesterday)
  cleanupOldFiles();

  // Then schedule recurring cleanup every 2 hours
  cron.schedule('0 */2 * * *', () => {
    cleanupOldFiles();
  });
  console.log('[Cleanup] Task scheduled (every 2 hours + immediate run on startup).');
};

module.exports = { startCleanupTask, cleanupOldFiles };
