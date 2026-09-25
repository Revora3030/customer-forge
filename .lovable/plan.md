# Plan

I will remove the remaining build blockers without changing security, billing, tenant isolation, or truth safeguards.

## What I will fix

1. Make first-build copy fully AI-authored
   - Remove the seeded default primary CTA from new first builds.
   - Require Sol to author `primaryCta` and `secondaryCta` in the first-build copy pass.
   - Let the existing fact/truth review gate approve or reject those CTA labels.
   - Keep the hard failure if no AI-authored primary action survives review.

2. Stop false image-campaign failures
   - Allow a valid AI creative direction to choose no generated images.
   - Keep image safety checks, cost caps, evidence tags, and media-integrity failures for sections that explicitly require imagery.

3. Remove remaining closed creative scales from authoring paths
   - Make first-build and redesign motion/density values free AI-authored tokens.
   - Keep only syntax, accessibility, reduced-motion, and renderer-safety validation.
   - Keep finite UI rendering tokens only where they are non-creative implementation constraints.

4. Fix Cloudflare-compatible public submission hashing
   - Replace the `node:crypto` import in public site functions with Web Crypto.
   - Fix the nullable contact-hash RPC call typing without loosening the database policy.

5. Strengthen regression/firewall tests
   - Add tests that block deterministic first-build CTA defaults.
   - Add tests that block closed first-build/redesign motion or density vocabularies.
   - Add tests that confirm no-image creative directions are accepted when the AI chose that.
   - Add a Web Crypto hashing regression for public submissions if the function can be exported safely.

6. Verify and report
   - Run targeted scans for removed creative-authority mechanisms.
   - Run typecheck, lint, test suite, and production build through the available project scripts.
   - Fix any failures from those checks.
   - Report the exact changes, remaining safeguards, findings, test results, and current commit SHA.
