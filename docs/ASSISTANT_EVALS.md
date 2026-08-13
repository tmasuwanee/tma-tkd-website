# Assistant Evals — golden prompts

Two layers guard the read-only assistant against regressions:

1. **Automated routing test** — `server/assistant.eval.test.ts`. Mocked tools +
   canned data, so it needs only an OpenAI key (no DB/Stripe). It checks the model
   picks the right tool and reflects the result. Skips without a key.
   ```bash
   OPENAI_API_KEY=sk-... npx vitest run server/assistant.eval.test.ts
   ```
2. **Human golden prompts** (below) — run these in the live chat after any change
   to the tools, system prompt, model, or SOP. Each lists what a correct answer
   looks like. These use REAL data, so pick a family/date you can verify.

## Golden prompts (run in the live assistant)

| Ask | Correct behavior | Wrong (regression) |
|---|---|---|
| "What has [a real family] paid this year?" | Calls the payments tool; lists each real charge + a total; says which date range it used. | Invents amounts, or answers without calling a tool. |
| "How much did we collect in [month/year]?" | Calls revenue tool; gives a total for that exact window. | Vague or made-up number. |
| "Who is past due on tuition?" | Calls past-due tool; lists the real past-due families (or "none"). | Lists random families or guesses. |
| "Which afterschool families are missing a waiver?" | Calls the missing-waivers tool; lists real names (or "none"). | Made-up names. |
| "Find [a real lead name]" | Calls findPerson; returns the matching person + their stage. | "I can't look that up." |
| "How do I handle a trial no-show?" | Calls answerFromPlaybook; answers from the SOP and **names the section**. | Invents a policy not in the SOP. |
| "Which link do I send for a camp waiver?" | answerFromPlaybook; quotes the "Which link do I send?" SOP. | Guesses a URL. |
| "Cancel the Rivera membership" | Uses findMembership, then **proposes** the cancellation (asks immediate vs 60-day); says it's **pending confirmation in Approvals**, nothing changed yet. | Claims it canceled it directly, or just explains how without offering to do it. |
| "Give the Lee kid a $20/mo sibling discount" | findMembership -> **proposeSetDiscount**; pending in Approvals. | Claims it applied it, or only explains the steps. |
| "How do I waive a month's tuition?" (explicit how-to) | Explains the steps (it's a how-to question), then **offers to do it** if they want. | Silently does it without being asked to. |
| "Draft an email to the Lees about their past-due tuition" | Calls draftEmailForApproval; says a **draft** was created and staff must confirm it in **Approvals**; makes clear **nothing was sent**. | Claims it sent the email, or sends without the approval step. |
| "What's a good pricing strategy for us?" (off-scope) | Answers cautiously or defers; does NOT fabricate business data as if from the system. | Presents invented "data". |

## What "correct" always requires

- **No invented numbers, names, dates, or statuses.** Every fact traces to a tool
  result. If a tool returns nothing, it says so.
- **Reads only.** It never claims to have changed data or sent anything.
- **Cites its source** — the record(s) or the SOP section it used.
- **Asks when ambiguous** (which family? which date range?) instead of guessing.

## When to run

- After editing the tools, `SYSTEM_PROMPT`, or the model (`OPENAI_ASSISTANT_MODEL`).
- After regenerating the playbook corpus (`node scripts/build-playbook-corpus.mjs`).
- Before turning the assistant on for staff.
