---
name: revora-security-review
description: Security review for Revora changes covering OWASP Top 10 risks, Supabase RLS / tenant isolation, secrets handling and the repo's own security audits. Use when reviewing a diff or PR for security, or before merging changes to auth, billing, publishing, Supabase or public API routes.
---

# Revora security review

General OWASP guidance: security-and-hardening skill (+ `.claude/references/security-checklist.md`). Supabase specifics: supabase skill. This skill is the repo-specific checklist; report findings with file:line, severity and a concrete exploit scenario.

## 1. Scope the diff
```bash
git diff --stat origin/lovable-sync...
git diff origin/lovable-sync... -- 'src/routes/api/**' 'src/lib/**/*.server.ts' 'src/lib/**/*.functions.ts' supabase/migrations
```

## 2. Tenant isolation (highest risk)
- Every query on workspace data filters by the caller's `organization_id` and relies on RLS (`private.is_org_member`); service-role clients are used only server-side and never with an id taken unchecked from the request.
- New tables/policies follow the add-supabase-migration skill (RLS on, no `USING (true)`, `WITH CHECK` on writes, `SECURITY DEFINER` with fixed `search_path`).
- Saves must confirm exactly one tenant-scoped row was written.

## 3. AuthN / AuthZ (OWASP A01, A07)
- Server functions check the session and role before acting; super-admin paths check super-admin.
- `/api/public/agent/*` routes check `REVORA_AGENT_API_KEY`; Level 4 actions (merge, deploy, publish, send, paid build, billing, delete) only through approved action requests.
- Publishing only via `publishSiteNow`; checkout returns never prove payment (Stripe webhooks are verified and idempotent).

## 4. Injection and output (A03, A10)
- No string-built SQL; RPC parameters typed. No `dangerouslySetInnerHTML` with model or user text without sanitizing. Links from compositions pass `isSafeHref`.
- Server-side fetches of user/model-supplied URLs are bounded (allow-list, no redirects to internal hosts).

## 5. Secrets
- No keys in code, tests, fixtures, logs or error messages; server env vars never read in client code (`VITE_` only for public values). `assertPublicEnvironment` and `client-bundle-guard` must keep passing.
- Run: `npm run security:audit` and `node scripts/website-rpc-security.contract.mjs`. If a real secret was committed, say so and tell the owner to rotate it; do not print it.

## 6. AI provider boundary
- Lovable AI only, through the router with the shared spend reservation; no new provider, no direct HTTP to model APIs, no bypass of `paidCollectiveAllowed`.

Output: findings ranked by severity, each with evidence; "no findings" only after every section above was checked.
