# Builder prompt regression suite

Protects the builder's AI prompts (page architect Sol + reviewer Terra, section copywriter Sol + reviewer Terra) so an edit to a prompt can't silently weaken a rule such as "never invent a price".

Code: `src/lib/builder/prompt-regression/`

## What it covers

Eight fixed, fictional businesses (`fixtures.ts`): plumber, HVAC, roofer, landscaper, cleaner, electrician, mobile detailer, and one sparse handyman (name, trade and town only). Phones are `(555) 010-xxxx`, emails use `example.com`.

For each one, the **real** prompt code runs (`proposePageArchitecture`, `refineSectionWordingWithCollective`) with only the model replaced. The checks (`checks.ts`):

| Check | What fails it |
| --- | --- |
| Structure | no home page, home not opening on a hero, too few pages, duplicate slugs, SEO title > 60 / description outside 120-155 characters, business name in a section heading, a supplied service shown nowhere, a page with no closing action |
| No invented facts | a price, phone number, email, or any number the owner did not supply; claims like award, licensed/insured, guarantee, 24/7, same-day, free estimate, star rating, years in business unless the owner's own words contain them |
| Phone-first | home page not opening with a hero that carries the primary action, primary action not a call/text action, no contact or sticky call section on the site |
| Lead capture | no quote, booking or contact section on any page, or a home page that reaches none and has no primary action |
| Wording pass | a patch for an unknown section, an empty section body left unfilled, or invented facts in patches |

Plus:

- **Prompt snapshots** (`snapshots/*.txt`): the full prompts sent for the plumber and the sparse handyman. Any prompt edit shows up as a diff in review.
- **Prompt contract** (`PROMPT_CONTRACT` in `checks.ts`): a short list of must-keep instructions (no invention, fact fidelity, mobile-first, contact one tap away, SEO limits, reviewer roles). Dropping one fails the suite with a plain message.
- **Call counts** (`__snapshots__/`): how many model calls of each purpose a run makes.
- **Negative tests**: bad outputs (invented price/phone/email/claims, missing hero, no lead capture, etc.) are fed to the checks to prove they fail.

The stub model (`stub-model.ts`) is hand-written and deterministic. It is **not** a recording of a real model, so stubbed CI proves the prompts and checks hold together, not how good a real model's answer is. Use live mode for that.

## Run it

```sh
npm run test:prompts          # stubbed, same as CI: no network, no secrets, no spend
npm test                      # full suite also includes it (CI runs it this way)
```

## Live mode (optional, off by default, never in CI)

```sh
PROMPT_REGRESSION_LIVE=1 PROMPT_REGRESSION_URL=<chat-completions endpoint> PROMPT_REGRESSION_API_KEY=<your own key> \
PROMPT_REGRESSION_MODEL=<model id that endpoint accepts> \
npm run test:prompts:live
# limit to some fixtures:  PROMPT_REGRESSION_ONLY=plumber,roofer
```

- It refuses to run unless all three variables are set, and refuses whenever `CI` is set. No CI secret is needed or used.
- It calls the endpoint you name directly (the repo's router-only guard forbids naming a provider host in source), bypassing the budget ledger, so a full run is about 10-14 calls per fixture. Keep it small.
- A live failure is information about that model's answer (real models vary), not a merge gate.
- Anthropic-style model ids are not supported by this runner (they need the native messages endpoint).

## Updating on purpose

1. Edit a prompt. The suite fails: the snapshot diff shows exactly what changed, and the contract names any dropped rule.
2. If the change is intended, refresh the snapshots and review the diff in the PR:
   `npx vitest run src/lib/builder/prompt-regression -u`
3. If you reworded a must-keep instruction, update its `pattern` in `PROMPT_CONTRACT`. If you removed one on purpose, delete the rule and say why in the PR.
4. Never loosen a check to make a model's output pass. Fix the prompt, or fix the fixture if the fixture was wrong.

### Adding or changing a fixture

- Add an entry to `PROMPT_FIXTURES` in `fixtures.ts`: fictional name, `(555) 010-xxxx` phone, `example.com` email, only facts the fixture really supplies. Everything not in the fixture counts as "invented" to the checks.
- If it should be treated as sparse (no services, short description), set `thin: true`.
- Run the suite; new snapshots are written for new call counts. Commit them.
- If the stub replies need a new shape for the fixture, edit `stub-model.ts`.
