# Snowflake for Medical Tracker: 80/20 Learning Guide

This guide targets the Full-Stack Data Engineer role in `medical-tracker.md`. The goal is not to learn every Snowflake feature. It is to learn the small set needed to deliver the role's first success: an incremental AWS/MongoDB pipeline, a trustworthy modelled dataset, and a working dashboard or prototype.

For the concrete stack, repository layout, milestones, acceptance gates, and demo script, see [`demo-project-plan.md`](demo-project-plan.md).

## The role in one architecture

```text
AWS MongoDB
    |
    | existing mt-sync v2: incremental exports with checkpoints
    v
regional S3 landing zone (immutable JSON/Parquet, encrypted)
    |
    | S3 event -> Snowpipe auto-ingest
    v
Snowflake RAW (Mongo payload as VARIANT + ingestion metadata)
    |
    | dbt: type, flatten, deduplicate, test, aggregate
    v
STAGING -> CORE -> MARTS / secure semantic views
                         |                 |
                         v                 v
                    Power BI       TypeScript/Node prototype
```

Recommended starting point: tap `mt-sync v2` and write micro-batches to S3. This decouples analytics from the operational database and reuses the hardened ingestion named in the job description. Snowflake storage integrations provide scoped IAM access to S3 without embedding AWS keys, while S3 notifications can trigger serverless Snowpipe loads ([storage integration](https://docs.snowflake.com/en/user-guide/data-load-s3-config-storage-integration), [Snowpipe on S3](https://docs.snowflake.com/en/user-guide/data-load-snowpipe-auto-s3)).

Treat direct CDC as a later option when the product truly needs lower latency. MongoDB change streams expose oplog-backed change events and resume tokens, but require a replica set or sharded cluster and introduce an always-on streaming system to operate ([MongoDB change streams](https://www.mongodb.com/docs/kafka-connector/current/source-connector/fundamentals/change-streams/)).

## The 80/20 view

### 1. Preserve raw documents; impose structure downstream

MongoDB documents evolve and contain nested objects and arrays. Land each source record unchanged in a Snowflake `VARIANT` column alongside operational metadata:

```json
{
  "event_id": "stable-source-event-id",
  "collection": "medical_events",
  "document_id": "mongo-object-id",
  "operation": "upsert",
  "source_updated_at": "2026-08-20T09:30:00Z",
  "extracted_at": "2026-08-20T09:31:00Z",
  "batch_id": "2026-08-20T09:30Z-0001",
  "region": "uk",
  "payload": {}
}
```

In `RAW`, favour replayability over convenience. In dbt staging models, extract frequently queried keys into typed columns and use `FLATTEN` for arrays. Snowflake recommends extracting arrays, dates, and numbers encoded as strings when they are queried frequently ([semi-structured data guidance](https://docs.snowflake.com/en/user-guide/semistructured-considerations)).

Transferable lesson: keep the source truth recoverable, but do not make every dashboard repeatedly parse raw JSON.

### 2. Incremental means idempotent, ordered, and delete-aware

An incremental pipeline must produce the same result after a retry. Do not rely only on a timestamp watermark.

- Give every event a stable `event_id`; give every export a `batch_id`.
- Store `source_updated_at`, `extracted_at`, file name, and load timestamp.
- Deduplicate on document ID and source version/timestamp, with deterministic tie-breaking.
- Represent deletes as tombstones rather than silently losing them.
- Keep the checkpoint only after the S3 object is durably written.
- Reconcile source/export/loaded counts and maximum update timestamps per batch.
- Backfill to a new S3 prefix and merge; never rewrite the normal landing path in place.

Snowpipe tracks file loading, while the dbt model must enforce business-level idempotency. Learn `MERGE` and dbt incremental models before considering streaming. Inside Snowflake, dynamic tables are useful for declarative, freshness-targeted SQL pipelines; streams and tasks suit procedural `MERGE` or custom control flow ([Snowflake decision guide](https://docs.snowflake.com/en/user-guide/dynamic-tables/decision-guide)). For this role, dbt should remain the main transformation layer unless there is a clear reason to split ownership.

Transferable lesson: “incremental” is a correctness contract, not merely a faster query.

### 3. Model the business grain before building a dashboard

For a Medical Tracker-style demo, start with one fact table whose grain is explicit:

```text
fct_medical_event       one row per recorded medical/safeguarding event
dim_pupil               one pseudonymous pupil version
dim_school              one school
dim_trust               one trust or customer tenant
dim_condition           one normalised condition/category
dim_date                one calendar date
```

Useful first marts:

- `mart_school_daily_events`: event volume, severity, and resolution time by school/day.
- `mart_trust_benchmark`: rates per 100 pupils, with minimum cohort suppression.
- `mart_open_followups`: unresolved or recurring events for an authorised operational view.

Define metrics in one place. For example, `events_per_100_pupils = event_count / active_pupil_count * 100`. Store both numerator and denominator so consumers can audit the result. Use slowly changing dimensions only where historical attribution matters; do not add them everywhere by habit.

Transferable lesson: a fact table's grain and a metric's denominator prevent more reporting errors than a clever dashboard does.

### 4. Privacy and tenancy are part of the schema

This role handles children's health and safeguarding data. Build the demo with synthetic or anonymous data only, then show how production controls would work:

- Replace source pupil IDs with a stable keyed HMAC before curated layers; keep the key outside Snowflake data tables.
- Restrict identifiable `RAW` data to an ingestion role; expose curated secure views to applications and BI.
- Apply least-privilege roles such as `LOADER`, `TRANSFORMER`, `ANALYST`, and `APP_READER`.
- Enforce `trust_id`/`school_id` tenant filtering with row access policies; mask direct identifiers and sensitive free text.
- Suppress small benchmark cohorts to reduce re-identification risk.
- Keep UK, UAE, and Asia landing buckets, Snowflake accounts/databases, keys, and processing boundaries explicit. Replication is a deliberate governance decision, not a default.
- Document purpose, lawful basis, retention, deletion propagation, and who can re-identify pseudonymous subjects in the DPIA.

Snowflake supports masking, row-access, and tag-driven controls; some tag-based policy combinations or regional failover features depend on edition or preview status, so verify account capabilities before promising them ([data-protection policies](https://docs.snowflake.com/en/user-guide/tag-based-policies), [cross-region failover](https://docs.snowflake.com/en/user-guide/database-failover-config)).

Transferable lesson: pseudonymised data is still personal data; true anonymisation must make re-identification impractical and irreversible.

### 5. Reliability and cost need visible evidence

The minimum trustworthy pipeline has four types of checks:

| Boundary | Proof |
|---|---|
| Source to landing | batch manifest, row count, checksum, checkpoint |
| Landing to raw | load history, rejected-file alert, no unexpected duplicates |
| Raw to core | dbt uniqueness, not-null, relationship, accepted-value tests |
| Core to product | freshness SLA, metric reconciliation, tenant-isolation test |

Also record pipeline duration, last successful source timestamp, rows loaded, rejected rows, and warehouse credits. Use separate small auto-suspending warehouses for loading, transformation, BI, and the prototype so one workload cannot consume or block another unexpectedly.

Transferable lesson: “the job ran” is not evidence that the data is complete, fresh, correctly scoped, or affordable.

## A focused seven-day learning plan

### Day 1 — Snowflake foundations

Learn databases/schemas, tables/views, virtual warehouses, roles/grants, stages, file formats, and zero-copy cloning. Draw the role-specific flow above from memory.

Deliverable: `RAW`, `CORE`, `MARTS`, and `GOVERNANCE` schemas plus separate loader, transformer, and reader roles.

### Day 2 — Mongo-shaped JSON to Snowflake

Convert a small healthcare CSV dataset into nested newline-delimited JSON documents. Load them manually from S3 with `COPY INTO` into `RAW.MONGO_EVENTS(payload VARIANT, ...)`; query paths and flatten one array.

Deliverable: typed staging view with load metadata and rejected rows visible.

### Day 3 — Automated incremental ingestion

Configure an S3 storage integration and Snowpipe auto-ingest. Send two micro-batches containing an insert, update, duplicate, and tombstone.

Deliverable: rerunning or redelivering a batch does not change the final row count incorrectly.

### Day 4 — dbt modelling

Build source definitions, staging models, the dimensional core, and one daily school mart. Add `unique`, `not_null`, `relationships`, accepted-value, and source-freshness checks.

Deliverable: `dbt build` produces a tested mart from an empty target.

### Day 5 — privacy and multi-tenancy

Pseudonymise pupil IDs, remove direct identifiers/free text from marts, and create tenant-filtered secure views. Test the same query as two trust roles.

Deliverable: each role sees only its trust; suppressed cohorts do not expose small groups.

### Day 6 — product surface

Connect Power BI or build a small TypeScript/Node API plus a simple dashboard showing event rates, trends, filters, and freshness. Query only the semantic mart, never `RAW`.

Deliverable: a user can answer one product question in under a minute.

### Day 7 — operate and explain it

Add a freshness panel, reconciliation query, failed-load alert, cost query, README, and architecture diagram. Rehearse recovery from a late file and schema change.

Deliverable: a five-minute demo that explains correctness, privacy, cost, and the next product experiment.

## Recommended Kaggle datasets

Use synthetic or clearly anonymous public data for the demo. Do not upload real pupil or patient records to a personal Snowflake/Kaggle account.

1. **[Synthetic Medical Dataset](https://www.kaggle.com/datasets/imtkaggleteam/synthetic-medical-dataset)** — best foundation for a longitudinal demo. It is generated with Synthea and represents connected medical records, making it suitable for reshaping into Mongo-style pupils, encounters, conditions, and observations. Kaggle labels its licence as “Other”, so verify the included terms before redistribution.

2. **[School Student Health and Wellbeing](https://www.kaggle.com/datasets/thedevastator/school-student-health-and-wellbeing)** — closest to the employer's school context. It supports school/trust aggregates around physical and emotional wellbeing. It is survey data rather than operational medical events and its licence is not a simple permissive code licence, so use it as an aggregate enrichment source and check the original terms.

3. **[Synthetic Clinical Tabular Dataset](https://www.kaggle.com/datasets/uom190346a/synthetic-clinical-tabular-dataset)** — easiest quick start: 10,000 synthetic, non-PII records with an Apache 2.0 licence. It is ideal for practising ingestion, data-quality tests, masking, and a risk dashboard, but needs generated schools, trusts, and event timestamps to resemble Medical Tracker.

4. **[Diabetes Health Indicators](https://www.kaggle.com/datasets/alexteboul/diabetes-health-indicators-dataset)** — large, cleaned CDC BRFSS survey data with a CC0 licence. It is useful as a public population benchmark and for cohort/fairness analysis, but it is adult US survey data and should not be presented as UK pupil evidence.

For the first implementation in this repository, [`demo-project-plan.md`](demo-project-plan.md) selects the School Student Health and Wellbeing dataset because it best matches the employer's school context. The demo models survey submissions and transparent support signals rather than mislabelling responses as diagnoses or medical events. Fictional `trust_id`, `school_id`, timestamps, versions, corrections, duplicates, and withdrawals provide the operational pipeline behaviour, and every generated field is labelled. Verify the upstream dataset's “Other” license before redistributing source rows.

The Synthea-based dataset remains the stronger later upgrade if the demo needs genuinely longitudinal clinical records and its redistribution terms have been verified.

## Demo backlog mapped to the job

| Job requirement | Evidence in the demo |
|---|---|
| AWS + MongoDB ingestion | Mongo-shaped JSON micro-batches exported to regional S3 |
| Snowflake warehouse/lake | scoped S3 integration, Snowpipe, `RAW/CORE/MARTS` layers |
| dbt and modelling | incremental fact/dim models, tests, documentation, semantic marts |
| Power BI / in-app reporting | one dashboard or Node API reads a curated secure view |
| Privacy/governance | HMAC pseudonyms, RBAC, masking, tenant row policy, cohort suppression |
| Reliability | manifests, reconciliation, freshness, schema-change and retry tests |
| Cost ownership | auto-suspend, workload isolation, credits-per-pipeline-run view |
| Product mindset | one narrow user question, user feedback, and a measured next experiment |

## Safe experiments

1. Deliver the same batch twice. Predict: raw load history may record file behaviour, but the curated fact remains unchanged because its business key/version is idempotent.
2. Add a new optional field to one Mongo payload. Predict: raw ingestion continues; the typed staging model returns `NULL` until explicitly updated.
3. Query the benchmark mart as two trust roles. Predict: each role sees only its tenant and no cohort below the suppression threshold.
4. Send a delete tombstone. Predict: the current-state model removes or expires the record while raw history remains auditable.

## Interview-ready explanation

> I would first reuse `mt-sync v2` to publish checkpointed, immutable micro-batches into region-specific S3 prefixes. Snowpipe would ingest the Mongo-shaped payload and metadata into a replayable raw layer. dbt would type, deduplicate, process tombstones, and build tenant-aware dimensional marts. Power BI and the Node prototype would read only secure semantic views. I would prove the platform with source-to-mart reconciliation, freshness and tenant-isolation tests, HMAC pseudonyms, small-cohort suppression, and visible warehouse cost. I would consider direct change-stream CDC only after a validated product need justified its operational complexity.

## Continuous-learning loop

1. Define one user-visible question.
2. Name the data grain and metric that answer it.
3. Implement the smallest source-to-product slice.
4. Prove it at source, load, model, privacy, and product boundaries.
5. Record what retries, late data, deletes, or schema changes revealed.
6. Carry that lesson into the next dataset or product experiment.
