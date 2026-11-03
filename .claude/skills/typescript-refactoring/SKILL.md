---
name: typescript-refactoring
description: Refactor TypeScript in this repo (rename, extract, split a large file, tighten types) without changing behaviour, using symbol-level tools and the strict compiler as the safety net. Use when asked to refactor, clean up, split or retype code.
---

# TypeScript refactoring

Behaviour must not change. Pair with the code-simplification skill for what to simplify; this skill is about doing it safely here.

## Before
1. Pin current behaviour: run the sibling tests and note the pass count. If the code has no test, add a characterization test first (test-driven-development skill).
2. Find every use with symbols, not text: Serena `find_referencing_symbols` (or `rg -n -w '<name>' src`). Check `*.server.ts` vs client imports: moving server code into a client-imported module breaks `client-bundle-guard`.

## During
- One mechanical move per step (rename, extract function, move file); keep public exports stable or update every importer in the same step. Prefer Serena `rename_symbol` / `replace_symbol_body` over hand edits on large files.
- The compiler is strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`): don't silence it with `as any`, `!`, or `// @ts-ignore`; narrow with type guards or fix the type.
- Use `import type` for type-only imports; keep `@/` path aliases.
- Never touch generated files (`routeTree.gen.ts`, `src/integrations/supabase/types.ts`, `*.generated.ts`).
- Splitting a huge file (e.g. `site-engine.worker.server.ts`): move a self-contained group of functions with their tests' imports; re-export from the old path until callers are migrated.

## After
```bash
NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit
npx eslint <changed files>
npx vitest run <sibling tests>
```
Same pass count as before. The diff should read as moves and renames; any logic change belongs in a separate commit with its own test.
