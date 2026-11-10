# ClearPath

ClearPath replaces a slow marketing-compliance review loop built around spreadsheets and email with a shared submission, triage, decision, and resubmission workspace.

Marketing can check creative copy before submitting and see its status and audit trail without asking for an update. Requesters can update any active request by creating a linked version, or archive an entire request history without deleting it. Compliance gets a searchable queue ordered by SLA age and weighted risk, plus an all-requests history with status and product filters and version navigation. Clean submissions can auto-clear while a small random sample remains in the human queue.

The **Rules** page is a read-only reference generated from the same versioned rule configuration used by the live self-check and server-side validation. It explains applicability, severity, rationale, fixes, and example copy; `npm run rules:check` verifies every example against the rules engine. The NMLS ID in its examples is fictional.

## Architecture

```text
Browser
  └─ Next.js 16 App Router
       ├─ Server Components: role-gated pages and read-only views
       ├─ Client Components: live search and filter controls
       ├─ Server Actions: validated submission, resubmission, and review mutations
       ├─ Pure TypeScript rules engine (shared by live check and server validation)
       └─ Prisma 8 ORM ── Neon Postgres
            ├─ Submission / RuleCheck
            ├─ Review / AuditEvent
            └─ ExportLog
```

The app uses server components for data-backed views and server actions for mutations; client components handle interactive filters and form state. There is no separate API service or client-side state library. Data access is contract-first through `src/prisma/contract.prisma` and `src/prisma/db.ts`.

## Compliance exports

Reviewers can use **Exports** to download four filtered CSVs: the submissions register, decision log, audit events, and failed-rule detail. Filters cover the UTC date range, partner/campaign, product, channel, and status; the submissions register can optionally include creative text. CSV output uses Excel-safe formula-injection protection, UTF-8 BOM, and UTC timestamps. Exports are limited to 4 MB; narrow the filters if a download exceeds that cap.

Each successful CSV download and printable compliance record is recorded in the append-only `ExportLog` with the reviewer, export type, filters, row count, and timestamp. Export actions check the reviewer role server-side. The printable submission record includes its version chain, creative, flags, decisions, activity, and attachment metadata; use the browser's **Print / Save as PDF**. File links remain authenticated ClearPath links. CSVs include attachment names and counts only, never stored Blob URLs. This maintains v3's private Blob delivery rather than following the add-on plan's outdated description of public blobs.

`RuleCheck` has no independent checked-at timestamp, so the flag export's `checked_at_utc` uses the associated submission's creation time. It should not be interpreted as a separately measured rule-engine execution time.

## Run locally

Requirements: Node.js 26+ and npm.

