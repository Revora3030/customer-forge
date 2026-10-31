---
name: revora-ai-city
description: 3D isometric AI workforce command center and city simulation reflecting real operations across Jarvis, Website Factory, The Institute, and Growth Hub for iPhone and desktop.
type: feature
---

# REVORA AI City: 3D Autonomous Workforce Operations & Command Center

## Architectural Vision & Core Concept
An interactive, real-time 3D isometric operational simulation and command center representing REVORA's autonomous AI workforce. Inspired by a cybernetic night city with distinct functional structures, each department reflects real backend tasks, model assignments, completed work, performance scores, and live system state rather than decorative or fake simulations.
Owner priority (2026-10-27): build the full AI City first as an actual workforce operations surface across all departments, then continue all roadmap pillars toward evidence-backed completion. Never substitute decorative activity for real work; paid actions, publishing and outreach remain approval-gated.

## Core Visual Style & Aesthetics
- **Palette**: Signature Revora black-and-gold architectural foundation with electric cyan, magenta, and neon lighting accents in a cinematic night environment.
- **Geometry**: Stylized low-poly isometric architecture (lightweight, under 3MB assets) allowing 60+ FPS on mobile GPUs without battery drain.
- **Atmosphere**: Emissive glass facades, glowing floor grids, neon rooftop signage, and illuminated work cubicles with animated AI agents at active desks.

## Departmental City Districts & Buildings
1. **Main Tower / Jarvis Control Room**:
   - Executive orchestration tower overlooking the city.
   - Real-time command center: active jobs, spend tracking within Luna's $100 monthly cap, model availability, alerts, and founder approval queues.
2. **Website Factory**:
   - The production engine for client sites.
   - Active workstations for **Sol** (lead designer/creative author), **Terra** (visual QA & contrast audit), and **Luna** (SEO/conversion metadata) pulsing when site generation is underway.
3. **The AI Institute**:
   - Continuous testing and model improvement laboratory.
   - Hosts the 44-model Lovable gateway evaluation suites, Hall of Fame scorecards, benchmark comparisons, prompt experiments, and error-recovery training.
4. **Creative District & Media Studio**:
   - Specialized suites for high-fidelity asset composition: Sunburst & Flare (photography composition), Whisper (transcription/voice), and Sora/Veo (motion/video).
5. **Growth, Sales & CRM Hub**:
   - Real-time lead ingestion stream, verified Google Maps prospect extractions, and founder-reviewed outreach draft queue.
6. **Security & Reliability Center**:
   - Tenant isolation audit monitors, Supabase RLS policy integrity, Cloudflare worker health, server-side secret protection, and emergency stop kill switch.
7. **Knowledge & Memory Library**:
   - Vector memory indexing, persistent client facts, business rules, and brand knowledge vaults.

## Cross-Platform Technical Architecture
### iPhone 17 (Mobile-First Experience)
- **Engine**: Three.js / React Three Fiber with WebGL 2.0.
- **Performance Optimization**: Capped render resolution (DPR 1.5–2.0), frame-rate throttling when idle, low draw calls via instanced meshes.
- **Mobile Interactions**: One-finger pan, pinch-to-zoom, tap-to-focus on buildings and individual agent cubicles.
- **Tactical Bottom Sheet**: Swipe-up mobile HUD showing live task progress, logs, and approvals without leaving the 3D viewport.
- **Accessible 2D Fallback**: Instant one-tap toggle for an ultra-fast tactical dashboard for low-bandwidth conditions and reduced-motion preferences.

### Apple Desktop / Mac (Cinematic Command Hub)
- **Layout**: Expansive ultrawide layout with split-screen floating glass panels (live terminal, site preview, analytics streams).
- **Graphics**: Dynamic post-processing bloom, screen-space reflections on wet street surfaces, and free-orbit camera controls.

## Grounded Data Invariants
1. **100% Truthful State**: Agents only light up or appear active when real background tasks exist in the database; no fake busywork animations.
2. **Auditability**: Tapping any building opens verified department queues; tapping any agent opens its real model ID, task history, and benchmark score; tapping any task displays its complete evidence trail.
3. **Security Invariants**: All status reads are strictly tenant-isolated and scoped to authenticated organizations. Founder approval remains required for live publishing, financial changes, and external sends.
