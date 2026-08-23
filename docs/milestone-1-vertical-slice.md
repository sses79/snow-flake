# Milestone 1: first source-to-mart vertical slice

## Prerequisites

- Complete Milestone 0 and configure the named Snowflake CLI connection.
- Use Node.js 22.18 or newer (native TypeScript execution is used).
- Install dbt in an isolated environment, for example:

  ```bash
  python3 -m venv .venv
  .venv/bin/pip install -r requirements-dbt.txt
  ```

- Copy `.env.example` to `.env` and fill in the Snowflake connection, account,
  and user. The default dbt authenticator opens the Snowflake browser login.

## Build and verify

The generator first validates the exact source checksum, reconstructs the
two-row header, and asserts 569 columns, 21,954 response rows, distinct source
IDs, and the single `Leeds` local-authority value. It then emits a deterministic
gzip-compressed NDJSON batch and sidecar manifest under `generated-data/`.

Run the whole slice from an empty set of demo tables:

```bash
make demo-reset
make demo-build
```

`demo-build` runs the generator tests, uploads and copies the batch, checks the
manifest count against raw rows, and runs all dbt models and tests. Snowflake's
normal COPY load-history behavior makes rerunning the same staged filename a
no-op; mutation-level idempotency is added in Milestone 2.

## Product question

This query identifies fictional schools whose adverse-response rate increased
between consecutive generated survey periods. Rates always include their
answered-response denominator; blank/not-asked responses are counted separately.

```sql
use role WELLBEING_DEMO_TRANSFORMER;
use warehouse WELLBEING_DEMO_TRANSFORM_WH;

with trends as (
  select
    trust_id,
    school_id,
    question_code,
    survey_period,
    adverse_response_rate,
    answered_response_count,
    lag(adverse_response_rate) over (
      partition by trust_id, school_id, question_code
      order by survey_period
    ) as previous_rate
  from SCHOOL_WELLBEING_DEMO.MARTS.MART_SCHOOL_WELLBEING_TREND
)
select
  trust_id,
  school_id,
  question_code,
  survey_period,
  answered_response_count,
  previous_rate,
  adverse_response_rate,
  adverse_response_rate - previous_rate as rate_change
from trends
where previous_rate is not null
  and adverse_response_rate > previous_rate
order by rate_change desc, trust_id, school_id, question_code;
```

The assignments and dates are generated for demonstration. The adverse flag is
an explainable reporting rule, not a diagnosis or individual support decision.
