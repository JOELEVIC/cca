# Deploying CCA to Render

CCA runs as a long-lived Node.js process with WebSocket support. Render Web Services support this natively.

## Quick Setup

1. **Connect your repo** in [Render Dashboard](https://dashboard.render.com) → New → Web Service
2. **Root directory**: If monorepo, set to `cca`
3. **Build command**: `npm install && npm run build`
4. **Start command**: `npm start`
5. **Health check path**: `/health`

## Environment Variables

Set these in Render Dashboard → Environment:

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | Supabase pooler URL (port 6543, `?pgbouncer=true`) |
| `JWT_SECRET` | Yes | Min 32 characters |
| `SUPABASE_URL` | Yes | e.g. `https://xxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Yes | From Supabase project settings |
| `CORS_ORIGIN` | Yes | Frontend URL, e.g. `https://blacksilvergroups.xyz` |
| `JWT_EXPIRES_IN` | No | Default `7d` |
| `PORT` | No | Render sets automatically |

## WebSocket URL

After deploy, your CCA URL will be like `https://cca-api-xxx.onrender.com`.

- **GraphQL**: `https://cca-api-xxx.onrender.com/graphql`
- **WebSocket**: `wss://cca-api-xxx.onrender.com/ws/game/:gameId?token=...`

In ccaui, set:
```
NEXT_PUBLIC_GRAPHQL_URI=https://cca-api-xxx.onrender.com/graphql
NEXT_PUBLIC_WS_URL=wss://cca-api-xxx.onrender.com
```

## Blueprint (Optional)

Use `render.yaml` for infrastructure-as-code: New → Blueprint, connect repo.
