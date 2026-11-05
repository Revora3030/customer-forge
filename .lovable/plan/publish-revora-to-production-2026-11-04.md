# Publish Revora to production

## What happens
1. Check the latest security scan. If any critical problems show up, list them for you before going further.
2. Confirm the preview builds with no errors.
3. Publish the current version to revoragrowthsystems.com (and its other connected addresses).
4. After about a minute, check once that the live site loads.

## What goes live
- Builds and chat requests keep running in the background, even if a customer leaves the app.
- Replies appear as they're written in the builder chat.
- Clearer status messages instead of "0 done · 2 didn't work".
- Rejected edits get fixed automatically in one batch, with fact and safety checks still on.
- The admin page that tracks builder chat health.
- All pull requests merged since the last publish.

## Notes
- Database changes are already in place, so publishing changes only the app itself.
- Pricing stays the same: $350 setup, first month free, then $100/month.
- After publishing, a real phone test is still worth doing: start an edit, switch to another app and come back.
