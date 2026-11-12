/*
 * Deletes uploaded photos and videos that were never attached to a post, listing, request or quotation.
 *   npm run cleanup:media                 (files older than 24 hours)
 *   npm run cleanup:media -- --hours=72   (older than 72 hours)
 *   npm run cleanup:media -- --dry-run    (only list what would be deleted)
 * Safe to run on a schedule (for example daily). Files that are attached are never touched.
 */
const { connectDB, disconnectDB } = require('../config/db');
const MediaAsset = require('../models/MediaAsset');
const storage = require('../services/storage');

async function main() {
  const hours = Number((process.argv.find((a) => a.startsWith('--hours=')) || '--hours=24').split('=')[1]);
  const dry = process.argv.includes('--dry-run');
  if (!Number.isFinite(hours) || hours < 1) throw new Error('--hours must be a number of at least 1');
  await connectDB();
  const cutoff = new Date(Date.now() - hours * 3600 * 1000);
  const stale = await MediaAsset.find({ attachedTo: { $exists: false }, createdAt: { $lt: cutoff } }).select('key size');
  let bytes = 0;
  for (const asset of stale) {
    bytes += asset.size || 0;
    if (!dry) {
      await storage.remove(asset.key);
      await MediaAsset.deleteOne({ _id: asset._id, attachedTo: { $exists: false } });
    }
  }
  console.log(`${dry ? 'Would delete' : 'Deleted'} ${stale.length} unused file(s), ${(bytes / 1048576).toFixed(1)} MB`);
  await disconnectDB();
}

main().catch(async (err) => { console.error(err); try { await disconnectDB(); } catch { /* ignore */ } process.exit(1); });
