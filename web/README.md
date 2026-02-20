# web

M0 implementation of the Lovable/bolt.new-style app-builder product.

## Current scope (M0)

- Next.js 16 App Router UI shell
- Protected builder route with stub auth
- Prompt -> session bootstrap -> trace timeline -> preview loop
- Stub API contracts for auth, sessions, messaging, and context

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment

Copy and fill values as needed:

```bash
cp .env.example .env.local
```

Current mode behavior:

- If WorkOS env vars are missing, auth falls back to stub mode
- If Supabase env vars are missing, data layer remains stub/in-memory
- Sandbox provider is currently stubbed until M1 integration

## Validation

```bash
npm run lint
npm run build
```

## M0 API routes

- `POST /api/m0/auth/sign-in`
- `POST /api/m0/auth/sign-out`
- `GET /api/m0/context`
- `POST /api/m0/sessions`
- `GET /api/m0/sessions/[sessionId]`
- `POST /api/m0/sessions/[sessionId]/messages`
- `GET /api/health`

## Notes

- Build may warn about inferred workspace root due multiple lockfiles.
- To silence that warning, configure `turbopack.root` in `web/next.config.ts`.
