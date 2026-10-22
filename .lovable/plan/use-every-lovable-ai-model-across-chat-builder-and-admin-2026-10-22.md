# Use every Lovable AI model across chat, builder and admin

## What is already in place
- Every role (wording, design, coding, vision, pictures, Jarvis chat) already has its own list of Lovable models. The router tries them in order and moves to the next one if a model fails. Jarvis's list holds 15 models.
- Free models only lead small tasks. Everything else runs on Lovable models first, with the free models as backup. All of it stays within the $100/month spending cap.
- The Jarvis health panel shows which Lovable models were used in the last 24 hours.

"Using all models" here means each job goes to the best model for it, with the rest standing by as backup. Calling every model on every request would multiply cost without making sites better.

## What this plan adds

1. **Model picker for you (admin only)**
   - A "Model" menu in Jarvis chat and in the builder chat, shown only to super admins.
   - Choices: "Auto (best per job)", which stays the default, or any chat model in the live Lovable catalogue, grouped by OpenAI, Anthropic and Google.
   - The picked model goes first for that message, and the normal list remains as backup. The spending cap and approvals still apply.
   - Customers never see the menu and always get Auto.

2. **Builder chat shows which model did the work**
   - Each step in the builder progress list (planning, designing, writing, reviewing, pictures) shows the model that actually answered, such as "Claude Opus 5.5". The labels come from recorded calls, the same way Jarvis's labels work.

3. **Close the remaining free-first paths in customer builds**
   - Audit every place a site build or builder chat calls AI: first build, rebuild, chat edits, suggestions, image briefs, reviews and repairs.
   - Any call that still skips the shared router, or goes to free models first for big work, moves to the right Lovable list.
   - Add one test per path confirming it asks for the right role.

4. **Expand the lists with verified models**
   - Add newer catalogue models that are missing from the lists, such as GPT-5.6 Sol and Terra and Gemini 3.7 Flash, as lower-priority backups.
   - Leave out non-chat models (voice, video, music, embeddings) and any model without zero data retention.

5. **Verify**
   - Run one small paid test call per provider family through the router, within the cap.
   - Then send one admin builder chat message with the picker set, and confirm the label and usage panel show that model.
   - Nothing is published, emailed or rebuilt for customers.

## Technical details
- Picker: a new server function returns the chat-capable ids from the live `/v1/models` catalogue, filtered by `data_retention_by_surface`. The chosen id is sent with `sendJarvisMessage` and the builder request, but only after a server-side super_admin check through `context.supabase`. It is then passed as `preferModels` (router `applyModelPreference` reorders and never drops).
- Builder labels: read model identity from `ai_usage_events` by request id; show nothing when unknown.
- Audit: search for direct `callCollective`, `callLuna` and Hall-of-Fame calls outside `fast`, and send them through `callBestThinker` or the router.
- Tests: picker is ignored for non-admins; chosen model leads the order; per-path role assignment.
