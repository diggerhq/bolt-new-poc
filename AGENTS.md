# AGENTS.md

## TL;DR

**Immediate goal:** build a **Lovable / bolt.new–style “app-builder agent” web product** (a *Lovable clone*).  
**We are NOT building a sandbox or “sandbox abstraction” right now.**

We will **use an existing sandbox provider** (e.g., E2B, Daytona, Modal, etc.) as the execution layer.  
Only **after** we ship a functioning app-builder agent and see what we had to add on top of those sandboxes will we be able to confidently define the “right” sandbox API surface.

**North star (research outcome):** extracting a future sandbox abstraction is a *learning objective*, not a near-term deliverable.

---

## Why we’re doing it this way

Existing sandboxes provide low-level primitives (compute, exec, filesystem, ports). Builder agents (Lovable/v0-like products) typically require additional behavior (traces, safe preview URLs, rollback semantics, multi-service patterns, deploy pipelines, etc.).

Instead of guessing the abstraction up front, we will:
1) **Build the full Lovable clone** on top of a real provider  
2) **Record every “missing piece”** we had to implement ourselves  
3) After completion, **derive the correct sandbox abstraction** from real requirements

---

## Non-goals (for now)

- Do **not** build a new sandbox provider
- Do **not** prematurely design a final “universal sandbox API”
- Do **not** optimize for provider-agnostic purity at the expense of shipping the clone
- Do **not** overbuild enterprise features (SSO, RBAC, collaboration) unless required to validate core loops

---

## Primary product we are building

A web-based AI app builder with these minimum loops:

- **Prompt → working app preview**
- **Iterate via chat** (agent edits project repeatedly)
- **Trace/action timeline** shown in UI (like builder agents)
- **Debug loop** (logs/errors → “fix it”)
- **Deploy pipeline**: preview in sandbox, production deployed to **separate destination** (e.g., Cloudflare Worker)
- **Optional but likely**: Git workflows (import repo, branch/commit/export, GitHub connection)

This is the product. The “sandbox abstraction” is a byproduct we extract later.

---

## Key principle: ship the clone, log the gaps

Whenever we implement something “around” the sandbox provider, we must write it down.

### Required repo artifacts for learnings
Create and keep up to date:
- `SANDBOX_GAPS.md` — a running log of capabilities we expected from the provider but had to build ourselves
- `DECISIONS.md` — decisions that materially affect architecture (provider choice, trace schema, deploy target, etc.)

**Rule:** If you write glue code that feels like “this should be in the sandbox API,” add an entry to `SANDBOX_GAPS.md`.

Suggested gap entry format:
```md
### Gap: Stable preview URL with access policies
- What we needed: stable HTTPS route + link-only access
- Provider offered: ephemeral port exposure, no policy layer
- What we built: edge proxy + signed link tokens
- Why it matters: required for safe sharing of previews
- Potential future sandbox API: create_endpoint(session_id, policy) -> url
