# Whole-Repository Maximum Upgrade

Customer Forge is intentionally treated as a repository, not only as a collection of builder
files. The whole-repository upgrade contract scans every tracked working-tree file and keeps
static evidence separate from runtime/environment evidence.

## Scope

The repository audit inventories:

- every source, route, component, test, migration, workflow, configuration and documentation file;
- extension and directory distribution;
- oversized artifacts;
- TODO/FIXME markers;
- credential/private-key patterns;
- suspicious hard-coded client environment values;
- route, migration, test and workflow counts.

The builder-side whole-repo pass additionally checks the generated website context for:

- duplicate slugs;
- empty pages and sections;
- missing lead content;
- missing native conversion actions;
- missing internal navigation signals;
- mobile, visual, performance and security evidence boundaries.

## Safety contract

The upgrade does **not** mass-edit generated Supabase types, binary assets, lockfiles or every
individual file merely to create noise. A file is changed when there is a concrete, reviewable
improvement. Inventory coverage is still complete: every file is scanned by the repository audit.

No part of this upgrade:

- adds a new paid AI provider;
- bypasses authentication, RLS, tenant isolation or Stripe;
- writes directly to the database from the deterministic builder;
- invents reviews, pricing, credentials, guarantees or business results;
- treats a static scan as proof of browser, database, provider or production behavior.

Run:

```sh
npm run repo:audit
```

and the full release gate:

```sh
npm run quality
```
