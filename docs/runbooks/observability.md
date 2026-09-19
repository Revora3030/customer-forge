# Observability runbook

## Minimum signals

Track actionable failures for authentication, publishing, AI-builder execution, payments/webhooks, background jobs, and database operations.

Each event should identify the operation and outcome without logging credentials, authorization headers, payment secrets, or unnecessary customer content.

## Required dimensions

- timestamp;
- operation;
- environment;
- success/failure;
- safe request or correlation identifier;
- duration when useful;
- sanitized error category.

## Release verification

Exercise a representative failure path in non-production and confirm that the signal is visible, actionable, and correlated to the affected operation.

Observability is not proven by the presence of a logging helper alone.
