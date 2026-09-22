# Roadmap — close the ten builder gaps vs Lovable

Ordered by user-felt impact. Each item: extend existing code, never duplicate.

- [ ] 1. Streaming chat replies (live token-by-token assistant reply + step activity)
- [ ] 2. Click-to-edit on the preview (select a section, talk about it)
- [ ] 3. Plan shown for approval before large changes
- [ ] 4. Browsable version timeline with preview + jump-to-version
- [ ] 5. AI asks a clarifying question instead of guessing
- [ ] 6. Reference screenshot as a design brief (drop image -> styling)
- [ ] 7. Blog / repeating collections on generated sites
- [ ] 8. Custom embed block (booking widget, map, third-party)
- [ ] 9. Preview device switching (phone / tablet / desktop)
- [ ] 10. Before/after comparison after a change lands

## Constraints
- Typed sanitized style/content tokens only; no arbitrary CSS/JS.
- Truthful content gates stay. RLS/tenant isolation, Stripe, publishing untouched.
- No deterministic template authority; AI keeps creative control.
- Verify each batch: tsgo --noEmit, vitest, lint, build log.
