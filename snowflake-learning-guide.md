# Snowflake School Wellbeing: 80/20 Learning Guide

This guide explains the small set of Snowflake and data-engineering ideas that
account for most of this completed project. It is based on the implemented
code, tests, and live Milestone 6 verification—not on a proposed architecture.

The project turns the public School Student Health and Wellbeing survey into
deterministic change events, loads them through an internal stage or
S3/Snowpipe, builds tested dbt models, and publishes only aggregate,
tenant-scoped data to a Next.js dashboard and Power BI.

For milestone detail, see [`demo-project-plan.md`](demo-project-plan.md). For the
final evidence and limitations, see
[`docs/project-outcomes-and-lessons.md`](docs/project-outcomes-and-lessons.md).

## What We Delivered

```text
Kaggle survey CSV
  -> TypeScript validation and deterministic fictional metadata
  -> manifest + immutable gzipped NDJSON batches
  -> internal stage/COPY or S3/SQS/Snowpipe
  -> Snowflake RAW delivery history
  -> dbt staging -> latest -> current -> fact -> marts
  -> tenant-specific secure views
  -> server-side Next.js API -> browser dashboard / aggregate CSV
  -> Power BI aggregate report
```

The final verified build included:

- six implemented milestones from account guardrails through live Snowpipe;
- 14 dbt models and 98 dbt data tests plus one dbt unit test;
- deterministic exercises for inserts, corrections, duplicates, late older
  versions, withdrawals, compatible schema changes, and rejected files;
- 18 documented wellbeing indicators with explicit answer ordering and
  interpretation rules;
- cohort suppression, fictional tenancy, secure reader views, and no committed
  respondent-level data; and
- a final incremental and full-refresh gate that passed all 116 dbt nodes.

These numbers describe the deterministic demo fixture. They are evidence of
correctness at demo scale, not a production-scale claim.

## The 80/20 View

### 1. Snowflake separates storage, compute, and access

A database stores the data, a virtual warehouse supplies compute, and a role
decides what a session may do. These are independent controls.

The ordered SQL in [`infra/snowflake`](infra/snowflake/) makes that separation
concrete:

- `SCHOOL_WELLBEING_DEMO` contains `RAW`, transformation, mart, and governance
  objects;
- load, transform, and application warehouses isolate workloads and
  auto-suspend when idle;
- loader, transformer, tenant reader, dashboard, and observer roles receive
  only the privileges needed by their boundary; and
- a resource monitor limits user-managed warehouse consumption.

A warehouse showing `SUSPENDED` is healthy when idle. A query can resume it,
and auto-suspend stops further warehouse use afterward. Snowpipe uses separate
serverless compute, so it can load data without leaving one of the three
warehouses running.

Transferable lesson: do not treat “the Snowflake connection” as one permission.
Choose a role, warehouse, database, and schema for each workload.

### 2. Preserve the source contract before modelling it

[`apps/generator/src/generator.ts`](apps/generator/src/generator.ts) checks the
downloaded CSV schema and checksum before emitting any event. Each generated
envelope carries stable event and document identifiers, operation, source
version, business timestamps, batch identity, schema version, payload, and
provenance. Its manifest records the expected row count and SHA-256 checksum.

Snowflake receives the envelope in a `VARIANT` column. That preserves the
original JSON shape while dbt extracts only the typed fields needed by the
analytical contract. An optional JSON field can therefore arrive safely in raw
before a downstream model decides to use it.

The same envelope works through two transports:

```text
local file -> internal stage -> COPY INTO -> RAW

local file -> S3 -> event notification -> managed SQS -> Snowpipe -> RAW
```

Transferable lesson: a stable data contract makes transport replaceable. S3 or
Snowpipe should not define business meaning.

### 3. Delivery history, logical events, and current state are different grains

An immutable raw table records what arrived. That is not automatically the
same as one business event or the latest state of one survey submission.

The implemented dbt path makes each grain explicit:

```text
RAW.MONGO_WELLBEING_SUBMISSIONS        one row per physical delivery
  -> stg_wellbeing_submission_changes  one typed row per logical event
  -> int_wellbeing_submission_latest   one winning event per document
  -> int_wellbeing_submission_current  current non-withdrawn documents
  -> int_wellbeing_answers              one answer per document/question
  -> fct_wellbeing_response             one curated response fact
```

Winner selection uses source version and timestamps with deterministic
tie-breaking. A late older version cannot replace a newer answer. A tombstone
removes the document from current state while its history remains auditable.
Duplicate delivery is retained as lineage but does not become a second logical
event.

The mutation fixtures live in
[`apps/generator/src/mutations.ts`](apps/generator/src/mutations.ts), and the
cross-model invariants live in [`dbt/tests`](dbt/tests/).

Transferable lesson: define idempotency separately for files, events, and
business entities.

