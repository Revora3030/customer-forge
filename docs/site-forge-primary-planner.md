# Site Forge primary planner

The authenticated `planWebsiteChanges` path now routes its native planning pass through `buildAutonomousPlan` before the existing optional external-reasoning fallback.

The autonomous layer remains non-mutating and feeds the existing plan parsing, approval, apply, verification, and rollback boundaries. Zero-cost mode continues to prevent external model calls.
