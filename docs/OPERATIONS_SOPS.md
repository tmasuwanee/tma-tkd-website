# TMA Operations SOPs — Memberships, Enrollment, Billing

**Living document.** Prices and policies change — when Arfa says something changed,
update the relevant section here (and the code/model that reads from it). Last
updated 2026-08-12.

These SOPs define the **membership engine** we're building: enroll, change, pause,
cancel, adjust payments, and discounts. Every action becomes (1) a backend
operation, (2) a dashboard screen a person uses, and (3) a chatbot propose-tool
behind the human-confirm step — so all of it works with or without the chatbot.

> Items marked **[CONFIRM]** are gaps/ambiguities I still need pinned down.

---

## A. Membership & pricing catalog

Arfa splits memberships into four sections.

### 1. Martial arts programs (monthly tuition)
| Program | Price |
|---|---|
| Taekwondo — 2 days/week | $179/mo |
| Taekwondo — 3 days/week | $199/mo |
| Kickboxing — 3 days/week | $159/mo |
| Brazilian Jiu-Jitsu — 3 days/week | $159/mo |

- **Free intro class** — available now.
- **$99 3-week trial** — mainly Taekwondo (sometimes Kickboxing if a prospect is
  hesitant). **Includes the Taekwondo uniform.** Only shown when a prospect is
  hesitant or fit is uncertain; otherwise we sell the regular tuition.
  **[CONFIRM]** you said "3 week" and also "2 weeks" — the system currently treats
  it as **3 weeks (21 days)**. Confirm 2 vs 3.
- **Planned (not built):** a temporary **7-day free trial** across all programs a
  prospect is eligible for. On hold until the rest is set up.

### 2. Afterschool programs
| Plan | Price |
|---|---|
| 5 days/week | $500/mo |
| 2-3 days/week | $400/mo |

- Taekwondo + Kickboxing **Monday–Thursday**; **Friday = free play day**.
- Mostly **online self-signup + pay on the website**; in-person follows the same
  flow as martial arts if needed.
- Current one-time fees in the system: registration $99, uniform $50, supply $65.

### 3. Camps
- **Summer camp** — already in the system (use it as the reference).
- **Spring break camp** — like summer camp but one week; usually **2 field trips**
  that week.
- **Other seasonal camps** (winter/fall break) — **[CONFIRM]** whether field trips
  happen for these.
- Prices: mirror summer camp for now; adjust once everything is set up.

### 4. Day camps
- **$50–$60/day.** Morning care on **digital-learning days** and **school-out
  holidays**.
- **Need to build:** a **sign-up page** — online signups AND a **printable version**
  to post near the office for in-person paper signup.
- **[CONFIRM]** exact per-day price + which specific days/holidays.

### One-time fees
| Fee | Amount |
|---|---|
| Testing fee | $50 cash/check · **$60 credit card** |
| Taekwondo uniform | $60 |
| BJJ gi | ~$120 [CONFIRM] |
| Kickboxing gear (full set) | $200 |
| Taekwondo registration | **$149 (includes the uniform)** — can be waived (reg and/or uniform) at signup |

- More prices to come.
- **[CONFIRM]** the uniform relationship: TKD registration is $149 "including the
  uniform," but the standalone TKD uniform is $60 — when is the $60 charged (e.g.
  replacements, or when registration is waived)?
