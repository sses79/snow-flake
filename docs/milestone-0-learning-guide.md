# Milestone 0 Learning Guide

Milestone 0 does not move survey data. It creates the Snowflake boundary that makes every later load, model, and dashboard safer to build. The useful mental model is: identity selects a role, the role receives only the capabilities it needs, and each workload uses its own bounded compute.

For the complete operator runbook, see [`milestone-0-account-setup.md`](milestone-0-account-setup.md). The executable source of truth is [`infra/snowflake/`](../infra/snowflake/).

## The 80/20 View

```text
named human connection
        |
        v
ACCOUNTADMIN / SECURITYADMIN (bootstrap only)
        |
        v
WELLBEING_DEMO_ADMIN
   |          |                |
   v          v                v
LOADER    TRANSFORMER     TENANT READERS
RAW write RAW read +       MARTS views only
          model create
   |          |                |
 LOAD_WH  TRANSFORM_WH       APP_WH
        \     |              /
         shared resource monitor
```

## 1. Roles Describe Capabilities, Not People

[`00_roles.sql`](../infra/snowflake/00_roles.sql) creates one administrative role and four narrow runtime roles. The admin role inherits the loader, transformer, and reader roles; `SYSADMIN` inherits the custom hierarchy. Only the bootstrap step switches to `ACCOUNTADMIN`, because global `CREATE DATABASE` and the later resource monitor require account-level authority.

[`03_grants.sql`](../infra/snowflake/03_grants.sql) turns those names into enforceable boundaries:

- `WELLBEING_DEMO_LOADER` can use the load warehouse, write the internal stage, and insert/select raw rows. It cannot update, delete, truncate, or create models.
- `WELLBEING_DEMO_TRANSFORMER` can read raw and create tables or views in `STAGING`, `CORE`, and `MARTS`. It cannot write the stage or mutate raw history.
- Reader roles can use only the app warehouse and select mart views. They receive neither raw access nor mart-table access.

The negative reader query in the runbook is therefore a feature: an insufficient-privileges error proves that sensitive raw rows are outside the reader capability.

Transferable lesson: design a role around one job, then test both what succeeds and what must fail.

## 2. Storage and Compute Are Separate Boundaries

[`01_foundation.sql`](../infra/snowflake/01_foundation.sql) creates one database with five schemas:

```text
RAW -> STAGING -> CORE -> MARTS
                     GOVERNANCE (policies and mappings)
```

The same script creates three X-Small warehouses for loading, transformation, and application queries. Each starts suspended, resumes on demand, and suspends after 60 seconds. This separation is not about performance at demo scale; it makes access and cost attributable. A dashboard role cannot quietly run work on the transform warehouse, and a load spike does not occupy app compute.

Schemas organize data ownership; warehouses pay for SQL execution. Metadata commands such as `SHOW` and `DESCRIBE` can inspect objects without deliberately starting a warehouse, while table queries require an assigned warehouse.

Transferable lesson: separate compute by workload before tuning it; ownership and cost become easier to reason about.

## 3. Raw Is a Replayable Contract

[`02_raw_objects.sql`](../infra/snowflake/02_raw_objects.sql) defines the first ingestion boundary:

```text
NDJSON file
  -> WELLBEING_NDJSON_FORMAT
  -> WELLBEING_INTERNAL_STAGE
  -> MONGO_WELLBEING_SUBMISSIONS
```

The file format expects one JSON envelope per line and keeps outer-array stripping disabled. The table preserves the complete envelope as `VARIANT` beside file name, file row number, load timestamp, and load-run ID. Those metadata fields allow a later pipeline to trace a curated row back to a specific delivery.

Raw is intentionally append-only. Corrections, latest-version selection, duplicates, and withdrawals are downstream modelling concerns. Updating raw rows would erase the evidence needed to replay or explain a result.

The internal stage is an adapter, not the permanent architecture. Milestone 5 can replace it with S3/Snowpipe while keeping the raw table contract stable.

Transferable lesson: keep the ingestion contract stable and auditable so transport mechanisms can change independently.

## 4. Rerunnable SQL Needs Preservation and Correction

