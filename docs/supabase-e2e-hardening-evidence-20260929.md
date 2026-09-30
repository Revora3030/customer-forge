# Supabase E2E Hardening Evidence — 2026-09-29

This document records the attached E2E evidence for the Supabase website mutation layer.

## Verified E2E results

All 10 end-to-end tests passed:
1. create_website_snapshot()
2. apply_website_theme()
3. apply_ai_website_changes()
4. Input validation
5. publish_website_draft()
6. RLS policy verification
7. Tenant access denied
8. Cleanup
9. Edge function health
10. Full audit trail

The test run found and fixed two defects:
- apply_ai_website_changes() used an incorrect result-field reference; the function result is now captured with SELECT * INTO v_theme_result.
- publish_website_draft() attempted the invalid branch status merged; published drafts now use the allowed kept status.

## Security and persistence evidence

The E2E run verified:
- RLS enabled on website tables.
- ai_tool_audit and ai_usage_events policies for service_role/authenticated access.
- website_sections manager/member/public/staff policies.
- Unauthorized cross-organization modification is rejected with ACCESS_DENIED.
- AI website changes persist atomically in one transaction.
- Website version snapshots are created during publish.
- Audit records are created across website_requests, ai_generations, ai_tool_audit, and ai_usage_events.
- Tested Edge Functions are ACTIVE and require JWT authentication.

## Scope

This is E2E evidence, not a claim that every Supabase object or production deployment characteristic has been exhaustively verified. Load testing, backup/restore drills, and untested functions remain outside this report.

Source: E2E_TEST_RESULTS.md dated September 29, 2026.
