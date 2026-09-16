# Snowflake School Wellbeing Demo

A production-shaped learning project that turns a public school health and
wellbeing survey into an incremental Snowflake analytics pipeline with
least-privilege access, tenant isolation, tested dimensional models, and a
small dashboard.

The project uses fictional trust, school, tenant, and pipeline metadata. It
does not introduce real pupil identities, and the planned dashboard exposes
only aggregated, non-diagnostic wellbeing indicators.

## Documentation

- [80/20 Snowflake learning guide](snowflake-learning-guide.md)
- [Demo architecture and delivery plan](demo-project-plan.md)
- [Milestone 0: account connection and guardrails](docs/milestone-0-account-setup.md)
- [Milestone 0: 80/20 learning guide](docs/milestone-0-learning-guide.md)
- [Milestone 1: first source-to-mart vertical slice](docs/milestone-1-vertical-slice.md)
- [Milestone 1: 80/20 learning guide](docs/milestone-1-learning-guide.md)
- [Milestone 2: incremental correctness](docs/milestone-2-incremental-correctness.md)
- [Milestone 3: aggregate dashboard](docs/milestone-3-dashboard.md)
- [Milestone 4: analytical depth](docs/milestone-4-analytics.md)
- [Milestone 5: production hardening](docs/milestone-5-production-hardening.md)
- [Milestone 6: S3 and Snowpipe](docs/milestone-6-s3-snowpipe.md)
- [Project closeout, achievements, and lessons](docs/project-outcomes-and-lessons.md)
- [DuckDB, AWS, dashboard, and Power BI replacement handover](docs/duckdb-power-bi-handover.md)
- [Dataset profile and handling rules](data/README.md)
- [Power BI dashboard runbook](docs/power-bi-dashboard.md)

## Current status

Milestone 0 is complete: the isolated Snowflake object boundary, custom role
hierarchy, workload-specific warehouses, raw loading objects, least-privilege
grants, and cost monitor are defined as rerunnable SQL in
[`infra/snowflake`](infra/snowflake).

Milestone 1 is implemented: the checked source is deterministically adapted to
a manifest-backed NDJSON micro-batch, loaded through the internal stage, and
transformed by tested dbt models into a school wellbeing trend mart.

Milestone 2 is implemented: deterministic mutation and replay batches exercise
inserts, corrections, duplicate delivery, late older versions, and withdrawals.
Incremental latest-state and response-fact models are tested against a
full-refresh rebuild.

Milestone 3 is complete: aggregate distribution, support-signal,
and freshness marts feed tenant-specific secure views, and the Next.js
dashboard queries those views from a server-only Snowflake adapter. See the
[dashboard runbook](docs/milestone-3-dashboard.md).

Milestone 4 is implemented: catalogue-driven definitions, suppression-aware
school and category analysis, weighted trust benchmarks, question change
drivers, ordered distributions, analyst queries, and filtered aggregate CSV
export extend the dashboard into a traceable analytical workflow.

Milestone 5 is implemented: workload-isolated service-user definitions,
immediate pipeline-run auditing, dbt source freshness, Account Usage health
and warehouse-credit evidence, an observer-only secure view, and repeatable
recovery, credential-rotation, and tenant-isolation checks harden the demo for
a hosted deployment.

Milestone 6 is implemented: Terraform provisions an encrypted, versioned S3
landing boundary and least-privilege Snowflake IAM role; S3 notifications feed
Snowflake's managed SQS queue and auto-ingest pipe. The same generator
manifests drive immutable AWS uploads, schema-drift/reject exercises, load
history evidence, and an opt-in full replay from S3.

The project has now reached its planned closeout. The
[outcomes and lessons guide](docs/project-outcomes-and-lessons.md) records what
was achieved, what the tests prove, the limitations, and the Snowflake account
closure checklist. The
[replacement-project handover](docs/duckdb-power-bi-handover.md) specifies how
to retain the event contracts, analytics, dashboard, Power BI delivery, and
existing AWS landing resources with DuckDB and `dbt-duckdb`.

## Source data

The demo is based on the
[School Student Health and Wellbeing](https://www.kaggle.com/datasets/thedevastator/school-student-health-and-wellbeing)
dataset. Kaggle labels its license as `Other`, so the downloaded CSV, report,
and generated row-level derivatives are intentionally excluded from Git.
Download the source separately and place it in `data/` as described in
[data/README.md](data/README.md).

## Security

Keep Snowflake connection configuration and authentication material outside
the repository. Copy `.env.example` to the ignored `.env` file for non-secret
local settings only. Never commit passwords, MFA codes, account identifiers,
private keys, or source survey rows.

AWS credentials also stay in the standard AWS CLI/provider credential chain.
Terraform derives the active account rather than storing an account ID in the
repository. Start the AWS extension with the
[Milestone 6 runbook](docs/milestone-6-s3-snowpipe.md).