The setup scripts use `CREATE ... IF NOT EXISTS`, which preserves existing objects and data on rerun. [`01_foundation.sql`](../infra/snowflake/01_foundation.sql) then uses explicit `ALTER WAREHOUSE` statements to restore the cost-sensitive size and suspension settings if they drift.

That pairing matters:

- `IF NOT EXISTS` prevents accidental replacement.
- `ALTER` converges selected mutable settings to the intended state.
- Repeated `GRANT` statements are naturally idempotent.
- `CREATE OR REPLACE` is avoided because it can destroy objects or reset grants.

There is an important boundary: these scripts add required grants, but they do not revoke unrelated privileges previously granted by someone else. The runbook's `SHOW GRANTS` checks remain necessary when proving least privilege.

Transferable lesson: idempotent means safe to repeat; convergent means drift is corrected. A robust bootstrap often needs both.

## 5. Cost and Credentials Are Part of the Design

[`04_cost_monitor.sql`](../infra/snowflake/04_cost_monitor.sql) attaches one monthly resource monitor to all three warehouses. The quota is supplied at execution time rather than hard-coded. Notifications occur at 50% and 80%; warehouses suspend at 90% and suspend immediately at 100%.

The shared quota is appropriate for one bounded demo: heavy use by any workload consumes the same safety budget. It would be a coupling risk for independent production workloads.

Authentication follows a similar boundary. [`.env.example`](../.env.example) stores names and local defaults, while the Snowflake CLI connection and credentials remain outside Git. Human bootstrap may use MFA or SSO; later application workloads should use a separate service identity with key-pair or approved workload authentication.

Transferable lesson: budgets and credentials are runtime dependencies, so model them explicitly rather than treating them as operator folklore.

## Execution Flow

Run the files in numeric order with a named administrative connection:

```bash
snow sql -c wellbeing-admin -f infra/snowflake/00_roles.sql
snow sql -c wellbeing-admin -f infra/snowflake/01_foundation.sql
snow sql -c wellbeing-admin -f infra/snowflake/02_raw_objects.sql
snow sql -c wellbeing-admin -f infra/snowflake/03_grants.sql
snow sql -c wellbeing-admin -f infra/snowflake/04_cost_monitor.sql \
  -D "credit_quota=<approved-positive-number>"
```

The result is an empty but usable raw boundary: loader and transformer roles can count zero raw rows, reader roles are denied, and all warehouses remain guarded. Milestone 1 enters through the stage and raw table without changing these ownership rules.

## What the Acceptance Checks Prove

The checks in [`milestone-0-account-setup.md`](milestone-0-account-setup.md) establish that:

- the named connection and role hierarchy work;
- the isolated database, schemas, warehouses, stage, format, and raw table exist;
- loader and transformer roles can read the raw table;
- tenant reader roles cannot read raw;
- warehouses are X-Small, auto-suspending, and monitored;
- rerunning setup preserves data and required grants.

These are operator-run integration checks, not an automated test suite. They do not yet prove row-level tenant filtering, secure semantic views, cohort suppression, data loading, or dbt correctness. Those belong to later milestones.

## Try It Safely

Use only the isolated demo account objects.

1. Predict the result, then query `RAW.MONGO_WELLBEING_SUBMISSIONS` as a tenant reader. It should fail before reading any rows. Switch to the loader role; the same count should succeed.
2. Change `WELLBEING_DEMO_LOAD_WH` auto-suspend to 300 seconds in the demo account. Predict what rerunning `01_foundation.sql` will do. `SHOW WAREHOUSES` should confirm it returned to 60 seconds.
3. Rerun `00_roles.sql` through `03_grants.sql`. Compare `SHOW GRANTS` and the raw row count before and after. Objects and rows should be preserved, and required grants should not duplicate.

The second experiment demonstrates convergence; the third demonstrates idempotency. Neither requires loading survey data.

## Continuous-Learning Loop

1. Define the user-visible goal: for example, “a reader must never reach raw survey rows.”
2. Name the enabling concept: least-privilege role grants.
3. Implement the smallest capability boundary.
4. Prove it cheaply with one positive and one negative query.
5. Explain what a failure reveals: missing access, excessive access, ownership drift, or wrong role selection.
6. Record the lesson and reuse it when adding the next stage, model, or service identity.
