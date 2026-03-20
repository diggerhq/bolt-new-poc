# Simplify Web App

## Goal

Make the web app as minimal as possible to demonstrate "here's how little code you need to build a Lovable clone with OpenComputer". Every file should earn its place.

## Current state: 22 files in `web/src/`

```
src/
  proxy.ts                                    # WorkOS middleware
  app/
    layout.tsx                                # root layout
    page.tsx                                  # redirect to /builder
    sign-in/page.tsx                          # redirect to WorkOS
    auth/callback/route.ts                    # WorkOS callback
    api/
      auth/sign-in/route.ts                   # manual sign-in redirect
      auth/sign-out/route.ts                  # logout
      context/route.ts                        # user + stack modes
      health/route.ts                         # health check
      sessions/route.ts                       # POST create session (proxy)
      sessions/[sessionId]/route.ts           # GET session (proxy)
      sessions/[sessionId]/messages/route.ts  # POST message (proxy)
      sessions/[sessionId]/events/route.ts    # GET events URL
    builder/
      page.tsx                                # new session page
      [sessionId]/page.tsx                    # restore session page
      builder-shell.tsx                       # the actual UI
    preview/[sessionId]/page.tsx              # stub preview page
  lib/
    auth/auth.ts                              # WorkOS helpers
    builder/types.ts                          # type definitions
    platform-client.ts                        # HTTP client to sessions API
    stack-modes.ts                            # config (mostly hardcoded)
```

## What to cut

### Delete entirely (6 files)

| File | Why |
|------|-----|
| `api/context/route.ts` | Not used by the builder UI |
| `api/health/route.ts` | Not needed for a demo |
| `api/sessions/[sessionId]/events/route.ts` | Only returns a URL — inline into the GET session response (already there) |
| `preview/[sessionId]/page.tsx` | Dead code — builder uses iframe, not this page |
| `lib/builder/types.ts` | Types can live at the top of builder-shell.tsx or platform-client.ts |
| `lib/stack-modes.ts` | Hardcoded values, not used by anything meaningful after platform extraction |

### Merge (4 files → 1)

The 3 API proxy routes (`sessions/route.ts`, `sessions/[sessionId]/route.ts`, `sessions/[sessionId]/messages/route.ts`) + `platform-client.ts` can be collapsed. The proxy routes are trivial — auth check + forward to platform API. Two approaches:

**Option A: Inline platform calls into route handlers** — delete `platform-client.ts`, put the `fetch()` calls directly in each route handler. 3 files but no lib dependency.

**Option B: Delete the proxy routes entirely** — call the sessions API directly from the client component. The builder shell already talks to the platform API directly for SSE. It could also do the session CRUD directly. This removes all 3 proxy routes + platform-client.ts, but requires exposing the OpenComputer API key to the client (via `NEXT_PUBLIC_` env var or a server-rendered prop). Trade-off: simpler code, but API key in the browser.

**Recommendation: Option A** — keep the proxy routes (they're the auth boundary) but inline the fetch calls. Remove the separate platform-client.ts.

### Simplify auth (keep but flatten)

- `auth/auth.ts` stays — it's needed
- `sign-in/page.tsx` and `api/auth/sign-in/route.ts` overlap — keep only the API route (WorkOS middleware handles the redirect)
- `auth/callback/route.ts` stays — required by WorkOS
- `api/auth/sign-out/route.ts` stays

### Flatten builder pages

- `builder/page.tsx` and `builder/[sessionId]/page.tsx` are nearly identical — merge into one `[...slug]/page.tsx` catch-all or just keep both (they're 15 lines each, not worth the cleverness)

## Target state: ~12 files

```
src/
  proxy.ts                                    # WorkOS middleware
  app/
    layout.tsx                                # root layout
    page.tsx                                  # redirect to /builder
    auth/callback/route.ts                    # WorkOS callback
    api/
      auth/sign-in/route.ts                   # sign-in redirect
      auth/sign-out/route.ts                  # logout
      sessions/route.ts                       # POST create session
      sessions/[sessionId]/route.ts           # GET session + eventsUrl
      sessions/[sessionId]/messages/route.ts  # POST message
    builder/
      page.tsx                                # new session
      [sessionId]/page.tsx                    # restore session
      builder-shell.tsx                       # the UI (types inlined)
  lib/
    auth.ts                                   # WorkOS helpers (flattened, no subdirectory)
```

## Changes summary

1. **Delete**: `api/context`, `api/health`, `api/sessions/[sessionId]/events`, `preview/[sessionId]`, `lib/builder/types.ts`, `lib/stack-modes.ts`
2. **Inline**: Move `platform-client.ts` fetch logic into each route handler (3 routes, ~10 lines each)
3. **Flatten**: `lib/auth/auth.ts` → `lib/auth.ts`
4. **Inline types**: Move `BuilderSession` type into `builder-shell.tsx`
5. **Remove sign-in page**: `sign-in/page.tsx` → delete (middleware handles redirect)
6. **Clean up create session route**: Remove `stackModes` from response (nothing uses it)

## What NOT to simplify

- The 3 session proxy routes — they're the auth boundary, keep them
- `builder-shell.tsx` — it's the core UI, already reasonably compact
- WorkOS auth — it's the minimum viable auth
- The `agent/` directory — it's already just 2 markdown files

## Execution

Single pass — delete files, inline code, verify build. No phasing needed.
