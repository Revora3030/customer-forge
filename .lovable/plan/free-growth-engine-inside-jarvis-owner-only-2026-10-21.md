# Free Growth Engine (inside Jarvis, owner-only)

A new admin area, **Admin → Growth Engine**, visible only to the two super-admin accounts. Jarvis drafts the work, you approve it, the system carries it out, and every result is logged. Nothing goes live without your tap.

## What you will see

1. **Growth Engine home**: a free-channel health score, pending approvals count, this week's wins, and what is scheduled for the next 7 days.
2. **Approval inbox (built first)**: one list of every pending item from every module. Each item shows its source, a preview, a risk level (low/medium/high) and Approve / Edit / Reject. Version history comes with it, and editing something already published sends it back for approval. A daily summary email tells you how many items are waiting.
3. **Google profile check-up**: a 0–100 score with a ranked fix list, weekly post drafts, and reply drafts for new reviews. Publishing waits for your approval, using your connected Google Business Profile.
4. **Free directories**: a list of free directories by industry, a ready-to-submit package for each, and name/address/phone matching that runs before any submission. A status tracker follows each listing. Bing gets an automatic submission only if its connection allows it; every other directory is a package you submit by hand.
5. **Content and SEO**: a monthly blog and FAQ calendar. Each draft has a title, description, body, links and image descriptions, and publishes to Revora's site only after approval. Search Console numbers show what each post brings in.
6. **Review requests**: when a job is marked complete, a request is queued by email, or by text only for customers who opted in, with the consent time logged. One reminder goes out after 5 days, and clicks and reviews are tracked.
7. **Reddit and Quora listening**: Jarvis finds posts like "need a ___ in ___" and drafts a helpful reply. You post it yourself, under a daily cap per site. Nextdoor and Facebook are left out because their rules forbid this.
8. **Referrals**: opt-in invites after a positive review, plus referral codes and a funnel (invited → redeemed → closed).
9. **Partnership finder**: Jarvis finds related local businesses through Google Maps and drafts pitches. You send them yourself, never automatically.
10. **Social scheduler**: weekly post drafts that publish to Instagram through the approval flow Jarvis already has, plus an engagement report.
11. **Local events radar**: a weekly list of relevant events with a relevance score. Jarvis only suggests; you decide what to do.

## Rules built in (Jarvis cannot override them)

- No text message without a recorded opt-in; text sending stays off until a texting service is connected.
- No automatic cold email to partners; Jarvis only drafts them.
- Every automated email carries your real sender name, mailing address and an unsubscribe link.
- Daily reply caps for each forum or social site.
- The name/address/phone match must pass before any directory submission.
- Your current pricing stays as it is, and drafts never invent reviews, prices or facts.

## What needs you later

- **Texting**: connect a texting service (Twilio) when you are ready. Until then, review requests go by email only.
- **Instagram**: your Meta connection is still missing, so social posts stay as drafts until it is connected.
- **Google Business Profile**: it must stay connected for profile updates and review replies.

## Technical details

- New tables: growth_businesses, gbp_profiles, directory_listings, content_drafts, review_requests (with consent_at), qna_monitor, referral_program, partnership_leads, social_posts, local_events, approval_queue, approval_item_versions.
- Every table is locked to super-admins through the existing role check, with the standard access grants. No customer workspace can see any of it.
- One service layer (`src/lib/growth-engine/*.server.ts`) handles every outside call: the Google Business Profile, Search Console, Maps and Cloudflare connections, Reddit's public search, Quora through the existing web search, and Lovable AI for drafting. Failures are recorded in the existing error log so they show in admin Monitoring.
- Approving an item checks the rules again on the server, then runs it exactly once with a single-use key. Uncertain sends are never retried automatically.
- Scanners and digests run on a schedule through public server routes under `/api/public/growth/*`. Each run checks the cron secret, holds a lock, processes a small batch, and pauses on credit or limit errors.
- Daily digest: the email goes to the owner only, through the existing Resend connection.
- Tests: the approval rules, the opt-in check for texts, the reply caps, the name/address/phone check, and the re-approval required after an edit.
- No customer emails, posts or paid AI are triggered during the build itself.
