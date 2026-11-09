# ClearPath

ClearPath replaces a slow marketing-compliance review loop built around spreadsheets and email with a shared submission, triage, decision, and resubmission workspace.

Marketing can check creative copy before submitting and see its status and audit trail without asking for an update. Compliance gets a queue ordered by SLA age and weighted risk, a first-pass rules report, and a structured decision record. Clean submissions can auto-clear while a small random sample remains in the human queue.

## Architecture

```text
Browser
  └─ Next.js 16 App Router
       ├─ Server Components: role-gated pages and read-only views
       ├─ Server Actions: validated submission, resubmission, and review mutations
       ├─ Pure TypeScript rules engine (shared by live check and server validation)
       └─ Prisma 8 ORM ── Neon Postgres
            ├─ Submission / RuleCheck
            └─ Review / AuditEvent
```

The app uses server components and server actions only; there is no separate API service or client-side state library. Data access is contract-first through `src/prisma/contract.prisma` and `src/prisma/db.ts`.

## Run locally

Requirements: Node.js 26+ and npm.

1. Copy `.env.example` to `.env` and set `DATABASE_URL` to a development Postgres database.
2. Install and prepare the contract:

   ```sh
   npm install
   npm run contract:emit
   npx prisma db update
   npm run seed
   ```

   `db update` applies the contract to the configured database. The seed script replaces only rows whose ids begin with `seed-`; use a development database.
3. Start the app:

   ```sh
   npm run dev
   ```

4. Visit `http://localhost:3000`. Choose “I’m a submitter” or “I’m a reviewer”; use “Switch role” to change the demo identity.

Useful checks:

```sh
npm run rules:check
npm run lint
npm run build
```

## Demo identity

Authentication is intentionally stubbed. The role picker writes an HTTP-only role cookie; the submitter is Jordan Lee (Marketing), and the reviewer is Priya Nair (Compliance). Marcus Webb (Compliance) appears in the seeded review history. This is a demo convenience, not production authentication or authorization.

## Assumptions

- The 24-hour service-level target, rule severities, 10% QA sample, and all cycle-time estimates below are illustrative assumptions.
- NMLS is required for mortgage and personal-loan creatives, but not credit-card creatives. In production Compliance would confirm this by state and product.
- The rules are deliberately a small first-pass screen, not a legal interpretation or a replacement for reviewer judgment. A “100% online” phrase currently triggers the APR check; this known false positive can be dismissed with a reviewer note.
- Seed timestamps are relative to the current time so the queue and “waiting” indicators remain useful during a demo.

## Product decisions

| Decision | Choice and rationale |
| --- | --- |
| NMLS applicability | Require an NMLS ID for mortgage and personal-loan creatives, not credit cards. Mortgage originators and many state-licensed consumer lenders are tracked through NMLS; credit cards are typically issued by banks that are not NMLS-licensed. State-level applicability remains a production Compliance decision. |
| Auto-clear | When there are zero failed rules, auto-clear 90% of the time and send a random 10% QA sample to the human queue. Auto-clear is the main throughput lever; sampling retains a low-cost quality signal because regex checks can miss context. |
| Nice-to-haves | Implemented both keyboard shortcuts and reviewer flag dismissal. If time is constrained, flag dismissal is the more valuable human override for false positives; shortcuts are inexpensive workflow polish. Schema support for dismissal is present independently of its UI. |
| Queue ordering | SLA-breached submissions first, then weighted risk score descending, then oldest first. SLA-first reduces starvation while risk still prioritizes higher-impact flags. |
| APR check | Fire only if the creative states a rate or payment and omits APR. Disclosure requirements are conditional; an always-on check would flag ordinary copy and undermine trust in the rules. |
| Resubmission | Request changes creates a linked new version. Rework is a major cycle-time cost, so a decision must lead to a visible, actionable next step rather than a dead end. |
| Cache Components | Disabled the starter’s Cache Components and partial-prefetching flags because this app follows the plan’s explicit request-time rendering requirement for database-backed pages, and Next.js 16 rejects `force-dynamic` route config when Cache Components is enabled. |

## Throughput story (assumptions, not measured outcomes)

The assumed spreadsheet/email baseline is about five calendar days across intake, triage, first review, rework, and status updates. ClearPath’s target state is a few hours for flagged work and near-zero human wait for clean work, with faster rework because the creative and feedback stay together.

Every number below is a planning assumption rather than a measured production result. See [docs/problem.md](./docs/problem.md) for the stage-by-stage breakdown.

## What I deliberately didn’t build and why

- **OCR:** the take-home focuses on copy review and throughput; extracting text from image/PDF uploads would add a separate ingestion and accuracy problem.
- **Email ingestion:** structured intake catches missing product/channel context and keeps the review history in one place. Importing mail would preserve the ambiguity the workflow is meant to remove.
- **SSO / production auth:** seeded role cookies make the demo navigable without adding an auth provider, but they are not safe for a real compliance workspace.
- **Notifications:** self-serve status and the audit trail remove routine “any update?” pings. Email and Slack notifications can follow once routing and ownership are real.
- **Advanced analytics:** one page measures the cycle-time and rule-failure signals needed to demonstrate the throughput thesis; broader reporting is out of scope.

## What I’d do next

1. Have Compliance validate each rule, state applicability, severity, and required evidence; then make rulesets immutable and versioned.
2. Replace the role cookie with SSO, tenant-aware authorization, and reviewer assignment.
3. Add controlled creative attachments and channel-specific rendered previews.
4. Instrument real stage timestamps and compare cycle time, false-positive rate, and QA findings against the assumed baseline.
5. Add notifications only for actionable ownership or SLA events.

Rules live in `lib/rules.ts` as a small, pure ruleset and are stamped as `v1` on every submission and review. In production, Compliance should own the rule definitions, approval process, effective dates, and version history.
