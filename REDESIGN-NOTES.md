# Upgrade: paid verification, ratings, privacy, contracts, documents, palette

This upgrade extends the existing Imbehe app. Nothing was rebuilt: it reuses the payment gateway abstraction (manual and webhook
gateways, signature checks, idempotency), the audit log, notifications, storage drivers, the rating model and the booking flow.

## What was added

| Area | Behaviour |
|---|---|
| Documents | Customers: National ID. Individual providers: National ID + CV. Business providers and business accounts: RDB certificate + authorised representative's National ID. PDF/JPG/PNG, size and real file-type checks (magic bytes). Stored **privately** (never under the public uploads folder), integrity-hashed, streamed only to the owner or to staff reviewing that person's application (audited). |
| Paid verification | Super admin sets/publishes fee, currency (RWF/USD) and payment instructions. Applicants see the fee before applying and keep the fee they were shown. Payment status (`unpaid/pending/confirmed/failed/waived`) is separate from review status (`pending_payment, payment_confirmed, under_review, more_info_required, recommended, approved, rejected`). |
| Payment confirmation | Only the server can confirm: a signature-checked gateway webhook whose amount and currency match, or staff entering the reference of money they saw (manual gateway). The amount is never taken from the client. Review actions return `409 PAYMENT_NOT_CONFIRMED` until paid. **Payment never verifies anyone.** |
| Review roles | Admins: start review, request information, recommend (with ratings as evidence), reject with a reason. Super admin: final approve/reject, reopen an admin rejection, withdraw verification, set the fee, publish terms. Approval is only possible for an application an admin recommended. |
| Ratings | Customers rate after completed jobs only (one per job; self-rating blocked). Averages and counts are computed on the server. Rating history (`GET /api/reviews/mine`), admin ratings report with evidence, and admin → super admin recommendations. Ratings never change verification by themselves. |
| Contact privacy | Public provider profiles/listings never carry phone or email (the old "show my phone/email" opt-in is ignored). In a job, each side sees the other's phone and email only after the **provider's explicit acceptance** (accepting the job's contract) is recorded, and only while the job is live. Enforced in the API responses, not just the UI. |
| Terms | Versioned platform Terms. Acceptance records user, version, time, IP. Required (server-side, `403 TERMS_NOT_ACCEPTED`) before requesting a service, sending a quotation, publishing a listing, applying for verification. New version = everyone re-accepts. |
| Contracts | One per accepted job, built on the server from the accepted quotation: service, price, deliverables, deadline, responsibilities, payment terms, cancellation, disputes. Both sides accept the current version; work cannot start (`409 CONTRACT_NOT_ACCEPTED`) until then. Changes make a new version (price and standard clauses are fixed) and restart acceptances. Immutable versions with SHA-256 fingerprints. Readable by both parties and admins only. |
| Notifications | Payment confirmed, more information requested, recommended/passed to final review, final decision, contract changes/signed, recommendations (to super admins). |
| UI | Palette #87B6BC (teal), #BED4CB (sage), #F6F09F (butter), #B35656 (rose) applied via the Tailwind theme in `frontend/tailwind.config.js`. Each is the exact anchor of its scale (`teal-400`, `sage-300`, `sun-300`, `rose-600`); darker shades of the same hues carry text and button fills so contrast stays at 4.5:1 or better, and `ink` (a deep teal-grey) is the text neutral. Rose doubles as the error/destructive colour. New screens for every role. |
| Account verification | On **Users**, the super administrator can **Verify** any active account (optional note) or **Remove verification** (reason required), filter by Verified / Not verified, and **Confirm email** by hand for someone who never got the link. The person gets a Verified badge and a notification; each action is audited; nobody can verify their own account. Separate from the reviewed, paid provider verification. API: `PATCH /api/admin/users/:id/verification`, `POST /api/admin/users/:id/confirm-email`, `GET /api/admin/users?verified=yes|no` (super administrator only). New `User` fields: `accountVerified`, `accountVerifiedAt`, `accountVerifiedBy`, `accountVerificationNote`. No migration needed. |
| Verification requests from customers and businesses | A customer or business account asks to be verified under **Get verified** (free; needs the National ID, or RDB certificate + representative's ID, uploaded first, a confirmed email and the current terms). The request goes through the same review as a provider's: every administrator and super administrator is notified; both can open the uploaded documents (each opening is audited); an administrator can **request more information**, **reject with a reason** or **recommend**; the super administrator makes the final **approve** / **reject** and can also request more information on a recommended request. The applicant sees every question and reason, and can answer or ask again after a rejection. Approval sets the same verified fields as the Users-page Verify button. API: `GET /api/verification/account/me`, `POST /api/verification/account/apply|respond`, `GET /api/admin/verification?kind=account|provider`. **Run `npm run migrate:account-verification` once** on an existing database (it replaces the old unique index on `VerificationApplication.provider`). |
| Documents and private details before a manual payment is confirmed | Administrators and the super administrator can open an applicant's uploaded documents and see their private details (name, email and whether confirmed, phone, account type, provider bio and district) from **Verification payments** (documents listed per payment, each marked Opened / Not opened) and from the application page. Before an **administrator or super administrator** can confirm a manual payment they must have opened every uploaded document themselves (`409 DOCUMENTS_NOT_OPENED` otherwise; opening is audited as `document.viewed`). Payment follow-up (finance) staff still confirm money only and never see documents or contact details. Opening an application page is audited as `verification.viewed`. The payment can also be confirmed from the application page. |
| Public layout | The public pages follow the Skill Connect layout reference, in Imbehe's own content and the four-colour palette: white header (Home, Find services, Categories, Sign in, **Create an account**); a two-column hero with a shield eyebrow, big headline, **Hire a professional** / **Offer your skills** buttons, the search bar and a **What gets checked** card; trade cards with icons; a four-step **How a job moves**; a **Have a skill?**-style call-to-action card; and a three-column footer (brand, Platform, Get started). Dashboards and sign-in pages are unchanged. |
| White layout, language, theme | Default surfaces are white (hero, dashboard sidebar, auth side panel, footer, search band); the four palette colours stay as accents. Language switcher (English, Français, Kinyarwanda) in `src/i18n` (English text is the key, `t('text', {vars})`, falls back to English), saved in localStorage and set on `<html lang>`. Light/dark toggle in `src/theme` (Tailwind `darkMode: 'class'`; the `ink` scale and page surfaces are CSS variables that flip in `.dark`; a pre-paint script in `index.html` avoids a flash). Both controls live in `components/Preferences.jsx` (public header, dashboard header, auth pages). Translated: layouts, home, login, register, forgot password, search bar, user menu, pagination, notification bell, announcement bar. Everything else is still English. Kinyarwanda needs a native-speaker review. |
| V2 Phase 1: media and categories | `POST /api/media` (field `media`): one photo (JPEG/PNG/WebP) or video (MP4/MOV/WebM). The video length is read from the file itself (`utils/videoInfo.js`) and anything over `MAX_VIDEO_SECONDS` (default 10), or whose length cannot be read, is refused. New env: `MAX_VIDEO_MB` (25), `MAX_VIDEO_SECONDS` (10). Categories gain `kind` (service/product/business; older ones read as service), `icon`, `imageUrl` (`POST /api/categories/:id/image`) and `requiredFields` (label, answer type, options, required), all editable in the admin Categories form; `GET /api/categories?kind=` filters. No migration needed. Tests: `media.test.js`, additions in `categories.test.js`. Not run (no npm here). |
| V2 Phase 2: social feed | Backend (posts, likes, comments, saves, shares, follows, feed, discovery, notifications; tests in `posts.test.js`) was already in the project and kept as is. Added the app side: `services/postApi.js`, `features/social/{PostComposer,PostCard}.jsx`, `pages/FeedPage.jsx` (tabs For you / Newest / Trending / Saved, search and #hashtag filter, load more) and `pages/PostPage.jsx` at `/dashboard/feed` and `/dashboard/feed/:id` (the links notifications already use), plus a Feed link in the dashboard menu. The composer uploads each file to `POST /api/media` (10-second videos are also checked in the browser), then creates the post with the returned ids. Likes, saves and follows apply at once and roll back if the server refuses. French and Kinyarwanda strings added. Not run (no npm here). Not yet built: profile pages at `/dashboard/people/:id` (Phase 6), so a follow notification link has no page yet. |
| V2 Phase 3: product and business listings | New `MarketListing` model (separate from service listings, which are unchanged), owned by a person or business account: kind product/business, category of the same kind, details checked against the category's required fields, photos and videos attached by `MediaAsset` id (own files, used once), price fixed/range/negotiable in whole RWF, tracked stock, contact and trade preferences (never a phone number or email), status active/inactive/sold/completed. API under `/api/market`: browse (search, type, category, district, price overlap, in stock, sort), `mine`, `compare` (2-4), create, edit (kind never changes), status, delete (removes files), and admin `takedown`/`restore` with a reason, audit entries and an owner notification (`listing.moderated`). Anyone signed in with a confirmed email can publish; staff cannot. App: `/dashboard/market` (browse and compare), `/market/new`, `/market/:id`, `/market/:id/edit`, `/market/mine`, `/market/compare`. Photos cannot be changed after publishing. Requesting a quotation on a listing comes in Phase 4. No migration needed. Tests: `market.test.js`, `marketFormat.test.js`. Not run (no npm here). |
| V2 Phase 4: requests and quotations | `ServiceRequest` gains `media` (up to 3 photos/10-second videos), `budgetNegotiable`, `allowMultiple`, `acceptedCount`, `sourceListing`, `sourcePost`; `Quotation` gains `durationDays` and `media`. New `POST /requests/:id/close`; `GET /requests/:id/quotations?sort=newest\|price\|rating\|speed` with `lowest_price`/`top_rated`/`fastest` badges. Default stays one provider per request; with `allowMultiple` each accepted quotation gets its own booking and the others wait until the customer closes the request. `Booking.request` is no longer unique: run `npm run migrate:booking-indexes` once on existing databases. | `mediaService.js`, `requestService.js`, `quotationService.js`, `migrateBookingIndexes.js`, `MediaPicker.jsx`, `RequestForm.jsx`, `QuotationForm.jsx`, `RequestDetailPage.jsx` |
| V2 Phase 5: messaging | New models `Conversation` (one per pair of accounts, optional subject: listing, request or post), `Message`, `Block`; notification type `message.new` (one unread notification per conversation). Endpoints under `/api/messages` (`GET /unread`, `GET/POST /conversations`, `GET /conversations/:id`, `POST /conversations/:id/messages`, `POST/DELETE /blocks/:id`). Contact privacy: phone numbers, emails and chat-app handles are refused until a booking exists between the two people. Staff accounts cannot be messaged. The app polls every 8 seconds (no websocket). Needs no migration. | `messageService.js`, `Conversation.js`, `Message.js`, `Block.js`, `messageRoutes.js`, `MessagesPage.jsx`, `MessageButton.jsx` |
| V2 Phase 6: profiles and business pages | New public `GET /api/profiles/:id` (person, provider or business): name, type, verified badge, follower counts, post and listing counts, and, only when public elsewhere, provider details (verified providers only, like the directory) and company details (name, industry, description, website, district). Never returns phone, email, registration number, contact person or documents. Staff and suspended accounts are not found. App: new page `/dashboard/people/:id` with Posts, Listings and About tabs, Follow and Message buttons; names on posts, listings and messages now link to it. No new models, no migration. | `profileService.js`, `profileRoutes.js`, `ProfilePage.jsx`, `profileApi.js` |
| V2 Phase 7: moderation | New model `Report` (post, comment, listing, private message or account; one report per person per item; snapshot of what was reported). `Message` gains `removed`; notification types `report.resolved`, `moderation.notice`. Endpoints: `POST /api/reports` (any verified member), admin-only `GET /api/admin/moderation/reports?status=&targetType=` and `POST /api/admin/moderation/reports/:id/resolve` with `dismiss`, `warn` or `remove` (a note is required for the last two). Removing takes the content down (post and comment status, listing takedown, message hidden), closes every open report on the same item, tells the owner and the reporters, and is audited. Accounts cannot be removed from reports: suspend them on the Users page. A private message is visible to staff only as the reported snapshot. No automatic hiding. App: Report links on posts, comments, listings, profiles and received messages; admin page "Reports". No migration. | `reportService.js`, `Report.js`, `reportRoutes.js`, `ReportButton.jsx`, `AdminModerationPage.jsx` |
| V2 Phase 8: hardening | Customer public pages need sign-in; `npm run cleanup:media` removes unused uploads; `.env.example` lists `MAX_VIDEO_MB`, `MAX_VIDEO_SECONDS`, `SOCIAL_RATE_LIMIT_MAX`. Full handover in `HANDOVER-V2.md`. | `profileService.js`, `cleanupUnusedMedia.js`, `HANDOVER-V2.md` |
| V2 follow-ups | Live messages (SSE), marketplace category filters and saved listings, moderator summary, message button on quotation cards, and translations: shared components (`Button`, `Field`, `PageHeader`, `Alert`, `EmptyState`, `Badge`, `Dialog`) now translate their text props automatically, static page text is wrapped in `<Tx>`, and French and Kinyarwanda gained about 800 phrases (1,159 total). | `i18n/*`, `components/Tx.jsx`, `components/ui/*`, `realtime.js`, `useMessageStream.js` |
| Announcements | The super administrator publishes short messages (max 200 characters, optional link and end time) under **Announcements**. Active, unexpired ones scroll in a bar at the top of every page (public, sign-in and dashboard). The bar pauses on hover/focus and with a Pause button, and does not move when the visitor has "reduce motion" on. API: `GET /api/announcements` (public), `GET /api/announcements/manage`, `POST /api/announcements`, `PUT|DELETE /api/announcements/:id` (super administrator only, audited). |

## API added
`GET /api/verification/fee|me`, `POST /api/verification/apply|payment|payment/cancel|respond`, `GET|POST /api/documents`, `GET /api/documents/:id/file`,
`GET /api/terms`, `GET /api/terms/status`, `POST /api/terms/accept`, `GET /api/contracts/by-booking/:id`, `GET /api/contracts/:id`, `POST /api/contracts/:id/accept|propose`,
`GET /api/reviews/mine`, and under `/api/admin`: `verification*`, `verification-payments*`, `ratings/providers*`, `verification-recommendations*`, `contracts`, `terms`, `settings/verification-fee`.
All are listed in the OpenAPI document.

## Database migration
Run once after deploying (idempotent, deletes nothing):
```
cd backend && npm run migrate:verification-upgrade
```
- Providers already "pending"/"needs_info" get an application with the fee **waived**, so they are not blocked.
- Every existing job gets a contract (marked legacy). Jobs already started/completed are marked accepted and their provider acceptance is back-filled, so contact details stay visible; jobs still waiting to start get a pending contract both sides must accept.
- Providers get `providerType: individual` where missing.
- Nobody's verified status changes. Existing users are asked to accept the terms (and upload documents) the next time they act.
New collections: `userdocuments`, `termsdocuments`, `termsacceptances`, `verificationapplications`, `verificationpayments`, `verificationrecommendations`, `contracts`. New fields: `ProviderProfile.providerType`, `Booking.providerAcceptedAt`.

## Environment variables (backend)
| Variable | Default | Meaning |
|---|---|---|
| `MAX_DOCUMENT_MB` | 8 | Largest identity document |
| `PRIVATE_UPLOAD_DIR` | `private-uploads` | Private document folder (never served statically; add to backups, not to a web root) |
| `S3_PRIVATE_BUCKET` | none | **Required in production with `STORAGE_PROVIDER=s3`**: a non-public, encrypted bucket for documents |
Existing: `PAYMENT_GATEWAY`, `PAYMENT_WEBHOOK_SECRET`, `PAYMENT_MANUAL_INSTRUCTIONS` are reused for the verification fee.

## First-time setup after deploying
1. Run the migration. 2. Log in as super admin → **Verification fee**: publish the fee (providers cannot apply until you do). 3. Optionally review/publish your own **Terms & Conditions** (a built-in first version is used until you do).

## Testing
```
cd backend  && npm test     # new: verification, documents, terms, contracts, contactPrivacy, ratingsAdmin
cd frontend && npm test     # new: ContractPanel, TermsGate, VerificationPage, AdminVerificationDetailPage, DocumentsPage, GuestOnly
```
Existing tests were updated where the rules changed on purpose: provider verification (admins can no longer approve directly), booking contact reveal, and the admin providers page.

## Honest limitations
- **Mobile Money and card payments:** the platform ships the manual gateway (money paid outside the app and confirmed by staff with a reference) and the dev sandbox. A live MoMo or card processor needs merchant credentials and a gateway module (see `backend/src/services/payments/index.js`); it plugs into the same webhook path, which already verifies signatures, checks the amount and ignores replays, for verification fees too. Until then Mobile Money, cards and bank transfer are recorded as the chosen method and confirmed by staff.
- The code was written without being able to install dependencies or run the test suites in the authoring environment (backend files were syntax-checked with Node). Run both test suites before deploying.

## Files
### New (backend)
- `backend/src/controllers/partnerController.js`
- `backend/src/controllers/verificationController.js`
- `backend/src/middleware/requirements.js`
- `backend/src/models/Contract.js`
- `backend/src/models/Partner.js`
- `backend/src/models/TermsAcceptance.js`
- `backend/src/models/TermsDocument.js`
- `backend/src/models/UserDocument.js`
- `backend/src/models/VerificationApplication.js`
- `backend/src/models/VerificationPayment.js`
- `backend/src/models/VerificationRecommendation.js`
- `backend/src/routes/contractRoutes.js`
- `backend/src/routes/documentRoutes.js`
- `backend/src/routes/partnerRoutes.js`
- `backend/src/routes/ratingHistoryRoutes.js`
- `backend/src/routes/termsRoutes.js`
- `backend/src/routes/verificationRoutes.js`
- `backend/src/scripts/migrateVerificationUpgrade.js`
- `backend/src/services/contractService.js`
- `backend/src/services/contractTemplate.js`
- `backend/src/services/documentService.js`
- `backend/src/services/partnerService.js`
- `backend/src/services/ratingsAdminService.js`
- `backend/src/services/termsDefaults.js`
- `backend/src/services/termsService.js`
- `backend/src/services/verificationService.js`
- `backend/src/tests/contactPrivacy.test.js`
- `backend/src/tests/contracts.test.js`
- `backend/src/tests/documents.test.js`
- `backend/src/tests/partners.test.js`
- `backend/src/tests/ranking.test.js`
- `backend/src/tests/ratingsAdmin.test.js`
- `backend/src/tests/terms.test.js`
- `backend/src/tests/verification.test.js`
- `backend/src/utils/ranking.js`
- `backend/src/validators/partnerValidators.js`
- `backend/src/validators/verificationValidators.js`
### Changed (backend)
- `backend/.env.example`
- `backend/.gitignore`
- `backend/package.json`
- `backend/src/config/env.js`
- `backend/src/docs/summaries.js`
- `backend/src/middleware/upload.js`
- `backend/src/models/Booking.js`
- `backend/src/models/Notification.js`
- `backend/src/models/ProviderProfile.js`
- `backend/src/routes/adminRoutes.js`
- `backend/src/routes/index.js`
- `backend/src/routes/listingRoutes.js`
- `backend/src/routes/providerRoutes.js`
- `backend/src/routes/requestRoutes.js`
- `backend/src/services/bookingService.js`
- `backend/src/services/listingService.js`
- `backend/src/services/paymentService.js`
- `backend/src/services/providerService.js`
- `backend/src/services/reviewService.js`
- `backend/src/services/settingsService.js`
- `backend/src/services/storage/index.js`
- `backend/src/services/storage/localDriver.js`
- `backend/src/services/storage/s3Driver.js`
- `backend/src/tests/env.js`
- `backend/src/tests/helpers.js`
- `backend/src/tests/providers.test.js`
- `backend/src/tests/setup.js`
- `backend/src/utils/imageType.js`
- `backend/src/validators/listingValidators.js`
- `backend/src/validators/providerValidators.js`
### New (frontend)
- `frontend/src/components/DocumentPreview.jsx`
- `frontend/src/components/PartnersStrip.jsx`
- `frontend/src/components/TermsGate.jsx`
- `frontend/src/components/TermsGate.test.jsx`
- `frontend/src/features/contracts`
- `frontend/src/features/requests/QuickRequest.jsx`
- `frontend/src/features/requests/QuickRequest.test.jsx`
- `frontend/src/features/verification`
- `frontend/src/pages/DocumentsPage.jsx`
- `frontend/src/pages/DocumentsPage.test.jsx`
- `frontend/src/pages/RatingHistoryPage.jsx`
- `frontend/src/pages/admin/AdminContractsPage.jsx`
- `frontend/src/pages/admin/AdminRatingsPage.jsx`
- `frontend/src/pages/admin/AdminVerificationDetailPage.jsx`
- `frontend/src/pages/admin/AdminVerificationDetailPage.test.jsx`
- `frontend/src/pages/admin/AdminVerificationPage.jsx`
- `frontend/src/pages/admin/AdminVerificationPaymentsPage.jsx`
- `frontend/src/pages/provider/VerificationPage.jsx`
- `frontend/src/pages/provider/VerificationPage.test.jsx`
- `frontend/src/pages/super/PartnersPage.jsx`
- `frontend/src/pages/super/RecommendationsPage.jsx`
- `frontend/src/pages/super/TermsAdminPage.jsx`
- `frontend/src/pages/super/VerificationFeePage.jsx`
- `frontend/src/routes/GuestOnly.jsx`
- `frontend/src/routes/GuestOnly.test.jsx`
- `frontend/src/services/partnerApi.js`
- `frontend/src/services/verificationApi.js`
### Changed (frontend)
- `frontend/index.html`
- `frontend/src/components/Icon.jsx`
- `frontend/src/components/Logo.jsx`
- `frontend/src/components/UserMenu.jsx`
- `frontend/src/components/UserMenu.test.jsx`
- `frontend/src/components/ui/Button.jsx`
- `frontend/src/components/ui/StarInput.jsx`
- `frontend/src/features/admin/AdminDashboard.jsx`
- `frontend/src/features/bookings/BookingTimeline.jsx`
- `frontend/src/features/providers/ProfileForm.jsx`
- `frontend/src/features/reviews/BookingReviewPanel.jsx`
- `frontend/src/index.css`
- `frontend/src/layouts/DashboardLayout.jsx`
- `frontend/src/layouts/DashboardLayout.test.jsx`
- `frontend/src/layouts/PublicLayout.jsx`
- `frontend/src/pages/CategoriesPage.jsx`
- `frontend/src/pages/DashboardPage.jsx`
- `frontend/src/pages/ErrorPage.jsx`
- `frontend/src/pages/ForgotPasswordPage.jsx`
- `frontend/src/pages/HomePage.jsx`
- `frontend/src/pages/HomePage.test.jsx`
- `frontend/src/pages/LoginPage.jsx`
- `frontend/src/pages/LoginPage.test.jsx`
- `frontend/src/pages/NotFoundPage.jsx`
- `frontend/src/pages/NotificationsPage.jsx`
- `frontend/src/pages/ProviderProfilePage.jsx`
- `frontend/src/pages/RegisterPage.jsx`
- `frontend/src/pages/ResetPasswordPage.jsx`
- `frontend/src/pages/SearchPage.jsx`
- `frontend/src/pages/ServiceDetailsPage.jsx`
- `frontend/src/pages/VerifyEmailPage.jsx`
- `frontend/src/pages/admin/AdminProvidersPage.jsx`
- `frontend/src/pages/admin/AdminProvidersPage.test.jsx`
- `frontend/src/pages/admin/AdminReportsPage.jsx`
- `frontend/src/pages/bookings/BookingDetailPage.jsx`
- `frontend/src/pages/disputes/DisputePage.jsx`
- `frontend/src/pages/provider/MyServicesPage.jsx`
- `frontend/src/pages/provider/ServiceEditorPage.jsx`
- `frontend/src/pages/requests/NewRequestPage.jsx`
- `frontend/src/routes/ProtectedRoute.jsx`
- `frontend/src/routes/index.jsx`
- `frontend/src/utils/constants.js`
- `frontend/tailwind.config.js`
### Other
- `REDESIGN-NOTES.md`

## Gap-filling pass (login, photos, notifications, profiles, discovery)

| Area | Behaviour |
|---|---|
| Login | New banner + card layout. One box for email **or** Rwandan mobile number (`POST /api/auth/login` accepts `{ email }` or `{ phone }`; a phone shared by two accounts cannot sign in). |
| Profile picture and cover | Every account (customer, provider, business, staff) has a picture and a cover image: `POST/DELETE /api/auth/me/avatar` and `/api/auth/me/cover`. A provider's public photo follows the account picture. New `User` fields `avatarKey/avatarUrl/coverKey/coverUrl`. |
| Bio and district | `PATCH /api/auth/me` also takes `bio` (500 chars) and `district`; both show on the public profile with the cover. New `User` fields `bio`, `district`. |
| Notifications | Quotation, message and other alerts are separate: `GET /api/notifications/unread-count` returns `{ unreadCount, byCategory }`; `GET /api/notifications?category=quotation|message|general`; `POST /api/notifications/read-all` takes an optional `{ category }`. Three header icons and four tabs on the page. |
| Post ↔ listing | A post can carry `listingId` (your own active listing). The card shows **View product/business** and **Request a quotation**; a sold, switched-off or taken-down listing stops being offered. New `Post.listing` field. |
| Post category and location | The composer takes a category and district; the feed filters by both. |
| Discovery | `GET /api/discover` (public) and `/dashboard/discover`: trending products and businesses (most saved in 30 days), popular businesses (most followers), top-rated verified providers, and, only for a verified provider, open requests that match their services. A customer's request is never shown to people who could not already open it. |

No migration is needed: all new fields are optional.

## Super admin adverts on the home page

The super administrator can publish picture adverts (`/dashboard/super/adverts`) that appear near the top of the welcome page for everyone, each labelled "Advert". Fields: title, optional short text and link, picture, order, optional end time, shown/hidden. Endpoints: `GET /api/adverts` (public: active, not ended), `GET /api/adverts/manage`, `POST /api/adverts`, `PUT /api/adverts/:id`, `POST /api/adverts/:id/image`, `DELETE /api/adverts/:id` (super administrator only, audited). New model `Advert`; no migration. Scrolling text announcements and the partners strip are unchanged.

## Home page layout (visitors)

The hero is now three columns, as in the design sketch: headline + search on the left, a tall rounded **showcase panel** of pictures and short videos posted by verified people in the middle, and the **What gets checked** card on the right. The showcase comes from `GET /api/posts/showcase` (public; popular recent posts with media from verified providers or verified accounts; no contact details; suspended authors excluded). It rotates every six seconds, pauses on hover/focus and when the device asks for reduced motion, and the hero falls back to two columns when there are no such posts yet. The hero's category chips were removed because the trade cards sit directly below. Trade cards, "How a job moves", partners, the provider call-to-action and the footer are unchanged.
