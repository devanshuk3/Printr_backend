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

/**
 * Delete records from orders and print_queue after 1 hour of completion.
 */
const cleanupCompletedJobs = async () => {
  console.log('[Cleanup] Checking for jobs completed >1 hour ago...');
  try {
    // 1. Get object keys for files that should be deleted
    const result = await db.supabaseQuery(`
      SELECT object_key, order_id FROM print_queue 
      WHERE completed_at <= NOW() - INTERVAL '1 hour'
    `);
    
    if (result.rows.length === 0) {
      return;
    }

    const bucketName = process.env.R2_BUCKET_NAME;
    const ordersToDelete = result.rows.map(r => r.order_id);
    const keysToDelete = result.rows.map(r => ({ Key: r.object_key }));

    // 2. Delete from R2
    if (bucketName) {
      try {
        await r2.send(new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: { Objects: keysToDelete },
        }));
        console.log(`[Cleanup] Deleted ${keysToDelete.length} files from R2 for completed jobs.`);
      } catch (r2Err) {
        console.warn(`[Cleanup] R2 deletion failed for some completed jobs, but proceeding with DB cleanup.`);
      }
    }

    // 3. Delete from DB Tables
    await db.supabaseQuery('DELETE FROM print_queue WHERE order_id = ANY($1)', [ordersToDelete]);
    await db.supabaseQuery('DELETE FROM orders WHERE id = ANY($1)', [ordersToDelete]);
    await db.supabaseQuery('UPDATE uploaded_files SET deleted_at = NOW() WHERE object_key = ANY($1)', [result.rows.map(r => r.object_key)]);

    console.log(`[Cleanup] Database records for ${ordersToDelete.length} completed jobs removed.`);
  } catch (error) {
    console.error('[Cleanup] Error in cleanupCompletedJobs:', error.message);
  }
};

// Run periodically according to set schedule (every 30 minutes)
const startCleanupTask = () => {
  // Run on startup
  cleanupOldFiles();
  cleanupCompletedJobs();

  // Then schedule recurring cleanup
  cron.schedule('0 */2 * * *', () => {
    cleanupOldFiles();
  });
  
  cron.schedule('*/30 * * * *', () => {
    cleanupCompletedJobs();
  });
  
  console.log('[Cleanup] Scheduled: OldFiles (2h) and CompletedJobs (30m).');
};

module.exports = { startCleanupTask, cleanupOldFiles, manualDeleteFile };
