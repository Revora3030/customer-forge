---
name: model-catalog-and-dormant-surfaces
description: Exhaustive audit of all 63 Lovable AI models across 4 providers, 6 dormant gateway surfaces, and zero-marginal-cost technical power-ups to unlock full workforce potential
type: strategy
---

# Revora Model Catalogue & Dormant Surfaces Master Audit

Comprehensive architectural inventory of all 63 models in the Lovable AI Gateway catalogue, active vs. dormant surfaces, and zero-marginal-cost platform power-ups.

---

## 1. Provider & Model Allocation Status

- **Total Catalogue Models**: 63
- **Active in Production Rosters**: 32 (across `primary`, `design`, `fast`, `vision`, `coding`, `image`, `transcription`, and `conversation`)
- **Unrouted / Dormant**: 31 (awaiting schema integration, migrations, or role assignments)

### Key Underutilized Flagship Models
1. **`google/gemini-3.8-flash`**: Best-in-class low-latency vision. Currently assigned to vision for uploaded attachments only; must be wired to real-time rendered DOM screenshots so Terra conducts live visual QA before sites are finalized.
2. **`openai/gpt-6-astra`**: High-throughput refactoring engine. Underutilized in multi-variant hero layout synthesis and client-specific A/B copy generation.
3. **`anthropic/claude-opus-5-5` & `claude-opus-5`**: Deepest architectural reasoning models. Currently positioned behind fast models in failover chains; should be reserved for whole-site redesign migrations and complex multi-page consistency audits.
4. **`anthropic/claude-fable-5-1`**: Narrative storytelling and bespoke brand voice specialist. Unassigned to dedicated founder origin story and customer brand narrative generation.

---

## 2. The 6 Dormant Gateway Surfaces

The Lovable AI Gateway provides 6 distinct surfaces that Revora does not currently route:

1. **`embeddings` (`openai/text-embedding-3-small` / `3-large`, `google/gemini-embedding-001` / `2`)**:
   - *Current State*: Unrouted; search memory currently uses flat SQL text rows capped at 40 memories.
   - *Activation Path*: Apply `pgvector` migration to create `public.vector_memories` with cosine-similarity indexes, unlocking semantic recall across all past client builds and founder preferences.
2. **`live` (`openai/gpt-live-1`)**:
   - *Current State*: Unrouted; needs server-minted short-lived WebRTC session handler.
   - *Activation Path*: Build an ephemeral WebRTC audio session endpoint for low-latency (<300ms) spoken voice reception and real-time voice-driven site building on mobile.
3. **`videos` (`google/veo-3.1`, `veo-3.1-fast`, `veo-3.1-lite`)**:
   - *Current State*: App video handler is formatted strictly for Gemini Omni.
   - *Activation Path*: Standardize video request body for Veo 3.1 to generate cinematic 1080p ambient video backgrounds for luxury customer sites.
4. **`music` (`google/lyria-3-pro-preview`, `lyria-3-clip-preview`)**:
   - *Current State*: Unrouted; no customer audio primitives or storage buckets exist.
   - *Activation Path*: Add an ambient soundscape toggle / sonic brand identity generator for high-ticket client sites.
5. **`systemone` (`typesafe/jev-1.13`)**:
   - *Current State*: Unrouted.
   - *Activation Path*: Route microsecond deterministic typing and compliance checks to eliminate hallucinations in routing and business-fact validation.
6. **`image-edit` (`openai/gpt-image-2.5-sunburst`, `flare`, `google/gemini-3.1-flash-image`)**:
   - *Current State*: Image edits currently trigger full image regeneration with reference prompts rather than inpainting masks.
   - *Activation Path*: Wire canvas-based mask coordinate payloads for surgical background replacement and logo placement.

---

## 3. Zero-Marginal-Cost ($0) Platform Power-Ups

Technical upgrades delivering enterprise platform capabilities using native web standards, database primitives, and client-side compute without incurring incremental API costs:

1. **Client-Side PDF Generator (`jspdf`)**:
   - Generates downloadable PDF service quotes, estimates, and customer contracts directly in the visitor's browser with zero server compute spend.
2. **Dynamic Client-Side QR Code Engine**:
   - Pure mathematical SVG/Canvas QR generation for review links, digital business cards, and payment links.
3. **Progressive Web App (PWA) Engine**:
   - Web app manifests and service workers enabling home-screen installation on iPhone and Android for both the Revora platform and generated customer sites.
4. **Native Browser Speech Recognition (`webkitSpeechRecognition`)**:
   - Free client-side speech-to-text running directly on device in Safari and Chrome for voice-directed Jarvis interactions.
5. **Dynamic SVG Open Graph (OG) Generator**:
   - Edge-computed SVG-to-social-preview cards (`1200x630`) containing live business branding, ratings, and phone numbers.
6. **Postgres Full-Text Search (`tsvector` & `tsquery`)**:
   - Instant search across thousands of CRM contacts, website sections, and logs inside Lovable Cloud without external search infrastructure.
7. **Interactive 3D Device Orientation (Gyroscope)**:
   - Subtle 3D tilt effects reacting to physical phone movement on mobile using native `DeviceOrientationEvent` without heavy 3D rendering engines.
8. **DoH Network & DNS Health Engine**:
   - Free domain verification, SSL certificate tracking, and SPF/DKIM validation via public Cloudflare 1.1.1.1 DNS-over-HTTPS queries.
