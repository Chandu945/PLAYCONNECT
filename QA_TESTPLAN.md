# Academyflo — End-to-End Manual QA Test Plan

**Target:** Pre-production sign-off
**Environment:** Local (`docker-compose` + `npm run dev` for web apps + `npm run web` for mobile)
**Mobile fallback:** Android physical device for FCM/push/native Cashfree
**Data state:** Fresh DB seeded via `scripts/seed-dev.mjs` then `seed-expand.mjs`

> Mark each box `[x]` when verified. Record the actual result in the **Notes** column. Any FAIL blocks production deploy.

---

## Legend

- **PRE** = preconditions before this phase starts
- **STEP** = numbered action you perform
- **EXP** = what must happen for PASS
- **BREAK-IT** = adversarial / edge cases that must NOT crash the app

---

## Phase 0 — Pre-flight setup

### 0.1 Local services up

- [ ] **STEP** Start infra: `docker-compose up -d mongo redis` (verify with `docker ps`)
- [ ] **STEP** Confirm Mongo reachable: `mongosh mongodb://localhost:27017` → connects
- [ ] **STEP** Confirm Redis reachable: `redis-cli ping` → `PONG`
- [ ] **STEP** Copy `.env.example` → `.env` in repo root AND in `apps/api/`. Fill: `MONGODB_URI`, `REDIS_URL`, `JWT_SECRET`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `CLOUDINARY_*` (sandbox keys), Cashfree sandbox keys, SMTP (use Mailtrap/Ethereal)
- [ ] **STEP** Set kill-switches OFF for first pass: `PARENT_ONLINE_PAYMENTS_ENABLED=false`, `FEE_REMINDER_ENABLED=false` — we'll flip them per-phase
- [ ] **STEP** `npm install` at repo root completes without error
- [ ] **EXP** No missing peer deps; no native build failures

### 0.2 Start all four apps

Run each in a separate terminal:

- [ ] `npm run start:dev --workspace=@academyflo/api` → starts on `http://localhost:3001`
- [ ] `npm run dev --workspace=@academyflo/admin-web` → starts on `http://localhost:3002`
- [ ] `npm run dev --workspace=@academyflo/user-web` → starts on `http://localhost:3003`
- [ ] `npm run web --workspace=@academyflo/mobile` → webpack dev server (note the port printed)
- [ ] **EXP** All four URLs respond; api logs show `Nest application successfully started`

### 0.3 Health check sweep

- [ ] `curl http://localhost:3001/api/v1/health/liveness` → 200, `{ status: "ok" }`
- [ ] `curl http://localhost:3001/api/v1/health/readiness` → 200, includes Mongo + Redis status `up`
- [ ] **BREAK-IT** Stop Redis (`docker stop <redis>`) → readiness returns 503 with redis down; API itself still serves (graceful degradation). Restart Redis.
- [ ] **BREAK-IT** Stop Mongo → readiness 503; restart Mongo before continuing.

### 0.4 Seed data

- [ ] `node scripts/seed-dev.mjs` runs to completion → prints summary (owner + staff + batches + students + attendance)
- [ ] `SEED_MONGODB_URI=mongodb://localhost:27017/academyflo_dev node scripts/seed-expand.mjs` → adds 6 months data
- [ ] Verify in Mongo: `db.users.countDocuments({})`, `db.students.countDocuments({})`, `db.feedues.countDocuments({})` — non-zero
- [ ] **EXP** Seed-dev creates a known **Owner** account (note email/password from script output) and a Super Admin from env

### 0.5 Test accounts table (record here)

| Role | Email | Password | Notes |
|---|---|---|---|
| Super Admin | (from `.env` `SUPER_ADMIN_EMAIL`) | | |
| Owner | (from seed-dev output) | | |
| Staff | (from seed-dev output) | | |
| Parent | (created later in Phase 5) | | |

---

## Phase 1 — Super Admin (admin-web @ :3002)

### 1.1 Login

- [ ] Visit `http://localhost:3002/login`
- [ ] **STEP** Login with super admin creds
- [ ] **EXP** Redirect to dashboard. Refresh page → still logged in (JWT persisted)
- [ ] **BREAK-IT** Wrong password 6 times → rate-limited (429 or lockout). Wait/cooldown → can retry
- [ ] **BREAK-IT** Manually edit localStorage JWT to garbage → next API call returns 401, redirect to login
- [ ] **BREAK-IT** Use staff/owner creds on admin-web → rejected with role error

### 1.2 Academies list & creation

