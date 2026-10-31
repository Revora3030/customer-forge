---
name: Revora AI Model Pool Orchestrator
description: Capability-aware routing and collective specialist execution across Lovable AI models for Sol, Terra, Luna, and the specialist bench without third-party provider bloat or ungrounded round-robins
type: feature
---

# Revora AI Model Pool Orchestrator

Strategic routing and collective execution engine across Revora's Lovable AI model pool.

## 1. Collective Specialist Roles
- **Sol (Creative Director & Visual Synthesis)**: Lead designer and architectural author. Crafts tailored design tokens, bespoke typography pairings, and industry-specific layouts (`design` role, headed by `openai/gpt-6.1-sol`, failing over to `anthropic/claude-sonnet-5` and `google/gemini-4-argon`).
- **Terra (Adversarial QA & Structural Reviewer)**: Critical reviewer. Evaluates drafts against WCAG 2.2 AA contrast, responsive wrapping, overflow hazards, and visual rhythm. Emits actionable, machine-executable revision directives (`vision` & `primary` review roles, headed by `anthropic/claude-sonnet-5` and `google/gemini-3.8-flash`).
- **Luna (Structured Intelligence, SEO & Fact Verification)**: Metadata and schema engineer. Validates JSON-LD structured schemas, verifies truthfulness against intake data, optimizes conversion paths, and enforces monthly budget caps ($100) (`fast` role, headed by `google/gemini-3.1-flash-lite` and `openai/gpt-6-luna`).
- **Specialist Bench**:
  - **Astra / Sol56 / Luna56**: High-throughput contextual drafting and section expansions.
  - **Sunburst & Flare**: Photographic art direction and contextual imagery generation (`image` role, headed by `openai/gpt-image-2.5-sunburst` and `google/gemini-3-pro-image`).
  - **Whisper**: Multilingual audio transcription for voice-directed builder workflows (`transcription` role, `openai/gpt-transcribe`).
  - **Sora**: Purposeful, conversion-enhancing motion and video backgrounds.

## 2. Capability-Aware Routing Rules
- **Capability-Driven Assignment**: Tasks route to models by proven capability (reasoning, vision, high-throughput extraction, structured JSON), never by arbitrary round-robin.
- **Graceful Bounded Failover**: If an upstream model times out or rejects a request, the router fails over down the designated role roster with identical schema enforcement.
- **Single Provider Integrity**: Lovable AI is the sole provider. All model dispatches route through the centralized router in `src/lib/ai/router.server.ts` with daily paid reservations and Luna spend caps.
- **Strict Grounded Truth**: Outputs are validated against verified business DNA facts; no model may invent claims, awards, reviews, or prices.
