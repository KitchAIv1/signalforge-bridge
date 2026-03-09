# SignalForge Bridge Dashboard

Next.js app for the Bridge: status, activity, health, and settings (Bridge ON/OFF, Kill switch).

## Setup

1. **Env**: Copy `.env.local.example` to `.env.local` and set:
   - `NEXT_PUBLIC_SUPABASE_URL` — same as the bridge Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon (public) key

2. **RLS**: Run `../migrations/004_dashboard_rls.sql` in the Supabase SQL Editor so the anon key can read bridge tables and update `bridge_active` / `kill_switch`.

3. **Install and run** (from the `dashboard/` folder):
   ```bash
   cd dashboard
   npm install
   npm run dev
   ```
   Open **http://localhost:3001** in your browser (the dashboard uses port 3001, not 3000).

   Or from the repo root: `npm run dashboard:dev`.

## Build

```bash
npm run build
npm run start
```
