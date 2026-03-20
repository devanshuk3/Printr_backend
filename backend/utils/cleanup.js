const cron = require('node-cron');
const r2 = require('../r2');
const db = require('../db');
const { DeleteObjectsCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

/**
 * Cleanup expired files from R2 using Database tracking.
 * This is more efficient than listing the entire bucket.
 */
const cleanupOldFiles = async () => {
  console.log('[Cleanup] Starting database-driven cleanup...');

  try {
    const bucketName = process.env.R2_BUCKET_NAME;
    if (!bucketName) {
      console.log('[Cleanup] Skipped: R2_BUCKET_NAME not configured.');
      return;
    }

    // 1. Query only specific files marked for deletion whose time has come
    const expiredResult = await db.supabaseQuery(
      'SELECT id, object_key FROM uploaded_files WHERE delete_after <= NOW() AND deleted_at IS NULL'
    );

    const allObjectsToDelete = expiredResult.rows;

    if (allObjectsToDelete.length === 0) {
      console.log('[Cleanup] No expired files found in database.');
      return;
    }

    console.log(`[Cleanup] Found ${allObjectsToDelete.length} expired files. Deleting...`);

    // 2. Delete in batches of 1000 (R2 limit)
    for (let i = 0; i < allObjectsToDelete.length; i += 1000) {
      const batch = allObjectsToDelete.slice(i, i + 1000);
      const keys = batch.map(obj => ({ Key: obj.object_key }));
      const ids = batch.map(obj => obj.id);

      try {
        await r2.send(new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: { Objects: keys },
        }));

        // 3. Mark as deleted in DB
        await db.supabaseQuery(
          'UPDATE uploaded_files SET deleted_at = NOW() WHERE id = ANY($1)',
          [ids]
        );
        
        console.log(`[Cleanup] Successfully deleted and marked ${batch.length} files.`);
      } catch (err) {
        console.error(`[Cleanup] Error deleting batch:`, err.message);
        // We don't mark as deleted so it retries next time
      }
    }

    console.log(`[Cleanup] Done. Combined total processed: ${allObjectsToDelete.length}`);
  } catch (error) {
    console.error('[Cleanup] Fatal Error:', error.message || error);
  }
};

/**
 * Manually delete a specific file (used for explicit removals)
 */
const manualDeleteFile = async (objectKey) => {
  try {
    const bucketName = process.env.R2_BUCKET_NAME;
    
    // 1. Delete from R2
    await r2.send(new DeleteObjectCommand({
      Bucket: bucketName,
      Key: objectKey
    }));

    // 2. Update DB
    await db.supabaseQuery(
      'UPDATE uploaded_files SET deleted_at = NOW() WHERE object_key = $1',
      [objectKey]
    );

    console.log(`[Manual Delete] Success: ${objectKey}`);
    return true;
  } catch (err) {
    console.error(`[Manual Delete] Failed: ${objectKey}`, err.message);
    throw err;
  }
};

// Run periodically according to set schedule (every 2 hours)
const startCleanupTask = () => {
  // Run on startup
  cleanupOldFiles();

  // Then schedule recurring cleanup
  cron.schedule('*/30 * * * *', () => {
    cleanupOldFiles();
  });
  console.log('[Cleanup] Database-driven task scheduled (running every 30 minutes).');
};

module.exports = { startCleanupTask, cleanupOldFiles, manualDeleteFile };