- [ ] Navigate to Academies list — seeded academy visible
- [ ] **STEP** Create a NEW academy "QA Test Academy 1" with owner email `qa.owner1@test.local`
- [ ] **EXP** Academy created, owner invite email sent (check Mailtrap inbox), academy appears in list
- [ ] **STEP** Click into the academy → details page shows owner, student count (0), staff count (0), subscription status `TRIAL`, trial end date
- [ ] **BREAK-IT** Create academy with the same name → either allowed (multi-tenant) or 409; document behavior
- [ ] **BREAK-IT** Create academy with invalid email/empty name → form-level validation error, no 500

### 1.3 User admin (cross-tenant)

- [ ] Navigate to Users → list shows users across all academies with academy column
- [ ] **STEP** Filter by role = OWNER, by academy → list narrows correctly
- [ ] **STEP** Suspend a user → user status flips to SUSPENDED
- [ ] **EXP** That user can no longer log in (test in user-web in a new incognito window — error message clear, not a stack trace)
- [ ] **STEP** Re-activate user → can log in again

### 1.4 Revenue dashboard

- [ ] Navigate to Revenue → shows MRR/ARR cards, per-academy revenue, per-tier breakdown
- [ ] **EXP** Numbers match `db.subscriptionpayments` aggregations; charts render without console errors
- [ ] **BREAK-IT** Date range with no data (e.g. year 2020) → empty state shown, no NaN/Infinity

### 1.5 Admin payments / Cashfree reconciliation view

- [ ] Navigate to Payments admin → list of payment requests across academies
- [ ] **EXP** Filters work (status, academy, date range)
- [ ] **STEP** Click a SUCCESS payment → shows order ID, amount, fee, net, gateway response

### 1.6 Admin audit

- [ ] Navigate to Audit log → recent admin actions (academy create, user suspend) appear with actor, timestamp, IP
- [ ] **EXP** Filter by entity type / actor works
- [ ] **STEP** Click an entry → before/after diff visible

### 1.7 Logout & session

- [ ] Logout → redirect to /login; back button doesn't reveal protected page
- [ ] Token revoked: re-using captured JWT via curl → 401

---

## Phase 2 — Owner: academy onboarding (user-web @ :3003)

### 2.1 Accept owner invite (email link)

- [ ] **PRE** Use the invite email from Mailtrap for `qa.owner1@test.local`
- [ ] **STEP** Click invite link → lands on set-password page with token in URL
- [ ] **STEP** Set password (min length, complexity rules per `.env`); confirm
- [ ] **EXP** Auto-login to onboarding wizard
- [ ] **BREAK-IT** Reuse the same invite link after acceptance → "expired/used" message, not 500
- [ ] **BREAK-IT** Tamper with token in URL → invalid token error

### 2.2 Onboarding wizard

Walk through every step:

- [ ] Academy details: name (pre-filled), city, timezone (defaults to Asia/Kolkata), logo upload
- [ ] **EXP** Logo uploaded via Cloudinary, preview shown; URL persisted on academy
- [ ] **BREAK-IT** Upload a 20MB PNG → rejected with size error (limit per `.env`)
- [ ] **BREAK-IT** Upload `.exe` renamed to `.png` → rejected by content-type sniff
- [ ] Settings: receipt prefix, fiscal year start, default fee due date
- [ ] Skip → can resume onboarding later (`onboarded: false`)
- [ ] Complete → `onboarded: true`, redirect to dashboard

### 2.3 Dashboard (Owner home)

- [ ] Dashboard widgets render: today's attendance, fees due this week, pending payments, recent activity
- [ ] All widgets handle empty state (new academy with no data)
- [ ] No console errors; all images load

---

## Phase 3 — Staff management

### 3.1 Create staff

- [ ] Navigate to Staff → "Add Staff"
- [ ] **STEP** Fill: name, phone (E.164), email, WhatsApp number, role (STAFF), profile photo, start date, gender
- [ ] **EXP** Staff created; email invite sent (check Mailtrap)
- [ ] **BREAK-IT** Same phone in same academy → 409 conflict, friendly error
- [ ] **BREAK-IT** Same phone in DIFFERENT academy → allowed (multi-tenant isolation) — verify by switching to seeded academy and checking
- [ ] **BREAK-IT** Invalid phone (no +country code) → validation error
- [ ] **BREAK-IT** Empty required field → field-level error, submit disabled

### 3.2 Staff invite acceptance

- [ ] Open staff invite link → set password → login
- [ ] **EXP** Staff lands on staff dashboard with reduced nav (no admin sections)