1. Copy `.env.example` to `.env` and set `DATABASE_URL` to a development Postgres database. To enable file uploads, create a **private** Vercel Blob store, connect it to the project, and select **Add a read-write token env var to this connection**. Include Development for local use, then run `vercel env pull`. Blob access mode cannot be changed after creation; existing public blobs must be copied to the private store and the public originals deleted. Never commit the token; link-only submissions work without Blob credentials.
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
npx tsx scripts/export-check.ts
npm run lint
npm run build
```

## Demo identity

Authentication is intentionally stubbed. The role picker writes an HTTP-only role cookie; the submitter is Jordan Lee (Marketing), and the reviewer is Priya Nair (Compliance). Marcus Webb (Compliance) appears in the seeded review history. This is a demo convenience, not production authentication or authorization.

## Assumptions

- The 24-hour service-level target, rule severities, 10% QA sample, and all cycle-time estimates below are illustrative assumptions.
- NMLS is required for mortgage and personal-loan creatives, but not credit-card creatives. In production Compliance would confirm this by state and product.
- The rules are deliberately a small first-pass screen, not a legal interpretation or a replacement for reviewer judgment. A “100% online” phrase currently triggers the APR check; this known false positive can be dismissed with a reviewer note.
- The displayed ClearPath NMLS ID (`12345678`) is fictional and exists only for the one-click disclosure helper.
- Attachments are stored in private Vercel Blob and routed to manual review. Authenticated file delivery checks the request role and submission ownership before streaming the blob. Production should replace demo role cookies with real authentication and add malware scanning.
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
| Request updates and archive | Requester updates always create a new linked version and preserve prior decisions. Archiving hides every version in the chain from the requester list but retains the records and audit trail for Compliance. |
| Cache Components | Disabled Cache Components because it conflicts with `force-dynamic`; all database pages are request-time and database-backed, so there is no caching benefit. |
| Rule authority labels | Store a regime-level authority on each rule check and render it as a separate tag, rather than adding regulatory language to the rule message. Historical rows fall back to the current rule definition when the stored value is null. |
| Testimonial detection | Use a narrow testimonial trigger and separate disclosure phrases; avoid broad matches such as bare “review” or “paid”. |
| Fix hints and disclosures | Show a suggested fix with each self-check flag and, after a changes-requested decision, on the request detail. The one-click disclosure helper appends standard sample disclosures using the fictional NMLS ID above; Compliance must verify copy before production use. |
| Reviewer comments | Prefill Request changes and Reject comments with undismissed flag messages. Reviewers can edit the draft before recording a decision. |
| Reviewer queue filters | Retain SLA-first ordering and add a channel filter. Filter options show counts from the pending queue. |
| Partner scorecard | Show top-level request totals, first-pass approval rate among decided requests, and the most frequent unresolved rule per partner. These are directional demo metrics, not performance claims. |
| Attachments and links | V3 overrides the earlier no-upload/API-route scope decision: allow up to five files or links, upload files directly to private Vercel Blob, use an authenticated upload-token Route Handler, and stream file reads through an ownership-checked route. No server action carries file bytes, and attachments always require manual review. |
| Attachment safety and limits | Block executable extensions; limit files to 100 MB each and five attachments per request. Links are stored as text, opened in a new tab, and never fetched or scraped. Limits are take-home assumptions. |
| Blob storage deviation | Vercel Blob client uploads require one token Route Handler. Private blob reads are proxied only after role and submission-ownership checks. Non-text files are not processed; their metadata and manual-review flag are stored with each version. |
| Rules reference source | Generate the reference directly from `RULES`, `RULE_VERSION`, and shared constants so displayed guidance cannot drift from enforced checks. |
| Rules page audience | Make the reference available to both submitters and reviewers: submitters can correct copy before intake, and reviewers can link to consistent guidance. |
| Rule ownership | Keep rule content in version-controlled code rather than a database editor; a regulated rules editor needs explicit ownership, approval, and change-history workflows. |
| Verified examples | Store failing and passing examples with each rule and have the rules check script prove both outcomes in their declared product/channel context. |
| Rules page numbers | Import severity weights, SLA hours, and QA sampling rate from the shared constants instead of duplicating enforced values in UI copy. |
| Rules page filters | Use a server-rendered GET form for product, channel, severity, and text search to fit the current stack and provide shareable filter URLs. |
| Rule flag references | Open each “Why?” reference in a new tab so submitters retain their in-progress creative and reviewers retain their decision context. |
| Rules page data access | Keep the reference free of database reads; require a demo role but render from static rule configuration. |
| Export delivery | Return CSV data from reviewer-guarded server actions and download it as a browser Blob; do not add a download API route. |
| Export formats | Use CSV for tabular data and browser print-to-PDF for a single submission record instead of adding XLSX or PDF dependencies. |
| Export timestamps | Format exported timestamps in UTC as `YYYY-MM-DD HH:MM:SS` and mark timestamp column names with `_utc`. |
| Export attachment data | Include attachment counts and names, but never URLs. Keep private Blob links behind the existing authenticated in-app delivery. |
| Export audit trail | Record each successful CSV and printable-record export in `ExportLog`, including actor, kind, filters, row count, and time. |
| Flag check timestamp | Use the submission timestamp as `checked_at_utc` because the current RuleCheck model does not record a check timestamp. |

## Throughput story (assumptions, not measured outcomes)

The assumed spreadsheet/email baseline is about five calendar days across intake, triage, first review, rework, and status updates. ClearPath’s target state is a few hours for flagged work and near-zero human wait for clean work, with faster rework because the creative and feedback stay together.

Every number below is a planning assumption rather than a measured production result. See [docs/problem.md](./docs/problem.md) for the stage-by-stage breakdown.

## Rule design

The rule set is inspired by principles from UDAAP, Regulation Z (TILA) advertising requirements, the FTC Endorsement Guides, and Fair Housing advertising practice, along with NMLS licensing norms. It is illustrative, not a statement of legal requirements or legal advice, and in production it would be owned, reviewed, and versioned by Compliance. Regulation DD, GLBA privacy notices, and TCPA are documented extension dimensions rather than built rules: they mainly concern deposit-account disclosures, privacy notices, and call or text consent capture, not marketing copy, so they are out of scope for this version.

## What I deliberately didn’t build and why

- **Automatic media processing:** OCR, transcript extraction, and other non-text processing are not built; attached material is always routed to manual review.
- **Email ingestion:** structured intake catches missing product/channel context and keeps the review history in one place. Importing mail would preserve the ambiguity the workflow is meant to remove.
- **SSO / production auth:** seeded role cookies make the demo navigable without adding an auth provider, but they are not safe for a real compliance workspace.
- **Notifications:** self-serve status and the audit trail remove routine “any update?” pings. Email and Slack notifications can follow once routing and ownership are real.
- **Broad analytics:** the partner scorecard and operational metrics address the first throughput questions; more extensive reporting is out of scope.

## What I’d do next

1. Have Compliance validate each rule, state applicability, severity, and required evidence; then make rulesets immutable and versioned.
2. Replace the role cookie with SSO, tenant-aware authorization, and reviewer assignment.
3. Instrument real stage timestamps and compare cycle time, false-positive rate, and QA findings against the assumed baseline.
4. Add notifications only for actionable ownership or SLA events.
5. Add a Compliance-owned rule editor with an approval workflow and immutable change history.
6. Let submitters suggest a rule or report a false positive for Compliance to triage.
7. Add XLSX export when spreadsheet formatting or multiple worksheets are needed.
8. Add streamed downloads for exports larger than the current 4 MB cap; this would require a download route.
9. Add scheduled exports with an appropriate notification and delivery mechanism.
10. Add tamper-evident file hashes and define retention and redaction rules for exported personal data.

**Multimedia processing.** Attachments of any format (emails, web pages, PDFs, images, audio, video) are accepted and always routed to manual review, because nothing non-text is processed yet. Next steps: text extraction for .eml and HTML files, OCR for images and scanned PDFs, speech-to-text for audio and video with the same rules run on the transcript, and sampled frame analysis for video. Storage uses private Blob URLs with authenticated application delivery; production should add malware scanning and replace demo role cookies with real authentication.

Rules live in `lib/rules.ts` as a small, pure ruleset and are stamped as `v1` on every submission and review. In production, Compliance should own the rule definitions, approval process, effective dates, and version history.
