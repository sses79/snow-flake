# Milestone 5: production hardening and operational evidence

Milestone 5 separates runtime identities, records every attempted batch, adds
source freshness, and exposes a one-row operational health contract. It keeps
the personal `SSES79` PAT working locally, but provides distinct service users
for a hosted loader, dbt runner, tenant dashboard, and observer.

## Runtime boundaries

| Workload | Service user | Forced role | Allowed surface |
|---|---|---|---|
| Batch loader | `WELLBEING_DEMO_LOADER_SVC` | `WELLBEING_DEMO_LOADER` | Internal stage, raw insert, run audit |
| dbt | `WELLBEING_DEMO_TRANSFORMER_SVC` | `WELLBEING_DEMO_TRANSFORMER` | Raw/audit read, model schemas, bounded Account Usage metadata |
| North dashboard | `WELLBEING_DEMO_DASHBOARD_NORTH_SVC` | `WELLBEING_DEMO_TRUST_NORTH_READER` | North secure aggregate views |
| South dashboard | `WELLBEING_DEMO_DASHBOARD_SOUTH_SVC` | `WELLBEING_DEMO_TRUST_SOUTH_READER` | South secure aggregate views |
| Operations | `WELLBEING_DEMO_OBSERVER_SVC` | `WELLBEING_DEMO_OBSERVER` | One secure health view |

`infra/snowflake/06_service_identities.sql` creates users without generating
credentials. A service user cannot log in until an administrator attaches the
required network policy and creates a role-restricted PAT, or configures
key-pair authentication or workload identity federation.

For local learning, `scripts/dbt-command.sh` continues to fall back to the
existing dashboard PAT. In a hosted environment, set `SNOWFLAKE_DBT_USER` with
`SNOWFLAKE_DBT_PAT_FILE` and configure the dashboard with its separate
service-user secret.

## Deploy

Run the new account objects from a human administrative connection:

```bash
snow sql -c "$SNOWFLAKE_CONNECTION_NAME" -f infra/snowflake/00_roles.sql
snow sql -c "$SNOWFLAKE_CONNECTION_NAME" -f infra/snowflake/02_raw_objects.sql
snow sql -c "$SNOWFLAKE_CONNECTION_NAME" -f infra/snowflake/03_grants.sql
snow sql -c "$SNOWFLAKE_CONNECTION_NAME" -f infra/snowflake/06_service_identities.sql
make dbt-freshness
make dbt-build
snow sql -c "$SNOWFLAKE_CONNECTION_NAME" -f infra/snowflake/05_tenant_reader_views.sql
snow sql -c "$SNOWFLAKE_CONNECTION_NAME" -f infra/snowflake/07_operations_view.sql
```

Configure your actual contracted credit price only if you want a currency
estimate:

```dotenv
SNOWFLAKE_CREDIT_PRICE=0
SNOWFLAKE_COST_CURRENCY=GBP
```

Zero intentionally leaves `APPROXIMATE_COST_30D` null. Credits remain the
authoritative consumption measure; the currency calculation is only an
estimate and excludes non-warehouse services.

## Health contract

`MART_PIPELINE_HEALTH` combines:

- the immediate `GOVERNANCE.PIPELINE_RUNS` audit written by `load-batch.sh`;
- raw-table timestamps and row counts;
- `ACCOUNT_USAGE.LOAD_HISTORY` for completed `COPY` outcomes;
- `ACCOUNT_USAGE.QUERY_HISTORY` for unexpected workload query failures; and
- `ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY` for 24-hour and 30-day credits.

Account Usage can be delayed. In particular, an `ABORT_STATEMENT` load might
not appear in load history. The explicit run audit therefore remains the
immediate attempt/failure record, while the raw timestamp remains the immediate
successful-data evidence. A successful no-op replay does not make source data
look newer. Query tags distinguish loader, dbt, dashboard, and expected
negative acceptance tests.

Only `MART_PIPELINE_HEALTH_SECURE` is granted to the observer. Tenant readers
cannot query it, and the observer cannot query raw or analytical tables.

## Failed-load and replay runbook

