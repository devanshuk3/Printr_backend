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
 * Delete records from history (DB) after they are 3 hours old.
 * This applies to Both uploaded_files and orders.
 */
const cleanupDatabaseHistory = async () => {
  console.log('[Cleanup] purging old database history (3h history / 10h queue policy)...');
  try {
    // 1. Delete completed/failed records after 3 hours (History)
    const historyRes = await db.supabaseQuery(`
      DELETE FROM uploaded_files 
      WHERE status IN ('printed', 'failed') 
      AND uploaded_at <= NOW() - INTERVAL '3 hours'
    `);

    // 2. Delete old order records after 3 hours
    const orderRes = await db.supabaseQuery(`
      DELETE FROM orders 
      WHERE created_at <= NOW() - INTERVAL '3 hours'
    `);
    
    // 3. Absolute 10-hour purge for everything (Queue limit)
    const absoluteRes = await db.supabaseQuery(`
      DELETE FROM uploaded_files 
      WHERE uploaded_at <= NOW() - INTERVAL '10 hours'
    `);
    
    console.log(`[Cleanup] purged ${historyRes.rowCount || 0} history, ${orderRes.rowCount || 0} orders, and ${absoluteRes.rowCount || 0} expired queue items.`);
  } catch (err) {
    console.error('[Cleanup] Error in cleanupDatabaseHistory:', err.message);
  }
};

/**
 * Handle "as soon as printed" cleanup for STORAGE (R2).
 * Records remain in DB for 3 hours (handled by history purger).
 */
const cleanupCompletedJobs = async () => {
  console.log('[Cleanup] Checking for freshly printed jobs to purge from storage...');
  try {
    const result = await db.supabaseQuery(`
      SELECT id, object_key FROM uploaded_files 
      WHERE status = 'printed' 
      AND deleted_at IS NULL
    `);
    
    if (result.rows.length === 0) return;

    const bucketName = process.env.R2_BUCKET_NAME;
    const batch = result.rows;
    const keys = batch.map(obj => ({ Key: obj.object_key }));
    const ids = batch.map(obj => obj.id);

    // 1. Delete from R2
    if (bucketName) {
      try {
        await r2.send(new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: { Objects: keys },
        }));
      } catch (r2Err) {
        console.warn(`[Cleanup] R2 deletion failed for completed jobs.`);
      }
    }

    // 2. Mark as deleted in DB (will be permanently removed by history purger later)
    await db.supabaseQuery(
      'UPDATE uploaded_files SET deleted_at = NOW() WHERE id = ANY($1)',
      [ids]
    );

    console.log(`[Cleanup] Storage cleared for ${batch.length} printed jobs.`);
  } catch (error) {
    console.error('[Cleanup] Error in cleanupCompletedJobs:', error.message);
  }
};

// Start Background Tasks
const startCleanupTask = () => {
  console.log('[Cleanup] Initializing specialized scheduled tasks...');
  
  // Initial runs
  cleanupOldFiles().catch(() => {});
  cleanupCompletedJobs().catch(() => {});
  cleanupDatabaseHistory().catch(() => {});

  // Recurring schedules
  // 1. Files/Queue Cleanup: Check for expired (10h) files/records every hour
  cron.schedule('0 * * * *', async () => {
    console.log(`[Cleanup] Starting 10-hour queue/file check...`);
    await cleanupOldFiles();
  });
  
  // 2. History Purge: Delete DB records older than 3 hours, every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    console.log(`[Cleanup] Starting history purge (3h policy)...`);
    await cleanupDatabaseHistory();
  });
  
  // 3. STORAGE Immediate Clean: Delete printed files from R2 every 10 minutes
  cron.schedule('*/10 * * * *', async () => {
    console.log(`[Cleanup] Starting immediate printed-file storage removal...`);
    await cleanupCompletedJobs();
  });
  
  console.log('[Cleanup] Scheduled: Queue Purge (1h), History Purge (30m), Printed-Storage (10m).');
};

module.exports = { 
  startCleanupTask, 
  cleanupOldFiles, 
  cleanupDatabaseHistory, 
  cleanupCompletedJobs 
};
