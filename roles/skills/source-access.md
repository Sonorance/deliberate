# Authenticated source access — method

> Use this whenever a workflow needs evidence from a configured source. Authentication is host/harness orchestration: Deliberate stores only repository-safe access instructions, never credentials.

## 1. Prefer the underlying data

Identify the source type before attempting access. Prefer the official API, saved query, warehouse, repository, or export behind a dashboard over scraping the rendered dashboard. Use browser access only when the source has no safer, more reliable interface.

## 2. Establish access before interpreting evidence

For every source the workflow materially depends on:

1. Read its repository-safe access hints from `.sonorance/sources.md` and, for metrics, `product.md` → **Metrics & traction**.
2. Probe access without printing, copying, or persisting credentials.
3. Reuse an existing harness connector or MCP integration when available.
4. Otherwise reuse the provider's normal authenticated CLI, SDK credential chain, workload identity, or approved browser session.
5. Verify the active identity and relevant account, tenant, subscription, project, organization, or profile without displaying tokens or secrets. Never silently use an unrelated cached account.
6. If authentication is missing or expired, ask for focused user approval before starting the provider's official browser, device, SSO, or CLI login.
7. If the identity or account context must change, explain the intended context and ask before switching it.
8. Retry the original minimal read-only query after authentication or context selection.
9. If direct access remains unavailable, offer an official export or file-drop fallback.
10. Only after the relevant approved paths are exhausted may the source become a visible evidence limitation or Data gap.

Do not interrupt for authentication to an optional source that cannot materially affect the result. Group approvals by provider when several sources share the same login.

## 3. Diagnose the failure precisely

- **Unauthenticated or expired (often 401):** reuse or renew the official login, then retry.
- **Authenticated but unauthorized (often 403):** identify the missing read permission; do not present another login as though it grants authorization.
- **Wrong account context:** show the safe identity/context fields and ask before switching.
- **MFA or conditional access:** hand control to the provider's official interactive flow.
- **Missing CLI or connector:** offer an installed integration, official client, or export rather than improvising credential handling.
- **Private network or endpoint:** explain that the current harness cannot reach it; use an approved local/customer-hosted environment or export.
- **Dashboard unsupported but API available:** query the underlying API or saved query.
- **Schema, freshness, or empty-result failure:** treat it as an evidence-quality problem, not an authentication problem.

## 4. Keep credentials out of project data

Never ask the user to paste a password, access token, refresh token, API key, connection string, cookie, private key, OAuth grant, or service-account key into chat. Never write one to `.sonorance/sources.md`, project context, generated artifacts, prompts, logs, or telemetry.

Credentials remain in the provider CLI cache, OS keychain, harness connector, environment or secret store, workload identity, or another provider-approved credential chain. Repository files may record only details safe to commit: provider/source type, preferred API or query, safe account context, required read-only scopes, and a credential-handle name. Omit even those details when the repository's visibility or policy makes them sensitive.

Prefer short-lived credentials and least-privilege read access. Creating a credential, granting scope, logging in, or changing identity always requires focused user approval.
