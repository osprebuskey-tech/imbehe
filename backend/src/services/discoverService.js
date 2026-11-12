const Follow = require('../models/Follow');
const ListingSave = require('../models/ListingSave');
const MarketListing = require('../models/MarketListing');
const ProviderProfile = require('../models/ProviderProfile');
const User = require('../models/User');
const requestService = require('./requestService');
const { ROLES } = require('../utils/roles');

const LIMIT = 8;
const DAYS = 30;
const idOf = (v) => String(v?._id ?? v);
const visible = { status: 'active', 'takenDown.at': { $exists: false } };

/** Products and businesses people have been saving lately; when too few, the newest fill the rest. */
async function trendingListings() {
  const since = new Date(Date.now() - DAYS * 86_400_000);
  const saved = await ListingSave.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $group: { _id: '$listing', saves: { $sum: 1 } } },
    { $sort: { saves: -1 } },
    { $limit: LIMIT * 3 },
  ]);
  const hot = await MarketListing.find({ _id: { $in: saved.map((s) => s._id) }, ...visible });
  const rank = new Map(saved.map((s, i) => [String(s._id), i]));
  hot.sort((a, b) => rank.get(String(a._id)) - rank.get(String(b._id)));
  const picked = hot.slice(0, LIMIT);
  if (picked.length < LIMIT) {
    const fill = await MarketListing.find({ ...visible, _id: { $nin: picked.map((l) => l._id) } }).sort({ createdAt: -1 }).limit(LIMIT - picked.length);
    picked.push(...fill);
  }
  return picked.map((l) => ({
    id: String(l._id), name: l.name, kind: l.kind, priceType: l.priceType, priceMin: l.priceMin, priceMax: l.priceMax,
    district: l.location?.district, imageUrl: l.media.find((m) => m.kind === 'image')?.url,
  }));
}

/** Business accounts with the most followers (newest accounts fill in when few have any). */
async function popularBusinesses() {
  const counts = await Follow.aggregate([{ $group: { _id: '$following', followers: { $sum: 1 } } }, { $sort: { followers: -1 } }, { $limit: 200 }]);
  const byFollowers = new Map(counts.map((c) => [String(c._id), c.followers]));
  const ranked = await User.find({ _id: { $in: counts.map((c) => c._id) }, roles: ROLES.BUSINESS, status: 'active' }).select('fullName avatarUrl accountVerified district');
  ranked.sort((a, b) => byFollowers.get(String(b._id)) - byFollowers.get(String(a._id)));
  const picked = ranked.slice(0, LIMIT);
  if (picked.length < LIMIT) {
    const fill = await User.find({ roles: ROLES.BUSINESS, status: 'active', _id: { $nin: picked.map((u) => u._id) } }).sort({ createdAt: -1 }).limit(LIMIT - picked.length).select('fullName avatarUrl accountVerified district');
    picked.push(...fill);
  }
  return picked.map((u) => ({ id: String(u._id), fullName: u.fullName, avatarUrl: u.avatarUrl, verified: Boolean(u.accountVerified), district: u.district, followers: byFollowers.get(String(u._id)) || 0 }));
}

/** Verified providers with reviews, best rated first. */
async function topProviders() {
  const rows = await ProviderProfile.find({ verificationStatus: 'verified', ratingCount: { $gt: 0 } }).sort({ ratingAvg: -1, ratingCount: -1 }).limit(LIMIT);
  return rows.map((p) => ({ id: String(p._id), displayName: p.displayName, avatarUrl: p.avatarUrl, ratingAvg: p.ratingAvg, ratingCount: p.ratingCount, completedJobs: p.completedJobs }));
}

/**
 * Open requests, but only the ones this viewer is already allowed to see: a verified provider's incoming requests.
 * Everyone else gets none, so a customer's request is never shown to people who could not open it.
 */
async function recentRequests(viewer) {
  if (!viewer || !viewer.roles.includes(ROLES.PROVIDER)) return [];
  try {
    const { items } = await requestService.list(viewer, { scope: 'incoming', page: 1, limit: LIMIT });
    return items.map((r) => ({ id: r.id, title: r.title, category: r.category, location: r.location, budgetMin: r.budgetMin, budgetMax: r.budgetMax, budgetNegotiable: r.budgetNegotiable, createdAt: r.createdAt }));
  } catch {
    return []; // no provider profile yet, or not verified: nothing to show, and that is not an error on a discovery page
  }
}

async function discover(viewer) {
  const [listings, businesses, providers, requests] = await Promise.all([trendingListings(), popularBusinesses(), topProviders(), recentRequests(viewer)]);
  return { trendingListings: listings, popularBusinesses: businesses, topProviders: providers, recentRequests: requests };
}

module.exports = { discover, idOf };