1. Query `analysis/04_pipeline_health.sql` as `WELLBEING_DEMO_OBSERVER`.
2. Find the failed `RUN_ID`, `BATCH_ID`, and file as `WELLBEING_DEMO_ADMIN` in
   `GOVERNANCE.PIPELINE_RUNS`. Do not edit or delete the failed audit row.
3. Correct the generator or source contract, then create a new immutable file
   name and manifest. Do not overwrite the original landing object.
4. Run `scripts/load-batch.sh <new-manifest>`. Event and source-version rules
   make a replay idempotent at the current-state layer while retaining raw
   delivery history.
5. Run `make dbt-build`, then confirm the health view and reconciliation tests.

If authentication or the network fails before Snowflake accepts the initial
audit insert, no warehouse-side failure can be recorded. Preserve the job log
in the deployment platform and retry after connectivity is restored.

## Schema-change runbook

1. Classify the change as optional-compatible, breaking, or sensitive.
2. Add an optional JSON field without changing the raw envelope contract.
3. Add typed staging logic and tests before exposing it downstream.
4. For breaking changes, version the envelope and support old and new versions
   during a defined migration window.
5. Run `make verify-milestone-2` to prove replay/full-refresh equivalence and
   `make verify-milestone-5` for freshness, health, and isolation.

Never silently coerce an invalid value to null when that would hide a contract
failure. Route a future quarantine design through explicit status and counts.

## Credential creation and zero-downtime rotation

Snowflake requires a network policy for `TYPE=SERVICE` PATs by default. Attach
the deployment's real egress policy first; do not commit IP addresses merely
to make the example executable. Then create a role-restricted, short-lived PAT
from an administrative session:

```sql
ALTER USER WELLBEING_DEMO_DASHBOARD_NORTH_SVC
  ADD PROGRAMMATIC ACCESS TOKEN WELLBEING_DASHBOARD_NORTH_V1
  ROLE_RESTRICTION = 'WELLBEING_DEMO_TRUST_NORTH_READER'
  DAYS_TO_EXPIRY = 30;
```

The secret appears only in that command's result. Put it directly in the
hosting secret manager. To rotate:

1. Create `..._V2` with the same role restriction.
2. Update the secret manager and restart or roll the deployment.
3. Run the connection and tenant-negative checks using V2.
4. Disable or remove V1.
5. Record the exercise time, operator, and outcome without recording secrets.

Application code and `.env.example` refer to a secret path or environment
variable, so rotation does not require a code change. Repeat independently for
loader, transformer, each tenant deployment, and observer.

## Cost inspection

Run `analysis/04_pipeline_health.sql`, then investigate an increase using
`SNOWFLAKE.ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY` as an administrative
observer. Compare the three workload warehouses separately. Check query tags
and query history before changing warehouse size or the resource-monitor quota.

## Conditional security migrations

The current source has no real stable respondent identifier, so adding a
pseudonym column would create unnecessary linkability. If a future contract
requires linkage, compute HMAC-SHA-256 before landing, keep the key in a secret
manager, include a non-secret key version, and never load the original ID.
Rotate with parallel old/new pseudonym columns and remove the old linkage after
the migration window. A plain hash is not an acceptable replacement for HMAC.

The product still uses separate tenant secure views. A shared row-access policy
is therefore unnecessary and would add an Enterprise Edition dependency. If
the product moves to one shared semantic view, create a governance-owned
role-to-trust mapping and a row-access policy using `IS_ROLE_IN_SESSION`, apply
it before granting the shared view, and rerun the same positive and negative
tenant tests. Do not keep shared unprotected tables accessible to tenant roles.

## Acceptance

```bash
make verify-milestone-5
```

This reruns the hardening DDL, source freshness, the complete dbt build, both
tenant positive/negative checks, and observer positive/negative checks.

Live verification on 2026-09-15 created one successful audited no-op replay:
the baseline remained 21,954 rows and the overall raw history remained 21,961
rows. The health surface reported zero failed loads, three recent failed dbt
queries from implementation diagnostics, 0.8424 warehouse credits in 24 hours,
and 1.5746 credits in 30 days. That truthful `ATTENTION` result demonstrates
that the surface reports failures instead of turning acceptance into a forced
green status. Source freshness also correctly warned because the last actual
raw insert was 2026-08-25; a no-op replay does not disguise stale source data.