### 3.3 Staff edit & deactivate

- [ ] Edit staff fields → saved, audit log entry created
- [ ] Deactivate staff → status INACTIVE, cannot login; reactivate restores access
- [ ] Profile photo change → old URL replaced, no orphaned Cloudinary asset (check Cloudinary dashboard)

---

## Phase 4 — Batches

### 4.1 Create batch

- [ ] Navigate to Batches → "Add Batch"
- [ ] **STEP** Fill name, branch code, capacity
- [ ] **EXP** Batch listed; can edit and delete (only if no students assigned)
- [ ] **BREAK-IT** Delete batch WITH assigned students → 409 with reason, not 500
- [ ] **BREAK-IT** Capacity = 0 or negative → validation error
- [ ] **BREAK-IT** Duplicate name → 409 or silently allowed per spec (document)

---

## Phase 5 — Students & Parents

### 5.1 Create student (manual)

- [ ] Navigate to Students → "Add Student"
- [ ] **STEP** Fill: name, roll number, phone, email, gender, batch, parent details (name, phone, email)
- [ ] **EXP** Student created; parent auto-created via `ParentStudentLink`; parent receives invite email
- [ ] **BREAK-IT** Roll number duplicate in same batch → 409
- [ ] **BREAK-IT** Same parent email for multiple students → second student LINKS to existing parent (multi-student parent); verify in `parentstudentlinks`
- [ ] **BREAK-IT** Parent phone same as a staff phone → allowed (different roles), document

### 5.2 Bulk import students (if feature exists)

- [ ] Download CSV template
- [ ] Upload CSV with 50 rows (mix of valid + 3 intentional errors: bad phone, missing name, duplicate roll)
- [ ] **EXP** Valid rows imported; invalid rows reported with row numbers; partial-success path works
- [ ] **BREAK-IT** Upload empty CSV → friendly error
- [ ] **BREAK-IT** Upload CSV with 5000 rows → either accepted with progress, or rejected with size limit message — not a timeout

### 5.3 Parent accepts invite & logs in

- [ ] Open parent invite link → set password → login on user-web
- [ ] **EXP** Parent dashboard shows linked student(s) only
- [ ] **BREAK-IT** Parent with no linked students → empty-state page, not a crash

### 5.4 Edit/transfer student

- [ ] Transfer student to a different batch → success; audit log captures it
- [ ] Mark student INACTIVE → student hidden from active rosters but historical records (attendance, fees) preserved
- [ ] **BREAK-IT** Make student inactive then try to record attendance → blocked with clear error

---

## Phase 6 — Attendance

### 6.1 Student attendance (Staff/Owner)

- [ ] Navigate to Attendance → today's date, select a batch
- [ ] **STEP** Mark each student PRESENT / ABSENT / LEAVE; save
- [ ] **EXP** Saved; refresh page → values persist
- [ ] **STEP** Re-edit and change a status → audit log records change
- [ ] **BREAK-IT** Try to mark attendance for a future date → either blocked or allowed-with-warning; document
- [ ] **BREAK-IT** Try to mark attendance for a holiday → either blocked (holiday in `Holiday`) or allowed; document
- [ ] **BREAK-IT** Two staff members mark same batch same day concurrently (open two browsers) → last write wins OR optimistic-lock error; no half-save corruption

### 6.2 Absence → parent notification (1h delay)

- [ ] Mark a student ABSENT
- [ ] **EXP** No immediate parent notification
- [ ] **STEP** Wait `ABSENCE_NOTIFY_DELAY_MS` (default 1h) OR temporarily set to 60s in `.env`, restart api
- [ ] **EXP** Parent receives push + email about absence with deeplink
- [ ] **STEP** Within the delay window, CHANGE absent → present
- [ ] **EXP** Notification cancelled; parent does NOT receive absence alert

### 6.3 Staff attendance (self check-in)

- [ ] Login as staff → check-in
- [ ] **EXP** `staffattendances` record created with `checkIn` timestamp
- [ ] Check-out → `checkOut` timestamp added
- [ ] **BREAK-IT** Double check-in same day → either updates or blocks; document
- [ ] **BREAK-IT** Check-out without check-in → blocked with friendly error

### 6.4 Holidays

- [ ] Create holiday for tomorrow → tomorrow's attendance UI shows holiday banner
- [ ] Delete holiday → banner gone

### 6.5 Attendance reports

