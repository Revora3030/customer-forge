# Clear out the last traces of the old engine

## What I found
The file you shared is an older copy of the project notes. The current code no longer contains the old engine:
- The "Revora's own deterministic builder engine" and the `ZERO_AI_COST_MODE` switch no longer exist in the working code.
- A safety test already fails if that switch is ever added back.
- The current notes say the AI team builds every site and there is no built-in non-AI engine.
- The `AI_DEFAULT_PROVIDER` setting, which forced Google first, was deleted last session. The code still accepts it as an optional override, but it is not set, so OpenAI is used first and Gemini is the backup.

Deleting the whole codebase would take down your platform, customer sites, billing and sign-in, so I won't do that. What's left to remove is leftover wording and old records.

## What changes
1. Update the project notes so they describe what the platform does today:
   - Describe it as serving any business worldwide, not only "local service businesses".
   - Mark the two AI provider settings as optional overrides that are normally left unset.
   - Say that email is sent through the built-in Lovable key.
2. Delete the old saved test results that still describe "one deterministic builder edit". They are outdated and no longer match how the builder works.
3. Rename a few code comments that still call helper tools "deterministic" when they're really small cleanup helpers, such as trimming spaces from form fields. This makes it clear they are not a hidden website builder. Their behavior does not change.
4. Add a test that fails if the notes or code ever say again that a non-AI engine builds or rewrites sites.

## Stays in place
These protections stay in place: truth checks, Terra's review, account separation, billing, publishing, accessibility, security and undo.

## Technical details
- In `README.md`, update line 3 to describe any business worldwide. Update the env table so `AI_DEFAULT_PROVIDER` and `AI_FALLBACK_PROVIDER` read as "optional override, normally unset" and `LOVABLE_API_KEY` reads as "AI gateway and email".
- Delete `browser-qa-artifacts/`, which contains stale screenshots and journey JSON and HTML.
- Adjust comments only in `src/lib/intake-smart.ts` and `src/lib/builder-tree.ts`.
- Extend `src/lib/builder/authority-firewall.test.ts` to scan `README.md` for "deterministic builder", "ZERO_AI_COST" and "built-in site builder".
- Run the type check and the full test suite.
