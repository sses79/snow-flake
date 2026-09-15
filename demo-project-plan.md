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

### Current delivery status

| Milestone | Status | Evidence |
|---|---|---|
| Milestone 0 — account connection and guardrails | Complete | Rerunnable Snowflake bootstrap, least-privilege roles, workload warehouses, and cost monitor |
| Milestone 1 — first source-to-mart vertical slice | Complete | Deterministic 21,954-event batch, tested dbt mart, tenant-safe secure views, and a published Power BI trend report |
| Milestone 2 — incremental correctness | Complete | Deterministic mutations, duplicate delivery history, incremental state/fact models, 40 passing dbt nodes, and full-refresh equivalence |
| Milestone 3 — product surface | Complete | Next.js API/UI, aggregate marts, tenant secure views, browser-boundary tests, and live PAT authentication through the north reader role |
| Milestone 4 — analytical depth | Complete | Trust benchmarks, change drivers, interpretable metrics, analyst exports, and minimum-cohort suppression are implemented and live-verified |
| Milestone 5 — production hardening | Complete | Workload service identities, source freshness, pipeline audit/health evidence, operational least privilege, and recovery/rotation acceptance checks |
| Milestone 6 — AWS ingestion | Planned | The S3, SQS, and Snowpipe extension remains deliberately deferred |

The Power BI report is an early validation of the Milestone 1 mart and secure
reader boundary. It does not replace Milestone 3's Next.js dashboard or
Milestone 4's deeper analyst workflow and minimum-cohort controls.

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
| Product surfaces | Power BI Service for early mart validation; Next.js + server-side Snowflake queries + Recharts in Milestone 3 | Proves the semantic layer early while retaining a small code-owned product surface later |
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
                         +----------------+----------------+
                         |                                 |
                  Power BI Service                  apps/dashboard
                  secure view import               Milestone 3 API/UI
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

Milestone 1 also exposes object-specific secure views for external readers:

- `mart_trust_north_school_wellbeing_trend`: north rows only;
- `mart_trust_south_school_wellbeing_trend`: south rows only.

The shared `mart_school_wellbeing_trend` table is not granted to reader roles.
Schema-wide `ALL VIEWS` and `FUTURE VIEWS` grants are deliberately avoided so
one tenant role cannot inherit access to the other tenant's view.

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
- Reader roles can select only their object-specific secure view in `MARTS`.
- Milestone 5 can add a row-access policy that maps `CURRENT_ROLE()` to
  `trust_id` if the product adopts shared multi-tenant semantic views. The
  current secure views already enforce the two-tenant demo boundary without
  exposing the shared mart table.
- The source row identifier contributes to a deterministic submission ID for
  pipeline correctness but is never exposed by semantic views. Direct
  identifiers, if discovered during profiling, do not enter marts.
- Free text is generated only to prove it is excluded from curated layers.
- Benchmark rows with `respondent_count < 10` return no sensitive metric.

If a future use case requires stable respondent linkage, introduce an HMAC
pseudonym and keep its secret outside the repository. A production design must
use a managed secret/key boundary and explicitly define who can re-identify
subjects.

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

Status: **complete (2026-08-25)**.

Build:

- Validate the source checksum, reconstruct its two-row header, and enforce the documented 21,954-response reconciliation check.
- Adapt survey rows into two fictional trusts, four schools, and several survey periods with a fixed seed.
- Produce one NDJSON batch and manifest.
- Upload it to the internal stage and `COPY INTO RAW.MONGO_WELLBEING_SUBMISSIONS`.
- Build the staging model, latest/current submission logic, response fact, and school wellbeing mart.
- Create north-only and south-only secure trend views with object-specific
  reader grants.
- Validate the north view through Power BI Service using key-pair
  authentication and save the synthetic-data trend report to the demo
  workspace.

Gate:

- `make demo-reset && make demo-build` creates a tested mart from an empty demo database.
- Manifest count equals raw change count.
- One documented SQL query answers the product question.
- The Power BI connector authenticates with RSA key-pair credentials and reads
  only the north secure view.
