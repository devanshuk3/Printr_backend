const cron = require('node-cron');
const r2 = require('../r2');
const db = require('../db');
const { DeleteObjectsCommand } = require('@aws-sdk/client-s3');

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
 * Delete records from history (DB).
 */
const cleanupDatabaseHistory = async () => {
  console.log('[Cleanup] purging old database history...');
  try {
    // 1. Delete abandoned 'uploading' orders after 30 minutes
    const abandonedRes = await db.supabaseQuery(`
      DELETE FROM orders 
      WHERE status = 'uploading' AND created_at <= NOW() - INTERVAL '30 minutes'
    `);

    // 2. Move printed/failed old order records to archived_orders after 1 hour, then delete
    await db.supabaseQuery(`
      INSERT INTO archived_orders (original_id, user_id, vendor_id, status, page_count, total_amount, is_color, file_name, created_at, archived_at)
      SELECT id, user_id, vendor_id, status, page_count, total_amount, is_color, file_name, created_at, NOW()
      FROM orders 
      WHERE status IN ('printed', 'failed', 'cancelled') AND updated_at <= NOW() - INTERVAL '1 hour'
    `);

    const orderRes = await db.supabaseQuery(`
      DELETE FROM orders 
      WHERE status IN ('printed', 'failed', 'cancelled') AND updated_at <= NOW() - INTERVAL '1 hour'
    `);

    // 3. Absolute purge from database for files that were ALREADY cleanly deleted from R2
    const absoluteRes = await db.supabaseQuery(`
      DELETE FROM uploaded_files 
      WHERE deleted_at IS NOT NULL AND deleted_at <= NOW() - INTERVAL '1 day'
    `);

    console.log(`[Cleanup] purged abandoned orders, ${orderRes.rowCount || 0} completed orders, and ${absoluteRes.rowCount || 0} deleted items from DB metadata.`);
  } catch (err) {
    console.error('[Cleanup] Error in cleanupDatabaseHistory:', err.message);
  }
};

// Start Background Tasks
const startCleanupTask = () => {
  console.log('[Cleanup] Initializing scheduled tasks...');

  // Initial runs
  cleanupOldFiles().catch(() => { });
  cleanupDatabaseHistory().catch(() => { });

  // Recurring schedules
  // 1. Files/Queue Cleanup: Check for expired record/file removals every 20 minutes
  cron.schedule('*/20 * * * *', async () => {
    console.log(`[Cleanup] Starting file check...`);
    await cleanupOldFiles();
  });

  // 2. History Purge: Delete DB records older than 1 hour (for completed orders only), every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    console.log(`[Cleanup] Starting DB history purge...`);
    await cleanupDatabaseHistory();
  });

  console.log('[Cleanup] Scheduled: Queue Storage Purge (20m), History Purge (30m).');
};

module.exports = {
  startCleanupTask,
  cleanupOldFiles,
  cleanupDatabaseHistory
};
