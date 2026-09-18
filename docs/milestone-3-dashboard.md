# Milestone 3: aggregate dashboard

> **Project status:** The dashboard was implemented and verified. These live
> Snowflake instructions are retained as a reproducible runbook and require an
> active account.

Milestone 3 adds a code-owned Next.js dashboard without moving Snowflake
authentication into the browser. The browser calls `/api/dashboard`; the API
uses the official Snowflake Node.js driver on the server and returns only
aggregate rows from tenant-specific secure views.

```text
browser -> Next.js /api/dashboard -> tenant reader role -> secure views
        <- aggregate JSON only    <- APP warehouse      <- aggregate marts
```

Each deployment selects one tenant with `DASHBOARD_TENANT`. Run a
separate deployment for another trust. Do not let a browser parameter select a
tenant, role, or Snowflake view.

## Warehouse deployment

Install the workspace packages:

```bash
pnpm install
```

Build and test the three new dbt marts alongside the existing trend mart:

```bash
set -a
source .env
set +a
.venv/bin/dbt build --project-dir dbt --profiles-dir dbt
```

Then recreate the tenant secure views and object-specific grants with an admin
connection:

```bash
set -a
source .env
set +a
snow sql -c "$SNOWFLAKE_CONNECTION_NAME" \
  -f infra/snowflake/05_tenant_reader_views.sql
```

The views exposed to the North dashboard are:

- `MART_TRUST_NORTH_SCHOOL_WELLBEING_TREND`;
- `MART_TRUST_NORTH_QUESTION_RESPONSE_DISTRIBUTION`;
- `MART_TRUST_NORTH_SUPPORT_SIGNAL_SUMMARY`; and
- `MART_TRUST_NORTH_DATA_FRESHNESS`.

Milestone 4 adds the suppression-aware indicator, category, and change-driver
views documented in [`milestone-4-analytics.md`](milestone-4-analytics.md).

South has the same four contracts under `MART_TRUST_SOUTH_*`. Reader roles do
not receive `SELECT` on the shared marts.

## Runtime identity

The verified personal demo reused an existing human user's PAT while the
server forced `WELLBEING_DEMO_TRUST_NORTH_READER` for application queries.
Milestone 5 added dedicated service-user definitions for hosted deployments;
each dashboard identity receives only its matching tenant reader role.

Copy the Milestone 3 entries from `.env.example` to the ignored `.env`. The
dashboard accepts either:

- `PROGRAMMATIC_ACCESS_TOKEN` with `SNOWFLAKE_DASHBOARD_PAT_FILE`; or
- `SNOWFLAKE_JWT` with `SNOWFLAKE_DASHBOARD_PRIVATE_KEY_PATH`.

No Snowflake setting uses a `NEXT_PUBLIC_` prefix. Secret files remain outside
the repository. The server also overrides the Snowflake role with the fixed
reader role mapped to `DASHBOARD_TENANT`.

## Run and verify

```bash
make dashboard-test
make dashboard-build
make dashboard-dev
```

Open `http://localhost:3000`. In browser developer tools, the Network tab
should show `/api/dashboard` returning only filters, benchmarked trend and
category aggregates, change drivers, answer distribution, and freshness. It
must not contain a
Snowflake token, username, private key, `document_id`, respondent identifier,
or raw answer envelope.

The tests also prove that every qualified object referenced by application SQL
belongs to the selected tenant's hard-coded secure-view allowlist and that
filter values are Snowflake binds. Before any public deployment, add your
organisation's application authentication in front of the dashboard; the
implemented dashboard is intended for local/private demonstration.

## Product interpretation

“Worsening” means the aggregate adverse-response rate increased by at least one
percentage point from the previous survey period. It is descriptive, not a
statistical-significance test. Milestone 4 suppresses protected metrics for
cohorts below 10.
