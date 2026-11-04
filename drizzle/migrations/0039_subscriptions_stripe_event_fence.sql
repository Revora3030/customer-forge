alter table public.subscriptions
  add column if not exists last_stripe_event_created bigint;

comment on column public.subscriptions.last_stripe_event_created is
  'Stripe event.created (seconds) of the last subscription event applied to this row; ordering fence for the payment webhook.';