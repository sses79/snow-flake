# dbt Learning Guide

dbt owns the transformation from append-only Snowflake JSON to an auditable
school-level wellbeing mart. The useful mental model is: write one `select` per
business step, connect steps with `ref()`, state each model's grain, and make
invalid data return rows from tests so `dbt build` stops.

For the full source-to-mart runbook, see
[`milestone-1-vertical-slice.md`](milestone-1-vertical-slice.md). The dbt source
of truth is [`dbt/`](../dbt/).

## The 80/20 View

```text
RAW JSON source (21,954 envelopes)
  -> stg changes: typed columns                 [view]
  -> int latest: newest event per document      [view]
  -> int current: upserts only                  [view]
  -> int answers: one row per answer (395,172)  [view]
  -> response fact: adverse-response rule       [table]
  -> school trend mart (2,376 groups)           [table]
```

## What “Mart” and “Source-to-Mart” Mean

A **data mart** is a curated dataset designed to answer a specific reporting or
business question. Raw data preserves what arrived; a mart presents trusted,
analysis-ready measures without requiring each report author to repeat the
pipeline's deduplication, filtering, classification, and aggregation logic.

This project's mart is
`SCHOOL_WELLBEING_DEMO.MARTS.MART_SCHOOL_WELLBEING_TREND`. Each row represents
one trust, school, school classification, survey period, and question. It
contains eligible, answered, missing, and adverse response counts plus the
adverse-response rate. A dashboard can query this table directly instead of
reading respondent-level JSON or rebuilding those calculations.

“Full source-to-mart” means proving the entire path, not only running dbt:

```text
source CSV
  -> generated NDJSON events
  -> Snowflake internal stage
  -> RAW table
  -> dbt staging and intermediate views
  -> response fact table
  -> wellbeing trend mart
```

The generator and loader own the path from CSV through `RAW`; dbt owns the
transformation from `RAW` to the mart. A successful source-to-mart build proves
that these boundaries collaborate to produce the report-ready result.

## 1. A dbt Model Is a Select Statement

Each file under [`dbt/models/`](../dbt/models/) contains the query that defines
one warehouse relation. dbt supplies the surrounding `create view` or `create
table` operation. For example,
[`stg_wellbeing_submission_changes.sql`](../dbt/models/staging/stg_wellbeing_submission_changes.sql)
casts fields out of the raw `VARIANT`; it does not contain deployment DDL.

This separation keeps transformation logic readable and lets configuration
choose how Snowflake persists it. dbt does not ingest the NDJSON file: the
generator and [`load-batch.sh`](../scripts/load-batch.sh) own everything through
the raw table. dbt begins at that table.

Transferable lesson: make each model express one useful data transformation;
let dbt manage the relation lifecycle.

## 2. `source()` and `ref()` Build the DAG

The staging query enters the graph with:

```sql
from {{ source('raw', 'mongo_wellbeing_submissions') }}
```

[`sources.yml`](../dbt/models/staging/sources.yml) resolves that logical name to
`SCHOOL_WELLBEING_DEMO.RAW.MONGO_WELLBEING_SUBMISSIONS`. Every later model uses
`ref()`, such as `ref('int_wellbeing_submission_current')`. dbt replaces the
reference with the physical Snowflake relation and records a dependency edge.

Those edges, rather than folder names, determine build order. They also make
graph selection possible: `+fct_wellbeing_response` means the fact and all its
ancestors, while `stg_wellbeing_submission_changes+` means staging and all its
descendants.

Transferable lesson: use `source()` at system boundaries and `ref()` inside the
project; avoid hard-coded downstream relation names.

## 3. Grain Is the Contract Between Layers

The intermediate models change grain deliberately:

- [`int_wellbeing_submission_latest.sql`](../dbt/models/intermediate/int_wellbeing_submission_latest.sql)
  ranks events and keeps one newest event per `document_id`.
- [`int_wellbeing_submission_current.sql`](../dbt/models/intermediate/int_wellbeing_submission_current.sql)
  keeps only `upsert`, so a latest delete removes a document from current state.
- [`int_wellbeing_answers.sql`](../dbt/models/intermediate/int_wellbeing_answers.sql)
  uses Snowflake `lateral flatten` to turn the answers object into one row per
  `(document_id, question_code)`.

The fact preserves that answer grain and adds `is_answered` plus the explicit
`is_adverse_response` reporting rule. The mart then groups by trust, school,
classification, survey period, and question. This explains the Milestone 1
counts: `21,954 * 18 = 395,172` fact rows, aggregated to 2,376 mart rows.

Transferable lesson: write down a model's “one row per ...” sentence before
writing its SQL; joins, tests, and metrics follow from it.

## 4. Materialization Separates Logic from Storage

[`dbt_project.yml`](../dbt/dbt_project.yml) makes staging and intermediate
models views, while core and marts are tables. Views keep early transformations
easy to inspect; tables persist the larger fact and reporting result. The
[`generate_schema_name` macro](../dbt/macros/generate_schema_name.sql) places
custom schemas directly in `STAGING`, `CORE`, and `MARTS` rather than prefixing
them with the profile's default schema.

A full build recreates the table models even when their SQL is unchanged; none
of these models is incremental yet. That is simple and correct for this demo,
but it consumes transform-warehouse compute.

