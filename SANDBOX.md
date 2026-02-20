# SANDBOX.md

## Purpose

Track all findings related to sandbox capabilities and the emerging sandbox API surface while building the app-builder product.

This is a working document. Update it whenever sandbox-related glue code is added.

---

## How to use this file

- Add one entry per meaningful sandbox gap
- Keep entries concrete and implementation-specific
- Include what the provider gave us vs what we had to build
- Capture candidate future API surface only after the real gap is observed

---

## Current provider status

- Selected provider: `E2B` (M1)
- Session lifecycle model: one sandbox per builder session
- Preview URL model: app dev server runs in same sandbox and is exposed via provider port URL
- Filesystem sync model: sync `harness/` + app workspace into sandbox at session bootstrap
- Command execution model: per-message harness turn command (`run-turn`) with structured JSONL events

---

## Gap log

### Template

```md
### Gap: <short name>
- Date: YYYY-MM-DD
- What we needed:
- Provider offered:
- What we built:
- Why it matters:
- Potential future sandbox API:
- Notes/links:
```

### Entries

None yet.

---

## Candidate sandbox API surface (derived from gaps)

Only add items here after they appear in the gap log.

### Candidate methods

None yet.

### Candidate objects

None yet.

---

## Open questions

- Which provider constraints are acceptable for MVP speed?
- Which missing capabilities are generic vs provider-specific?
- Which API candidates are stable enough to treat as cross-provider concepts?
