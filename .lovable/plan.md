# A much simpler website builder

Today the builder asks a customer to understand 5 tabs, 10 sub-tabs, 10 collapsed
panels, 2 pop-up windows and five different AI boxes before they can publish. The
same "what's missing" list is calculated three different ways and shown in three
different places.

The new builder is one screen: a conversation on the left, their real website on the
right. Nothing else, until their site actually needs something.

## The new main screen

```text
┌──────────────────────────────────────────────────────────────┐
│  Bella's Bakery · website        Draft   [Preview]  [Publish] │
├──────────────────────────┬───────────────────────────────────┤
│                          │  ┌─────────────────────────────┐  │
│  Revora                  │  │                             │  │
│  I built 4 pages and     │  │      their real website     │  │
│  wrote your words.       │  │        live, clickable      │  │
│                          │  │                             │  │
│  You                     │  │   [ phone  tablet  desktop ]│  │
│  make the header warmer  │  └─────────────────────────────┘  │
│                          │                                   │
│  Revora                  │  ► 2 things needed before you go   │
│  Changed 3 things ▸      │    live — answer them (appears     │
│                          │    only when true)                 │
│ ┌──────────────────────┐ │                                   │
│ │ Tell Revora what to  │ │                                   │
│ │ change...      [↑]   │ │                                   │
│ └──────────────────────┘ │                                   │
│  📷  🎤   Suggestions ▾  │                                   │
└──────────────────────────┴───────────────────────────────────┘
```

- **Left: one assistant.** Today's five AI boxes (ask-box, chatbot, full-build,
  improve-my-website, grow-my-business) become one conversation. Their old
  one-click actions survive as suggestion chips above the text box — "Improve my
  layout", "Fix mobile", "Check my site", "Get more enquiries" — so nothing is
  lost, it's just one place. Photo upload and voice stay attached to the box.
- **Right: their actual site.** The live preview, with phone/tablet/desktop
  switching. Clicking any text or button on it still edits it in place, as it does
  today. Every change Revora makes appears here immediately.
- **Top: three things only.** Status (Draft / Live), Preview, Publish. History and
  undo/redo stay as small controls beside them.

## Nothing shows until it's needed

Instead of tabs for brand, effects, photos, pages, reports and portal access, the
right column shows a short list of cards, and each card only appears when the site
genuinely needs it:

| Card | Appears when |
| --- | --- |
| Things needed before going live | a required answer is missing |
| Add your photos | the site has no images of their own |
| Choose your look | brand colours/fonts were never confirmed |
| Connect your domain | they're published on the Revora address only |
| Enquiries aren't going anywhere | no alert inbox and no form target |
| Something looks broken | the site check found a real problem |

When a customer's site is healthy, this column is empty and the screen is just
chat plus their website.

Every detailed control still exists, behind one **Advanced** link at the bottom:
pages and sections, brand, backdrops and effects, photo library, lead capture,
reports, previews, client portal, launch checks. Same panels, same behaviour — one
door instead of ten.

## One "what's missing" list

The three overlapping readiness systems become one. `preflight` (used in the
builder) and `readiness` (used on the Launch page) are merged into a single list,
and the unused `prepublish-checklist` is removed. Publishing keeps exactly the same
server-side gates it has now — setup payment, required facts, content present,
permission — nothing about publishing gets looser.

## What stays untouched

Building, publishing, custom domains, rollback and restore points, the free
model collective, exact-wording and fact protection, tenant isolation, billing and
trials, analytics, and every already-published customer website. This is a change
to the screens only; the engine behind them is not rewritten.

## Technical notes

- New `src/routes/_authenticated/app.website.tsx` (currently 918 lines of inline
  section definitions) reduced to a thin route rendering a new
  `BuilderWorkspace` component: two-column `lg:grid-cols-[minmax(380px,420px)_1fr]`,
  stacked on mobile with the preview first and the composer docked to the bottom.
- New `src/components/app/BuilderAssistant.tsx` — one conversation surface built on
  AI Elements (`conversation`, `message`, `prompt-input`, `shimmer`, `tool`),
  installed from the AI Elements registry. It replaces the transcript/composer
  hand-rolled in `AiRequestPanel` while keeping its existing plan/approve/apply
  worker (`planWebsiteChanges` → `applyWebsiteChanges`), clarifying questions,
  `CompositionPreviewCard`, per-action outcome details, voice
  (`transcribeVoiceCommand`) and attachments. `SiteChatbot`, `RevoraGenius`,
  `BuilderAudit` and `UpgradeStudio` entry points become suggestion chips that
  seed the same composer; their server functions are unchanged.
- New `src/components/app/BuilderNeeds.tsx` — the conditional card list, derived
  from the merged readiness result plus existing queries (media count, brand
  confirmation, domain status, alert inbox, last audit findings).
- `BuilderShell` keeps the top bar, undo/redo and History overlay; its left
  section nav and mobile bottom tab bar are dropped. `BuilderSection`/`GroupTabs`
  usage collapses into the Advanced overlay.
- Readiness merge: one module exports the single checklist consumed by the builder,
  `/app/launch` and the client portal; `src/lib/builder/prepublish-checklist.ts`
  deleted with its tests.
- `?section=` deep links from audit findings keep working by mapping legacy keys
  (`design`, `pages`, `launch`, `ai`, …) onto the new screen — chat focus, a
  specific Advanced panel, or a needs card — via the existing
  `normalizeBuilderMode`.
- Tests: the existing builder tests are updated to the new components rather than
  weakened; new tests cover the needs-card conditions, legacy deep links, the
  merged readiness list, and that publish gates are unchanged.
- Verification before hand-off: typecheck, full test suite, production build, and a
  real browser pass of the new screen at phone, tablet and desktop widths.

## Rollout

Built in one pass as requested, but the old route is kept reachable at
`/app/website?classic=1` until you've used the new one and confirmed it, then
removed.
