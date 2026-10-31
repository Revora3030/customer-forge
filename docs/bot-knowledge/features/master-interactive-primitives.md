---
name: Master Interactive & 3D Primitives Blueprint
description: 8 categories and 25 high-craft 3D, WebGL, physics, configurator, and spatial storytelling primitives for $10k+ customer sites
type: feature
---

# Master Interactive & 3D Primitives Blueprint ($10k+ Agency Quality)

## Architectural Invariant
- All interactive and 3D primitives are zero-token deterministic React/Canvas/WebGL components rendered client-side by `src/components/site/CompositionRenderer.tsx`.
- Sol (AI Creative Director) authors only declarative composition trees (`src/lib/builder/composition-tree.ts`).
- Heavy WebGL / Three.js bundles are strictly dynamically imported (`React.lazy`) with mobile touch guards (`touch-action: pan-y`) and static image fallbacks.

## The 8 Master Categories (25 Primitives)

### 1. 3D GLTF & Spatial Web (Three.js / WebGL2)
- `model_3d_viewer`: Interactive 3D model viewer (.glb with Draco compression), auto-rotate, orbit controls, pinch-to-zoom.
- `exploded_3d_assembly`: Scroll-driven model disassembly into floating cross-sections with labeled hotspots.
- `spatial_lighting_rig`: Pointer/gyro-reactive studio lighting with metallic sheen.
- `3d_hotspot_tour`: Spatial coordinate pins triggering detail cards on tap.
- `depth_tilt_card`: CSS 3D matrix parallax cards with mouse-following highlights.

### 2. Scroll-Scrubbed Cinema & Video Canvas
- `scroll_scrub_canvas`: High-density image sequences (30-60 frames) scrubbing on scroll (e.g. pressure washing clean, grass cut).
- `video_curtain_reveal`: Looping video hero masked by expanding typography/shapes on scroll.
- `sticky_split_story`: Pinned high-res before/after visual on one half, phased milestones scrolling on the other.
- `lens_magnifier`: High-magnification zoom loupe following cursor/touch for clear-coat/grout inspection.

### 3. Interactive WebGL Shaders & Canvas FX
- `liquid_wave_wipe`: Interactive fluid simulation generating ripples across hero visuals.
- `thermal_scanner_toggle`: Infrared shader overlay showing heat leaks (HVAC), moisture (roofing), or paint defects.
- `particle_dust_cleaner`: GPU particles scatter on cursor/touch move.
- `holographic_foil_badge`: Iridescent angle-shifting shader on guarantee badges and certification seals.

### 4. Physics-Driven & Spatial UI Engines
- `gravity_badge_pool`: Matter.js / lightweight canvas physics box of draggable, bouncing review/guarantee badges.
- `magnetic_action_button`: CTA elements that pull subtly toward cursor hover.
- `interactive_color_swatch_room`: Live material/paint swatch selector updating room accents in real time.
- `interactive_soundboard`: Subtle tactile audio feedback (soft clicks, clean water swoosh).

### 5. Multi-Tier Configurators & Decision Dialers
- `circular_gauge_dial`: SVG rotary dial adjusting package tiers, square footage, or PSI.
- `multi_room_builder`: Interactive floorplan room selector calculating area and pricing.
- `service_tier_fader`: Smooth slider cross-fading feature checklists across Good/Better/Best tiers.
- `roi_savings_slider`: Real-time visual math for energy or maintenance cost reductions.

### 6. Social Proof & Geographic Trust Visualizers
- `live_radius_map`: Interactive vector map showing verified service zones, recent job pins, and neighborhood pills.
- `live_booking_ticker`: Discreet activity ticker displaying recent verified bookings.
- `interactive_review_filter`: Tag, star rating, and neighborhood filtered testimonial wall.
- `video_testimonial_drawer`: Vertical reel-style video cards with customer proof clips.

## Industry Pack Mappings
- Luxury Auto Detailing: `model_3d_viewer` + `lens_magnifier` + `holographic_foil_badge` + `circular_gauge_dial`
- Contractors / Remodeling: `multi_room_builder` + `sticky_split_story` + `interactive_color_swatch_room`
- Roofing & Storm: `thermal_scanner_toggle` + `3d_hotspot_tour` + `live_radius_map`
- MedSpa / Clinics: `spatial_lighting_rig` + `depth_tilt_card` + `service_tier_fader`
- Restaurants & Hospitality: `video_curtain_reveal` + `liquid_wave_wipe` + `gravity_badge_pool`
*** Update File: mem://index.md
 - [Master Codebase & Production Audit](mem://audit/master-codebase-audit.md) — Deep zero-credit architectural, security, database, and conversion audit across all 1,874 files, 123 database tables, and 121 routes with prioritized fixes and upgrades
- [Master Interactive & 3D Primitives Blueprint](mem://features/master-interactive-primitives.md) — 8 categories and 25 high-craft 3D, WebGL, physics, configurator, and spatial storytelling primitives for $10k+ customer sites
 - [Cognitive Architecture Blueprint](mem://strategy/cognitive-architecture-blueprint.md) — 6-pillar technical architecture transforming the AI team into an autonomous workforce (Brain/ReAct/DAG, pgvector memory, dual-key hands, vision senses, 24/7 autopilot, multi-agent negotiation)
