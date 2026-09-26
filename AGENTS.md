<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

## Whole-repository upgrade contract

Scan the entire repository before making broad changes. Do not mass-edit generated types, lockfiles or binary assets without a concrete reason. Prefer deterministic, evidence-backed improvements, preserve tenant/auth/billing/publishing boundaries, and keep browser/database/provider claims explicitly runtime- or environment-gated.
- New customer website creative choices, including first-build CTA labels plus motion and density tokens, must be AI-authored and safety-reviewed rather than seeded from deterministic rules; this keeps creative authority with the AI team while preserving truth/accessibility safeguards.
- Builder progress uses the chat request ID from planning through apply; this keeps every live stage attached to the request that caused it.
