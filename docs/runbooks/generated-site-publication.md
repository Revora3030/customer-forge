# Generated Site Publication Contract

A generated site is a product artifact, not just a collection of files.

## Mandatory pre-publish checks

### Structure
- Every intended route has a valid target.
- Navigation targets exist.
- No duplicate route slugs.
- No unreachable required page.

### Content
- No obvious placeholder/template copy.
- Hero has a clear value proposition.
- At least one meaningful conversion action exists when the business model supports one.
- Contact, booking, quote or lead destination is real.

### SEO
- Unique title.
- Useful meta description.
- Canonical URL where required.
- Semantic heading hierarchy.
- Image alternative text where appropriate.
- Internal links resolve.

### Accessibility
- Interactive elements have accessible names.
- Keyboard operation works for critical flows.
- Focus is visible.
- Touch targets are usable on mobile.
- Reduced-motion behavior is respected.

### Runtime and performance
- No known runtime/console errors.
- No insecure resource URLs.
- No critical broken network resources.
- Mobile layout has no known horizontal overflow.
- Core Web Vitals are measured where a browser environment is available.

### Security
- Tenant ownership is verified before reads/writes/publish.
- Signed previews are scoped and revocable.
- Public routes expose only intended public projections.
- Service-role credentials never enter the browser.

## Evidence boundary

The deterministic builder may plan these checks, but a static planner must never report a browser, runtime, visual, database or production check as passed without corresponding evidence.
