# web

M0 implementation of the Lovable/bolt.new-style app-builder product.

## Current scope (M0)

- Next.js 16 App Router UI shell
- WorkOS AuthKit authentication
- Prompt -> session bootstrap -> trace timeline -> preview loop
- API contracts for auth, sessions, messaging, and context

## Run locally

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:3000`.

## Environment

Copy and fill values as needed:

```bash
cp .env.example .env.local
```

Current mode behavior:

- WorkOS AuthKit is required for sign-in
- If Supabase env vars are missing, data layer remains stub/in-memory
- Sandbox provider is currently stubbed until M1 integration
- Configure WorkOS callback URL to `http://127.0.0.1:3000/auth/callback`
- `WORKOS_COOKIE_PASSWORD` must be at least 32 characters

## Validation

```bash
npm run lint
npm run build
```

## M0 API routes

- `GET /api/auth/sign-in`
- `POST /api/auth/sign-in`
- `POST /api/auth/sign-out`
- `GET /api/context`
- `POST /api/sessions`
- `GET /api/sessions/[sessionId]`
- `POST /api/sessions/[sessionId]/messages`
- `GET /api/health`

## Notes

- Auth protection is centralized in `web/src/proxy.ts` with `authkitMiddleware`.
- `/sign-in` immediately redirects to WorkOS (no intermediate app UI screen).
- Build may warn about inferred workspace root due multiple lockfiles.
- To silence that warning, configure `turbopack.root` in `web/next.config.ts`.
- Sign-out uses AuthKit `signOut` and redirects through WorkOS logout.
