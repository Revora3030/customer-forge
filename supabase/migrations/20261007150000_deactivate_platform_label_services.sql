-- Retroactive intake clean-up.
-- Older onboarding sessions could save Revora's own interface wording ("All",
-- "Build my site", "Submit", ...) as a business service. New sign-ups are
-- sanitised in the app (src/lib/builder/intake-sanitize.ts); this switches the
-- rows already in the database off so they never reach a site, a price list,
-- a booking picker or the AI team again. Rows are deactivated, not deleted,
-- so any booking or quote that already points at one keeps its reference.
-- The label list mirrors PLATFORM_UI_LABELS; normalisation mirrors normaliseLabel().

update public.services
set is_active = false
where is_active = true
  and (
    name is null
    or btrim(regexp_replace(regexp_replace(regexp_replace(lower(name), '[\u2019'']', '', 'g'), '[^a-z0-9/ ]+', ' ', 'g'), '\s+', ' ', 'g')) = ''
    or btrim(regexp_replace(regexp_replace(regexp_replace(lower(name), '[\u2019'']', '', 'g'), '[^a-z0-9/ ]+', ' ', 'g'), '\s+', ' ', 'g'))
       = any (array['all','any','none','other','n/a','na','build my site','build site','build my website','generate site','generate my site','generate website','rebuild site','publish my site','publish site','apply this improvement','improve my search preview','command center','growth command center','submit','save','continue','next','back','cancel','click here','get started','start','service','services','my service','service 1','service name','add service','new service']::text[])
  );
