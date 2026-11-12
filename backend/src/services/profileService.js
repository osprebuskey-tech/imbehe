const CompanyProfile = require('../models/CompanyProfile');
const MarketListing = require('../models/MarketListing');
const Post = require('../models/Post');
const ProviderProfile = require('../models/ProviderProfile');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const { isStaff } = require('../utils/roles');
const followService = require('./followService');

const type = (u) => (u.roles.includes('business') ? 'business' : u.roles.includes('provider') ? 'provider' : 'customer');

/**
 * The public page of any account: a person, a provider or a business. It only ever carries what is already public elsewhere
 * (the provider directory, the business listing, posts): no phone, no email, no registration number, no documents.
 * Provider details follow the directory rule and appear only once the provider is verified.
 */
async function getPublic(viewer, id) {
  const user = await User.findOne({ _id: id, status: 'active' }).select('fullName roles accountVerified createdAt avatarUrl coverUrl bio district');
  if (!user || isStaff(user)) throw new AppError(404, 'Profile not found', 'PROFILE_NOT_FOUND');

  // Providers and businesses are public by nature. A customer's page is for signed-in members only, so names cannot be scraped by id.
  if (!viewer && type(user) === 'customer') throw new AppError(404, 'Profile not found', 'PROFILE_NOT_FOUND');

  const [provider, company, posts, listings, stats] = await Promise.all([
    ProviderProfile.findOne({ user: user._id }).populate('categories', 'name slug'),
    CompanyProfile.findOne({ owner: user._id }),
    Post.countDocuments({ author: user._id, status: 'active' }),
    MarketListing.countDocuments({ owner: user._id, status: 'active', 'takenDown.at': { $exists: false } }),
    followService.stats(user._id, viewer),
  ]);

  const verifiedProvider = provider && provider.verificationStatus === 'verified' ? provider : null;
  const profile = {
    id: String(user._id),
    fullName: user.fullName,
    type: type(user),
    verified: Boolean(user.accountVerified),
    memberSince: user.createdAt,
    isMe: Boolean(viewer && String(viewer._id) === String(user._id)),
    ...(user.coverUrl ? { coverUrl: user.coverUrl } : {}),
    ...(user.bio ? { bio: user.bio } : {}),
    ...(user.district ? { district: user.district } : {}),
    ...(user.avatarUrl || provider?.avatarUrl ? { avatarUrl: user.avatarUrl || provider.avatarUrl } : {}),
    counts: { posts, listings },
    ...stats,
  };

  if (verifiedProvider) {
    profile.provider = {
      id: String(verifiedProvider._id),
      displayName: verifiedProvider.displayName,
      bio: verifiedProvider.bio,
      categories: verifiedProvider.categories.map((c) => ({ id: String(c._id), name: c.name, slug: c.slug })),
      skills: [...verifiedProvider.skills],
      experienceYears: verifiedProvider.experienceYears,
      location: { district: verifiedProvider.location?.district, sector: verifiedProvider.location?.sector },
      coverage: [...verifiedProvider.coverage],
      ratingAvg: verifiedProvider.ratingAvg,
      ratingCount: verifiedProvider.ratingCount,
      completedJobs: verifiedProvider.completedJobs,
      portfolio: verifiedProvider.portfolio.map((i) => ({ id: String(i._id), imageUrl: i.imageUrl, title: i.title, description: i.description })),
    };
  }
  if (company) {
    profile.business = {
      companyName: company.companyName,
      industry: company.industry,
      description: company.description,
      website: company.website,
      district: company.address?.district,
      sector: company.address?.sector,
    };
  }
  return profile;
}

module.exports = { getPublic };
