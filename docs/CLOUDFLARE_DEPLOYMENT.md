# Cloudflare Workers & D1 Deployment Guide

This application is ready for deployment on **Cloudflare Workers** with **Cloudflare D1** (Serverless SQLite) and **Workers Assets** on Cloudflare's 100% free tier.

---

## 1. Prerequisites (Free Tier)

- A free [Cloudflare account](https://dash.cloudflare.com/sign-up).
- Node.js 22 installed locally.
- Cloudflare Wrangler CLI (installed via npm):
  ```bash
  npm install -D wrangler
  ```

---

## 2. Cloudflare Authentication

Log in to your Cloudflare account from the command line:

```bash
npx wrangler login
```

---

## 3. Provision Cloudflare D1 Database (Free Tier)

Run the following command to create your persistent D1 database:

```bash
npx wrangler d1 create saudi_bidpilot_db
```

The output will display your new database configuration:
```text
[[d1_databases]]
binding = "DB"
database_name = "saudi_bidpilot_db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Copy the generated `database_id` and replace the placeholder in `wrangler.jsonc`:
```json
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "saudi_bidpilot_db",
    "database_id": "<PASTE_YOUR_DATABASE_ID_HERE>"
  }
]
```

---

## 4. Run D1 Schema Migrations and Seed Data

Apply the initial schema migration and the verified historical data seeds directly to your remote D1 database:

```bash
# 1. Apply schema tables and indexes
npx wrangler d1 execute saudi_bidpilot_db --remote --file=migrations/0001_initial_schema.sql

# 2. Seed verified Saudi opportunities and sources
npx wrangler d1 execute saudi_bidpilot_db --remote --file=migrations/0002_seed_data.sql
```

You can verify the database contents anytime with:
```bash
npx wrangler d1 execute saudi_bidpilot_db --remote --command="SELECT COUNT(*) AS total_tenders FROM opportunities;"
```

---

## 5. Configure Admin Secret Token

Set a secure admin authorization token for manual tender refresh (minimum 32 characters, never commit this to git):

```bash
npx wrangler secret put BIDPILOT_ADMIN_TOKEN
```
When prompted, paste a random 32+ character string.

---

## 6. Deploy to Cloudflare Workers

Deploy the worker and static frontend assets to Cloudflare's edge:

```bash
npx wrangler deploy
```

Wrangler will output your live URL (e.g. `https://saudi-bidpilot.<your-subdomain>.workers.dev`).

---

## 7. Local Testing with D1 Emulator

To run with Wrangler locally simulating the Cloudflare Workers runtime and local D1:

```bash
# Apply migrations to local D1
npx wrangler d1 execute saudi_bidpilot_db --local --file=migrations/0001_initial_schema.sql
npx wrangler d1 execute saudi_bidpilot_db --local --file=migrations/0002_seed_data.sql

# Start wrangler dev
npx wrangler dev
```

For AI Studio preview and development on port 3000:
```bash
npm run dev
```

---

## 8. Resource Limits & Cost

This architecture strictly adheres to Cloudflare's free tier:
- **Workers Free**: 100,000 requests/day
- **D1 Free**: 5,000,000 read units/day, 100,000 write units/day, 5 GB storage
- **Workers Assets Free**: Included with Worker requests
- **No Paid APIs or Cron tasks**: Refresh is triggered manually by authorized admins only (`ZERO_COST_ONLY=true`).
