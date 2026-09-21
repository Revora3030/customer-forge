# Release verification report

Generated: 2026-09-21T06:42:32+00:00

## Checks

| Check | Command | Result |
| --- | --- | --- |
| Type check | `bunx tsgo --noEmit` | PASS (0 errors) |
| Lint | `bun run lint` | PASS (0 errors, 39 warnings) |
| Unit and contract tests | `bun run test` | PASS (199 files, 1320 passed, 4 skipped) |
| Production build | `bun run build` | PASS |
| Security audit | `bun run security:audit` | PASS |
| Security audit contract | `bun run security:audit:test` | PASS |
| Whole-repo audit | `bun run repo:audit` (+ contract) | PASS |
| Production readiness | `bun run production:readiness` | PASS |
| Production readiness (max) | `bun run production:readiness:max` | PASS |
| Production controls | `bun run production:controls` | PASS |
| Visual output contract | `bun run repo:visual-output` | PASS |
| Builder audit | `bun run builder:ultimate-audit` | PASS |
| Dependency vulnerabilities | dependency scan | PASS (0 in 74 production dependencies) |
| Browser journey (with edit and rollback) | `JOURNEY_ALLOW_MUTATE=1 bun run browser:journey` | PASSED |

## Browser journey steps

Totals: NOT_TESTED 5, PASS 20

| 01_app_loads | PASS | The application loads |
| 02_no_error_screen | PASS | No global error screen |
| 03_auth_session | PASS | Signed-out gate holds and a session signs in |
| 04_fixture_workspace | PASS | A deterministic workspace is entered |
| 05_builder_opens | PASS | The builder opens |
| 06_builder_console_clean | PASS | The builder loads without console errors |
| 07_build_request | NOT_TESTED | A deterministic build request is submitted |
| 08_build_stages | NOT_TESTED | Build progresses through the user-facing stages |
| 09_preview_renders | PASS | The generated site renders |
| 10_page_navigation | PASS | Navigation between generated pages works |
| 11_mobile_widths | PASS | Mobile layout at 320/375/390/414px |
| 12_desktop_widths | PASS | Desktop layout at 1280/1440px |
| 13_no_overflow | PASS | No horizontal overflow at any width |
| 14_actionable | PASS | Important buttons and links are actionable |
| 15_real_content | PASS | The page carries real content |
| 16_builder_edit | PASS | One deterministic builder edit is applied |
| 17_edit_visible | PASS | The edit appears in the rendered preview |
| 18_edit_persists | PASS | The edit survives a refresh |
| 19_rollback | PASS | Undo / rollback is available and used |
| 20_rollback_restores | PASS | Rollback restores the previous state |
| 21_publish_gated | PASS | Publishing stays gated and nothing is published |
| 22_dashboard_return | PASS | The app returns to the dashboard cleanly |
| ext_stripe | NOT_TESTED | Live Stripe checkout and webhooks |
| ext_email | NOT_TESTED | Live transactional email delivery |
| ext_crm | NOT_TESTED | Live CRM hand-off |

## Not verified here

- Live payment, email and CRM delivery need real sandbox credentials; run `bun run test:integrations` once they are configured.
- AI picture *editing* stays switched off: no genuinely free edit-capable provider has passed a real edit probe. Manual framing controls are complete and are never labelled AI.
