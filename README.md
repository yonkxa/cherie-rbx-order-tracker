# Chérie RBX Order Desk

A private, shared staff dashboard for tracking Roblox gamepass orders and Robux payouts.

## Design

The interface is intentionally minimal and Notion-inspired: white/charcoal surfaces, subtle borders, clean typography, custom matching dropdown menus, responsive layouts, and a light/dark mode toggle.

## Gamepass orders

Each row is **one buyer order**, even when the buyer splits the purchase across multiple gamepasses.

Example:
- Total order: `10,000 R$`
- Gamepass #1: `5,000 R$` + link
- Gamepass #2: `3,000 R$` + link
- Gamepass #3: `2,000 R$` + link

The form checks that the split amounts add up exactly to the total order amount. The order keeps one shared process and status.

Fields:
- Buyer username
- Total Robux
- Process: `fast` or `slow`
- Any number of gamepass amount/link pairs
- Status: `pending`, `processing`, `completed`, `refunded`
  - Pending = not yet sent to supp
  - Processing = already sent to supp
  - Completed = gamepass already bought
  - Refunded = refunded/cancelled order
- Notes

Existing single-link orders remain compatible. The schema adds `gamepass_links` as JSONB and automatically migrates existing links into a one-item list.

## Robux payouts

Fields:
- Buyer username — the Chérie buyer/order owner
- Roblox recipient username — the Roblox account that will actually receive the Robux
- Amount of Robux
- From which group: `A (supp)`, `A (d'isle)`, `B (supp)`, `C (supp)`, `D (supp)`, `E (supp)`
- Status: `pending`, `processing`, `completed`, `refunded`
  - Pending = not yet sent to supp
  - Processing = already sent
  - Completed = Robux sent
  - Refunded = refunded payout
- Notes

## Logo

Add your own `logo.png` to:

`public/logo.png`

The app is already wired to use it on the login card and topbar. If the file is not present, the UI falls back to a simple `C` mark so the app does not show a broken image.

## Local setup

1. Extract this folder and open it in VS Code.
2. Create `.env.local` in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
```

3. In Supabase SQL Editor, run `supabase/schema.sql`.
4. In Supabase Authentication → Users, create the private staff accounts.
5. In PowerShell, from the project folder:

```powershell
npm.cmd install
npm.cmd run dev
```

6. Open `http://localhost:3000`.

## Important

Only use the Supabase **publishable** key in `.env.local`. Never put a Supabase secret/service-role key in this frontend project.

The authenticated staff users share the same Supabase database. RLS allows authenticated staff to read and update the shared records.