Transferable lesson: start with views for simplicity, use tables at stable or
expensive boundaries, and introduce incremental logic only with a tested need.

## 5. Tests Are Queries That Must Return Zero Bad Rows

YAML tests in [`staging.yml`](../dbt/models/staging/staging.yml),
[`core.yml`](../dbt/models/core/core.yml), and
[`marts.yml`](../dbt/models/marts/marts.yml) apply reusable checks such as
`not_null`, `unique`, and `accepted_values`. Singular tests under
[`dbt/tests/`](../dbt/tests/) express project invariants as SQL:

- raw has exactly 21,954 Milestone 1 rows;
- fact has `21,954 * 18` rows;
- `(document_id, question_code)` is unique;
- answered plus missing reconciles to eligible, and adverse never exceeds
  answered.

`dbt build` runs tests in DAG order. A failed upstream test prevents dependent
nodes from building, which is stronger than running every model first and
checking quality afterward. The successful build produced 6 models and 27
tests; generated `dbt/target/run_results.json` records each node's status,
timing, compiled SQL, relation, and Snowflake query ID.

The exact-count tests prove this fixture, not a general production volume.
They must evolve when Milestone 2 introduces additional change events.

Transferable lesson: test stable contracts—keys, accepted domains, grain, and
reconciliation—and distinguish fixture assertions from permanent invariants.

## 6. The Profile Is the Runtime Boundary

[`profiles.yml`](../dbt/profiles.yml) reads account, user, authenticator,
database, and warehouse values from the ignored `.env`. It fixes the runtime
role to `WELLBEING_DEMO_TRANSFORMER`, uses the dedicated transform warehouse,
and allows four concurrent threads. This is why dbt can read `RAW` and create
models downstream without receiving loader privileges.

`dbt debug` validates configuration and login. `dbt ls` parses the graph
without building warehouse relations. `dbt build` executes Snowflake SQL and
therefore consumes warehouse credits; the X-Small warehouse's auto-suspend is
the cost boundary.

Transferable lesson: keep credentials outside the project, make the runtime
role least-privileged, and use graph inspection before paid execution.

## Execution Flow

[`Makefile`](../Makefile) exposes the complete path:

```text
make demo-build
  -> generator tests
  -> generate deterministic NDJSON + manifest
  -> PUT staged file
  -> COPY raw rows + reconcile manifest
  -> dbt build
       parse project/profile
       compile Jinja source()/ref() to Snowflake SQL
       order nodes from the DAG
       build each model and run its tests
       write artifacts under dbt/target/
```

After a build or compile, inspect generated
`dbt/target/compiled/school_wellbeing_demo/models/intermediate/int_wellbeing_answers.sql`.
The `ref()` has become a fully qualified Snowflake relation, while the business
SQL remains recognizable. The entire `target/` directory is disposable and is
not committed.

## What the Tests Prove

The completed Milestone 1 build proves that the fixed source batch reaches the
mart with the expected counts, required identifiers, allowed operation/trust
values, unique event IDs and answer grain, and reconciled mart measures. It
also proves the transformer role can create and query the configured objects.

It does not prove mutation-level idempotency, late-arriving updates, realistic
delete handling, source freshness, tenant row policies, cohort suppression, or
the clinical validity of the adverse-response rules. Those are explicit later
boundaries; the adverse flag is a demo reporting rule, not a diagnosis.

## Try It Safely

Load the ignored environment before invoking dbt:

```bash
set -a
source .env
set +a
```

Start with commands that do not rebuild Snowflake relations:

```bash
# Validate configuration and authentication.
.venv/bin/dbt debug --project-dir dbt --profiles-dir dbt

# Predict the upstream model set, then ask dbt to show it.
.venv/bin/dbt ls --project-dir dbt --profiles-dir dbt \
  --resource-type model --select +fct_wellbeing_response --output name

# List the staging model and every downstream model.
.venv/bin/dbt ls --project-dir dbt --profiles-dir dbt \
  --resource-type model --select stg_wellbeing_submission_changes+ --output name
```

For a focused paid execution, predict which ancestors and tests will run, then
build only the fact path:

```bash
.venv/bin/dbt build --project-dir dbt --profiles-dir dbt \
  --select +fct_wellbeing_response
```

Safe experiment: first predict whether `int_wellbeing_submission_latest` is an
ancestor or descendant of the fact. Run the first `dbt ls` command and explain
why it appears. Then remove the leading `+`, rerun `dbt ls`, and compare the
selection. This changes no data and teaches the selector syntax used for fast,
targeted development.

## Continuous-Learning Loop

1. Define the user-visible goal, such as “report adverse response rates by
   school and period.”
2. Name the enabling concept: a fact with explicit answer grain feeding an
   aggregate mart.
3. Implement the smallest useful `select` and connect it with `ref()`.
4. Prove it at the cheapest meaningful boundary: parse/list first, then one
   focused build and a grain or reconciliation test.
5. Explain what a failure revealed: compilation, privileges, unexpected grain,
   invalid domain values, or broken reconciliation.
6. Record the transferable contract before extending the next model.

For a broader guided exercise after this repository-specific guide, use the
[official dbt and Snowflake quickstart](https://docs.getdbt.com/guides/snowflake?step=1).
