# Revora hardening — 2026-09-14

This branch records the production hardening pass performed against the connected Supabase project.

## Completed

- Isolated platform control-plane tables from browser roles.
- Removed direct browser execution of the public conversion SECURITY DEFINER RPC.
- Added covering indexes for the foreign keys reported by the Supabase performance advisor.
- Removed exact duplicate indexes reported by the advisor.
- Rewrote affected RLS policies so auth identity is initialized once per statement instead of repeatedly per row.
- Consolidated overlapping permissive SELECT policies where the resulting authorization semantics are unchanged.
- Kept existing tenant boundaries and role checks intact.

## Verification

After the hardening pass, the Supabase performance advisor no longer reports the previous unindexed-foreign-key set; only two FK findings remained during the intermediate pass and were subsequently covered.

The remaining performance notices are unused-index INFO notices. They are intentionally not mass-deleted because low traffic makes usage statistics insufficient evidence that an index is unnecessary.

## Remaining security configuration

Two security advisor warnings remain outside application SQL:

1. `provision_workspace(...)` is intentionally exposed to authenticated callers because the current authenticated onboarding flow invokes it directly and the function validates `auth.uid()` and performs the workspace provisioning transaction.
2. Supabase Auth leaked-password protection must be enabled in the project Auth settings; this is an account/project configuration rather than repository SQL.

These two items are deliberately called out rather than weakening onboarding or making an unsafe database change without validating the replacement flow.