- Each reader role is denied access to the other tenant's view, and rerunning
  the tenant-view SQL does not widen grants.

Implementation notes:

- Run `infra/snowflake/05_tenant_reader_views.sql` after dbt builds the shared
  mart.
- Enter the full Snowflake server hostname in lowercase in Power BI. The ADBC
  connection path returned a generic `Invalid credentials` error for the same
  valid hostname in uppercase.
- The repeatable connection, report, and troubleshooting steps are recorded in
  [`docs/power-bi-dashboard.md`](docs/power-bi-dashboard.md).

### Milestone 2 — incremental correctness

Status: **complete (2026-08-25)**.

Build four small mutation batches:

1. new inserts;
2. a corrected submission plus an exact duplicate;
3. a late older version after a newer version;
4. a withdrawal tombstone.

Add dbt incremental models and reconciliation tests.

Implementation:

- `make generate` produces four deterministic mutation batches plus a renamed
  delivery replay fixture.
- staging preserves physical raw history while deduplicating logical events by
  `event_id`;
- `int_wellbeing_submission_latest` incrementally compares event candidates and
  ranks source version before arrival time;
- `fct_wellbeing_response` incrementally merges changed answer rows and removes
  withdrawn current facts; and
- the small aggregate mart remains a deterministic rebuild.

Gate:

- Loading the same file twice does not duplicate raw file ingestion under normal `COPY` behavior.
- Loading the same business changes under a different file name does add raw history but does not duplicate the current fact.
- The late older submission never overwrites the newer correction.
- The withdrawn submission is absent from current facts and present in raw history.
- Full-refresh and incremental builds produce equivalent current-state results.

Evidence:

- raw: 21,961 physical delivery rows;
- staging: 21,959 distinct logical events;
- latest state: 21,956 documents, including one winning tombstone;
- current state: 21,955 upsert documents;
- response fact: 395,190 rows;
- trend mart: 2,376 rows;
- dbt: 40 of 40 nodes passed; and
- bidirectional fact and mart comparisons returned zero differences after
  `dbt build --full-refresh`.

Runbook: [`docs/milestone-2-incremental-correctness.md`](docs/milestone-2-incremental-correctness.md).

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

### Milestone 4 — analytical depth and trustworthy insights

Build:

- An indicator catalogue containing the readable label, wellbeing category,
  answer display order, adverse-response rule, direction, and interpretation
  note for every curated question.
- A school-period analytical mart containing the current adverse-response
  rate, previous-period rate, percentage-point change, trust benchmark,
  school-versus-trust gap, answered count, and missing-response rate.
- Category summaries for emotional wellbeing, peer relationships, safety,
  school support, and physical wellbeing. Do not combine unlike questions
  into a clinical-sounding overall wellbeing score.
- A top-driver view that explains which questions contributed most to each
  school's latest category movement.
- Ordered response distributions with counts and percentages that reconcile
  to the analytical mart.
- Minimum-cohort suppression: groups below 10 expose neither the numerator nor
  a derived rate. Display a clear coverage warning when missingness or a
  suppressed cohort limits interpretation.
- Dashboard navigation from trust overview, to school and category, to the
  selected question's response distribution. Show change in percentage
  points, not ambiguous relative percentages.
- Plain-language insight cards for largest worsening, largest improvement,
  persistent high signals, and material gaps from the trust benchmark.
- A filtered aggregate CSV export that applies the same tenant, cohort, and
  suppression rules as the visible dashboard.
- Versioned analyst SQL under `analysis/` for the principal investigation
  questions, plus a metric dictionary explaining calculations and caveats.
- dbt reconciliation, uniqueness, not-null, relationship, accepted-value, and
  suppression tests for the new semantic layer.

Analytical questions:

1. Which fictional schools worsened most since the previous survey period?
2. Is the school also worse than its trust benchmark, and by how many
   percentage points?
3. Which categories and individual questions drive the movement?
4. How many answered and missing responses support the finding?
5. Does the response distribution support the headline aggregate?
6. Are suppression or coverage limitations material to interpretation?

Authentication decision:

