-- Owner decision 2026-10-07: setup fee is $350 (monthly $100, first month free, 3-day full access).
ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS plans_revora_offer_locked;
ALTER TABLE public.payment_products DROP CONSTRAINT IF EXISTS payment_products_revora_offer_locked;
ALTER TABLE public.offer_config DROP CONSTRAINT IF EXISTS offer_config_revora_offer_locked;

UPDATE public.plans SET setup_price = 350 WHERE id = 'revora_growth_system';
UPDATE public.payment_products SET amount = 350 WHERE id = 'revora_growth_system_setup';
UPDATE public.offer_config SET setup_price = 350, full_access_days = 3 WHERE id = 'growth_system';

ALTER TABLE public.plans ADD CONSTRAINT plans_revora_offer_locked CHECK (
  id <> 'revora_growth_system' OR (monthly_price = 100 AND setup_price = 350 AND annual_price = 0));
ALTER TABLE public.payment_products ADD CONSTRAINT payment_products_revora_offer_locked CHECK (
  (id <> 'revora_growth_system_setup' OR (amount = 350 AND upper(currency) = 'USD' AND kind = 'setup_fee'))
  AND (id <> 'revora_growth_system_monthly' OR (amount = 100 AND upper(currency) = 'USD' AND kind = 'subscription' AND billing_interval = 'monthly')));
ALTER TABLE public.offer_config ADD CONSTRAINT offer_config_revora_offer_locked CHECK (
  id <> 'growth_system' OR (setup_price = 350 AND monthly_price = 100 AND trial_days = 30 AND full_access_days = 3));