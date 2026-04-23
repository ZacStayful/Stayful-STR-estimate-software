# Stayful Intelligence

The customer-facing SaaS for the Stayful STR revenue estimator. Standalone
Next.js 16 app — auth, billing, saved searches, and paywall — destined for
`intelligence.stayful.co.uk`.

The estimate engine itself lives in the separate Stayful STR software repo;
this app calls it over HTTP via `INTERNAL_API_BASE_URL`.

## Stack

- Next.js 16 (App Router, Turbopack) + React 19
- Tailwind CSS v4 (dark sage theme, Playfair Display + DM Sans)
- Supabase (auth, Postgres, RLS) via `@supabase/ssr`
- Stripe Checkout + Billing Portal + webhooks
- Recharts for the monthly forecast chart

## Quick start (local)

```bash
npm install
cp .env.example .env.local
# fill in the env vars — see below
npm run dev
```

App boots at http://localhost:3000.

## Required environment variables

See `.env.example` for the full list. Each one you must set:

| Var | Where to get it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page (keep server-side only) |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Same page |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Developers → Webhooks → your endpoint |
| `STRIPE_PRO_PRICE_ID` | Stripe → Products → the £29/mo price |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` locally, prod URL in Vercel |
| `INTERNAL_API_BASE_URL` | Base URL of the existing Stayful STR deployment |

## Database setup

One-time, per Supabase project. Open the SQL editor and paste the contents of
`supabase/schema.sql`. It creates two tables with RLS enabled:

- `profiles` — one row per auth user; tracks `plan`, `searches_used`, Stripe IDs.
- `saved_searches` — user's bookmarked estimates.

It also registers an `on_auth_user_created` trigger so every new signup gets a
free-tier profile automatically.

## Stripe setup

1. Create a Product in Stripe called **Stayful Intelligence Pro**.
2. Add a recurring price: **£29.00 GBP / month**. Copy the Price ID into
   `STRIPE_PRO_PRICE_ID`.
3. Add a webhook endpoint pointing at `https://<your-app>/api/stripe/webhook`
   and subscribe to:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

## Supabase auth setup

1. **Email/password** is enabled by default; nothing to do.
2. **Google OAuth (optional)**: Auth → Providers → Google. Set the client
   ID/secret from your Google Cloud project.
3. Add these to **Auth → URL Configuration → Redirect URLs**:
   - `http://localhost:3000/auth/callback`
   - `https://<your-production-domain>/auth/callback`

## Deploying to Vercel

1. Push this repo to GitHub.
2. Import into Vercel — it auto-detects Next.js.
3. Set all env vars from `.env.example` in Project Settings → Environment
   Variables (both Preview and Production).
4. After first deploy, update `NEXT_PUBLIC_APP_URL` to the production URL and
   redeploy.
5. Add custom domain `intelligence.stayful.co.uk` — Vercel → Domains. Create
   a `CNAME` from that subdomain to `cname.vercel-dns.com`.

## How the estimate call works

1. Browser POSTs `{ address, guestCount }` to `/api/estimate`.
2. This app verifies the Supabase session and free-tier quota.
3. It derives a postcode + bedroom count and POSTs to
   `${INTERNAL_API_BASE_URL}/api/analyse` (the existing STR software's SSE
   endpoint).
4. The SSE stream is consumed server-side; we pick out the final
   `stage: "complete"` event and flatten its payload into the UI's
   `EstimateResult` shape.
5. `profiles.searches_used` is incremented, and the response is returned.

This means the new deployment depends on the existing STR deployment being
reachable. If `INTERNAL_API_BASE_URL` is unset or the upstream is down,
`/api/estimate` will surface a friendly error to the user.

## Routes

Public: `/`, `/pricing`, `/login`, `/signup`, `/auth/callback`
Authenticated: `/estimate`, `/dashboard`, `/upgrade`, `/account`

Auth gating lives in `src/proxy.ts` (Next.js 16's replacement for
`middleware.ts`).

## Project structure

```
src/
├── app/
│   ├── (public)/          auth pages + pricing (PublicNav + Footer layout)
│   ├── (authed)/          estimate tool, dashboard, account, upgrade
│   ├── api/               estimate, searches, stripe, account/delete
│   ├── auth/callback/     OAuth + magic-link handler
│   ├── layout.tsx         root (fonts, <html>)
│   └── page.tsx           landing page
├── components/
│   ├── intel-ui/          Button, Badge, Card, Field, Logo, Modal, Toast
│   ├── layout/            PublicNav, AppNavbar, Footer
│   ├── estimate/          search form, results, chart, comp table
│   └── dashboard/         saved search card, empty state
├── lib/intel/
│   ├── supabase/          browser/server/admin clients
│   ├── str-api.ts         HTTP client for the upstream STR estimate API
│   ├── auth.ts            session + profile helpers
│   ├── search-limits.ts   free-tier enforcement
│   └── (types, env, stripe, format, cn, postcode)
├── proxy.ts               auth-aware route protection
└── supabase/schema.sql    one-shot DB setup
```
