# Jarvis: add the free tools from your list that can actually run inside Revora

## What's realistic
Most of the list (ComfyUI, Ollama, vLLM, Whisper, Semgrep, Trivy, n8n self-hosted, Qdrant, video models) is software that needs its own server or GPU. Revora runs on Cloudflare's edge, so that software can't run inside the app. Those items go on a "needs a server" list for later, not into this build.

Already covered: Context7, Lighthouse/PageSpeed, browser checks (Browserless/Browserbase), Supabase/pgvector, Sentry, n8n, GitHub, Cloudflare, free-model routing (OpenRouter, Groq, Cerebras, Gemini, Cloudflare Workers AI, Hugging Face).

## New Jarvis checks (all free, no key, read-only)
1. **HTML validator** — checks a page for broken markup using the official W3C validator (validator.w3.org/nu).
2. **Dependency vulnerability check** — looks up the app's own packages in the free OSV.dev database (the same data OSV-Scanner uses) and lists known security issues.
3. **Security grade** — runs Mozilla Observatory on an allowed page and returns its header grade.
4. **Domain registration lookup** — RDAP (the free, official replacement for WHOIS): who the registrar is, plus expiry date and status. Useful for prospect and customer domains.
5. **Wayback history** — Internet Archive check: has this site existed before, and when was it last saved? Helps Jarvis tell new businesses from established ones.
6. **Readable page text** — pulls the main text out of an allowed page (Readability-style), so Jarvis can summarize it. It is treated only as evidence, never as instructions.

Each check uses the existing rules: it only accepts allowed addresses, never posts or changes anything, and reports "unknown" rather than "passed" when a service fails or hits its limit.

## Jarvis panel
- Adds a button for each new check in "Page checks & docs".
- Adds a "Needs a server (later)" list, with links to the self-hosted tools you named, so nothing on your list is lost.

## Not doing
- No paid calls and no publishing.
- No emails, posts, or database writes.
- No second agent framework (Mastra/LangGraph), so Jarvis doesn't end up with two control systems fighting each other.

## Technical details
- New `src/lib/jarvis-free-checks.ts`: URL builders and response summarizers for these services: W3C Nu (`out=json`), OSV `querybatch` (packages read from bundled package.json at build time), Observatory v2 `/api/v2/scan`, `rdap.org/domain/{d}`, `archive.org/wayback/available`, and bounded HTML-to-text extraction that reuses the keyless page reader.
- Registry entries are added to `jarvis-tool-registry.ts` (read, low risk), with executor branches in `jarvis-diagnostic-tools.server.ts`, readiness flags set to `true`, and buttons in `FreeToolsPanel.tsx`.
- Tests cover input validation, domain/URL allow-listing, summary trimming, and the unknown-on-failure behavior.
