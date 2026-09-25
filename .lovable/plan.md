# Chat-first website builder (a Lovable-style workspace)

## What you get
A new **Build** screen for every business: chat on the left, the live site on the right. You type what you want ("add a pricing page", "make it feel more premium", "move reviews up"), the AI team plans the change, writes it, and the preview refreshes on its own. Every change can be undone in one click.

```text
+------------------------+------------------------------------+
| Chat with your AI team | Live preview   [Phone|Tablet|Desk] |
|  - your messages       |   page picker  [Open] [Publish]    |
|  - what the AI is doing|                                    |
|  - changes it made     |        (your draft website)        |
|  - Undo / Restore      |                                    |
| [ type a request... ]  |                                    |
+------------------------+------------------------------------+
```
On phones the chat and preview switch with a Chat / Preview toggle.

## How it behaves (like Lovable)
1. **Just type:** no forms. Plain requests, or a full brief. You can attach photos.
2. **It does the work:** safe changes are applied straight away. Anything that removes pages or content asks first, with an Approve / Skip card.
3. **Shows progress live:** "Reading your site → Planning → Writing → Checking" while it works, then a short list of what changed.
4. **Preview updates by itself** after each change, on the page that was changed.
5. **Undo any turn:** each reply has "Undo this change", using the restore point saved before every write.
6. **Remembers the conversation:** your chat is saved per business, so you can come back tomorrow and keep going.
7. **Checks its own work:** after each change the automatic 5-size screenshot review runs, and the AI fixes what it finds.
8. **Publish from the chat:** the same Publish button with the same gates (review score 95+, setup payment).

## Where it lives
- A **"Build with chat"** button at the top of the Website page opens the new screen.
- Existing panels on the Website page stay as they are.

## Not changing
Pricing, billing, the publishing checks, the truth rules, the $100/month AI limit, who can access what, and published customer sites.

## Technical details
- New route `src/routes/_authenticated/app.build.tsx` (full-screen, split layout; mobile tab toggle).
- Reuses the existing agent in `site-agent.functions.ts` (`planWebsiteChanges` → `applyWebsiteChanges`, snapshots + undo) and the unused `SiteChatbot` logic, refactored into `BuilderChat` + `BuilderPreview` components. No second agent.
- Preview = iframe of `/draft/$slug[/$page]`, reloaded via a version key after each apply; device width toggle 390 / 768 / 1280.
- New table `builder_messages` (organization_id, user_id, role, content, plan jsonb, applied_version_id, created_at) with GRANTs and RLS limited to members of that business; full history is sent with each request.
- Progress shown from existing plan trace stages; destructive steps keep the existing approval requirement.
- After apply, triggers the existing automatic look-and-fix check for changed pages.
- Tests: message persistence/RLS scope, auto-apply only for non-destructive plans, undo restores the snapshot, preview refresh key changes after apply.
- Verify end-to-end signed in: send a real request, see the preview change, undo it.
