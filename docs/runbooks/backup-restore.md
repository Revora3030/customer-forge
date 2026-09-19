# Backup and restore runbook

## Goal

Prove recoverability from accidental data loss, bad migrations, or a production regression.

## Controls

- Confirm the production Supabase backup and retention configuration.
- Keep migration history versioned and reproducible.
- Separate application rollback from database recovery.
- Do not rely on destructive SQL as the only recovery mechanism.

## Restore drill

1. Restore a representative backup into a non-production recovery environment.
2. Verify organizations, memberships, websites, leads, appointments and billing references.
3. Run typecheck, tests and production build against the recovered application configuration.
4. Run tenant-isolation tests.
5. Render a generated site and exercise a critical customer journey.
6. Record recovery time, manual steps and missing data.
7. Store evidence without credentials or unnecessary customer data.

A backup that exists but has never been restored is evidence of backup availability, not proof of recoverability.