- [ ] Generate attendance report for a month → PDF/CSV download
- [ ] **EXP** Numbers match Mongo aggregation
- [ ] **BREAK-IT** Empty range → empty report, not crash

---

## Phase 7 — Fees

### 7.1 Create fee due (single)

- [ ] Navigate to Fees → "Create Fee Due"
- [ ] **STEP** Select student, amount, due date (future), grace period
- [ ] **EXP** Fee due appears in PENDING status; appears in parent's view too
- [ ] **BREAK-IT** Amount = 0 or negative → validation error
- [ ] **BREAK-IT** Due date in past → either allowed (back-dated) or blocked; document

### 7.2 Bulk fee creation (per batch)

- [ ] Create fees for an entire batch in one go
- [ ] **EXP** N fees created, all visible

### 7.3 Late fee accrual

- [ ] **PRE** Set a fee due date to yesterday, grace period 0
- [ ] **STEP** Wait for late-fee cron OR trigger manually via dev endpoint
- [ ] **EXP** Late fee added per `computeLateFee()` rule; fee status PENDING with `lateFeeAmount > 0`
- [ ] **BREAK-IT** Late fee shouldn't double-charge if cron runs twice (idempotency) — check `db.feedues.findOne()` history field

### 7.4 Offline payment recording

- [ ] **STEP** Owner records offline payment (cash) against a fee → enter amount, mode, receipt#
- [ ] **EXP** `FeePayment` created with `paidSource: OFFLINE`; fee status updates to PARTIAL or PAID
- [ ] **EXP** Receipt PDF generated with the configured receipt prefix; downloadable
- [ ] **BREAK-IT** Amount > balance → rejected
- [ ] **BREAK-IT** Mark fully paid twice → second attempt blocked

### 7.5 Fee approval workflow (recent commit `4fb5775`)

- [ ] Verify approval state machine: who can submit, who approves?
- [ ] **STEP** Staff records a payment → state PENDING_APPROVAL
- [ ] **STEP** Owner approves → state APPROVED, fee status updates
- [ ] **STEP** Owner rejects → state REJECTED with reason; fee status reverts
- [ ] **EXP** Audit log captures each transition
- [ ] **BREAK-IT** Staff tries to approve own submission → forbidden
- [ ] **BREAK-IT** Approve an already-approved payment → idempotent, no double-credit

---

## Phase 8 — Online payments (Cashfree)

> Flip `PARENT_ONLINE_PAYMENTS_ENABLED=true` for this phase. Use Cashfree **sandbox** keys only.

### 8.1 Parent initiates payment

- [ ] Login as parent → Fees → click PAY on a pending fee
- [ ] **EXP** Convenience fee shown (2.9% via `computeConvenienceFee`); total = fee + late + convenience
- [ ] **STEP** Confirm → redirect to Cashfree sandbox; complete with test card `4111 1111 1111 1111`
- [ ] **EXP** Return URL lands on user-web success page; fee status updated to PAID (or PARTIAL)
- [ ] **EXP** Webhook hit: check api logs for `cashfree-webhook` POST; `paymentrequests` doc has status SUCCESS

### 8.2 Webhook signature verification

- [ ] **STEP** Replay a webhook with wrong signature using `scripts/cashfree-webhook-simulator.ts`
- [ ] **EXP** 401/403; no DB write
- [ ] **STEP** Replay with valid signature but stale timestamp → either accepted (idempotent) or rejected; document

### 8.3 Payment failure paths

- [ ] Use Cashfree FAILURE test card → return URL lands on failure page, fee remains PENDING, `paymentrequests` status FAILED
- [ ] **BREAK-IT** Close the Cashfree tab mid-payment → fee status remains PENDING, no orphan payment record
- [ ] **BREAK-IT** Pay same fee twice (two tabs) → second attempt fails or is rejected; no double-credit

### 8.4 Refunds (if supported)

- [ ] Owner refunds a paid fee → status reverts, refund recorded
- [ ] **EXP** Audit log + email to parent

### 8.5 Kill-switch behavior

- [ ] Flip `PARENT_ONLINE_PAYMENTS_ENABLED=false`, restart api
- [ ] **EXP** Parent's PAY button hidden OR shows "online payments disabled" message; existing payment-in-flight still resolves

---

## Phase 9 — Subscriptions

### 9.1 Trial state

- [ ] New academy starts in TRIAL with `endDate = createdAt + TRIAL_DURATION_DAYS`
- [ ] Dashboard banner shows "X days left in trial"
- [ ] **EXP** All features usable in trial

