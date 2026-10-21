CREATE TABLE public.growth_businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, niche text, city text, service_area text, address text, phone text, email text,
  website_url text, website_status text NOT NULL DEFAULT 'none' CHECK (website_status IN ('none','weak','active')),
  gbp_claimed boolean NOT NULL DEFAULT false, source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.gbp_profiles (
  business_id uuid PRIMARY KEY REFERENCES public.growth_businesses(id) ON DELETE CASCADE,
  profile_url text, category text, hours jsonb, photos_count int NOT NULL DEFAULT 0, posts_count int NOT NULL DEFAULT 0,
  reviews_count int NOT NULL DEFAULT 0, avg_rating numeric(2,1), last_post_date date, last_photo_date date,
  has_booking_link boolean NOT NULL DEFAULT false, has_description boolean NOT NULL DEFAULT false,
  optimization_score int, fix_list jsonb NOT NULL DEFAULT '[]', updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.directory_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.growth_businesses(id) ON DELETE CASCADE,
  directory_name text NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','submitted','live','rejected','needs_update')),
  url text, listed_name text, listed_address text, listed_phone text, package jsonb, submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (business_id, directory_name)
);
CREATE TABLE public.content_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES public.growth_businesses(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('blog','faq','social','review_reply','gbp_post')),
  title text, meta_description text, body text NOT NULL DEFAULT '', extras jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','published','rejected')),
  scheduled_for timestamptz, created_by_ai boolean NOT NULL DEFAULT true, approved_by uuid, published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.review_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES public.growth_businesses(id) ON DELETE CASCADE,
  customer_name text NOT NULL, customer_email text, customer_phone text, job_id text,
  channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email','sms')),
  sms_consent_at timestamptz, email_consent_at timestamptz, review_link text, platform text NOT NULL DEFAULT 'google',
  sent_at timestamptz, reminder_sent_at timestamptz, clicked boolean NOT NULL DEFAULT false, review_left boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.qna_monitor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_platform text NOT NULL CHECK (source_platform IN ('reddit','quora')),
  post_url text NOT NULL UNIQUE, post_title text, post_text text, matched_niche text, relevance int NOT NULL DEFAULT 0,
  draft_reply text, status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','drafted','approved','posted','skipped')),
  posted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.referral_program (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_name text NOT NULL, referrer_email text, referred_contact text, code text NOT NULL UNIQUE,
  incentive_type text NOT NULL DEFAULT 'give_get', reward_value numeric(10,2),
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','shared','redeemed','closed','expired')),
  consent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.partnership_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL, business_type text, contact_email text, place_id text, pitch_draft text,
  status text NOT NULL DEFAULT 'identified' CHECK (status IN ('identified','drafted','sent','responded')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL DEFAULT 'instagram', caption text NOT NULL, media_url text, scheduled_for timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','posted','rejected')),
  engagement_metrics jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.local_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL, event_date date, location text, url text UNIQUE, relevance_score int NOT NULL DEFAULT 0,
  notes text, status text NOT NULL DEFAULT 'found' CHECK (status IN ('found','reviewed','attending','skipped')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.approval_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type text NOT NULL, item_id uuid NOT NULL, module text NOT NULL, summary text NOT NULL, preview text,
  risk_level text NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low','medium','high')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','executed','failed')),
  execution_key uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE, execution_note text,
  created_at timestamptz NOT NULL DEFAULT now(), approved_by uuid, approved_at timestamptz, rejected_reason text, executed_at timestamptz
);
CREATE INDEX approval_queue_pending_idx ON public.approval_queue (status, created_at DESC);
CREATE TABLE public.approval_item_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid NOT NULL REFERENCES public.approval_queue(id) ON DELETE CASCADE,
  version int NOT NULL, content jsonb NOT NULL, edited_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (queue_id, version)
);
CREATE TABLE public.growth_daily_caps (
  platform text NOT NULL, day date NOT NULL DEFAULT current_date, used int NOT NULL DEFAULT 0,
  PRIMARY KEY (platform, day)
);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['growth_businesses','gbp_profiles','directory_listings','content_drafts','review_requests','qna_monitor','referral_program','partnership_leads','social_posts','local_events','approval_queue','approval_item_versions','growth_daily_caps'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "super_admin_all" ON public.%I FOR ALL TO authenticated USING (private.is_super_admin()) WITH CHECK (private.is_super_admin())', t);
  END LOOP;
END $$;