const cron = require('node-cron');
const r2 = require('../r2');
const { ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');

const cleanupOldFiles = async () => {
  console.log('Running cleanup: Searching for files older than 1 hour...');

  try {
    const bucketName = process.env.R2_BUCKET_NAME;
    const listCommand = new ListObjectsV2Command({
      Bucket: bucketName,
    });

    const listedObjects = await r2.send(listCommand);

    if (!listedObjects.Contents || listedObjects.Contents.length === 0) {
      console.log('No files found in bucket.');
      return;
    }

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const objectsToDelete = listedObjects.Contents
      .filter((obj) => new Date(obj.LastModified) < oneHourAgo)
      .map((obj) => ({ Key: obj.Key }));

    if (objectsToDelete.length > 0) {
      const deleteCommand = new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: {
          Objects: objectsToDelete,
        },
      });

      await r2.send(deleteCommand);
      console.log(`Successfully deleted ${objectsToDelete.length} expired files.`);
    } else {
      console.log('No expired files to delete.');
    }
  } catch (error) {
    console.error('Cleanup Error:', error);
  }
};

// Run every 30 minutes
const startCleanupTask = () => {
  cron.schedule('*/30 * * * *', () => {
    cleanupOldFiles();
  });
  console.log('File cleanup task scheduled (every 30 mins).');
};

module.exports = { startCleanupTask };
