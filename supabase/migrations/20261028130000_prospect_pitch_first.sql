-- Pitch-first outreach: autopilot can email a short text pitch and build the
-- demo site only after the owner replies. Off by default, so existing
-- behaviour (build the demo, then email its preview link) is unchanged.
-- The settings row is already admin-only; adding a column changes no grant.
ALTER TABLE public.prospect_autopilot_settings
  ADD COLUMN IF NOT EXISTS pitch_first boolean NOT NULL DEFAULT false;
