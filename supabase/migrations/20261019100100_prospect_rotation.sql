BEGIN;

-- Prospect autopilot rotation: after the explicit targets, autopilot can walk
-- built-in trades x metros. Ships switched off. The cursor records when each
-- (trade, metro) pair was last searched so a pair is not searched again within
-- its cooldown, across runs and settings changes. Server-only (service_role).
ALTER TABLE public.prospect_autopilot_settings
  ADD COLUMN IF NOT EXISTS rotation jsonb NOT NULL
    DEFAULT '{"enabled": false, "trades": [], "states": []}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'prospect_autopilot_settings_rotation_shape'
      AND conrelid = 'public.prospect_autopilot_settings'::regclass
  ) THEN
    ALTER TABLE public.prospect_autopilot_settings
      ADD CONSTRAINT prospect_autopilot_settings_rotation_shape
      CHECK (jsonb_typeof(rotation) = 'object');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.prospect_rotation_cursor (
  -- lower(trade|city|state), matching rotationPairKey in src/lib/prospect-rotation.ts
  id text PRIMARY KEY CHECK (char_length(id) BETWEEN 5 AND 300),
  trade text NOT NULL CHECK (char_length(trade) BETWEEN 2 AND 80),
  city text NOT NULL CHECK (char_length(city) BETWEEN 2 AND 80),
  state text NOT NULL CHECK (state ~ '^[A-Z]{2}$'),
  last_searched_at timestamptz NOT NULL DEFAULT now(),
  searches integer NOT NULL DEFAULT 0 CHECK (searches >= 0),
  last_found integer NOT NULL DEFAULT 0 CHECK (last_found >= 0),
  last_built integer NOT NULL DEFAULT 0 CHECK (last_built >= 0),
  last_error text
);

CREATE INDEX IF NOT EXISTS prospect_rotation_cursor_last_searched_idx
  ON public.prospect_rotation_cursor (last_searched_at);

ALTER TABLE public.prospect_rotation_cursor ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.prospect_rotation_cursor FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.prospect_rotation_cursor TO service_role;

COMMENT ON COLUMN public.prospect_autopilot_settings.rotation IS 'Rotation through built-in trades x metros: {enabled, trades[], states[]}; empty lists mean all. Ships disabled.';
COMMENT ON TABLE public.prospect_rotation_cursor IS 'When each autopilot rotation (trade, metro) pair was last searched; pairs inside the cooldown are skipped.';

COMMIT;
