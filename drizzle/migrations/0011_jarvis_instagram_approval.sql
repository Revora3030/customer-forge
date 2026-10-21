CREATE TABLE public.jarvis_instagram_connections (
 user_id uuid PRIMARY KEY, instagram_id text NOT NULL, username text NOT NULL,
 token_ciphertext text NOT NULL, expires_at timestamptz NOT NULL, connected_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.jarvis_instagram_connections TO service_role;
ALTER TABLE public.jarvis_instagram_connections ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.jarvis_instagram_oauth (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, state_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.jarvis_instagram_oauth TO service_role;
ALTER TABLE public.jarvis_instagram_oauth ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.jarvis_instagram_posts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, instagram_id text NOT NULL,
 username text NOT NULL, caption text NOT NULL, image_url text NOT NULL, content_hash text NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','publishing','published','failed','uncertain','cancelled')),
 container_id text, media_id text, permalink text, error text,
 approved_by uuid, approved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (status NOT IN ('publishing','published','uncertain') OR (approved_by = user_id AND approved_at IS NOT NULL))
);
GRANT ALL ON public.jarvis_instagram_posts TO service_role;
ALTER TABLE public.jarvis_instagram_posts ENABLE ROW LEVEL SECURITY;
CREATE INDEX jarvis_instagram_posts_owner_idx ON public.jarvis_instagram_posts(user_id,created_at DESC);
CREATE UNIQUE INDEX jarvis_instagram_post_once_idx ON public.jarvis_instagram_posts(user_id,instagram_id,content_hash) WHERE status IN ('draft','publishing','published','uncertain');