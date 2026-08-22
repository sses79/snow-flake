# Snowflake School Health and Wellbeing Demo Project Plan

## 1. Demo outcome

Build a small, production-shaped analytics product that answers:

> Which fictional schools show worsening wellbeing indicators or rising support signals, and can each trust see only its own data?

Supporting questions taken from the dataset's stated research uses:

1. How do physical activity and social-emotional wellbeing responses differ by year group and school type?
2. Where do respondents report feeling unsafe, and how does that vary by cohort?
3. What proportion report missing school or lessons for reasons other than illness?
4. How much useful information do respondents report receiving about selected British Values topics?

The MVP answers questions 1 and 2. Attendance is the next mart. British Values is a separate optional mart so it is not blended into a clinical-sounding wellbeing score.

The five-minute demo should prove that the system can:

1. Convert school-health survey rows into Mongo-shaped submission changes.
2. Load immutable micro-batches into Snowflake.
3. Correctly handle inserts, updates, duplicates, late arrivals, and deletes.
4. Build tested dimensional models and auditable metrics with dbt.
5. Enforce tenant isolation and suppress small cohorts.
6. Serve a small TypeScript dashboard from curated Snowflake views.
7. Show freshness, reconciliation, and approximate compute cost.

The source is a public survey dataset, augmented only with clearly labelled fictional tenant and pipeline fields. No real pupil identity should be introduced.

## 2. Delivery strategy

Use two interchangeable ingestion modes:

```text
Mode A: Snowflake-account-only (first vertical slice)

TypeScript generator -> local NDJSON -> named internal stage -> COPY INTO RAW

Mode B: production-shaped AWS extension

TypeScript generator -> S3 immutable prefix -> SQS notification -> Snowpipe -> RAW
```

Both modes use the same event envelope, raw table, dbt project, tests, and application. This makes Mode A cheap and quick to prove, while Mode B demonstrates the target architecture without rebuilding downstream work.

### Selected Kaggle seed dataset