### 9.2 Tier upgrade (Owner pays subscription)

- [ ] Navigate to Subscription → choose TIER_1/2/3
- [ ] **EXP** Pricing from `TIER_PRICING_INR` matches contracts constant
- [ ] **STEP** Pay via Cashfree sandbox
- [ ] **EXP** Subscription status → ACTIVE, tier updated, endDate extended
- [ ] **EXP** `subscriptionpayments` record SUCCESS

### 9.3 Tier limits enforced

- [ ] **STEP** With TIER_1 (lower student cap from `TIER_RANGES`), try to add student beyond cap
- [ ] **EXP** Blocked with upgrade prompt; current students unaffected
- [ ] **STEP** Same for staff cap

### 9.4 Trial expiry & churn cron

- [ ] **STEP** Manually set an academy's subscription `endDate` to yesterday in Mongo
- [ ] **STEP** Trigger the subscription tier cron (or wait)
- [ ] **EXP** Status flips to CHURNED; owner sees grace-period banner; read-only mode after grace
- [ ] **BREAK-IT** Login as owner of churned academy → redirected to subscription page; no data loss

### 9.5 Renewal

- [ ] Pay before expiry → endDate extended cleanly (no gap, no double-extension)
- [ ] **BREAK-IT** Pay AFTER expiry → status reactivates from current date OR retro-extends; document expected behavior

---

## Phase 10 — Notifications & deeplinks (recent commits)

### 10.1 Device token registration

- [ ] **PRE** Open mobile app (web build via `npm run web`, OR Android device)
- [ ] **STEP** Login as Owner → grant notification permission
- [ ] **EXP** `devicetokens` doc created with token, platform, userId, `isActive: true`
- [ ] **STEP** Logout → token `isActive: false` (NOT deleted, for re-login)

### 10.2 Push delivery (Android device required)

- [ ] **STEP** From admin or backend, trigger a test notification (fee reminder, absence alert, etc.)
- [ ] **EXP** Device receives push within seconds
- [ ] **BREAK-IT** App in background → notification shown in tray
- [ ] **BREAK-IT** App killed → still received (FCM data message)
- [ ] **BREAK-IT** Token revoked on Firebase (use FCM console "send test") and then your real push → token marked inactive after FCM 404 (NOT_REGISTERED)

### 10.3 Deeplinks (recent commits `fe847b6`, `0863031`, `a0d45c7`)

For each notification type, verify the deeplink navigates to the correct screen:

- [ ] Fee due reminder → opens Fee detail screen for the specific fee
- [ ] Payment success → opens Receipt screen
- [ ] Absence alert (parent) → opens student attendance for that date
- [ ] Parent invite → opens accept-invite flow
- [ ] Staff onboarding → opens set-password flow
- [ ] Event reminder → opens event detail
- [ ] **BREAK-IT** Tap deeplink while logged out → routed to login, then to target screen after auth
- [ ] **BREAK-IT** Tap deeplink for an entity that no longer exists (deleted fee) → friendly "not found", not crash
- [ ] **BREAK-IT** Tap deeplink for a DIFFERENT tenant's entity (force the URL) → 403, not data leak

### 10.4 Email templates

For each: open Mailtrap, verify render:

- [ ] Owner invite
- [ ] Staff invite
- [ ] Parent invite
- [ ] Password reset OTP
- [ ] Fee due reminder
- [ ] Payment receipt
- [ ] Absence alert
- [ ] Subscription expiring
- [ ] **EXP** All emails: correct from address, no broken links, no Lorem Ipsum, mobile-responsive HTML, plain-text alternative present

### 10.5 OTP password reset

- [ ] Click "Forgot password" → enter email → OTP sent
- [ ] **EXP** OTP arrives within seconds; valid for `OTP_EXPIRY_MINUTES` (10)
- [ ] **BREAK-IT** Enter wrong OTP 5 times → locked out for `OTP_COOLDOWN_SECONDS`
- [ ] **BREAK-IT** Request OTP 10 times in 60s → rate-limited
- [ ] **BREAK-IT** Use expired OTP → rejected
- [ ] **EXP** Successful reset invalidates old JWTs (tokenVersion bump)

---

## Phase 11 — Events

- [ ] Create event (name, date, type, target audience: ALL/STAFF/PARENTS/BATCH_X, description)
- [ ] **EXP** Visible on target audience's dashboard; push + email to subscribers (per audience)
- [ ] Edit event → audience re-notified or not, per spec; document
- [ ] Delete event → vanishes; deeplink to deleted event → friendly not-found
- [ ] **BREAK-IT** Past-dated event → blocked or labeled "past"; document

