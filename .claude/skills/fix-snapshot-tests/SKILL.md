---
name: fix-snapshot-tests
description: Decide whether a failing Vitest snapshot (toMatchSnapshot, toMatchFileSnapshot, inline snapshots, the builder prompt-regression snapshots) is a real regression or an intended change, and update it only in the second case. Use when a snapshot or prompt-regression test fails.
---

# Fix snapshot tests

Snapshots here: `src/lib/builder/prompt-regression/__snapshots__/*.snap` (call counts) and `src/lib/builder/prompt-regression/snapshots/*.txt` (full prompts per fixture). Prompt text is product behaviour: a diff means the AI will be told something different.

## 1. See the diff, not the files
```bash
npx vitest run src/lib/builder/prompt-regression/prompt-regression.test.ts 2>&1 | head -80
```
Never read the `.txt` snapshots whole; the failure output shows the changed lines.

## 2. Classify
- **Intended**: the diff matches the source change in this branch (`git diff origin/lovable-sync -- src/lib/builder` shows the same wording/rule change). Go to step 3.
- **Regression**: a must-keep rule disappeared, a fact/price/phone guard weakened, call counts changed without a reason, or the diff touches prompts the task never meant to change. Fix the source, not the snapshot.
- **Flaky / non-deterministic**: dates, ids, random order in the output. Fix the test input (fixed clock, sorted output); do not update the snapshot to whatever ran last.

## 3. Update only the intended file
```bash
npx vitest run src/lib/builder/prompt-regression/prompt-regression.test.ts -u
git diff --stat -- src/lib/builder/prompt-regression/
```
The stat must list only the snapshots you expected. If others changed, revert them (`git checkout -- <file>`) and investigate. Never run `-u` across the whole suite.

## 4. Re-run and report
Run the test again without `-u` and paste the pass line. In the PR description, say which snapshots changed and why (one line each). The contract checks in the same test (must-keep rules, invented price/phone detection) must keep passing; never edit them to pass.

`prompt-regression.live.test.ts` calls real models and costs money: only run it when the owner asks.
