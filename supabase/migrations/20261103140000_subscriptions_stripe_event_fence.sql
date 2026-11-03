-- Stripe subscription event ordering fence (additive, idempotent).
--
-- Stores the `created` second of the last Stripe event applied to each
-- subscriptions row. The payment webhook projects a subscription event only
-- when it is not older than this fence, and a canceled subscription id is
-- never moved back to a live status (src/lib/stripe-subscription-fence.ts).
-- Nullable: null means "no fence yet", so existing rows keep working and the
-- webhook tolerates the column being absent until this migration is applied.
--
-- No new table, no data rewrite, no DROP. The column inherits the existing
-- table privileges and RLS policies on public.subscriptions (members read their
-- own organization's row; only the service-role webhook writes).

alter table public.subscriptions
  add column if not exists last_stripe_event_created bigint;

comment on column public.subscriptions.last_stripe_event_created is
  'Stripe event.created (seconds) of the last subscription event applied to this row; ordering fence for the payment webhook.';