---

## Phase 12 — Expenses

- [ ] Create expense category (e.g. "Equipment", "Utilities")
- [ ] Add expense with amount, date, category, attachment (receipt image)
- [ ] **EXP** Listed; aggregates correctly on dashboard; CSV export works
- [ ] Delete category → blocks if expenses reference it; or cascades (verify expected behavior)
- [ ] **BREAK-IT** Negative amount → rejected
- [ ] **BREAK-IT** Future-dated expense → either allowed (planned) or blocked; document

---

## Phase 13 — Enquiries

- [ ] Add enquiry: name, phone, source (Walk-in / Referral / Google / Instagram), status OPEN
- [ ] Add follow-up notes (multiple over time)
- [ ] Close enquiry with reason (CONVERTED → student, NOT_INTERESTED, JUNK)
- [ ] **EXP** If CONVERTED, link to created student record
- [ ] Reopen closed enquiry → status OPEN again
- [ ] **BREAK-IT** Duplicate phone — warn but allow

---

## Phase 14 — Reviews

- [ ] As parent, submit a review (rating 1–5, comment)
- [ ] **EXP** Visible on academy's review page; aggregate rating updates
- [ ] **BREAK-IT** Rating outside 1–5 → rejected
- [ ] **BREAK-IT** Submit twice for same academy → either updates or rejects; document
- [ ] Owner can hide an inappropriate review → hidden from public view but kept in DB

---

## Phase 15 — Reports & dashboard widgets

- [ ] Owner dashboard: attendance %, fee collection %, expense summary, upcoming events — all numbers reconcile with raw DB
- [ ] **STEP** Date-range pickers on each widget work
- [ ] **STEP** Export each report to PDF and CSV
- [ ] **EXP** PDFs render with logo, header, footer, page numbers; CSVs open cleanly in Excel
- [ ] **BREAK-IT** Range with no data → empty PDF (1 page, "no data" message); no 500

---

## Phase 16 — Audit log

- [ ] Owner views audit log → filter by user, entity, action, date
- [ ] **EXP** Every state-changing action from Phases 1–15 appears with actor, IP, before/after diff
- [ ] **EXP** Read-only — no edit/delete from UI
- [ ] **BREAK-IT** Try to call audit-log delete endpoint directly via curl → 403 even for owner (immutable log)

---

## Phase 17 — Account deletion

- [ ] Parent requests account deletion → request created in `accountdeletionrequests` with status PENDING
- [ ] Owner sees request → approves
- [ ] **EXP** User soft-deleted (status DELETED), PII redacted per policy, related records preserved (audit trail, payments)
- [ ] **BREAK-IT** Deleted user tries to login → "account deleted" message
- [ ] **BREAK-IT** Request deletion twice → second is no-op or duplicate-blocked
- [ ] Owner can also delete own academy (requires super-admin approval) → flow goes through admin-web

---

## Phase 18 — Mobile app (web + Android)

### 18.1 Mobile via `npm run web` (functional only)

- [ ] App loads in browser; no console errors
- [ ] Login as Owner → tabs/nav render
- [ ] Walk through every screen: Home, Attendance, Fees, Students, Events, Profile, Settings
- [ ] **EXP** All screens render; data matches user-web
- [ ] **BREAK-IT** Slow network (Chrome DevTools throttle "Slow 3G") → spinners shown, no UI freeze
- [ ] **BREAK-IT** Offline → friendly offline screen, retry button
- [ ] **NOTE** Skip these on web build: FCM push, native Cashfree, keychain, image picker (file fallback OK)

### 18.2 Mobile on Android physical device

- [ ] Build & install: `npm run android --workspace=@academyflo/mobile` (or use installed APK)
- [ ] **STEP** Login as Owner
- [ ] **STEP** Walk all screens again — gestures, transitions smooth
- [ ] **STEP** Profile photo upload via camera → uploads, appears
- [ ] **STEP** Profile photo upload via gallery → uploads
- [ ] **STEP** Mark attendance, record fee payment, etc. — same flows as web
- [ ] **STEP** Cashfree native flow: pay a subscription → completes in native SDK, returns to app
- [ ] **STEP** Receive push notification (Phase 10.2)
- [ ] **STEP** Tap notification while app killed → deeplink lands on right screen
- [ ] **STEP** Background → foreground transitions, no token loss (keychain test)
- [ ] **STEP** QR code generation (if used for staff/student check-in) → renders & scannable
- [ ] **STEP** Generate & share receipt → file save + share intent
- [ ] **BREAK-IT** Force-stop app from settings, reopen → resumes at login or last screen per spec
- [ ] **BREAK-IT** Airplane mode → offline banner; reconnect → queued actions sync
- [ ] **BREAK-IT** Low storage → image upload fails gracefully

