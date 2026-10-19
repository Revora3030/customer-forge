# Jarvis toolbench and integration rollout

## Dependency fixes included
- Pins transitive DOMPurify to 3.4.16, KaTeX to 0.18.2, and source-map-js to 1.2.2 using root overrides and corresponding lockfile resolutions. These address the versions flagged in the first Trivy SARIF report.

## CodeQL configuration
GitHub Actions evidence shows this repository's GitHub **default CodeQL setup is already enabled**. Running the separate advanced-setup workflow at the same time makes GitHub reject uploads with: `CodeQL analyses from advanced configurations cannot be processed when the default setup is enabled`. This PR removes the conflicting advanced workflow and leaves the repository default CodeQL setup as the authoritative CodeQL configuration; verify that default setup covers the desired branches in repository Security settings.

## New tooling
- **Trivy** scans dependencies, secrets, and configuration. Critical findings fail; SARIF and artifact reports are uploaded.
- **Semgrep** runs static analysis and uploads a JSON report. It starts report-first while the baseline is triaged.
- **OWASP ZAP Baseline** passively scans the isolated CI app, replacing the placeholder StackHawk job whose startup and error suppression could produce a misleading green run.
- **Playwright + agent-browser** inspect configured routes and produce independent snapshots/screenshots.
- **MCP server** exposes read-only repository status, path listing, bounded file reads, code search and recent CI for the fixed public `Revora3030/customer-forge` repository / `lovable-sync` branch.
- **OpenTelemetry OTLP + Langfuse** receive optional provider-call metadata via Worker-compatible OTLP/HTTP.

## Runtime-only configuration
Set these in Lovable Cloud / deployment environment; never commit values:

| Variable | Purpose |
|---|---|
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | Full OTLP traces URL |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP base URL; exporter appends `/v1/traces` |
| `OTEL_EXPORTER_OTLP_AUTHORIZATION` | Optional full Authorization header |
| `LANGFUSE_BASE_URL` | Langfuse region URL; default `https://cloud.langfuse.com` |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` | Langfuse project credentials |
| `SENTRY_DSN` | Existing Sentry adapter |
| `OLLAMA_API_KEY` | Existing Ollama Cloud adapter |
| `N8N_BASE_URL` / `N8N_WEBHOOK_SECRET` | Existing self-hosted n8n adapter |

Export includes provider/model/task, latency/outcome, token counts, fallback flag and tool-call count only. Prompts, completions, user/workspace IDs, raw provider errors and API keys are excluded. HTTPS is required except loopback HTTP for local testing. Jarvis's `observability.export.status` reports configured state but always labels live ingestion unverified until a controlled test span arrives.

## MCP setup
The project-level `.mcp.json` starts the read-only server in compatible MCP clients:

```sh
npm run jarvis:mcp:contract
npm run jarvis:mcp
```

Set `GITHUB_TOKEN` or `GH_TOKEN` in the MCP client environment to improve API limits and enable authenticated code search. Do not put tokens in the config or commit them.

## External service limitations
CI scanners need no API credential. Sentry, Ollama Cloud, n8n, Langfuse and a generic OTLP collector need operator-owned instances/credentials. This PR wires configuration/status reporting but does not fabricate credentials or assert live connectivity. Existing approval/audit controls for publishing, billing, customer messaging, migrations and destructive writes remain unchanged.

Green CI means a check completed against that commit; ZAP passive baseline is not a penetration test, and CI does not prove production health.
