## What changed and why

<!-- One or two sentences. Link the issue or error that started this. -->

### Evidence card

<!-- Bots: paste the output of `npm run agent:evidence -- --task <id>`. People: fill in what you ran. -->

| Field | Value |
|---|---|
| Task | |
| Problem observed | |
| Fix applied | |
| Tests | _ passed, _ failed (`npx vitest run`) |
| Type check | passed / failed / not run |
| Build | passed / failed / not run |
| Security / RLS | No migration changed / RLS + adversarial test added |
| Rollback | Revert the merge commit on lovable-sync |

### Approval

- [ ] Targets `lovable-sync` from a feature branch
- [ ] No paid AI calls, publishing, outbound sends or billing changes ran while preparing this
- [ ] Merging, deploying and publishing wait for the founder's approval (Level 4)
