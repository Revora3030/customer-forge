# Generated-site QA runbook

## Required checks

For each critical generated website before publication, verify:

- home page renders;
- visible navigation resolves;
- internal links resolve;
- headings are meaningful;
- placeholder/template content is absent;
- title and meta description are present and useful;
- conversion CTA points to a real destination;
- forms and submission paths work where configured;
- keyboard focus is usable;
- accessible names exist for interactive controls;
- mobile layouts do not overflow or hide essential content;
- images/resources load;
- console/runtime errors are absent;
- performance checks have evidence.

## Evidence boundary

Static HTML inspection is deterministic and useful. Browser interaction, screenshots, form submission, Core Web Vitals and console inspection require a runtime capable of performing those checks.

Never label a runtime check passed when the runtime was not actually executed.

## Publish rule

Critical failures block publication. Warnings remain visible and must not be silently converted into passes.
