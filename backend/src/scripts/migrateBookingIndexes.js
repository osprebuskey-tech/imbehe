/*
 * One-time, idempotent migration for requests that allow several offers.
 *   npm run migrate:booking-indexes
 * What it does (no data is changed or deleted):
 *   Drops the older UNIQUE index on Booking.request. A request that allows several offers can now produce one booking per accepted
 *   quotation. Each quotation still has at most one booking (unique index on Booking.quotation stays), then the plain replacement
 *   index is built.
 */
const { connectDB, disconnectDB } = require('../config/db');
const Booking = require('../models/Booking');

async function main() {
  await connectDB();
  const indexes = await Booking.collection.indexes();
  const old = indexes.find((i) => i.name === 'request_1' && i.unique);
  if (old) {
    await Booking.collection.dropIndex('request_1');
    console.log('Dropped the old unique request_1 index');
  }
  await Booking.createIndexes();
  console.log('Booking indexes are in place');
  await disconnectDB();
}

main().catch(async (err) => { console.error(err); try { await disconnectDB(); } catch { /* ignore */ } process.exit(1); });
