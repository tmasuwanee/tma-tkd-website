# TMA Workflow Flowcharts (Target State)

If/then flowcharts for how TMA runs once the restructure lands. Covers both what **staff do** and the **behind-the-scenes automations**. These render as diagrams in Obsidian, GitHub, and VS Code (mermaid).

**Legend:** solid = built today · **dashed = planned** (Phase 2/3: unified signup, in-app tuition, coordinated no-show). `hello@` = customer email, TG = Telegram staff alert.

---

## 1. Front-desk daily driver (open → close)

```mermaid
flowchart TD
  A([Staff opens the dashboard]) --> B[Lands on TODAY]
  B --> C{Trials scheduled today?}
  C -->|Yes| D[Confirm each family's time]
  C -->|No| E[Move on]
  B --> F{Anyone on the call list?}
  F -->|Yes| G[Work the list top-down]
  F -->|No| H[Move on]
  G --> I{Reached them?}
  I -->|"Yes"| J[Book a trial or answer questions]
  I -->|"No answer"| K[Leave it - it auto re-queues]
  B --> L{After ~3pm?}
  L -->|Yes| M[Mark who Showed / No-show in Today]
  L -->|No| N[Later]
  M --> O([End of day: pipeline is current])
  J --> O
```

---

## 2. Lead lifecycle (the master pipeline)

```mermaid
flowchart TD
  New[New lead created] --> RT{"recordType = prospect/trial?"}
  RT -->|"No: order / enrolled / form"| Hide[Filtered out of the call pile - lives in its own section]
  RT -->|Yes| Board[Shows on Leads + Today call list]
  Board --> Reach{Reached & interested?}
  Reach -->|"Not interested"| Lost[Mark Lost]
  Reach -->|"No answer"| Requeue[Stays on list + auto follow-up]
  Reach -->|Yes| Booked[Book trial -> trial_scheduled]
  Requeue --> Board
  Booked --> Showed{Showed up to the trial?}
  Showed -->|Yes| Attended[trial_attended]
  Showed -->|No| NoShow[no_show -> recovery flow]
  Attended --> Signed{Signed up?}
  Signed -->|Yes| Enrolled[enrolled -> Enrolled Families]
  Signed -->|"Not yet"| Followup[Follow up to close]
  Followup --> Signed
  NoShow --> Rebook{Rebooked within recovery window?}
  Rebook -->|Yes| Booked
  Rebook -->|No| Final[no_show_final / Lost]
```

---

## 3. New lead intake (automation)

```mermaid
flowchart TD
  Form([Website form submitted]) --> Save[Server saves the lead + dedupes by email]
  Save --> Type{Inquiry or payment/form?}
  Type -->|Inquiry| Email[Email staff - titled by real source]
  Type -->|"Payment or signed form"| TG[Telegram: money/paperwork happened]
  Email --> Meta[Meta CAPI lead event]
  Meta --> N8N[n8n starts the email nurture]
  N8N --> Dash[Appears in dashboard: Leads + Today]
  TG --> Dash
  Dash --> Cron{8am daily}
  Cron -->|Hot lead| CallList[Added to the Telegram call list]
```

---

## 4. Trial reminders + no-show recovery (automation, coordinated)

```mermaid
flowchart TD
  Booked([Trial booked]) --> Rem24[n8n: 24h reminder email to parent]
  Rem24 --> AM[App 8am: 'trials today' -> TG staff]
  AM --> Checkin{Staff mark check-in}
  Checkin -->|Showed| Attended[trial_attended -> post-trial follow-up]
  Checkin -->|No-show| NS[Stage set to no_show]
  Checkin -->|"Not marked by 8:30pm"| Prompt[App: 'did they show?' -> TG]
  Prompt --> Checkin
  NS --> Coord{"Coordinated no-show owner (planned)"}
  Coord -->|Day 0| RecEmail[n8n: recovery email]
  Coord -->|"Day 0, if no reply"| RecCall[App: one outbound Retell call]
  RecEmail --> Reply{Rebooked?}
  RecCall --> Reply
  Reply -->|Yes| Booked
  Reply -->|"No after window"| Final[no_show_final]
  classDef planned fill:#fff7ed,stroke:#c2410c,stroke-dasharray:5 5,color:#7c2d12;
  class Coord,RecCall planned
```

---

## 5. Sign-up + waiver (target: unified)