### 4. dbt transforms inside Snowflake; it is not the ingestion engine

dbt reads model SQL, resolves `ref()` and `source()` dependencies, compiles the
Snowflake dialect, submits the statements to Snowflake, and runs tests against
the resulting relations. The data remains in Snowflake during this work.

In this project:

- Snowpipe or `COPY INTO` moves files into `RAW`;
- dbt turns raw events into typed, reconciled facts and marts;
- tests reject incorrect grains, domains, arithmetic, suppression, or
  withdrawal behaviour; and
- `--full-refresh` rebuilds the modelled state from raw history.

Snowpipe does **not** trigger `dbt build`. A production version still needs an
orchestrator, scheduled job, or event-aware workflow to refresh the marts after
new raw data arrives.

The main commands are wrapped by the repository:

```bash
make dbt-build
make dbt-freshness
make demo-reset && make demo-build
```

Transferable lesson: ingestion establishes durable evidence; transformation
turns that evidence into business state. Schedule and observe both stages.

### 5. A trustworthy metric includes its grain, denominator, and limitations

The dashboard does not read arbitrary raw questions. A catalogue defines the
18 selected indicators, labels, categories, answer order, direction, and
interpretation notes. Marts retain eligible, answered, missing, and adverse
counts beside rates so analysts can inspect the denominator.

The analytical layer adds:

- school trends and weighted trust benchmarks;
- question-level change drivers;
- ordered answer distributions;
- category summaries and prior-period movement;
- freshness and pipeline-health evidence; and
- explicit non-diagnostic support signals.

Cohorts below the configured minimum are suppressed before publication. The
project never claims that a survey answer is a diagnosis, and fictional school,
trust, tenant, and time assignments remain labelled as generated data.

Transferable lesson: a chart is only the final rendering. The reusable product
is the tested definition behind it.

### 6. Credentials and tenancy stop at the server boundary

The browser calls the fixed API routes in
[`apps/dashboard/app/api`](apps/dashboard/app/api/). Server-side code in
[`apps/dashboard/lib/snowflake.ts`](apps/dashboard/lib/snowflake.ts) owns the
Snowflake session. The browser never receives a Snowflake password, PAT, or
account identifier.

[`apps/dashboard/lib/dashboard-data.ts`](apps/dashboard/lib/dashboard-data.ts)
queries tenant-specific secure views using fixed object allowlists and bind
parameters. It returns aggregate trends, distributions, drivers, categories,
and freshness. Dashboard tests verify both the row mapping and the query
boundary.

Transferable lesson: filtering in a user interface is not authorization.
Restrict the published database object and keep service credentials behind the
server.

## Why the AWS/Snowpipe Handshake Has Three Phases

Milestone 6 crosses two control planes:

1. Terraform creates an encrypted, versioned S3 bucket and a bootstrap IAM
   role in the user's AWS account.
2. Snowflake creates the storage integration and reveals its IAM principal and
   external ID; Terraform then narrows the AWS trust policy to those values.
3. Snowflake creates the pipe and managed SQS queue; Terraform then configures
   the S3 event notification with that queue ARN.

[`scripts/configure-snowpipe.sh`](scripts/configure-snowpipe.sh) coordinates the
exchange without committing the handshake values. The S3 bucket and IAM role
belong to the user's AWS account. The pipe and destination queue belong to the
Snowflake side of the integration.

The uploader writes the manifest first and the `.ndjson.gz` object last. It
checks the checksum before upload, treats the same key and checksum as a no-op,
and rejects an attempted overwrite with different content.

Transferable lesson: multi-cloud infrastructure often cannot be created in one
pass. Make ownership and exchanged identifiers explicit instead of hiding the
dependency.

## What the Tests Prove

| Boundary | Evidence |
|---|---|
| Source to batch | exact source checks, deterministic output, manifest count and checksum |
| Batch to raw | reconciliation SQL, immutable S3 keys, Snowpipe and copy history |
| Raw to current state | duplicate, correction, late-version, and withdrawal assertions |
| Current state to marts | grain, relationship, domain, denominator, and arithmetic tests |
| Privacy to publication | suppression tests, tenant-specific secure views, fixed server query contracts |
| Recovery | incremental/full-refresh equivalence and an opt-in S3 replay exercise |
| Operations | freshness, pipeline-run audit, rejected-file visibility, and warehouse-credit evidence |

The final live Milestone 6 gate proved that a newly created S3 object reached
raw without manual `COPY`, retrying its immutable key was a no-op, compatible
schema drift survived in raw, malformed input appeared as a failed load, and
both incremental and full-refresh builds passed.

The tests do not prove production scale, real school tenancy, clinical
validity, continuous dbt orchestration, or automatic portability to another
database.

## Milestone Map

