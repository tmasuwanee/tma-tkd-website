# Admin Auth (Phase 1) — Plan, Rollout, Test

Closes the hole where the admin tRPC API was `publicProcedure` behind a
browser-only password (callable by anyone who found the URL; the password
`Keep9oing!` shipped in the client bundle).

## What shipped (foundation, safe to deploy now)

- **Server session:** `server/admin-auth.ts` signs an httpOnly `tma_admin` cookie
  (HMAC over `email|expiry`, signed with `JWT_SECRET`). `POST /api/admin/login`
  verifies the shared credentials **server-side** and sets it; `POST /api/admin/logout`
  clears it; `POST /api/admin/verify-key` (the Telegram magic-link) now also sets it.
- **Context:** `createContext` reads/verifies the cookie into `ctx.isAdmin` /
  `ctx.adminEmail`.
- **Gate:** `tmaAdminProcedure` in `_core/trpc.ts` requires `ctx.isAdmin`.
- **Client:** the login form POSTs `/api/admin/login` instead of self-certifying;
  cookies flow on tRPC calls (`credentials: "include"` was already set).

## The kill-switch (why this is safe to deploy)

`tmaAdminProcedure` only enforces when `ADMIN_AUTH_ENFORCE=true`. Until then it
behaves exactly like `publicProcedure`. So deploying the gate + gating procedures
changes **nothing** and cannot lock anyone out. The cookie is still issued on
login, so when you flip enforcement on, it already works.

`adminPassword` reads `ADMIN_PASSWORD` env, falling back to the historical shared
password, so login works before you set anything. Set `ADMIN_PASSWORD` in Secrets
to rotate it out of the code.

## Gated so far (the highest-sensitivity, unambiguously dashboard-only readers)

Converted to `tmaAdminProcedure`:
- `leads.getAll` (every lead + PII)
- `students.getAll` (every student + PII)
- `afterschool.listRegistrations` (payments + PII)
- `payments.listOneOff` (payment records)
- `camp.listWaivers` (waiver PII)
- `search.query` (searches across all people)

These are certain to be browser-only, so gating them is safe even before the full
sweep. Everything else is still `publicProcedure` (unchanged).

## The classification for finishing the sweep

The remaining admin procedures must be gated too, but **three categories must NOT
be gated** or they break:

1. **Parent / public-facing** (the enrollment + payment + waiver flows). Keep public:
   `auth.me`, `auth.logout`, `leads.submit`, `camp.createRegistration/confirmPayment/submitWaiver`,
   `trial.createIntent/confirmPayment`, `backToSchool.*`, `christmas.*`,
   `supplyFee.*`, `fieldTrip.*`, `transportation.submit`, `waiver.submit`,
   `afterschoolWaiver.submit`, `afterschool.submitIntake/createIntent/confirm`.
2. **Automation-called via tRPC** (no admin cookie exists on these callers — the
   n8n dispatcher, FB sync, Gmail poller, kiosk). Likely-unsafe to gate until
   verified: `sequence.*`, `dispatcher.*`, `templates.*` (rendering),
   `lifecycle.*`, `audit.*`, `inbound.emailReply`, `attendance.*` (the public
   `/attendance` kiosk), `leads.upsertFromFacebook`, `leads.logActivity`,
   `calls.generateToday`, `rules.route`. **Confirm whether each is called by an
   n8n workflow or cron via tRPC before gating** (if they use REST/webhooks
   instead, they are safe to gate).
3. **Dashboard-admin** (safe to gate, browser-only): the rest —
   `admin.*`, `leads` mutations (updateStage/updateProgram/updateNotes/updateTags/
   getActivity/pause/resume/delete/setFollowUp/bookManual), `students` (import/
   search/getEligible/promoteBelt/demoteBelt/update/create), `ads.getInsights/sync`,
   `calls.listToday/board/markOutcome/leadActivity`, `checkin.*`, `tasks.*`,
   `controls.*`, `roster.*`, `studio.*`, `waiver.list/byLead/delete`,
   `invoices.*`, `callLog.*`, `rules.list/create/update/delete`,
   `trial.list/setStatus/updateStartDate`.

## Rollout / test checklist (do on a PREVIEW before prod)

1. Deploy with `ADMIN_AUTH_ENFORCE` unset. Confirm the dashboard works exactly as
   before (nothing enforced yet) and that logging in sets a `tma_admin` cookie
   (DevTools -> Application -> Cookies).
2. Set `ADMIN_AUTH_ENFORCE=true` on the preview. Redeploy.
3. **Logged in:** the whole dashboard still loads (the gated queries return data).
4. **Logged out / incognito:** hitting `/api/trpc/leads.getAll` (or the dashboard
   without the cookie) returns 401. This is the hole being closed.
5. **Telegram magic-link:** tapping a `?key=` link still logs in.
6. **Parent flows unaffected:** run a test enrollment / trial / camp registration
   end to end (these are public and must not require the cookie).
7. **Automation still runs:** confirm the n8n Sequence Dispatcher still sends,
   FB Lead Ads Sync still ingests, and the Gmail reply poller still posts — these
   are the category-2 risk. If any breaks, that procedure was gated wrongly (or
   needs a machine-secret path); revert that one to `publicProcedure`.
8. Once preview is clean, set `ADMIN_AUTH_ENFORCE=true` in prod.

## Optional hardening (later)

- Give automation a machine-secret path so category-2 procedures can be gated too:
  `tmaAdminProcedure` passes if `ctx.isAdmin` OR a request carries a valid
  `x-tma-internal` secret; then add that header in the n8n workflows.
- Per-user logins instead of a shared password (only if you actually need per-user
  audit; the adversarial review flagged a shared-login PIN as theater).
