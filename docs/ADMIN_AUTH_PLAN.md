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

## Gating model: default-deny with an audited public allowlist

Rather than flip ~50 procedures individually (error-prone; a missed public one
breaks the parent site), the gate lives at the **base procedure**. `publicProcedure`
runs `adminGate`: when enforcement is on, any procedure whose dotted path is NOT
in `PUBLIC_PATHS` requires the admin session. So the **entire admin surface is
gated at once**, it is **fail-closed** (a new procedure is admin-by-default), and
there is one list to review instead of scattered edits.

`PUBLIC_PATHS` (in `server/_core/trpc.ts`) is the allowlist that must stay public.
It was derived by grepping exactly which tRPC procedures the public pages call
(`client/src/pages/*`), plus the known automation callers:

- **Parent-facing:** `leads.submit`, `leads.bookManual` (walk-in), all
  `*.createIntent/confirm`, `camp.*` create/confirm/waiver, `*.submit` waivers,
  `afterschool.submitIntake/createIntent/confirm`, and `students.getAll` +
  `attendance.*` (the public `/attendance` kiosk reads these — a real gotcha the
  grep caught).
- **Session/system:** `auth.me`, `auth.logout`, `system.health`.
- **Automation (no admin cookie on the caller):** `sequence.*`, `dispatcher.*`,
  `lifecycle.*`, `audit.log`, `inbound.emailReply`, `leads.upsertFromFacebook`,
  `leads.logActivity`, `calls.generateToday`, `rules.route`.
- **Chat widget:** `chat.*` (if mounted on public pages).

**Everything else is admin-gated** when enforcement is on — including all the
sensitive readers and every dashboard mutation (`leads.getAll` + all leads
mutations, `admin.*`, `invoices.*`, `payments.*`, `search.query`, `students`
mutations, `calls.*` board, `checkin.*`, `tasks.*`, `controls.*`, `roster.*`,
`studio.*`, `waiver.list/byLead/delete`, `callLog.*`, `ads.*`, `rules` CRUD,
`templates.*`, `trial.list/setStatus/updateStartDate`, `camp.listWaivers`,
`afterschool.listRegistrations`, `audit.list`).

### Known remaining holes (deliberate, for non-breaking)

The automation allowlist entries stay reachable without the cookie (their callers
have none), and `students.getAll` stays public for the kiosk. These are the only
gaps left once enforcement is on. Close them later with the machine-secret path
below (add a header to the n8n workflows / kiosk), then remove them from
`PUBLIC_PATHS`.

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
