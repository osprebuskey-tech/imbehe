# Imbehe V2 handover

Imbehe is now a social-media-driven marketplace on top of the existing service marketplace. Nothing was rebuilt: every earlier
feature (requests, quotations, bookings, contracts, payments, disputes, ratings, verification, announcements) still works, and the
new features were added in eight phases. The current palette was kept (not the brief's), as decided at the start.

> **Not run in the build environment.** The sandbox could not install npm packages, so every file was syntax-checked only. Run the
> tests (below) and click through the app before releasing.

## 1. How to install and test

```
cd backend  && npm install && npm test        # jest; uses an in-memory MongoDB (downloads a MongoDB binary on first run)
cd frontend && npm install && npm test        # vitest
```

Run these once on an existing database (both are safe to repeat):

| Command (in `backend/`) | Why |
|---|---|
| `npm run migrate:booking-indexes` | Drops the old unique index on `Booking.request` so one request can produce several jobs (Phase 4). |
| `npm run migrate:account-verification` | From the earlier account-verification work, if not yet run. |
| `npm run cleanup:media` | Not a migration: deletes uploads never attached to anything (default older than 24 h; `-- --dry-run`, `-- --hours=72`). Run daily. |

Manual check list: sign up two members, post a photo and a 10-second video, try an 11-second video (refused), follow, like, comment,
create a listing, request a quotation from it, send two quotations, accept one (then try "more than one provider"), message
(a phone number must be refused before a job exists), report a post, resolve it as admin, open a profile.

## 2. Phases and what each added

| Phase | Added |
|---|---|
| 1 Media and categories | Photo/short-video upload (`POST /api/media`), video length read from the file itself, category kinds (service, product, business), category image, per-category required fields. |
| 2 Posts and feed | Posts with media and hashtags, likes, comments, saves, shares, follows, personal feed, discovery. |
| 3 Marketplace listings | Product, service and business listings with category-specific details, price (fixed, range, negotiable), stock, status, compare view, admin takedown/restore. |
| 4 Requests and quotations | Photos/video on requests and quotations, negotiable budget, days needed, sorting and badges, one provider (default) or several, close request, start from a listing or post. |
| 5 Messaging | Private conversations, optional subject, unread counts, blocking, contact-detail privacy until a job exists. |
| 6 Profiles | Public page for people, providers and businesses. |
| 7 Moderation | Reports on posts, comments, listings, messages and accounts; admin queue; dismiss, warn, remove. |
| 8 Hardening | Review of the new code (section 6), media cleanup script, environment variables, this document. |
| Follow-ups | Live messages over server-sent events (`GET /api/messages/stream`, no extra package, falls back to slow polling); marketplace filters by each category's own fields (`d[field]=...`) and saved listings (`/market/saved`); moderator dashboard (`GET /admin/moderation/summary`); "Ask a question or negotiate" button on quotation cards; French and Kinyarwanda for the inner pages. |

## 3. New and changed data models (MongoDB)

New: `MediaAsset`, `Post`, `PostComment`, `PostLike`, `PostSave`, `Follow`, `MarketListing`, `Conversation`, `Message`, `Block`, `Report`.

Changed:
- `ServiceCategory`: `kind`, `icon`, `imageUrl`/`imageKey`, `requiredFields`. Older categories read as `service`.
- `ServiceRequest`: `media`, `budgetNegotiable`, `allowMultiple`, `acceptedCount`, `sourceListing`, `sourcePost`.
- `Quotation`: `durationDays`, `media`.
- `Booking`: `request` index is no longer unique (needs the migration above). The unique index on `quotation` stays.
- `Notification`: new types `post.liked`, `post.commented`, `follow.new`, `listing.moderated`, `message.new`, `report.resolved`, `moderation.notice`.
- `Message`: `removed` flag (moderation).

## 4. New endpoints (all under `/api`; each has an OpenAPI summary in `docs/summaries.js`)

- Media: `POST /media`.
- Categories: `GET /categories?kind=`, `POST /categories/:id/image` (admin).
- Posts: `GET /posts`, `/posts/feed`, `/posts/saved`, `POST /posts`, `GET|PUT|DELETE /posts/:id`, `POST|DELETE /posts/:id/like`, `/save`, `POST /posts/:id/share`, `GET|POST /posts/:id/comments`, `DELETE /posts/:id/comments/:commentId`.
- Follows: `POST|DELETE /follows/:id`, `GET /follows/:id/stats`, `/followers`, `/following`.
- Marketplace: `GET /market`, `/market/mine`, `/market/compare`, `POST /market`, `GET|PUT|DELETE /market/:id`, `PATCH /market/:id/status`, `POST /market/:id/takedown` and `/restore` (admin).
- Requests: `POST /requests/:id/close`; `GET /requests/:id/quotations?sort=newest|price|rating|speed`; create accepts `mediaIds`, `budgetNegotiable`, `allowMultiple`, `fromListing`, `fromPost`.
- Messages: `GET /messages/unread`, `GET|POST /messages/conversations`, `GET /messages/conversations/:id`, `POST /messages/conversations/:id/messages`, `POST|DELETE /messages/blocks/:id`.
- Profiles: `GET /profiles/:id`.
- Reports: `POST /reports`; admin `GET /admin/moderation/reports`, `POST /admin/moderation/reports/:id/resolve`.

## 5. Environment variables added

| Variable | Default | Meaning |
|---|---|---|
| `MAX_VIDEO_MB` | 25 | Largest video upload. |
| `MAX_VIDEO_SECONDS` | 10 | Longest video, read from the file (MP4/MOV/WebM). Unreadable length is refused. |
| `SOCIAL_RATE_LIMIT_MAX` | 300 | Likes, comments, follows, saves, posts, messages and reports per person per 15 minutes. |

Existing storage settings (`STORAGE_PROVIDER`, S3 values) apply to the new media too.

## 6. Security and performance review

Checked, no change needed: search text is escaped before use in a regular expression; every new request body is validated with
strict schemas (unknown fields refused); media attaches only by id, only if the person owns it and it is unused; chats are visible
only to their two members (others get 404); messages cannot be sent to staff; reports reveal a private message only to its recipient
and to staff as a snapshot; all new write routes require a verified email and are rate limited; new collections have indexes for
their queries (feed, thread, inbox, queue).

Fixed in this phase: a customer's public page could be opened by anyone who knew the id. It now needs sign-in; providers and
businesses stay public. Added the media cleanup script so abandoned uploads do not pile up.

## 7. Known limits and suggestions

- No automated test has been run. Kinyarwanda and French need a native review (the Kinyarwanda was written without a native check).
- Translations cover the fixed text of the app (about 1,160 phrases): headers, buttons, form labels, messages, dialogs. Still English: sentences built from values (for example amounts, names and dates inside a sentence), error messages that come from the API, and text that members write themselves. To translate a new phrase, add it to `frontend/src/i18n/fr.js` and `rw.js` and write it with `t('...')` or `<Tx>...</Tx>`.
- Live messages keep connections in the memory of one server process. With more than one server instance, put a shared channel such as Redis pub/sub behind `publish()` in `backend/src/utils/realtime.js`; until then a message reaches the recipient on the slow 30-second refresh.
- Contact-detail detection (digits, emails, WhatsApp/Telegram) is a reasonable filter, not a guarantee: people can write numbers in words.
- Businesses without a provider profile cannot send quotations.
- Video length is read from MP4/MOV/WebM headers; other containers are refused. No transcoding or thumbnails.
- No automatic hiding after many reports (deliberate, to avoid abuse); no appeals flow for removed content.
- Natural next steps: an appeals flow for removed content, thumbnails and video conversion, and Redis behind live messages.
