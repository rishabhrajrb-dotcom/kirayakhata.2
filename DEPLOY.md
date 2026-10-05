# Deploying KirayaKhata (GitHub → Vercel + Supabase + Gemini + Resend)

The steps are done in order. **Never paste a secret key into a chat, an issue or the code.** Keys go only into Vercel → Environment Variables, or into your own local `.env` file, which git ignores.

## What each service does

| Service | Used for | Required? |
|---|---|---|
| **Vercel** | Hosts the website and the `/api/*` functions | Yes |
| **Supabase** | Sign-in with an emailed code (needed to send email); durable limits for demo checks, emails and AI drafts; anonymous demo metrics; email audit log | Yes, for email and durable limits |
| **Resend** | Sends the tenant email with the invoice PDFs attached | Only for "Email to tenant" |
| **Gemini** | Rewords the demo explanation and drafts the tenant email text. It never calculates anything. | Optional |

Your **property records stay in each user's browser** in this release. Syncing records across devices is the next phase; the schema proposal is in `docs/supabase-schema.sql`.

## 1. GitHub

The code is pushed to `https://github.com/rishabhrajrb-dotcom/kirayakhata.2`. The repository is **public**.

- Make it private if you prefer: GitHub → *Settings → General → Danger zone → Change visibility*.
- No secrets are in the repository.

## 2. Supabase (about 10 minutes)

1. Go to https://supabase.com, choose **New project**, and pick the region closest to your users (for example Mumbai, `ap-south-1`). Save the database password somewhere safe.
2. Open **SQL Editor → New query**, paste all of `supabase/setup.sql`, and click **Run**. You should see "Success".
3. Open **Authentication → Sign In / Providers → Email**:
   - Email: **enabled**
   - Confirm email: **on**
4. Change the email template to send a code instead of a link:
   - Go to **Authentication → Emails → Templates → Magic Link**.
   - Make sure the body contains `{{ .Token }}`, for example: `Your KirayaKhata sign-in code is {{ .Token }}`.
5. Set the URLs:
   - Go to **Authentication → URL Configuration**.
   - Set **Site URL** to your Vercel URL (from step 4), for example `https://kirayakhata.vercel.app`.
6. For real users, add custom SMTP. Supabase's built-in email sender is heavily rate-limited and meant only for testing.
   - Go to **Authentication → Emails → SMTP Settings** and use Resend's SMTP: host `smtp.resend.com`, user `resend`, password = your Resend API key.
7. Copy the API values from **Project Settings → API**:
   - Project URL → `SUPABASE_URL`
   - `anon` public key → `SUPABASE_ANON_KEY`. This key is public by design.
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`. This one is **secret** and must only go into Vercel.

## 3. Resend, for "Email to tenant" (about 10 minutes)

1. Go to https://resend.com, sign up, then open **Domains → Add domain**. Use a domain you own, for example `yourname.in`. Add the DNS records it shows at your domain registrar and wait until the domain says **Verified**.
   - Without a verified domain, Resend only delivers to your own address. That's fine for testing, but not for real tenants.
2. Open **API Keys → Create** and give it "Sending access". Copy the key into `RESEND_API_KEY`.
3. Set `EMAIL_FROM` to an address on that domain, for example `KirayaKhata <invoices@yourname.in>`. When tenants reply, the reply goes to the signed-in landlord's own address.

## 4. Gemini (optional, about 2 minutes)

1. Go to https://aistudio.google.com/apikey and choose **Create API key**. Copy it into `GEMINI_API_KEY`.
2. `GEMINI_MODEL` defaults to `gemini-2.5-flash`. Change it if Google offers a newer Flash model to your account.
3. Check the free-tier limits and billing in AI Studio. KirayaKhata already caps usage at 20 drafts per user per day, and makes no AI calls on page views.

## 5. Vercel (about 5 minutes)

1. Go to https://vercel.com, choose **Add New → Project**, and import `rishabhrajrb-dotcom/kirayakhata.2`. This connects your GitHub account.
2. Use these settings:
   - Framework preset: **Other**
   - Root directory: `./`
   - `vercel.json` already sets the build (`npm run build`) and the output folder (`public`).
3. Under **Environment Variables**, add these for Production and Preview:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `RESEND_API_KEY`
   - `EMAIL_FROM`
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL` (optional)
4. Click **Deploy**. Every later push to `main` redeploys automatically, and every pull request gets a preview URL.
5. Copy the production URL back into Supabase as the Site URL (step 2.5).

## 6. Check that it works

- `https://<your-site>/api/health` should show:
  - `serverStore: "supabase"`
  - `auth: "Supabase Auth (email code)"`
  - `email: "Resend configured"`
- Landing page → **Try a ready example** shows a result and "4 demo checks left today". Refresh and run it again; the count should keep going down, which proves the limit is durable.
- **My workspace → Settings & data → Account for sending email**: enter your email, type in the code you receive, and you're signed in.
- Next, switch to **My records**:
  1. Add a property with your own email as the tenant's.
  2. Generate this month's invoices and issue them.
  3. Open the invoice and click **Email to tenant**. Optionally click **Write with Gemini**, then **Send now**.
  4. The email arrives with the PDFs attached.
  5. Click send again: the app warns that it was already sent, and if you continue it sends a fresh copy on purpose. A plain retry never sends twice.
- In Supabase, the **Table Editor** shows `kk_email_log` rows. Only the recipient's domain is stored, never the full address.

## Running locally with the same services

Copy `.env.example` to `.env`, fill in the values, then run:

```bash
npm install
npm run build
npm start
```

## Costs to expect

Vercel Hobby, the Supabase free tier, the Resend free tier and the Gemini free tier are usually enough for a small pilot. Check each provider's current pricing page before inviting many users.
