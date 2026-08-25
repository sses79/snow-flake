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
