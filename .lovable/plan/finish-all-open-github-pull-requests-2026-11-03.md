# Finish all open GitHub pull requests

## Blocker found
The connected GitHub account (`revorabusiness0-tech`) has no repositories, no organizations and no open pull requests. The Revora repository with PRs #354–#620+ lives under a different GitHub account or organization, so none of its PRs are visible yet.

## Step 0 — you do this
Do one of these:
- Reconnect GitHub using the account that owns the Revora repository, or
- On GitHub, add `revorabusiness0-tech` as a collaborator on the Revora repository (write access), or
- Tell me the repository address (owner/name).

## Steps 1–5 — after access is fixed
1. List every open PR with its title, branch, CI status, merge conflicts and review comments.
2. Sort each PR into one of these:
   - Ready: CI green, no conflicts, matches project rules. Recommend merging.
   - Fixable: failing CI, conflicts or small gaps. Fix it on the PR's own branch and leave a summary comment.
   - Stale or duplicate: already done in the current code, or replaced by a newer PR. Recommend closing it, with the reason.
   - Unsafe: it would weaken tenant isolation/RLS, billing, `publishSiteNow`, the single Lovable AI provider, or the $350/$100 pricing. Flag it and don't merge.
3. Fix the Fixable PRs one by one: run that PR's own tests, then the targeted checks listed in the project's working notes.
4. Merging, closing and force-pushing are Level-4 actions, so each one needs your approval. I won't merge anything unless you approve that specific PR, and I won't rewrite history on `lovable-sync`.
5. Report back on every PR: what changed, its checks and test results, and what still needs your approval.

## Notes
- Code that is merged on GitHub only reaches Lovable once it lands on the synced branch. Publishing is a separate step that you approve.
- Before any merge, any PR that touches database migrations gets checked against the live database (GRANT/RLS).