### 18.3 Mobile version

- [ ] Commit the staged version bump in `apps/mobile/android/app/build.gradle` (1.3.8 → 1.3.9, versionCode 24 → 25) OR confirm intent
- [ ] About screen shows correct version

---

## Phase 19 — Multi-tenant isolation (CRITICAL)

This phase exists because a tenant leak = production blocker.

- [ ] **PRE** Two academies seeded: A and B, each with owner, staff, students
- [ ] **STEP** Login as owner of A → capture a student ID `S_A` from network tab
- [ ] **STEP** Login as owner of B → try `GET /api/v1/students/S_A` via curl with B's JWT
- [ ] **EXP** 403 or 404, NOT the student data
- [ ] **STEP** Repeat for: batches, fees, payments, attendance, events, expenses, enquiries, reviews, staff
- [ ] **STEP** Repeat with PUT/DELETE — same expected result
- [ ] **STEP** Try cross-tenant deeplink in mobile app (tap a notification URL hand-edited to reference other academy's resource) → 403
- [ ] **EXP** No endpoint leaks any field that contains another academy's data
- [ ] **STEP** Super-admin only: confirm super-admin CAN read across tenants (positive control)

---

## Phase 20 — Security & negative tests

### 20.1 Auth

- [ ] No endpoint other than `/health/*`, `/auth/*`, public marketing pages responds to unauthenticated requests
- [ ] **STEP** Drop JWT signature byte → 401
- [ ] **STEP** Swap algorithm to `none` (classic attack) → 401
- [ ] **STEP** Expired JWT → 401; refresh flow issues new pair
- [ ] **STEP** Re-present the just-rotated (now-previous) refresh token once within ~60s → honoured (one-shot rotation grace tolerates a lost rotation response)
- [ ] **STEP** Re-present that token again, or any older token, or after the grace window → session revoked (token theft / fork defense)

### 20.2 Authorization (RBAC)

- [ ] Staff tries owner-only endpoints (subscription change, batch delete, audit log read) → 403
- [ ] Parent tries staff-only endpoints (mark attendance) → 403
- [ ] **STEP** Owner tries super-admin endpoints → 403

### 20.3 Input validation

- [ ] Send oversize body (>10MB JSON) → 413
- [ ] SQL/NoSQL injection in any string field: `{ "$ne": null }` as a value → rejected by class-validator
- [ ] XSS in comment/name fields: `<script>alert(1)</script>` → stored escaped, rendered as text not HTML
- [ ] Path traversal in upload filename: `../../etc/passwd` → sanitized

### 20.4 Rate limiting (Throttler)

- [ ] Hit `/auth/login` 50× in 1 minute → 429 after threshold
- [ ] **EXP** Throttle is per-IP not global

### 20.5 CORS

- [ ] Request from `http://evil.example` with credentials → blocked
- [ ] Request from allowed origin → 200 with proper CORS headers

### 20.6 Secret hygiene

- [ ] `git status` shows no `.env` staged
- [ ] `npm run hardening:secrets` → zero findings
- [ ] No secrets visible in any API response body (e.g. config endpoint)

### 20.7 Webhook security

- [ ] Cashfree webhook with missing/invalid signature → rejected (Phase 8.2 confirmed)
- [ ] Replay attack: capture a real success webhook, replay 10× → idempotent, no double-credit

---

## Phase 21 — Performance smoke

(Not full load test — just rule out obvious regressions)

- [ ] Open the seeded academy with 75 students, 6mo of data; render Owner dashboard
- [ ] **EXP** First paint <3s, full render <5s on local
- [ ] Open attendance for a batch of 25 students → renders <2s
- [ ] Fees list with 6 months × 75 students (~450 records) → paginated, page renders <2s
- [ ] **STEP** Watch api logs: any query >`SLOW_QUERY_THRESHOLD_MS` (200ms) logged
- [ ] **EXP** No slow-query warnings during normal flows
- [ ] **STEP** Check `INDEX_ASSERTION_ENABLED=true` boot → fails fast if a required index is missing

---

## Phase 22 — Concurrency & data integrity

- [ ] Two staff edit same student simultaneously → last write wins or conflict error; no partial save
- [ ] Two parents pay same fee simultaneously (use two browsers, sandbox Cashfree) → one succeeds, other fails cleanly
- [ ] Fee-reminder cron + manual fee-status change at the same moment → no inconsistent state
- [ ] **STEP** Kill api mid-request (Ctrl-C during a save) → restart; no half-committed records

---

## Phase 23 — Backup & recovery

- [ ] Run `scripts/backup/` → dump created, restorable
- [ ] **STEP** Restore dump to a separate DB → verify count of users/students/fees matches
- [ ] **EXP** Backup retention/rotation policy documented

---

## Phase 24 — Logout & session hygiene

- [ ] Logout invalidates JWT (tokenVersion bump) → captured JWT can't be reused
- [ ] Sessions list (if UI exists) shows active sessions; revoke individual sessions works
- [ ] Password change invalidates all other sessions

---

## Phase 25 — Cron jobs & background workers

> Use a short interval in `.env` to test these without waiting hours.

- [ ] **Fee reminder cron** (`FEE_REMINDER_ENABLED=true`): runs, sends reminders to parents with PENDING fees within window
- [ ] **Subscription downgrade cron**: runs at midnight, downgrades expired subscriptions
- [ ] **Late fee cron**: applies late fees per `computeLateFee()`
- [ ] **EXP** Each is **idempotent**: running twice doesn't double-charge / double-notify
- [ ] **EXP** Each is **multi-instance safe** via `JobLockModule` — start 2 api instances locally, only one runs the job
- [ ] **EXP** All crons respect kill-switches in `.env`

---

## Phase 26 — Redeemables (recent commit `8434ef9`)

> Status note: commit touches many modules but no `Redeemable` entity is visible in current schemas/contracts. Verify feature state before testing.

- [ ] Confirm with team whether this feature is enabled for the test
- [ ] If enabled: trace the redeemable creation, redemption, and audit flow end-to-end
- [ ] If disabled: confirm no UI references appear in any role (otherwise it leaks half-finished UI)

---

## Phase 27 — Final pre-deploy checks

- [ ] `npm run lint` — zero errors
- [ ] `npm run typecheck` — zero errors
- [ ] `npm run test` — all unit tests pass
- [ ] `npm run test:e2e` — all e2e tests pass
- [ ] `npm run validate:boundaries` — clean
- [ ] `npm run validate:architecture` — clean
- [ ] `npm run hardening:sweep` — no critical findings
- [ ] `npm run contract:check` — OpenAPI matches contracts
- [ ] All `.env` keys set in Render dashboard for staging AND prod
- [ ] Cashfree **prod** keys ready (NOT sandbox); webhook URL configured on Cashfree dashboard
- [ ] Firebase **prod** project keys ready; iOS APNS cert uploaded if applicable
- [ ] Cloudinary prod folder configured; upload presets reviewed
- [ ] Super admin password rotated for prod (not the seed default)
- [ ] DEPLOY.md re-read and current
- [ ] Mobile build for prod (release variant) installs and runs against staging api first, then prod api
- [ ] Mobile version bump committed (see 18.3)
- [ ] Render staging deploy succeeded; smoke test on staging passes
- [ ] Rollback plan documented (Render keeps last N deploys — verify)

---

## Sign-off

| Phase | Tester | Date | Result | Notes |
|---|---|---|---|---|
| 0 Pre-flight | | | | |
| 1 Super Admin | | | | |
| 2 Owner onboarding | | | | |
| 3 Staff | | | | |
| 4 Batches | | | | |
| 5 Students & Parents | | | | |
| 6 Attendance | | | | |
| 7 Fees | | | | |
| 8 Online payments | | | | |
| 9 Subscriptions | | | | |
| 10 Notifications | | | | |
| 11 Events | | | | |
| 12 Expenses | | | | |
| 13 Enquiries | | | | |
| 14 Reviews | | | | |
| 15 Reports | | | | |
| 16 Audit log | | | | |
| 17 Account deletion | | | | |
| 18 Mobile | | | | |
| 19 Multi-tenant isolation | | | | |
| 20 Security | | | | |
| 21 Performance | | | | |
| 22 Concurrency | | | | |
| 23 Backup | | | | |
| 24 Sessions | | | | |
| 25 Crons | | | | |
| 26 Redeemables | | | | |
| 27 Pre-deploy | | | | |

**Production deploy approval:** ☐ Engineering Lead ☐ QA Lead ☐ Product Owner

Date: ______________