- Continue using the existing `SSES79` PAT for this personal demo.
- Keep the PAT in an ignored external file and load it only in the Next.js
  server runtime; it must never use a `NEXT_PUBLIC_` variable or reach the
  browser.
- Continue forcing `WELLBEING_DEMO_TRUST_NORTH_READER` in the server-side
  tenant mapping so application queries retain least-privilege view access.
- A dedicated service identity remains the production recommendation, but is
  not a Milestone 4 gate.

Gate:

- An analyst can identify the largest worsening school, compare it with the
  trust benchmark, and inspect its principal question drivers in under three
  minutes.
- Percentage-point changes and trust benchmarks reconcile exactly to their
  underlying aggregate counts in dbt tests.
- Every response distribution reconciles to its answered-response count and
  uses the catalogue's documented display order.
- Cohorts below 10 expose neither rate nor numerator through secure views, API
  responses, CSV exports, or dashboard tooltips.
- The browser continues to receive aggregate rows only and the north reader
  role continues to return zero south rows.
- No direct respondent identifier, sensitive free text, Snowflake credential,
  or arbitrary SQL reaches the analytical surface.
- Every headline insight links to the supporting school, category, question,
  period, response volume, and metric definition.

### Milestone 5 — production hardening and operational evidence

Status: **complete (2026-09-15)**.

The current dataset contains no real stable respondent identifier, so HMAC
pseudonymisation is documented as a pre-ingestion migration rather than adding
unnecessary linkability. Tenant-specific secure views remain the active model;
the Enterprise-only shared row-access-policy path is documented but is not
applied until the product actually adopts a shared semantic view.

Build:

- HMAC respondent pseudonyms if a future source contract requires stable
  respondent linkage below the aggregate layer.
- A tenant row-access policy if the product replaces tenant-specific secure
  views with shared multi-tenant semantic views.
- A dedicated dashboard service identity and managed secret rotation for a
  hosted deployment.
- dbt source freshness and a health mart using load/query history for failures,
  warehouse consumption, and approximate cost.
- A runbook for failed loads, replay, schema changes, credential rotation, and
  cost inspection.

Gate:

- Production credentials are isolated by workload and can be rotated without
  changing application code.
- Tenant isolation remains effective through both positive and negative role
  tests.
- The health surface identifies the last successful load, failed files, and
  approximate warehouse consumption.
- Full recovery and credential-rotation exercises are documented and repeatable.

### Milestone 6 — S3 and Snowpipe upgrade

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

The production-shaped Snowflake demo is complete at Milestone 5. Milestone 6
is the optional AWS infrastructure extension and is not a blocker for
demonstrating Snowflake, dbt, data correctness, meaningful analysis,
governance, product thinking, and operational readiness.

The repository is done when a new developer can follow the README, connect their own Snowflake account, run a reset/build command, reproduce all mutation scenarios, pass the tests, and deliver the five-minute demo without undocumented manual fixes.

## 13. First implementation slice — completed

The first source-to-mart slice was delivered in this order:

1. Repository scaffold and secret-safe configuration.
2. Kaggle download instructions, gitignored input directory, checksum/attribution file, and a profiling command.
3. Snowflake bootstrap SQL and teardown SQL scoped only to `SCHOOL_WELLBEING_DEMO`.
4. Deterministic CSV-to-submission adapter for one baseline batch and its manifest.
5. Internal-stage upload/load command.
6. `stg_wellbeing_submission_changes`, `int_wellbeing_submission_latest`, `fct_wellbeing_response`, and `mart_school_wellbeing_trend`.
7. Tests for uniqueness, accepted operations, deterministic latest-version selection, and source-to-raw count reconciliation.
8. Object-specific north and south secure views with cross-tenant denial checks.
9. A Power BI Service trend report built from the north secure view.

That sequencing kept product work behind a passing empty-database build.
Milestone 2 subsequently proved mutation and rebuild correctness, and
Milestone 3 delivered the code-owned API and dashboard, Milestone 4 added the
analytical semantic layer, and Milestone 5 added workload isolation and
operational evidence. The remaining optional slice is Milestone 6's AWS
landing and Snowpipe transport.