```mermaid
flowchart TD
  Start([Family decides to enroll]) --> One{"One unified signup (planned)"}
  One --> Info[Collect child + guardian info once]
  Info --> Waiver[Sign waiver + policies: initials + signature]
  Waiver --> PDF[Signed PDF stored -> Waivers section]
  PDF --> Fees{One-time fees due?}
  Fees -->|Yes| Pay[Checkout - see chart 6]
  Fees -->|No| Skip[Skip]
  Pay --> Tuition{"Recurring tuition? (planned)"}
  Skip --> Tuition
  Tuition -->|"Option A"| Sub["App: Stripe subscription (planned)"]
  Tuition -->|"Option B"| Ext["Dedicated billing tool (planned)"]
  Sub --> Done[enrolled -> Enrolled Families + Students]
  Ext --> Done
  classDef planned fill:#fff7ed,stroke:#c2410c,stroke-dasharray:5 5,color:#7c2d12;
  class One,Tuition,Sub,Ext planned
```

---

## 6. Payment / checkout (target: one shared flow)

```mermaid
flowchart TD
  Pick([Pick a product/fee]) --> Startc["checkout.start: validate + price server-side (planned)"]
  Startc --> Order[Create pending order in our DB]
  Order --> Stripe[Stripe PaymentElement: card + Apple/Google Pay]
  Stripe --> Hook{"Stripe webhook: succeeded?"}
  Hook -->|Yes| Paid[Mark order paid - single source of truth]
  Hook -->|No / failed| Fail[Mark failed -> TG staff alert]
  Paid --> Fulfill[Create the domain record + receipt email + TG once]
  Fulfill --> DashP[Shows under Money: Orders/Camp/Enrolled]
  classDef planned fill:#fff7ed,stroke:#c2410c,stroke-dasharray:5 5,color:#7c2d12;
  class Startc,Order planned
```

Note: today each product has its own page + confirm; the planned shared flow collapses them and makes the **webhook** authoritative so a double confirm never double-charges or double-alerts.

---

## 7. Inbound phone call (Retell voice agent)

```mermaid
flowchart TD
  Ring([Inbound call]) --> Agent[Retell after-hours agent answers]
  Agent --> Intent{What do they want?}
  Intent -->|"Info / book a trial"| Verify[Read back name/DOB/phone]
  Verify --> Book{Booked a trial?}
  Book -->|Yes| Lead[n8n: create/update lead -> trial_scheduled]
  Book -->|No| Note[Log the call]
  Intent -->|"Pickup my child"| Pickup[TG: PICKUP - send child down now]
  Intent -->|"Wants a human"| Human[TG: callback requested]
  Lead --> TG[TG: call summary + Call Log]
  Note --> TG
  Pickup --> TG
  Human --> TG
```

---

## 8. Where do I find out about X? (alerting rule)

```mermaid
flowchart TD
  Event([Something happened]) --> Q{Do I need to act TODAY?}
  Q -->|Yes| TG[Telegram - the real-time feed]
  Q -->|"No, it's a record"| Email[Email - the paperwork to keep]
  TG --> Dash[Do the actual work in the DASHBOARD]
  Email --> Dash
  Dash --> Done([The dashboard is the worklist / source of truth])
```

---

## 9. Which link do I send? (staff decision tree)

```mermaid
flowchart TD
  Ask([What does the family want?]) --> A{Just curious?}
  A -->|Yes| Free["/free-class or /open-house"]
  A -->|No| B{Try a paid trial?}
  B -->|Yes| Trial["$99 trial (Students tab) or /back-to-school"]
  B -->|No| C{Enroll in after-school?}
  C -->|Yes| AS["/afterschool-register"]
  C -->|No| D{Only need to sign a form?}
  D -->|"Waiver"| W["/afterschool-waiver or /enroll"]
  D -->|"Bus transport"| T["/transportation"]
  D -->|No| E{Pay a specific fee?}
  E -->|"Supply fee"| SF["/supply-fee"]
  E -->|"Camp"| Camp["/camp-registration"]
  E -->|"Field trip"| FT["/field-trip"]
```

---

*Shared styling for planned nodes:*
```mermaid
%% add to any chart:
%% classDef planned fill:#fff7ed,stroke:#c2410c,stroke-dasharray:5 5,color:#7c2d12;
```
