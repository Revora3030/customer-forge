# Build both next workforce upgrades

## 1. Lead acquisition pipeline in AI City (Sales district)
Connect tools that already exist into one flow you approve one step at a time:
- **Scout:** a "Find prospects" mission runs the existing free map search (OpenStreetMap only). It targets businesses with no website or a weak one that list a public email.
- **Demo Forge:** for a prospect you pick, the existing private demo builder makes a demo. It still goes through the existing daily limit, spending cap and launch checks.
- **Pitch:** the existing email drafter writes a pitch. It includes the official setup and monthly price sentence, read from the offer file. The pitch goes into the existing approval queue. Nothing is sent until you tap Approve, and the existing rules check it again at that moment.
- A pipeline strip in the Sales district shows real counts at each stage: Found → Demo ready → Awaiting approval → Sent → Replied. If a count can't be read, it says "unavailable", never 0.

## 2. District inspector (phone and desktop)
- Tapping a building opens a panel: a bottom sheet on iPhone, a side panel on desktop. It shows that district's running work, queue size, latest routine runs, which models it uses with their recorded success out of calls in the last 24 hours, and recent errors.
- Each row opens its record. Each district gets a quick mission button that pre-fills the Jarvis composer. Jarvis then hands the work to the existing reviewed tools.
- The panel is keyboard friendly, closes with Escape or a swipe, and keeps buttons at least 44px tall.

## Safeguards (unchanged)
No automatic emails, publishing or paid calls. Approval goes only through the existing queue. Owner-only access. No new database tables unless a stage is truly missing; if one is, I'll flag it first.

## Technical details
- Extend `ai-city.server.ts` with a sales pipeline read built from the existing prospect, demo and approval-queue records, scoped to super-admin.
- New `DistrictInspector.tsx`, using shadcn Sheet with side changing by screen size, wired to `selected` in `AiCity.tsx`.
- Mission drafts reuse `jarvis-prospecting.functions.ts`, `jarvis-demo-site.functions.ts` and `growth-engine/service.server.ts`.
- Tests: stage counts, unavailable state, a pitch containing the price sentence, and approval being required before any send.
- Browser check at 390 and 1280 widths while signed in. No real sends.
