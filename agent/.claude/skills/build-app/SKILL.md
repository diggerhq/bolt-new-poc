# Build App

Use this skill when the user asks you to create a new app or make changes to an existing one.

## New project (first prompt in a session)

1. Check if `/workspace/app/package.json` exists
2. If not, scaffold a new Next.js project:
   ```bash
   cd /workspace/app
   npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes
   ```
3. Start the dev server in the background:
   ```bash
   cd /workspace/app && npm run dev &
   ```
4. Wait a few seconds, then verify the server is running:
   ```bash
   curl -s -o /dev/null -w '%{http_code}' http://localhost:3000
   ```
5. Now implement what the user asked for — edit `src/app/page.tsx` and add any needed components/routes

## Editing an existing project

1. Read the files you need to understand before editing
2. Make the changes
3. Check for errors:
   ```bash
   cd /workspace/app && npx tsc --noEmit 2>&1 | head -20
   ```
4. If the dev server died, check why and restart:
   ```bash
   cd /workspace/app && npm run dev &
   ```

## Guidelines

- Prefer editing existing files over creating new ones when possible
- Put components in `src/components/`, utilities in `src/lib/`
- Use `src/app/` for routes (Next.js App Router conventions)
- For data, start with local state or hardcoded data — don't add a database unless asked
- For styling, use Tailwind classes directly — don't create CSS files
- When adding a page, also add navigation to it from the main layout or homepage
