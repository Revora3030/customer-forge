# Wipe old builds in "Revora Growth Systems (live-build QA)"

Scope: only this one workspace. Its site is in preview (not published, no custom domain), so no live site is affected. Your marketing homepage is unaffected. The workspace, account, team, billing and leads stay.

## What gets deleted
- 20 build jobs and 160 AI generation records
- 11 saved versions (undo points)
- 1 page, 5 sections, 7 components, 8 site memory notes
- 19 preview links, 17 visual QA reports
- 23 pictures (records and their stored files)

## What gets reset
- Site settings row is kept but returned to an empty draft, so the next build starts fresh.

## Steps
1. Re-count rows right before deleting to confirm nothing changed.
2. Delete in dependency order (sections/components before pages, etc.), every statement filtered to this workspace's ID only.
3. Remove the 23 picture files from storage.
4. Verify all counts read zero and the builder page shows an empty start state.

This cannot be undone. Nothing is published, emailed or charged.
