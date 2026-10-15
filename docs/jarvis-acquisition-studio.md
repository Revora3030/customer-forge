# Jarvis Acquisition Studio

## What this slice does

The Acquisition Studio is a super-admin-only lead-discovery and concept-preview workflow that reuses Revora's existing Google Maps connector, model router, composition-tree schema/renderer, preview URL, and checkout entry point.

1. Search a business category in a city and state. The Places query is capped at five listings.
2. Review listing provenance and the opportunity score. A missing Places website field is explicitly **not** proof that the business has no website.
3. Save the listing. The save action repeats the server-side Places query and matches the stable Google Place ID; browser-submitted Maps content is not trusted.
4. Generate a structured website concept through the Revora AI router in free-only mode. The generated tree is passed through the real composition validator and a further link/image-host/unsupported-claim check. One repair call is allowed; invalid output does not receive a preview link.
5. The preview is rendered by CompositionRenderer, includes a visible draft/noindex banner, identifies proposed services, lists facts to confirm, and accepts a business-owner request for next steps.
6. Requests enter the super-admin interest queue. A person reviews the request and manually responds; the queue can open a prefilled email draft or mark the request reviewed/dismissed.

## Boundaries that are intentional

- The system does not send cold email/SMS, initiate calls, buy media, charge a card, change a customer's production website, or publish an acquisition preview as the owner's live website.
- An interest form submission is not a purchase or a marketing subscription. It only asks Revora to review the requested website concept.
- The first PR provides a human-reviewed handoff. It does not automatically attach the concept to a paid workspace or claim ownership of an existing domain. That requires a distinct, verified Stripe-webhook claim path and conversion tests; do not infer a claim from browser parameters or an unverified checkout response.
- The configured acquisition AI call is freeOnly: true. If no available free provider can produce valid JSON within the model router's budgets, generation stops rather than falling back to a paid provider or a deterministic fake website.
- A website concept is not production quality proof. Verify claims, real business services, visual rendering, mobile behavior, keyboard accessibility, forms, navigation, performance and full customer journey before publishing.

## Database and data-retention notes

Apply supabase/migrations/20261015210000_jarvis_acquisition_studio.sql before using saved prospects, previews or the interest queue. The migration enables RLS and revokes browser-role access to the new tables; server functions enforce super-admin access through assertSuperAdmin. The public interest submission RPC is granted only to service_role, locks per site, checks that a preview is still active, and permits no more than five submissions per site per rolling hour. Audit events are append-only.

Google Places fields are source data, not owner-confirmed business facts. The prospect's stable Place ID is retained so a listing can be refreshed; address, business name, website, phone, rating, review count, and other Places-derived fields receive an expiry. When the expiry sweep runs, unverified source fields are removed and active concept links are expired. The saved prospect list currently triggers this sweep; for strong retention guarantees in an unattended production system, attach the cleanup routine to the platform's scheduled-job system and monitor its last successful run.

The preview token is generated with cryptographic randomness, and only its SHA-256 digest is stored. Public preview lookup returns a minimal rendering payload only after token, status, expiry, composition schema, and safety checks pass. Noindex metadata prevents ordinary indexing; it is not authorization for a secret-free public URL, so treat the token as a bearer link and revoke/expire it when necessary.

## Google Maps rules

The search UI attributes Google Maps results and marks unlisted websites as unverified. Check the current Google Maps Platform policies before launch or broadening storage. The implementation expires stored provider fields after 30 days and keeps the Google Place ID for refresh. See https://developers.google.com/maps/documentation/places/web-service/policies.

## Launch checklist

- Apply and inspect the migration in the intended non-production environment.
- Confirm the Lovable/Google Maps connector has permission and quota, and verify its field mask includes places.id.
- Confirm the AI router has at least one healthy free model available for JSON output.
- Run bunx tsc --noEmit, bunx vitest run on the two acquisition studio test files, bun run lint, security gates, and the standard browser suite.
- Exercise the complete happy path: search → save → generate → review private preview → submit interest → confirm queue entry → create a manual response draft.
- Test expired tokens, invalid tokens, a revoked token, output containing fabricated testimonials/credentials, unsafe links and image hosts, invalid composition trees, repeated form submissions, and missing integrations.
- Confirm customer tenant roles cannot read the acquisition tables, invoke super-admin functions, or directly execute the interest RPC.
- Do not mark a lead "no website" based only on listing data. Independently verify before a factual outreach claim.
- Keep the PR draft until CI is green and the above environment-dependent checks are recorded. Never auto-merge or deploy directly from the concept generator.
