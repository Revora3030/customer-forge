# Admin account: Lovable-only repair

## Changes
- Routing choices come from configured regular role rosters filtered by Lovable's catalogue, not old usage rows or a bare specialist list.
- Exact prefixed model IDs are validated on the super-admin save endpoint; deprecated, unrouted, legacy and dedicated media IDs cannot be saved as text routing choices. Live catalogue failure disables settings writes rather than pretending eligibility was verified.
- Current model counts/successes use only Lovable events. Null outcomes do not count as successes. Legacy database history is preserved, not deleted or offered for execution.
- AI health excludes retired providers from current statistics; configuration is not labelled live verification. Budget/design lookup failures cannot quietly turn into zero spend or empty design saves.
- The capability registry identifies the Lovable AI router as paid and requiring its managed credential, not a keyless free engine.
- Product-page grid tracks now shrink to their available width; AI tables scroll inside their own container instead of pushing the entire page past the phone screen.

## Evidence
- Read-only source trace: only the Lovable adapter is registered. Jarvis, generative growth/outreach and builds use the shared router. Command pins/pauses already reach it. Dedicated media and existing ElevenLabs voice selection were not replaced.
- Signed-in own-account browser checks: `/admin`, `/admin/jarvis`, `/admin/clients`, `/admin/websites`, `/admin/monitoring`, `/admin/analytics`, `/admin/outreach`, `/admin/monthly`, `/admin/domains`, `/admin/plans`, `/admin/payments`, `/admin/backups`, `/admin/seo`, `/admin/growth`, `/admin/command`, `/admin/ai`. No script errors or document overflow recorded. Slow initial command/AI reads were rechecked with explicit loaded-state waits.
- Final Command Center and AI health checks at 390x710 and 1280x1800: page edges inside viewport, no cerebras/gpt-oss/free-router labels in either current page. Pin/Unpin changed local form state; Save was not clicked.
- Tests: 29 focused checks initially passed; full offline suite 438 files passed, 3,371 tests passed, 6 live tests skipped. Changed-code lint clean; latest automatic build observed OK.
- Admin leaf metadata inventoried; index head retains independent tenant and platform branches.

## Limits
No inference call, email, checkout, publishing, stored routing change or production data deletion was performed. Catalogue reads establish compatible model listings, not successful generation. Operational integrations such as payments, SEO, monitoring and CRM remain authoritative data services, not replaced with AI guesses. This is not proof that every admin action works: client-detail variations, saved-setting rejection against the hosted database, and consequential flows remain unrun.