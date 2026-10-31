---
name: Cinematic Creative Engine & Video-Grade Visual Archetypes
description: Customer-specific creative direction engine producing cinematic product showcases, luxury editorial, and interactive 3D sites tailored to each business without generic templates
type: feature
---

# Cinematic Creative Engine & Video-Grade Visual Archetypes

Master design specification for Revora's AI Website Builder and Jarvis. Builds websites matching the visual craft of top-tier video showcases, moving beyond generic AI layouts into high-craft, business-specific digital experiences.

## 1. The Three Reference Visual Archetypes
- **Cinematic Product Showcase**: Dark environments, dramatic lighting, large product/vehicle photography, immersive transitions, oversized typography, editorial product storytelling. Tailored for auto detailing, apparel, specialty goods, and high-end services.
- **Luxury Editorial Design**: Elegant typography (characterful serif headers, clean sans body), deliberate whitespace, striking photography, restrained palettes, and carefully sequenced sections. Ideal for premium service businesses, barbers, architects, consultants, and luxury trades.
- **Futuristic Interactive 3D**: Animated 3D objects, luminous flowing forms, particle environments, cinematic transitions, and scroll-synchronized motion. Best suited for technology, creative studios, automotive innovation, and cutting-edge brands.
- **Rule**: These are archetypes, not rigid templates. The system dynamically authors an original visual identity tailored to the specific business, audience, and conversion goal.

## 2. Customer-Specific Creative Direction Engine (Pre-Code Stage)
- Before generating page code, Jarvis prepares a comprehensive Creative Brief:
  1. Verified Business Identity: Exact business name, trade, service area, authentic services, brand differentiators, and real brand colors.
  2. Primary Conversion Goal: Instant phone/SMS, quote estimator, appointment booking, or direct lead capture.
  3. Visual Direction & Rationale: Selection of the ideal archetype with specific justifications based on customer expectations.
  4. Art Direction Tokens: Palette, typography clamp scales, whitespace density, lighting/contrast rules, and motion intensity.
  5. Page Composition Plan: Unique visual rhythm per page, avoiding repetitive icon-card grids.
  6. Asset & Provenance Plan: Customer-provided photos/logos prioritized, CC0/generated visual fallbacks, strict zero-fabrication.
  7. Constraints: Multi-viewport limits (320px to 2560px), mobile touch targets (min 44x44px), performance budgets, and accessibility.
- Compares 2–3 creative directions internally before selecting the highest-converting, brand-accurate path for the builder.

## 3. High-Craft Visual & Motion Architecture
- **UI Foundation**: shadcn/ui and Radix UI with Tailwind CSS v4 semantic tokens.
- **Animated Components**: React Bits patterns (shader backgrounds, interactive text, kinetic reveals) integrated into modular composition nodes.
- **Interactive 3D Primitives**: Three.js, React Three Fiber v9 (React 19 compatible), and Drei. Must be progressive enhancements: lazy loaded behind `<ClientOnly>`, strict GPU limits, and elegant static fallbacks for low-power devices.
- **Cinematic Motion**: Motion (Framer Motion) and GSAP for coordinated scroll-triggered reveals and timeline transitions. Mandatory support for `prefers-reduced-motion: reduce`.
- **Design Judgment**: Impeccable checks and Anthropic frontend-design principles to reject generic gradients, centered-everything layouts, and AI monoculture.

## 4. Multi-Role Specialist Review Workflow
- **Business Researcher**: Grounds claims strictly in verified intake facts.
- **Creative Director (Sol)**: Authors the bespoke visual direction, typography pairings, and spatial rhythm.
- **Art & Asset Director**: Curates imagery, lighting, surface reflections, and textures.
- **Frontend & Motion Engineer**: Implements semantic composition trees, responsive layouts, and motion timelines.
- **Visual QA Critic (Terra)**: Audits rendered DOM screenshots at 320px, 390px, 768px, 1280px, and 2560px against the creative brief.
- **Functional & Accessibility Reviewer (Luna)**: Validates JSON-LD schema, forms, booking flows, WCAG 2.2 AA contrast, and Core Web Vitals.

## 5. Objective Visual-Quality Gate (Proof Over Assertion)
A generated site passes only when the rendered DOM satisfies:
1. Visual Originality: Distinct visual personality; no template repetition.
2. Brand Relevance: Appropriate tone, typography, and imagery for the trade.
3. Visual Hierarchy: Immediate optical clarity from headline to action trigger.
4. Asset Quality: Sharp, properly framed, optimized (Squoosh/WebP), and truthfully sourced.
5. Motion & Interaction: Intentional, smooth, non-blocking, with accessible controls.
6. Mobile Experience: Zero horizontal scroll at 320px/390px, sticky conversion triggers, thumb-friendly targets.
7. Functional Integrity: All navigation, booking pickers, quote calculators, and lead webhooks test cleanly.
8. Accessibility & SEO: Keyboard focusable, WCAG 2.2 AA contrast, valid JSON-LD rich snippets.
9. Performance Benchmarks: LCP <= 2.5s, INP < 200ms, CLS < 0.1.
10. Grounded Truth: Zero invented reviews, fake ratings, bogus certifications, or fabricated prices.

## 6. Section Layout Root Causes & 4-Phase Build Order
- **Root Causes of Layout Stalls Identified in Audit**:
  1. 4-section batching causes output token truncation in complex JSON trees (`BATCH = 4`).
  2. Strict `requiredMediaRefs` marks every attached picture as mandatory, causing validator rejections if one is omitted.
  3. Rigid `widgetPresentation` themes fail when any of the 8 semantic colors or copy fields are missing or flagged by genericity filters.
  4. Long review/repair loops exhaust edge worker time limits before checkpoint persistence.
- **4-Phase Implementation Sequence (Ready for Credit Top-Up)**:
  - **Phase 1: Layout Engine Resilience**: Shift Sol to 1-to-2 section micro-batches, soften mediaRef requirements, auto-repair widget themes from the brand palette, and enforce tight checkpoint boundaries.
  - **Phase 2: Customer Creative Direction Engine**: Pre-code generation comparing 2-3 tailored concepts (Cinematic, Luxury, or 3D) with specific trade rationale before page assembly.
  - **Phase 3: High-Craft Visual Primitives & Motion**: Integrate React Bits animated primitives (shaders, kinetic text), Three.js / React Three Fiber v9 for progressive 3D, and Motion/GSAP scroll timelines with reduced-motion fallback.
  - **Phase 4: Rendered Visual-Quality Gate**: Multi-viewport Playwright DOM snapshots (320px, 390px, 768px, 1280px), Terra visual review against the creative brief, and automated Core Web Vitals / WCAG 2.2 AA verification.