- **[CONFIRM]** registration fees for Kickboxing and BJJ (only Taekwondo's $149 given).

---

## B. Enrolling a new student (martial arts: TKD / Kickboxing / BJJ)

**Typical flow:** prospect takes a trial class (walking in ready to sign is rare)
→ we talk after class → show + explain prices if they haven't seen them → sign up.

**Sign-up collects:** kid's name, age, address, parent email + phone → select the
program → scan the credit card.

**Payment nuances (today done by switching to the computer / ZenPlanner):**
- **Registration fee** ($149 TKD, includes uniform). We sometimes **waive the
  registration and/or the uniform** — need per-signup checkboxes for each.
- **Sibling discount: $20 off the second child.** **[CONFIRM]** one-time or
  recurring monthly, and which programs it applies to.
- **Contract:** we add the specific contract in the member's contracts section,
  then it updates through ZenPlanner. After payment we explain the contract, they
  read + sign, done. **[CONFIRM]** which contracts exist (term lengths, e.g.
  12-month) and what they bind.

Same process for Taekwondo, Kickboxing, and BJJ.

**What to improve in our system (goal):** collapse the "switch to the computer to
configure payment" step — do the registration/uniform waivers, sibling discount,
and contract attachment **inline in one signup screen**, with the chatbot able to
handle parts of it (as a proposal a staff member confirms).

**Afterschool:** mostly online self-signup + pay on the website; in-person is the
same idea.

---

## C. Changing a membership (upgrade / downgrade)

- Keeps the same subscription; **charges the new amount on the next billing date.**
- **Proration should be an option** (Arfa: "not all people want proration to the
  first of the month"). See the proration primer below.

### Proration primer (plain terms)
Proration = when a change happens mid-cycle, only charge/credit the *portion* used
or unused, instead of a full month.
- **No proration (default):** the change just takes effect on their next normal
  billing date. Simplest, matches "charge the new amount next billing date."
- **Prorate:** if you also move their billing date (e.g. to align to the 1st), you
  charge a partial amount for the days between now and the new date, then full
  months after. Optional, per member.

**Proposed rule:** default to **no proration** (change applies next cycle); offer a
**"prorate + change billing date"** option when a staff member explicitly wants to
realign someone. **[CONFIRM]** this is what you want.

---

## D. Pauses & cancellation

**Pause policy (current):** **NO pauses.** (We used to allow 2-month pauses but too
many people paused over the summer, so we stopped.)
- Instead: a member can **pay the period in advance**; when they return, that
  payment is **applied as credit** so those months are effectively free on return.

**Cancellation:** **60-day notice.** They **pay for the remaining 60 days** and can
attend class during that time; then the membership is cancelled. **Re-signing up
later requires paying the registration fee again.**

**Capabilities we still want (manual + chatbot):**
- **Pause or cancel a membership immediately** (an override option, despite the
  standard policy).
- In a student's **Financials section**: **cancel an individual payment**, or
  **give credit** — set a payment to **$0**, or apply a **partial payment /
  discount** for a **specific month or months** independently.

**[CONFIRM]** who is allowed to do cancellations / credits / immediate pauses —
any staff, or owner-only?

---

## E. Tuition payment adjustments & discounts (Financials section)

Per student, a person (or the chatbot, via propose→confirm) can:
- **Cancel a specific upcoming payment.**
- **Zero out a payment** (full credit) for a chosen month.
- **Apply a partial payment / discount** to a specific month or months.
- **Add a discount:** currently the **$20 sibling** discount; general ability to add
  **percent-off or dollar-off** discounts, one-time or recurring.
- **[CONFIRM]** discount types you actually use (%, $, sibling, military, staff,
  promo), whether they stack, and who can approve them.

Every money-changing action goes through the **confirm-flow** (proposed → a person
reviews the exact effect → confirms once, audited). The chatbot can propose these;
it can never execute one on its own.

---

## F. Open questions (to resolve before/while building)

1. $99 trial: **2 or 3 weeks?**
2. Registration fees for **Kickboxing and BJJ**; the **$149-incl-uniform vs $60
   uniform** relationship.
3. **Sibling discount:** one-time vs recurring; which programs.
4. **Contracts:** what terms exist + what they enforce.
5. **Proration:** confirm the default-no-proration + optional-prorate rule (§C).
6. **Pay-in-advance credit:** track as an account credit balance the member draws
   down on return — confirm.
7. **Day camp:** exact per-day price + the specific days it runs.
8. **Camp prices:** confirm mirroring summer camp is fine for now.
9. **Permissions:** who can apply discounts/credits/cancellations/immediate pauses.

---

## G. Build implications (for reference)

- A real **membership model** (option/template vs individual membership vs bills vs
  payments) — the ZenPlanner-parity design in `TUITION_RECURRING_PAYMENTS_SPEC.md`
  §14. These SOPs are its requirements.
- A **Financials section** per student for payment adjustments/credits/discounts.
- **Day-camp signup page** (online + printable) — new build.
- Each operation exposed three ways: backend op → dashboard UI → chatbot
  propose-tool (behind the confirm-flow already built).