| Milestone | Main lesson | Evidence |
|---|---|---|
| 0 | Account objects and privileges are architecture | ordered, rerunnable role, warehouse, schema, grant, and monitor SQL |
| 1 | Build one complete vertical slice first | checked CSV -> manifest/NDJSON -> raw -> tested trend mart |
| 2 | Incremental correctness needs adversarial fixtures | corrections, duplicates, late events, withdrawals, full-refresh comparison |
| 3 | The browser consumes aggregates, never warehouse credentials | secure views, server adapter, dashboard API and tests |
| 4 | Analytical meaning belongs in governed definitions | indicator catalogue, benchmarks, distributions, drivers, suppression |
| 5 | Operations and identity are part of correctness | service users, freshness, audit, health, cost, rotation and recovery checks |
| 6 | A stable contract survives a transport change | encrypted S3, scoped IAM, notifications, Snowpipe, rejection and replay evidence |

## What Transfers Beyond Snowflake

The following design survives a move to DuckDB, PostgreSQL, or another cloud
warehouse:

- the source checksum and schema checks;
- the event envelope and manifest;
- immutable landing keys and replay rules;
- event/latest/current grain definitions;
- most business tests and reconciliation rules;
- the indicator catalogue, suppression rules, and aggregate API contract; and
- the dashboard and Power BI user questions.

The following parts are Snowflake-specific and must be replaced:

- `VARIANT` access syntax and other Snowflake SQL;
- stages, file formats, `COPY INTO`, storage integrations, and Snowpipe;
- Snowflake roles, warehouses, secure views, PAT authentication, and Account
  Usage telemetry; and
- the managed SQS destination created for Snowpipe.

The detailed migration design is in
[`docs/duckdb-power-bi-handover.md`](docs/duckdb-power-bi-handover.md).

## Account Retirement Boundary

Closing Snowflake does not delete resources in the user's AWS account. The
retained S3 bucket, encryption, version history, and valid landing objects can
support the replacement project, but the old Snowflake-managed SQS destination
cannot.

Before account closure:

1. Preserve the ignored Terraform state securely; it remains the ownership
   record for the AWS resources.
2. Move or import those resources into one new Terraform state before changing
   them. Never let two states manage the same S3 notification.
3. Replace the Snowflake SQS notification with a queue owned by the replacement
   project, then remove the Snowflake-specific IAM trust.
4. Exclude or quarantine the deliberately malformed Milestone 6 fixture during
   replay.
5. Revoke local PATs and remove Snowflake connection and `.env` secrets after
   collecting only non-sensitive portfolio evidence.
6. Cancel any separate CoCo subscription independently.
7. For a trial, self-service, or last organization account, request closure
   through Snowflake Support; simply reaching trial expiry suspends the account
   rather than formally closing it.

See Snowflake's current documentation for
[trial cancellation](https://docs.snowflake.com/en/user-guide/admin-trial-account),
[support cases](https://docs.snowflake.com/en/user-guide/ui-support), and
[dropping organization accounts](https://docs.snowflake.com/en/user-guide/organizations-manage-accounts-delete).

## Try It Safely

The local contract and application tests remain useful after the Snowflake
account closes:

```bash
make test
make dashboard-test
./scripts/verify-milestone-6.sh --local
```

Two useful experiments:

1. Copy a generated manifest and batch to a temporary directory. Predict the
   result, change only the manifest row count, and run validation. It should
   fail before any cloud write.
2. Add one optional JSON field to a local event fixture. Predict the result:
   raw-compatible validation should accept it, while curated output remains
   unchanged until a model explicitly adopts the field.

Do not run live Snowflake, recovery, upload, or Terraform apply commands after
the account is retired unless the corresponding environment has deliberately
been re-established.

## Interview-Ready Explanation

> I built a production-shaped school wellbeing pipeline around an anonymous
> public survey. A TypeScript adapter validated the source and produced
> deterministic, manifest-backed change events. I first loaded them through a
> Snowflake internal stage, then proved that the same contract worked through
> encrypted S3 and Snowpipe. dbt separated delivery history, logical events,
> latest state, current state, response facts, and aggregate marts, with tests
> for retries, corrections, late data, withdrawals, reconciliation, and cohort
> suppression. Tenant secure views fed a server-side Next.js adapter, so the
> browser received only aggregate rows and never Snowflake credentials. The
> final gate proved live auto-ingest, rejected-file visibility, and equivalent
> incremental and full-refresh results. I also documented the remaining gap:
> Snowpipe loads raw automatically, but a scheduler is still required to run
> dbt and refresh product surfaces.

## Continuous-Learning Loop

1. Define one user-visible question.
2. Write the grain and ownership boundary that make it answerable.
3. Build the smallest complete source-to-product path.
4. Prove it with deterministic local tests before using a live cloud boundary.
5. Exercise one failure: retry, late data, deletion, schema change, or rejected
   input.
6. Record what the failure teaches and carry that contract into the next
   implementation.
