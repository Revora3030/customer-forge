# Elite Mobile Detailing — Premium Visual Theme Specification

## Purpose
This document specifies a non-destructive, production-ready visual direction for the published Elite Mobile Detailing public site.

## Brand tokens

| Role | Value | Intended use |
|---|---|---|
| Primary action | `#22C55E` | Primary calls to action, active states, confirmed-success cues |
| Secondary / deep base | `#07111F` | Page background and deep visual foundation |
| Premium accent | `#FBBF24` | Limited premium highlights, badges, and key service details |
| Primary ink | `#F8FAFC` | Headings and primary body copy on dark surfaces |
| Muted ink | `#94A3B8` | Supporting text and metadata |
| Surface | `#0D1B2A` | Cards, panels, and elevated interface surfaces |
| Font | `Space Grotesk` | Existing brand typeface to retain |

## Dynamic profile values

Set these `business_profiles` fields for organization `11111111-1111-4111-8111-111111111111`:

```json
{
  "primary_color": "#22C55E",
  "secondary_color": "#07111F",
  "accent_color": "#FBBF24",
  "font_preference": "Space Grotesk"
}
```

## Background direction

Use the existing allowlisted `aurora` site backdrop. Render it as a low-contrast dark-navy foundation with restrained emerald and blue glows. It must remain decorative, stay behind content, and respect reduced-motion preferences.

## Accessibility rules

- Use `#F8FAFC` on `#07111F` for primary copy.
- Use `#94A3B8` only for secondary copy.
- Use `#22C55E` for calls to action and active states; do not use color as the only state indicator.
- Use `#FBBF24` for limited premium highlights rather than body copy.
- Maintain visible keyboard focus rings and sufficient contrast on all buttons.

## Component guidance

- Keep cards on `#0D1B2A` with subtle borders or shadows.
- Use responsive, optimized hero imagery showing clean vehicles and premium detailing work.
- Keep background effects performant and suppress or simplify animation for `prefers-reduced-motion`.
- Preserve quote/contact CTA prominence across desktop and mobile layouts.

## Validation checklist

- Confirm public route `/s/elite-mobile-detailing` uses dynamic profile color variables.
- Confirm the aurora background remains behind all interactive content.
- Review mobile contrast, hover/focus states, and quote CTA legibility.
- Run tests and a production build before merge.
