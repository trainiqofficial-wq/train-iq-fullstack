# Train IQ - Full Stack

A lead-generation funnel for local businesses, with a protected admin dashboard.

- **Public site** (`/`): a 5-step questionnaire that builds a personalised roadmap, then captures the lead. No admin controls on this page.
- **Admin dashboard** (`/admin`): sign in with a real username and password, then search, filter, update status, delete, and export leads as CSV. It is not linked from the public site.
- **API** (Express): validates every submission, rate-limits abuse, and stores leads in Supabase (or a local JSON file during development).

```
server.js            Express app (API + static files)
src/                 config, auth, db, validation, routes
public/              public funnel (index.html) and /admin dashboard
db/schema.sql        Supabase table + row-level security
scripts/             password-hash helper
vercel.json          Vercel deployment config
```

## Run locally

```bash
npm install
cp .env.example .env
npm run hash-password -- "choose-a-strong-password"   # copy the output line into .env
npm run dev
```

Open http://localhost:3000 for the public site and http://localhost:3000/admin to sign in.

With no Supabase keys set, leads are saved to `data/leads.json` so you can try everything without a database.

## Set up the database (Supabase)

1. Create a project at https://supabase.com.
2. Open **SQL Editor**, paste the contents of `db/schema.sql`, and run it. It is safe to re-run and also upgrades the table from the first version of this project.
3. In **Project Settings > API**, copy the project URL and the **service_role** key into `.env` as `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

The service-role key must stay on the server. The table has row-level security enabled with no public policies, so the public anon key cannot read or write leads.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Database. Required in production. |
| `ADMIN_USERNAME` | Admin login name (default `admin`). |
| `ADMIN_PASSWORD_HASH` | bcrypt hash from `npm run hash-password`. Admin login stays disabled until set. |
| `JWT_SECRET` | Long random string that signs admin sessions. Required in production. |
| `PORT` | Local port (default 3000). |

Generate a secret with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

## Deploy to Vercel

1. Push this folder to GitHub and import it in Vercel.
2. Add the environment variables above, plus `NODE_ENV=production`.
3. Deploy. The public site is at your domain and the dashboard at `/admin`.

## Security notes

- Admin passwords are checked against a bcrypt hash; there is no password in the front-end code.
- Sessions are signed JWTs in an `httpOnly`, `SameSite=Strict` cookie (`Secure` in production) that expire after 8 hours.
- Login is limited to 6 failed attempts per 15 minutes per IP; lead submissions to 8 per 15 minutes.
- All input is validated on the server; a hidden honeypot field filters simple bots.
- CSV exports neutralise spreadsheet formulas (cells starting with `=`, `+`, `-`, `@`).
- A strict Content-Security-Policy and standard security headers are set with Helmet.

## API

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/options` | none | Choices used by the funnel |
| POST | `/api/leads` | none | Submit a lead |
| POST | `/api/admin/login` | none | Sign in |
| POST | `/api/admin/logout` | session | Sign out |
| GET | `/api/admin/session` | session | Check sign-in |
| GET | `/api/admin/leads?status=&q=` | session | List leads |
| GET | `/api/admin/leads/export.csv?status=&q=` | session | Download CSV |
| PATCH | `/api/admin/leads/:id` | session | Change status |
| DELETE | `/api/admin/leads/:id` | session | Delete a lead |
