# Production roadmap

Nothing in this list has been done yet. No GitHub push, Vercel deployment or Supabase project exists, and no email has been sent.

## Order of work

1. **Rules review.** A CA reviews every `REQUIRES_CA_VERIFICATION` row in `shared/compliance-config.js` against the notifications themselves. Record the reviewer and date, and bump `RULESET_VERSION`. Add notification-level sources for 05/2022, 07/2025 and 09/2024-CTR, and for the TDS rate tables.
2. **Auth and data ownership.** Set up Supabase Auth with email OTP or password plus recovery. The owner is always derived from the verified session (`auth.uid()`), never from a client-supplied `owner_id`.
3. **Storage swap.** Implement the repo contract against Postgres:
   - `get/put/list/findOne/tx` map to server endpoints that run `generateBillingForPeriod`, `issueInvoice` and the rest inside a database transaction.
   - Unique constraints: `invoices(owner_id, active_key)`, `invoices(owner_id, supplier_id, fy, number)`, `outbox(owner_id, idempotency_key)`.
   - Number allocation uses `SELECT … FOR UPDATE` on the supplier series row.
4. **Schema and policies.** Apply `docs/supabase-schema.sql`, which is a proposal and has not been applied. RLS is on every private table:
   - Ownership checks on parent and child rows.
   - `WITH CHECK` blocks moving rows to another owner or attaching a child to someone else's parent.
   - Private Storage buckets for PDFs and signatures, with per-owner path policies.
5. **Secrets.** Keep the service-role key, email key and Gemini key server-side only, in the Vercel environment. Rotate them, and never expose them in client bundles.
6. **Durable scheduler and email.**
   - A Vercel Cron or Supabase scheduled function calls the same `generateBillingForPeriod` once a day for agreements whose owner opted in to `auto_draft`. Drafts only.
   - Issue and email only follow the owner's approval preference.
   - The email provider (for example Resend or SES) attaches server-rendered PDFs, records delivery events, and uses its own idempotency key so retrying a document never re-sends a delivered email. Tenant-contact consent is recorded.
7. **Rate limiting and metrics.** Move the five-checks-per-24-hours demo limit and the anonymous metrics into Postgres or Upstash, since the local JSON files are not durable on serverless. Use a service-role-only table for anonymous stats; never use that pattern for private records.
8. **Staging tests.**
   - Two-user isolation (read, update and download another owner's IDs must fail).
   - Cross-device restore; logout and recovery.
   - Idempotent local import; scheduler double-run; email retry.
9. **GitHub and Vercel**, only when the owner authorises it: private repository, preview deployments, then production.

## Importing local records after sign-in

- Export from `/app` → *Settings & data*, then preview the import in the signed-in account.
- The import is explicit. It is never automatic, and never attaches another device user's data.
- Map each local ID to a server ID and record the source export hash, so retries are idempotent.
- Issued numbers are kept exactly as they are. Any collision is reported for manual resolution and never renumbered.
- The rollback path is to keep the export file; the server import is one transaction per file.

## Filing integrations

These remain mocks (`lib/integrations/gst-provider.js` and `income-tax-provider.js`). Making them real needs:

- an authorised GSP/ASP or ERI;
- consent;
- reviewed rules;
- reliable filing status and evidence;
- per-return approval.

No portal scraping, no stored passwords or OTPs, and no mock "filed" status.

## Retention and deletion

Owners can export and delete their data. Deletion removes both database rows and Storage objects. Keep an audit trail (the `audit` store already exists locally) and back up the database daily.

## Planned tests (not yet passed)

These need a configured Supabase project:

- RLS two-user isolation
- Storage policy isolation
- Cross-device restoration
- Logout and recovery
- Idempotent local import