Use [School Student Health and Wellbeing](https://www.kaggle.com/datasets/thedevastator/school-student-health-and-wellbeing) as the primary seed. Its data card describes a school survey covering physical activity, nutrition, lifestyle, safety, social-emotional wellbeing, and related behaviours. Record the downloaded archive's checksum, original source attribution, and exact license text in the repository, but keep the archive and extracted data out of Git.

The Kaggle rows are survey records, not an incremental operational feed. The source adapter therefore has two explicit jobs:

1. Preserve the supplied answers without presenting derived signals as diagnoses or clinical facts.
2. Add clearly labelled demo-only operational context needed to exercise the pipeline.

| Kaggle field group | Demo use |
|---|---|
| Year group and non-identifying demographics | Cohort dimensions, subject to small-cohort suppression |
| Physical activity and nutrition answers | `physical_wellbeing` answer group |
| Worrying, bullying, safety, and emotional-health answers | `emotional_wellbeing` answer group with restricted access where appropriate |
| Attendance or missed-lesson answers | `engagement` answer group, not a clinical outcome |
| School support/opinion answers | `school_support` answer group |
| Source row number plus file checksum | Input to a deterministic submission ID; never treat it as a real pupil identifier |

Fields added by this project must carry documented provenance:

- `trust_id` and `school_id`: deterministic fictional assignments, not original survey geography.
- `submitted_at` and `source_updated_at`: generated dates within the demo survey window.
- `support_signal_category` and `support_signal_level`: deterministic demo mappings from selected answers, labelled as product rules rather than medical judgments.
- `source_version`, `operation`, `event_id`, and `batch_id`: pipeline simulation metadata.
- Corrected, duplicate, late-arriving, and withdrawn submissions: generated mutations of the baseline records.

Initial profiling is recorded in [`data/README.md`](data/README.md): 569 columns, a two-row header, and 21,954 individual response rows. The source contains sensitive and potentially stigmatizing fields, so the first pipeline will curate only the documented MVP subset and exclude all other answers by default.

Because Kaggle labels the license as “Other” and attributes an upstream source, verify the included license before redistributing any source rows. If redistribution is unclear, provide download instructions and transformations while keeping source and generated derivatives out of the public repository.

## 3. Recommended stack

| Layer | Choice | Why it belongs in the demo |
|---|---|---|
| Runtime and package management | Node.js 22 LTS, TypeScript, pnpm workspaces | One application language for generator, loader, API, tests, and dashboard |
| Source adapter | Kaggle school survey CSV, deterministic seed, Zod schemas | Preserves survey answers while generating reproducible tenant metadata and submission mutations |
| Batch format | Gzipped newline-delimited JSON | Preserves Mongo-shaped documents and works for local stages and S3 |
| Snowflake client | Snowflake CLI for setup/local `PUT`; official Node.js driver for the app | Separates operator workflows from runtime queries |
| Warehouse layers | `RAW`, `STAGING`, `CORE`, `MARTS`, `GOVERNANCE` | Clear ownership and least-privilege boundaries |
| Transformation | dbt Core with `dbt-snowflake` | Versioned models, incremental logic, tests, documentation, and lineage |
| Dashboard | Next.js + server-side Snowflake queries + Recharts | Small TypeScript product surface; credentials never reach the browser |
| Testing | Vitest for TypeScript, dbt data/schema tests, SQL policy tests | Covers contracts, transformations, idempotency, and tenant isolation |
| Automation | Makefile for local commands; GitHub Actions after the vertical slice | Low-friction developer workflow before adding CI |
| AWS extension | S3, SQS, Snowpipe auto-ingest; Terraform | Demonstrates a production-shaped event-driven ingestion route |

Do not add Kafka, Airflow, MongoDB, Kubernetes, or dynamic tables to the first version. The event generator represents the existing MongoDB sync boundary; the demo is about the contract after that boundary.

## 4. System design

```text
apps/generator
  creates deterministic event batches + manifest
          |
          +----------------------+----------------------+
          |                                             |
          v                                             v
  Snowflake internal stage                         AWS S3 landing
          |                                             |
     COPY INTO RAW                               SQS -> Snowpipe
          +----------------------+----------------------+
                                 v
                  RAW.MONGO_WELLBEING_SUBMISSIONS
                   envelope VARIANT + load metadata
                                 |
                              dbt build
                                 v
              STAGING -> CORE -> MARTS -> secure views
                                             |
                                      apps/dashboard
```

### Workload separation

Use extra-small, auto-suspending warehouses:

- `WELLBEING_DEMO_LOAD_WH`: local `COPY INTO` and ingestion checks.
- `WELLBEING_DEMO_TRANSFORM_WH`: dbt builds and tests.
- `WELLBEING_DEMO_APP_WH`: dashboard queries.

Start with `AUTO_SUSPEND = 60` and `AUTO_RESUME = TRUE`. Add a low resource monitor limit appropriate to the account before repeated testing.

## 5. Data contract

Every source change is one JSON line:

```json
{
  "event_id": "evt_01J...",
  "collection": "wellbeing_submissions",
  "document_id": "submission_01J...",
  "operation": "upsert",
  "source_version": 3,
  "source_updated_at": "2026-08-21T09:30:00Z",
  "extracted_at": "2026-08-21T09:31:00Z",
  "batch_id": "batch_20260821_093100_0001",
  "region": "uk",
  "payload": {
    "trust_id": "trust_north",
    "school_id": "school_014",
    "respondent_id": "derived_respondent_8821",
    "year_group": "year_9",
    "submitted_at": "2026-08-21T09:10:00Z",
    "answers": {
      "physical_activity": "30_to_60_minutes",
      "feels_safe_at_school": "usually",
      "frequently_worried": "sometimes"
    },
    "support_signals": ["emotional_wellbeing_check_in"]
  }
}
```

Rules:

- `event_id` identifies the immutable change event.
- `document_id` identifies the mutable source document.
- Higher `source_version` wins for a document.
- `source_updated_at`, then `event_id`, provides a deterministic tie-break.
- `operation = "delete"` is a tombstone; its payload may contain only routing keys.
- The generator writes a sidecar manifest with row count, SHA-256, minimum/maximum source timestamps, and schema version.
- S3 keys are append-only: `region=uk/collection=wellbeing_submissions/date=YYYY-MM-DD/batch_id=<id>/submissions.ndjson.gz`.

## 6. Snowflake model

### Raw

`RAW.MONGO_WELLBEING_SUBMISSIONS`

- `envelope VARIANT`: complete change envelope, unchanged.
- `source_file STRING`: from `METADATA$FILENAME`.
- `source_file_row_number NUMBER`: from `METADATA$FILE_ROW_NUMBER`.
- `loaded_at TIMESTAMP_TZ`: Snowflake load time.
- `load_run_id STRING`: operator-generated ID in local mode, pipe metadata in AWS mode.

Raw is append-only and restricted to loader/transformer roles.

### Staging and intermediate

- `stg_wellbeing_submission_changes`: typed paths from the envelope; one row per source change.
- `int_wellbeing_submission_latest`: deterministic latest submission per `document_id`, including withdrawals.
- `int_wellbeing_submission_current`: latest non-withdrawn submissions only.
- `int_wellbeing_answers`: one row per submission and normalized question/answer.
- `int_support_signals`: transparent rule-derived signals, separate from source answers.

Invalid casts should become visible failures or quarantined rows, not silently disappear.

### Core

- `dim_trust`: one row per fictional tenant.
- `dim_school`: one row per fictional school.
- `dim_respondent`: one row per derived pseudonymous respondent where the source grain supports it.
- `dim_question`: one row per normalized survey question.
- `fct_wellbeing_response`: one row per current submission and normalized question.
- `fct_support_signal`: one row per current, transparently derived support signal.

The first version does not need slowly changing dimensions. Add history only as a deliberate extension.

### Marts

- `mart_school_wellbeing_trend`: response counts and selected wellbeing indicators by fictional school and survey period.
- `mart_support_signals`: aggregated signal counts and rates; no claim that a signal is a diagnosis.
- `mart_trust_benchmark`: trust-level indicator rates with cohorts below 10 suppressed.
- `mart_pipeline_health`: most recent source/load/model timestamps, row reconciliation, rejects, and last successful dbt build.

Later, source-backed marts may add:

- `mart_attendance_barriers`: reported absence or missed lessons for non-illness reasons, clearly labelled as self-reported survey data.
- `mart_british_values_learning`: reported sufficiency of information about rights, respect, democracy, rules/law, and differing faiths/beliefs.

Do not combine these domains into a single opaque score. Publish denominators and missing/not-asked counts beside every percentage.

Expose only secure semantic views to the dashboard. Do not query raw or staging data from the app.

## 7. Security model

Roles:

```text
WELLBEING_DEMO_ADMIN
  ├── WELLBEING_DEMO_LOADER
  ├── WELLBEING_DEMO_TRANSFORMER
  ├── WELLBEING_DEMO_TRUST_NORTH_READER
  └── WELLBEING_DEMO_TRUST_SOUTH_READER
```

Implementation:

- Loader can write only to `RAW` and use the load warehouse/stage.
- Transformer can read `RAW` and build downstream schemas.
- Reader roles can select only secure views in `MARTS`.
- A row-access policy maps `CURRENT_ROLE()` to `trust_id` for the two demo tenants.
- A source row identifier is transformed into a stable pseudonym before `CORE`; direct identifiers, if discovered during profiling, do not enter marts.
- Free text is generated only to prove it is excluded from curated layers.
- Benchmark rows with `respondent_count < 10` return no sensitive metric.

For a learning demo, store a non-production HMAC secret in the local environment and never commit it. In a production design, use a managed secret/key boundary and define who can re-identify subjects.

## 8. Repository shape

```text
snow-flake/
├── apps/
│   ├── generator/              # synthetic source changes and manifests
│   └── dashboard/              # Next.js UI and server-side Snowflake access
├── dbt/
│   ├── models/
│   │   ├── staging/
│   │   ├── intermediate/
│   │   ├── core/
│   │   └── marts/
│   ├── macros/
│   ├── seeds/
│   └── tests/
├── infra/
│   ├── snowflake/              # ordered SQL setup, roles, policies, teardown
│   └── aws/                    # Terraform added in the AWS milestone
├── scripts/                    # thin orchestration commands only
├── generated-data/             # gitignored local batches
├── .env.example
├── Makefile
├── package.json
├── pnpm-workspace.yaml
├── README.md
└── snowflake-learning-guide.md
```

## 9. Build plan and acceptance gates

### Milestone 0 — account connection and guardrails

Detailed instructions: [`docs/milestone-0-account-setup.md`](docs/milestone-0-account-setup.md).

Build:

- Configure a named Snowflake CLI connection outside the repository.
- Create the database, schemas, three warehouses, roles, JSON format, internal stage, and raw table with idempotent SQL.
- Add `.env.example`; keep account identifiers and credentials out of Git.
- Prefer key-pair authentication for the dashboard/service user.

Gate:

- A smoke query succeeds under each role.
- Warehouses auto-suspend.
- A reader role cannot query `RAW`.
- Re-running bootstrap SQL does not fail or widen grants unexpectedly.

### Milestone 1 — first source-to-mart vertical slice

Build:

- Validate the source checksum, reconstruct its two-row header, and enforce the documented 21,954-response reconciliation check.
- Adapt survey rows into two fictional trusts, four schools, and several survey periods with a fixed seed.
- Produce one NDJSON batch and manifest.
- Upload it to the internal stage and `COPY INTO RAW.MONGO_WELLBEING_SUBMISSIONS`.
- Build the staging model, latest/current submission logic, response fact, and school wellbeing mart.

Gate:

- `make demo-reset && make demo-build` creates a tested mart from an empty demo database.
- Manifest count equals raw change count.
- One documented SQL query answers the product question.

### Milestone 2 — incremental correctness

Build four small mutation batches:

1. new inserts;
2. a corrected submission plus an exact duplicate;
3. a late older version after a newer version;
4. a withdrawal tombstone.

Add dbt incremental models and reconciliation tests.

Gate:

- Loading the same file twice does not duplicate raw file ingestion under normal `COPY` behavior.
- Loading the same business changes under a different file name does add raw history but does not duplicate the current fact.
- The late older submission never overwrites the newer correction.
- The withdrawn submission is absent from current facts and present in raw history.
- Full-refresh and incremental builds produce equivalent current-state results.

### Milestone 3 — product surface

Build a dashboard with:

- trust/school/date filters;
- wellbeing-indicator trend by survey period;
- response distribution for selected questions;
- aggregated support-signal table with a non-diagnostic disclaimer;
- data-freshness indicator;
- a clear "synthetic data" label.

Gate:

- The browser receives aggregated rows, never Snowflake credentials.
- The app queries secure views only.
- A user can identify a school with a worsening wellbeing indicator and inspect aggregated support signals in under one minute.

### Milestone 4 — privacy, reliability, and cost evidence

Build:

- HMAC respondent pseudonyms where the source row grain supports stable respondents.
- Tenant row-access policy and two reader roles.
- Minimum-cohort suppression.
- dbt source freshness, uniqueness, not-null, relationship, and accepted-value tests.
- Health mart and queries using load/query history for failures and warehouse consumption.

Gate:

- The north role returns zero south rows, and vice versa.
- No direct respondent ID or sensitive free text exists in marts.
- Cohorts below 10 expose neither rate nor numerator.
- The dashboard displays last successful data time.
- The runbook explains failed loads, replay, schema changes, and cost inspection.

### Milestone 5 — S3 and Snowpipe upgrade

Prerequisite: an AWS account or sandbox with permission to create an S3 bucket, SQS notification, and IAM role/policy.

Build:

- Terraform for a versioned, encrypted S3 landing bucket and notification path.
- Snowflake storage integration, external stage, and auto-ingest pipe.
- Generator upload mode using the same S3 key and manifest conventions.
- A schema change and rejected-file alert exercise.

Gate:

- Uploading a new batch causes it to appear in raw without running `COPY` manually.
- Snowpipe status/load history proves the file outcome.
- Re-sending an already seen business change does not alter curated counts incorrectly.
- Deleting and recreating downstream demo tables can be recovered by replaying landing files.

## 10. Test matrix

| Risk | Test | Expected result |
|---|---|---|
| Duplicate file | Upload the same filename/content again | No second file load |
| Duplicate event | Put the same `event_id` in a new file | Raw retains lineage; current fact remains unique |
| Out-of-order update | Load version 2 after version 3 | Version 3 remains current |
| Withdrawal | Load a versioned tombstone | Removed from current fact, retained in raw |
| Schema drift | Add an optional JSON field | Raw load succeeds; existing typed columns remain valid |
| Bad type | Send an invalid answer/timestamp | Test fails or row enters quarantine visibly |
| Tenant leak | Query through both reader roles | Each sees only its mapped trust |
| Small cohort | Create a group with 9 respondents | Sensitive benchmark values are suppressed |
| Rebuild | Full-refresh from raw | Same current-state result as incremental build |

## 11. Demo script

1. Show the generated insert/correction/duplicate/withdrawal files and one manifest.
2. Load a new batch and show its raw `VARIANT` plus filename metadata.
3. Run `dbt build` and show tests passing.
4. Compare raw change history with the deduplicated current fact.
5. Open the dashboard and answer the product question.
6. Switch between north and south roles to prove tenant isolation.
7. Show cohort suppression, freshness, reconciliation, and warehouse consumption.
8. Explain that internal-stage ingestion is the development adapter and S3/Snowpipe is the production-shaped adapter.

## 12. Definition of done

The core demo is complete at Milestone 4. Milestone 5 is an infrastructure extension, not a blocker for demonstrating Snowflake, dbt, data correctness, governance, and product thinking.

The repository is done when a new developer can follow the README, connect their own Snowflake account, run a reset/build command, reproduce all mutation scenarios, pass the tests, and deliver the five-minute demo without undocumented manual fixes.

## 13. First implementation slice

Implement these pieces first, in order:

1. Repository scaffold and secret-safe configuration.
2. Kaggle download instructions, gitignored input directory, checksum/attribution file, and a profiling command.
3. Snowflake bootstrap SQL and teardown SQL scoped only to `SCHOOL_WELLBEING_DEMO`.
4. Deterministic CSV-to-submission adapter for one baseline batch and its manifest.
5. Internal-stage upload/load command.
6. `stg_wellbeing_submission_changes`, `int_wellbeing_submission_latest`, `fct_wellbeing_response`, and `mart_school_wellbeing_trend`.
7. Tests for uniqueness, accepted operations, deterministic latest-version selection, and source-to-raw count reconciliation.

Defer the dashboard until this vertical slice passes from an empty database. The data contract and correctness behavior are the foundation every later layer consumes.
