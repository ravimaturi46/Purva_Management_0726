# Supabase Migration Guide

To transfer your application data from your current Supabase instance to your self-hosted Hostinger VPS Supabase, you have two main options:

## Option 1: Use the `FULL_SCHEMA_EXPORT.sql` file (Easy for schema, but no data)

This will create all the tables, structure, and Row Level Security on your new VPS, but you will **lose existing project data**. 

1. Go to your Hostinger self-hosted Supabase Studio Dashboard.
2. Navigate to the **SQL Editor** on the left menu.
3. Open the `FULL_SCHEMA_EXPORT.sql` file located in the root of this app.
4. Copy its entire content.
5. Paste it into the SQL Editor and click **Run**.
6. Change the environment variables in your app codebase to point to your new Hostinger Supabase URL and Anon Key. In `.env.example` or in your Hostinger settings.

## Option 2: Full Database Migration via pg_dump & psql (Includes Data)

If you want to move all your existing users, projects, vendors, and tasks, follow this approach. You will need PostgreSQL tools installed on your local computer.

### Step 1: Export the original database

Run this command in your terminal. Replace the `postgres://` connection string with your *current* Supabase connection string. You can find this in your original Supabase Dashboard under **Project Settings -> Database**.

```bash
pg_dump \
  --clean \
  --if-exists \
  --quote-all-identifiers \
  --exclude-schema=public \
  --exclude-schema=storage \
  --exclude-schema=auth \
  -d "postgres://postgres.[YOUR_PROJECT_ID]:[YOUR_DB_PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres" \
  -F p -o > roles.sql

pg_dump \
  --clean \
  --if-exists \
  --quote-all-identifiers \
  --schema=public \
  --schema=storage \
  --schema=auth \
  -d "postgres://postgres.[YOUR_PROJECT_ID]:[YOUR_DB_PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres" \
  -F p -o > schema.sql

pg_dump \
  --quote-all-identifiers \
  --data-only \
  --schema=public \
  --schema=storage \
  --schema=auth \
  --exclude-table="auth.audit_log_entries" \
  --exclude-table="auth.refresh_tokens" \
  --exclude-table="auth.sessions" \
  -d "postgres://postgres.[YOUR_PROJECT_ID]:[YOUR_DB_PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres" \
  -F p -o > data.sql
```

### Step 2: Import into Hostinger VPS

Replace the `postgres://` connection string with your *new VPS* Supabase connection string.

```bash
psql -d "postgres://postgres:[YOUR_VPS_DB_PASSWORD]@[YOUR_VPS_IP]:5432/postgres" -f roles.sql
psql -d "postgres://postgres:[YOUR_VPS_DB_PASSWORD]@[YOUR_VPS_IP]:5432/postgres" -f schema.sql
psql -d "postgres://postgres:[YOUR_VPS_DB_PASSWORD]@[YOUR_VPS_IP]:5432/postgres" -f data.sql
```

### Step 3: Update App Environment Variables

In your Google AI Studio or wherever you host this code, update your Environment Variables to point to your new instance:

1. Copy your Hostinger Supabase `Project URL` and `API Key (anon/public)`.
2. Update them in your `.env` or deployment variables.

```
VITE_SUPABASE_URL=http://your-vps-ip:8000
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```
