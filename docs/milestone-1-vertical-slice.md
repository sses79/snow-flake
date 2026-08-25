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

## Data shape and row expansion

The source CSV contains 569 columns and 21,954 response rows. The generated
manifest retains a 569-entry data dictionary for source traceability. The
number `530` in the generator is not the dictionary size: it is the zero-based
CSV position of the final selected question,
`healthy_lifestyle_encouragement`, and therefore identifies the 531st column.

Milestone 1 curates 18 wellbeing question columns. The deterministic compressed
NDJSON batch contains 21,954 lines, with one event per source response and an
`answers` object containing those 18 question keys. `PUT` uploads that single
batch file to the internal stage, and `COPY` loads one complete JSON event into
the raw table per line:

```text
source CSV
  569 columns x 21,954 response rows
       |
       | select 18 wellbeing questions
       v
batch_m1_*.ndjson.gz
  21,954 events, each with 18 answer keys
       |
       | PUT to stage, then COPY
       v
RAW.MONGO_WELLBEING_SUBMISSIONS
  21,954 rows, one event per ENVELOPE
       |
       | dbt lateral flatten of answers
       v
CORE.FCT_WELLBEING_RESPONSE
  395,172 rows (21,954 x 18)
```

Blank answers still retain their question key. dbt therefore creates the fact
row with a null `answer_value`, allowing the mart to distinguish missing from
answered responses instead of silently dropping the question.

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
