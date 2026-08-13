# TMA Operations SOPs — Memberships, Enrollment, Billing

**Living document.** Prices and policies change — when Arfa says something changed,
update the relevant section here (and the code/model that reads from it). Last
updated 2026-08-12.

These SOPs define the **membership engine** we're building: enroll, change, pause,
cancel, adjust payments, and discounts. Every action becomes (1) a backend
operation, (2) a dashboard screen a person uses, and (3) a chatbot propose-tool
behind the human-confirm step — so all of it works with or without the chatbot.

> Still open: exact day-camp days, BJJ gi exact price, seasonal-camp field trips,
> confirming camp prices mirror summer camp.

---

## A. Membership & pricing catalog

### 1. Martial arts programs (monthly tuition)
| Program | Price |
|---|---|
| Taekwondo — 2 days/week | $179/mo |
| Taekwondo — 3 days/week | $199/mo |
| Kickboxing — 3 days/week | $159/mo |
| Brazilian Jiu-Jitsu — 3 days/week | $159/mo |

- **Free intro class.**
- **$99 3-week trial (21 days).** Mainly Taekwondo (sometimes Kickboxing if a
  prospect is hesitant). **Includes the Taekwondo uniform.** Only shown when a
  prospect is hesitant or fit is uncertain; otherwise we sell regular tuition.
- **Planned (not built):** a temporary **7-day free trial** across all eligible
  programs. On hold until the rest is set up.

### 2. Afterschool programs
| Plan | Price |
|---|---|
| 5 days/week | $500/mo |
| 2-3 days/week | $400/mo |

- Taekwondo + Kickboxing **Mon–Thu**; **Friday = free play day.**
- Mostly **online self-signup + pay on the website**; in-person follows the martial
  arts flow. Current one-time fees in the system: registration $99, uniform $50,
  supply $65.

### 3. Camps
- **Summer camp** — in the system (reference).
- **Spring break camp** — one week, usually **2 field trips**.
- **Other seasonal camps** (winter/fall break) — field trips TBD.
- Prices: mirror summer camp for now; adjust later.

### 4. Day camps
- **$60/day.** Morning care on digital-learning days and school-out holidays.
- **To build:** a sign-up page — online signups AND a **printable version** for
  in-office paper signup. Exact days TBD.

### One-time fees
| Fee | Amount |
|---|---|
| Testing fee | $50 cash/check · **$60 credit card** |
| Taekwondo registration | **$149 (includes the uniform)** — can be waived (reg and/or uniform) at signup |
| Kickboxing registration | $150 |
| BJJ registration | $150 |
| Taekwondo uniform (standalone) | $60 — charged when the registration fee is waived but they still need a uniform |
| BJJ gi | ~$120 (confirm) |
| Kickboxing gear (full set) | $200 |

---

## B. Enrolling a new student (martial arts: TKD / Kickboxing / BJJ)

**Typical flow:** prospect takes a trial class (walking in ready to sign is rare)
→ talk after class → show + explain prices → sign up.

**Sign-up collects:** kid's name, age, address, parent email + phone → select
program → scan credit card.

**Payment configuration (do inline in our system — no more switching to ZenPlanner):**
- **Registration fee** (TKD $149 incl uniform; KB/BJJ $150). Per-signup toggles to
  **waive the registration and/or the uniform**; if the reg is waived, charge the
  **$60 uniform** if they still need one.
- **Sibling discount: $20 off the second child, EVERY month, on every program**
  (recurring monthly discount on that child's membership).
- **Contract:** attach a term (usually **12 months**, sometimes different). Nothing
  complex beyond the cancellation + no-pause rules below. Explain, they sign.

Same for Taekwondo, Kickboxing, BJJ. **Afterschool** is mostly online self-signup.

**Goal:** one signup screen that does the registration/uniform waivers, sibling
discount, and contract in place, with the chatbot able to **propose** enrollments
(a staff member confirms).

---

## C. Changing a membership (upgrade / downgrade)

- Keeps the same subscription; **charges the new amount on the next billing date.**
- **Default: no proration.** Optionally, when a staff member (or the chatbot, via a
  `prorate` flag) asks, prorate the change and/or realign the billing date. The
  chatbot can do this when asked.

---

## D. Pauses & cancellation

**Pause policy (current):** **NO pauses.** (Too many paused over the summer.)
- Instead, a member can **pay ahead**; those prepaid months become free when they
  return (handled by editing those months' charge amounts — see §E).

**Cancellation:** **60-day notice.** They **pay the remaining 60 days** and can
attend during it; then it cancels. **Re-signing up later = pay the registration
fee again.**

**Overrides we support:** **pause or cancel a membership immediately** when needed
(despite the standard policy).

**Permissions:** **anyone in the account** can apply discounts, credits, and
cancellations. Staff share one login (no per-staff users), so there's no per-user
gating beyond being logged in.

---

## E. Financials — per-student payment adjustments & discounts

Each membership has a list of **monthly charges** (one per month). In a student's
**Financials section**, a person (or the chatbot, via propose→confirm) can, **per
specific month**:
- **Edit the amount** for that month (this is the primary lever — easier than a
  separate credit balance).
- **Zero it out** (full credit / waive) or set a **partial amount** (discount).
- **Cancel** that month's charge.

Recurring discounts:
- **Sibling: $20/month** off, every program (a standing monthly discount on the
  membership).
- General ability to add **percent-off or dollar-off** discounts, one-time (one
  month) or recurring (every month).

Every money-changing action runs through the **confirm-flow** (proposed → a person
sees the exact effect → confirms once, audited). The chatbot proposes; only a
person executes.

---

## F. Chatbot capabilities for these actions (target)

Beyond today's read + draft-email abilities, the assistant should be able to:
- **Open a specific student's popup** and give step-by-step directions on how to do
  a thing (deep-link + guidance).
- **Propose** changes to existing members' memberships (upgrade/downgrade, pause,
  cancel, edit a month's charge, apply a discount) — executed only after a human
  confirms in Approvals.
- **Propose creating a new member.**
- **Ask follow-up questions** to clarify before proposing anything (e.g. which
  program, which month, prorate or not).

---

## G. Build implications

- **Membership model:** membership record + per-month charges (the Financials
  ledger). Fields: program, plan, monthly amount, sibling/other discounts, status
  (active/paused/canceled), start date, term (default 12mo), billing day, Stripe
  links, cancel-effective date.
- **Financials section** per student: the monthly-charges list, each editable.
- **Operations** (each = backend → dashboard UI → chatbot propose-tool via the
  confirm-flow): enroll, change plan (with optional prorate), pause/cancel
  (immediate or per-policy), edit/zero/cancel a month's charge, add a discount.
- **Day-camp signup page** (online + printable) — separate build.
- Stripe stays the payment executor; our model is the source of truth for what
  *should* be charged.
