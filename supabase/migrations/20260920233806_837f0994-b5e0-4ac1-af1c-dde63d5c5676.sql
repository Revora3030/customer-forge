ALTER TABLE public.website_components
  ADD CONSTRAINT website_components_link_url_safe_scheme
  CHECK (
    link_url IS NULL
    OR link_url ~ '^(#|/|https?://|mailto:|tel:|sms:)'
  );