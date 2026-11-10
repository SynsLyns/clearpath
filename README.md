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

Each successful CSV download and printable compliance record is recorded in the append-only `ExportLog` with the reviewer, export type, filters, row count, and timestamp. Export actions check the reviewer role server-side. The printable submission record includes its version chain, creative, flags, decisions, activity, and attachment metadata; use the browser's **Print / Save as PDF**. File links remain authenticated ClearPath links. CSVs include attachment names and counts only, never stored Blob URLs. Attachments are stored privately and delivered through authenticated, short-lived links.

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
- The rules are deliberately a small first-pass screen, not a legal interpretation or a replacement for reviewer judgment.
- The displayed ClearPath NMLS ID (`12345678`) is fictional and exists only for the one-click disclosure helper.
- Attachments are stored in private Vercel Blob and routed to manual review. Authenticated file delivery checks the request role and submission ownership, then redirects to a five-minute, file-scoped signed Blob URL so file bytes are delivered by Blob rather than proxied through the app. Production should replace demo role cookies with real authentication and add malware scanning.
- PDF and image text extraction runs locally after the submission response, so submitters do not wait for OCR. Reviewers see a processing status that refreshes until results are ready; decisions are blocked while an attachment is processing. The work uses Next.js `after()` within the Vercel function's configured maximum duration, not a durable external queue. Extracted text is retained with the attachment for reviewer use and is not included in CSV exports; request archiving retains it with the rest of the audit record.
- Seed timestamps are relative to the current time so the queue and “waiting” indicators remain useful during a demo.

## Throughput story (assumptions, not measured outcomes)

The assumed spreadsheet/email baseline is about five calendar days across intake, triage, first review, rework, and status updates. ClearPath’s target state is a few hours for flagged work and near-zero human wait for clean work, with faster rework because the creative and feedback stay together.

Every number below is a planning assumption rather than a measured production result. See [docs/problem.md](./docs/problem.md) for the stage-by-stage breakdown.

## Rule design

The rule set is inspired by principles from UDAAP, Regulation Z (TILA) advertising requirements, the FTC Endorsement Guides, and Fair Housing advertising practice, along with NMLS licensing norms. It is illustrative, not a statement of legal requirements or legal advice, and in production it would be owned, reviewed, and versioned by Compliance. Regulation DD, GLBA privacy notices, and TCPA are documented extension dimensions rather than built rules: they mainly concern deposit-account disclosures, privacy notices, and call or text consent capture, not marketing copy, so they are out of scope for this version.

## Current limitations

- **Authentication and access control:** the role picker uses demo cookies, not production authentication. There is no tenant isolation or reviewer assignment.
- **Attachment screening:** PDF and image text extraction runs after submission and extracted text is checked against the rules. Processing is limited; extraction can miss text or visual context, and every attachment still needs human review. Audio/video transcription, video-frame analysis, and link fetching are not implemented. See [Assumptions](#assumptions) for upload and extraction limits.
- **Email intake and notifications:** submissions are entered through the form. There is no email ingestion or notification delivery; status and audit history are available in the app.
- **Operational measurement:** queue and partner metrics are directional demo metrics. Cycle time, false-positive rates, and QA outcomes have not been measured against real production traffic.
- **Production safeguards:** malware scanning, retention/redaction policies, and tamper-evident file integrity checks are not implemented.
- **Exports:** CSV downloads are capped at 4 MB; there are no scheduled exports or XLSX workbooks.

## Next steps

1. Validate rule content, applicability, severity, and evidence requirements with Compliance before relying on it; establish an approval process and immutable rule versions.
2. Replace demo role cookies with SSO, tenant-aware authorization, and reviewer assignment.
3. Move attachment extraction to a durable job queue so processing is reliable beyond a single function's execution window.
4. Instrument real workflow timestamps and measure cycle time, false positives, and QA findings against the assumed baseline.
5. Define malware scanning, retention, redaction, and file-integrity controls for production.
6. Add notifications for actionable ownership and SLA events once identity and assignment are in place.
7. Consider a Compliance-owned rule editor, larger or scheduled exports, and additional analytics only when operational needs justify them.

Rules live in `lib/rules.ts` as a small, versioned ruleset. In production, Compliance should own the rule definitions, approval process, effective dates, and version history.
