# Supabase Connection Fix

## Problem
Database operations are timing out because the connection isn't properly configured for Supabase.

## Solution

### Step 1: Update your `.env` file with the correct Supabase connection string

Supabase has TWO types of connection strings:

1. **Direct Connection** (Port 5432) - Not recommended for serverless/connection pooling
2. **Connection Pooler** (Port 6543) - **USE THIS ONE** ✅

### Step 2: Get your Connection Pooler string from Supabase

1. Go to your Supabase Dashboard
2. Click on your project
3. Go to **Settings** → **Database**
4. Scroll to **Connection string** section
5. Select **Connection pooling** tab (NOT "Session mode")
6. Choose **Transaction mode** (recommended for this app)
7. Copy the connection string

It should look like this:
```
postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true
```

### Step 3: Update your `.env` file

Replace your current `DATABASE_URL` with the pooler connection string:

```env
DATABASE_URL=postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true
```

**Important:** 
- Replace `[YOUR-PASSWORD]` with your actual database password
- Keep the `?pgbouncer=true` parameter at the end
- Use port **6543** (not 5432)

### Step 4: Restart your server

```bash
npm run dev
```

## What Changed

The database configuration now:
- ✅ Uses connection pooling optimized for Supabase
- ✅ Sets appropriate timeouts (5s connection, 10s query)
- ✅ Detects pgbouncer and adjusts pool size
- ✅ Enables SSL for Supabase connections
- ✅ Tests connection on startup
- ✅ Has proper error handling

## Alternative: Direct Connection (Not Recommended)

If you must use direct connection, update your `.env`:

```env
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
```

But this is **not recommended** for production as it doesn't use connection pooling.

## Verify Connection

After restarting, the server should log:
- No timeout errors
- Queries complete in < 1 second
- Connection established on startup

If you still see timeout errors:
1. Check your Supabase project is active
2. Verify your password is correct
3. Ensure your IP is allowed (check Supabase firewall settings)
4. Try the direct connection string as a test
