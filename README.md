# KirayaKhata

Rent, GST and tax-deadline assistant for small Indian landlords. **Deploying:** see [DEPLOY.md](DEPLOY.md) (Vercel + Supabase + Resend + optional Gemini).

Rent invoices, payment matching, a compliance calendar and year-end records for small Indian landlords. Runs entirely on your own computer. It needs no accounts, cloud services or API keys.

**Agreement → invoice → share → match payment → next deadline → year-end records.**

## Start

```bash
npm install
npm run build
npm start
```

Then open **http://localhost:4173**. The landing page and demo are at `/` and the workspace is at `/app`.

- `npm test` runs 58 engine, API, guardrail and i18n tests with `node --test`.
- `GET /api/health` reports readiness and never shows secret values.
- Node was installed here as a portable build in `%LOCALAPPDATA%\Programs\node`. Add it to PATH, or run `"%LOCALAPPDATA%\Programs\node\node.exe" scripts/dev-server.js`.

### Reset

- **Your records** live in your browser's IndexedDB. Go to `/app` → *Settings & data*, where you can Export backup, Import, Delete workspace or Reset sample.
- **Anonymous demo counts** are kept by the server in `work/local-data/`. Clear them with `npm run reset-local`.

## What works locally

| Area | Status |
|---|---|
| Animated landing page (EN/हिं) with a working demo, invoice studio, calendar and sample year-end pack | Working |
| Properties, units, tenants and agreements with effective-dated versions | Working (IndexedDB, device-only) |
| One-click and bulk monthly drafts from one `generateBillingForPeriod` service, idempotent per agreement + unit + period + category + supplier | Working |
| Percentage (compounding or simple), fixed and dated step-up escalation, each charge escalating on its own schedule | Working |
| Proration (daily or full-month), with a one-time decision when no policy is set; leap years; billing day 31 | Working |
| Pause, end tenancy, new tenant (history kept), archive, catch-up preview | Working |
| Draft → issue: transactional numbering (`PREFIX/YYYY/0001`, 16-character limit), immutable snapshots, stale-draft flags, supersede and recalculate, credit-note draft | Working |
| Three templates (Classic Ledger, Modern Minimal, Professional Letterhead) as matching HTML previews and jsPDF output; ZIP of separate PDFs | Working |
| Email: `mailto:` draft (you attach the PDFs yourself), plus a practice outbox that simulates success, failure and retry without duplicates | Working; **nothing is ever sent** |
| Receipts: manual entry or bank CSV import, suggested allocations you confirm, partial payments, excess amounts, deposits kept separate, duplicate guard | Working |
| Calendar: monthly/QRMP, state 22nd/24th, IFF, PMT-06, CMP-08, rent due dates, TDS certificate follow-ups, lease expiry, conditional advance tax, `.ics` with 5-day and 1-day alarms | Working; marked for CA verification |
| Year-end: ledger CSV, summary, document index and a ZIP containing the actual PDFs | Working; **not an income-tax return** |
| Local scheduler | Runs **only while `/app` is open** |

## Not part of this build

The following are planned, and adapters are stubbed in `lib/integrations/`:

- Sign-in
- Cloud sync
- Real email delivery
- Unattended monthly runs while the computer is off
- GST or income-tax filing
- AIS/26AS retrieval

There are no "sent", "filed", "paid" or "government verified" states anywhere. See [docs/production-roadmap.md](docs/production-roadmap.md).

## Tax rules

All rates, thresholds and dates live in `shared/compliance-config.js`. Each one carries its source, its effective dates and a status (`SOURCE_CHECKED`, `REQUIRES_CA_VERIFICATION` or `REVIEW_ONLY`). None is marked "verified".

Every scenario returns one of `SUPPORTED`, `NEEDS_MORE_INFORMATION` or `NEEDS_SPECIALIST_REVIEW`. The engine never treats missing facts as zero GST, and no LLM is involved in any calculation. See [docs/coverage-matrix.md](docs/coverage-matrix.md) and [docs/sources.md](docs/sources.md).

## Layout

```text
public/   index.html styles.css app.js motion.js i18n.js pdf.js   (landing)
          app.html app.css i18n-app.js js/workspace.js js/store-idb.js js/exports.js
          assets/ (optimised WebP)   vendor/ (jsPDF, copied by npm run build)
shared/   money dates words rules escalation billing billing-service calendar
          compliance-config messages schemas csv zip examples memory-repo
api/      close-month compliance-calendar stats health
lib/      local-store rate-limit sanitize prompt gemini integrations/*
scripts/  dev-server build optimize-images.py reset-local
tests/    rules billing calendar guardrails
docs/     design-system motion-storyboard coverage-matrix sources assets production-roadmap supabase-schema.sql
```

## Optional settings (`.env`)

Copy `.env.example` to `.env` and fill in values only if you want them.

- `GEMINI_API_KEY` rewords explanations on the server side only. The output is checked so it cannot change numbers, add claims or exceed 90 words. If anything fails, the app falls back to its own deterministic text.
- `OPENAI_API_KEY` is used by nothing at runtime. It exists only for a separate image-generation helper, if you ever add one.

Never put keys in browser code or in chat.

## Where Gemini is used (and where it is not)

Gemini is **optional**. Without a key everything works, and deterministic text is used instead.

| Where | What Gemini does | Safeguards |
|---|---|---|
| `POST /api/close-month` (landing "Check this month's rent") | Rewords the explanation of an already-computed result in plain English or Hindi | Sees only computed amounts and statuses (no names); output is rejected if it adds numbers, claims "filed/paid/verified", or exceeds 90 words; falls back to fixed text |
| `POST /api/draft-email` (workspace → invoice → Email to tenant → "Write with Gemini") | Drafts a polite email for the attached invoices | Signed-in users only, 20 drafts per day; sees only the period, document numbers, totals and due dates; names are filled in by the browser from placeholders; drafts that invent numbers or mention penalties are rejected |

Gemini **never** calculates GST, TDS, rent, escalation, dates or registration. It never decides a tax treatment, and it never sends anything.

## Email to tenant

From an issued invoice, click **Email to tenant (PDFs attached)**. The server (`/api/send-invoices`) then:

1. Checks that you are signed in.
2. Validates the PDFs.
3. Applies a limit of 30 emails per day.
4. Sends through Resend with an idempotency key, so a double-click or retry never sends twice.
5. Logs the send in Supabase, storing the recipient's domain only.

The status shown is "Accepted by email service"; inbox delivery is not confirmed. In the sample workspace, real sending is disabled.
