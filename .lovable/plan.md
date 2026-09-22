# Maximum product simplification

## Goal
Make every Revora surface feel like one calm, focused workspace: one clear navigation system, one primary task per screen, fewer visible controls, and advanced detail available only when requested. Preserve all existing capabilities, permissions, billing, publishing, tenant isolation, and production safeguards.

## What will change

### 1. One shared product shell
- Consolidate the customer workspace, AI Command Center, website builder, client portal, and admin area around the same compact top bar, restrained navigation, consistent content width, and mobile drawer behavior.
- Reduce the customer navigation to a short primary set. Place lower-frequency destinations in a single “More” area instead of showing every tool at once.
- Keep trial, support, notification, live-site, admin, and sign-out controls available without letting them dominate the screen.

### 2. One page hierarchy everywhere
- Standardize every product page around a small header: clear title, one-line purpose, and one primary action.
- Make repeated panels flatter and quieter, remove decorative labels where the title already explains the section, and use dividers or disclosure rows instead of card stacks.
- Keep detailed settings, diagnostics, audit evidence, and secondary actions collapsed until opened.

### 3. Simplify the AI Command Center
- Lead with one prompt/goal and one recommended next action.
- Move scores, category breakdowns, scan detail, conversion ladders, and proposal evidence into progressive disclosure.
- Preserve auto-fix, batch repair, restore points, live scanning, and manual-fix links.

### 4. Simplify the website builder and related pages
- Keep the existing focused builder canvas as the reference experience.
- Make setup, design, content, images, SEO, pages, QA, and publish feel like modes within one workspace rather than separate dense dashboards.
- Apply the same interaction pattern to leads, bookings, quotes, automations, services, reviews, campaigns, analytics, billing, settings, launch, and domains.

### 5. Simplify portal, admin, and public pages
- Give the client portal the same compact navigation and page treatment as the main workspace.
- Turn the admin area into a left-navigation workspace instead of a crowded horizontal tool strip; retain every admin destination and audited support controls.
- Reduce public-site navigation and repeated promotional sections so each page has one main story and action, while preserving SEO routes and conversion paths.

## Technical details
- Centralize the shell, page header, section, disclosure, status, and navigation styles in shared components and semantic design tokens.
- Keep route files and business logic intact; make broad improvements through shared shells and primitives first, then fix route-specific outliers.
- Use existing design-system buttons and controls, maintain keyboard and screen-reader behavior, and preserve mobile touch targets.
- Keep all route-specific metadata unique and complete.

## Verification
- Check representative public, customer workspace, website builder, AI Command Center, client portal, and admin screens at mobile and desktop widths.
- Verify navigation, disclosures, dialogs, primary actions, and loading/empty/error states.
- Run targeted tests plus the project’s full automated checks and resolve any regressions.
