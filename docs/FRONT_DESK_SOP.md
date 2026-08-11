# TMA Front Desk SOPs (current system)

Written against the CURRENT dashboard so staff can use it today. When the dashboard reorg lands, the view names in here get updated. Staff: Arfa (owner), Master Jo, Ms Anna, Ms Aniessa. Shared admin login.

**The one rule that matters most right now:** several flows are unlinked or invisible in the admin (afterschool, camp waivers, supply/field-trip payments, paid-trial to lead). Until those are fixed, the manual cross-checks below are not extra work, they are the system. Telegram is the real-time signal; the weekly manual reconciliation is the safety net.

---

## 1. Daily open / close

**Morning (whoever opens):**
1. Open the dashboard, land on **Today**. Confirm the day looks right.
2. **Today's Calls**: confirm the AM Telegram "trials today" and "daily call list" landed. If missing by 9am, tell Arfa.
3. **Trial Check-in**: have waiver + intake ready for anyone trialing today.
4. Scan Telegram for overnight pickup/callback/after-hours calls. Action anything time-sensitive first.

**Evening (whoever closes):**
1. **Today's Calls**: every call has a status (contacted / no answer / voicemail). Nothing blank overnight.
2. Cross-check the PM "did they show?" Telegram against **Trial Check-in**. No-shows without a note get flagged for tomorrow.
3. **My Tasks**: close out or roll forward with a note.
4. Skim Telegram for late payments; confirm each has its record (see SOP 5 for the ones with no table).

---

## 2. Lead to trial to enrolled

Trigger: new lead (web form, FB ad, walk-in, phone).
1. New leads land in **Leads** at `new_lead` automatically. FB leads sync every 15 min.
2. The follow-up sequence starts automatically (dispatcher runs every 5 min). Your job is a live call, fast.
3. After you talk to them, move **Leads** status to `contacted`, log in **Call Log**.
4. Trial booked (by you, voice agent, or sequence) moves to `trial_scheduled`. If the voice agent booked it, verify it shows in **Leads** / **Today's Calls**.
5. 24h reminder sends automatically.
6. `$99 trial paid` Telegram fires and status moves to `trial_paid`. **Watch-out:** the paid trial is not auto-linked to the lead. Confirm the matching lead updated; fix by hand if not.
7. On trial day, check them in via **Trial Check-in** (`trial_attended`).
8. No-show recovery kicks off automatically; follow up personally if no response in 48h.
9. Enrolled families move to `enrolled` and should appear in **Enrolled Families**. Declines move to `lost` with a one-line reason. Never leave it blank.

---

## 3. Afterschool enrollment

Trigger: parent signs up for afterschool.
1. `afterschool enrollment signed` and (separately) `afterschool care paid` Telegram alerts fire. Parent gets the intake PDF + confirmation automatically.
2. **Watch-out (manual step):** signature, payment, and the **Afterschool Roster** are three separate unlinked records. The roster does not auto-populate.
3. Only after you see BOTH the signed alert AND the paid alert for a family, manually add the child to **Afterschool Roster**. Never add off one alert alone.
4. Reconcile weekly (daily is safer): check every afterschool alert name against the roster. Paid + signed but missing from roster gets added immediately.
5. Payment alert with no matching signature (or vice versa): do not roster them. Chase the missing piece first.

---

## 4. Camp registration

Trigger: parent registers for camp.
1. Registration + payment go through **Camp Registrations**. `camp paid` Telegram fires; parent gets the confirmation email.
2. The camp waiver link email is sent automatically after registration.
3. **Watch-out (invisible waiver):** when a parent signs the camp waiver, the ONLY confirmation is a `camp waiver` Telegram alert. There is no dashboard table for it. Do not look in **Waivers**; camp waivers are not there.
4. To confirm a camp waiver before a child attends: search staff Telegram history for the family name + "camp waiver" near their registration date. If you cannot find it, assume unsigned. Text/call to resend before drop-off.
5. Keep a running weekly list: `camp paid` and `camp waiver signed` are two separate checkboxes; both must be checked before a child is cleared.

---

## 5. One-off payments (supply fee, field trip)

Trigger: supply-fee or field-trip payment.
1. **Watch-out:** neither has an admin table. The only record is Stripe + the Telegram alert (`supply-fee paid` / `field-trip paid`). Field trip also emails the parent.
2. Treat the Telegram alert as the in-the-moment signal, not the permanent record.
3. **Manual reconciliation (weekly):** pull supply-fee + field-trip transactions from Stripe, cross-check against the Telegram alerts.
4. Keep a manual log (name, item, date, amount) for every one-off payment. This is the only durable record outside Stripe. Do not skip it.
5. Alert with no matching Stripe charge (or vice versa): flag immediately.

---

## 6. Phone vs voice agent

1. The Retell inbound agent answers when staff cannot; it can book trials, take pickup requests, take callbacks.
2. **Outbound voice (speed-to-lead, no-show, post-trial) is gated OFF until tested.** Manual follow-up calls are still your job until Arfa says it is live.
3. If you are at the desk and it rings, answer live. A human answer beats the agent.
4. Every call generates a Telegram alert. Watch for: voice-agent booked trial, pickup request, callback request. Verify each landed in **Today's Calls** / **Leads**.
5. Log calls you handle in **Call Log**.

---

## 7. Which link do I send?

Check **Links** in the dashboard for the current URL before sending from memory.

| Situation | Send |
|---|---|
| Wants to book a trial | Trial booking link (or book it yourself in Leads) |
| Registering for camp | Camp registration link |
| Camp waiver | Camp waiver link (auto-sent after registration; resend if lost) |
| Enrolling in afterschool | Afterschool enrollment link |
| Paying supply fee | Supply-fee payment link |
| Field trip | Field-trip payment link |
| General / in-person waiver | In-person waiver link, or handle in person via Waivers |
| Invoice / tuition question | Invoice Generator, or send the invoice |

---

## 8. Only Arfa handles

1. Stripe-vs-dashboard mismatches you cannot resolve with the manual steps above.
2. Turning the outbound voice agent on/off or changing what the agent says.
3. Recurring tuition billing (not automated yet; any tuition question beyond a one-time invoice).
4. n8n workflow failures (missing cron Telegram, stuck lead, duplicates not caught).
5. Refunds, disputes, any Stripe-level correction.
6. Structural changes to Leads stages, Afterschool Roster, or Camp flow.
7. New staff access, Telegram group membership, login issues.
8. Anything a parent frames as legal / safety / liability (injury, waiver dispute, custody/pickup conflict).
