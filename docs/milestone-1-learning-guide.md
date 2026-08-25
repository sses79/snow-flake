# Milestone 1 Learning Guide

Milestone 1 proves one complete path from a checked local survey file to a
report-ready Snowflake mart. Its value is not the size of the pipeline; it is
the set of explicit contracts that make every boundary inspectable: source,
batch, raw load, current-state model, response fact, and aggregate mart.

For operating instructions and the product query, see
[`milestone-1-vertical-slice.md`](milestone-1-vertical-slice.md). For a deeper
dbt explanation, see [`dbt-learning-guide.md`](dbt-learning-guide.md).

## The 80/20 View

```text
checked CSV                         local adapter boundary
  569 columns x 21,954 responses
       |
       | validate + select 18 questions + fictionalize deterministically
       v
manifest + batch_m1_*.ndjson.gz     delivery contract
  21,954 events
       |
       | PUT -> stage -> COPY -> reconcile
       v
RAW.MONGO_WELLBEING_SUBMISSIONS     immutable history boundary
  21,954 envelopes
       |
       | type -> latest -> current -> flatten
       v
CORE.FCT_WELLBEING_RESPONSE         answer-level contract
  395,172 rows
       |
       | aggregate with explicit denominators
       v
MARTS.MART_SCHOOL_WELLBEING_TREND   report-ready contract
  2,376 rows
```

## 1. Reject an Unknown Source Before Transforming It

[`generator.ts`](../apps/generator/src/generator.ts) treats the CSV as a
versioned input contract. It checks the exact SHA-256, two header rows, 569
columns, 21,954 responses, response width, distinct source IDs, and the expected
local authority before producing an event. A file with the same name but
different contents is therefore not silently accepted.

The source has a two-row header: broad labels are sparsely populated across
groups of item labels. The generator carries the latest broad label forward,
normalizes the combined label, and disambiguates repeated names. The manifest
keeps all 569 reconstructed dictionary entries even though the event payload
curates only 18 wellbeing questions. Position `530` is the zero-based location
of the last selected question, not the dictionary size.

Transferable lesson: validate the assumptions used to interpret a file before
mapping its values; a row count alone cannot detect a changed schema.

## 2. Determinism Makes Fictional Data Reproducible

The adapter hashes the fixed demo seed and source ID to assign each response to
one of four fictional schools, two trusts, three survey periods, and a generated
timestamp. It also derives stable document and event IDs. The same checked
source therefore produces the same logical assignments and the same compressed
batch bytes; gzip uses a fixed modification time.

This is intentional fictionalization, not recovered source truth. Each event's
`provenance` marks the trust, school, period, and timestamps as
`generated_for_demo`. The source identifier is used to derive a hash but is not
carried into curated models. Sensitive fields and free text listed in
[`data/README.md`](../data/README.md) remain outside the first vertical slice.

[`generator.test.ts`](../apps/generator/test/generator.test.ts) generates the
batch twice and compares its checksum, then verifies the row count, dictionary,
event ID shape, trust domain, 18 answer keys, and provenance marker.

Transferable lesson: generated demo attributes should be stable enough to
debug and clearly labelled so nobody mistakes them for observations.

## 3. The Manifest and Envelope Are Boundary Contracts

The batch is newline-delimited JSON compressed as one deterministic gzip file.
Each of its 21,954 lines is a self-contained change envelope with identifiers,
operation, version, timestamps, schema version, batch ID, payload, and
provenance. A line can therefore be traced and replayed without depending on
the lines around it.

The adjacent manifest records the source and batch checksums, batch ID, row
count, timestamp range, reconstructed data dictionary, and selected-question
mapping. [`load-batch.sh`](../scripts/load-batch.sh) reads the filename, batch
ID, and expected count from this manifest rather than duplicating those values
as operator input.

The envelope is the stable interface between adapters. A later S3 or Snowpipe
transport can deliver the same envelope without changing the raw-table or dbt
contract.

Transferable lesson: pair bulk data with small control metadata, and make every
record carry enough identity and version context for later reconciliation.

## 4. Stage, COPY, and Raw Preserve Delivery Evidence

The loader uses the narrow `WELLBEING_DEMO_LOADER` role and dedicated load
warehouse. `PUT` moves the gzip file to the internal stage; `COPY` parses one
JSON line into one raw `ENVELOPE` and also records filename, file row number,
load time, and load-run ID. `ON_ERROR = ABORT_STATEMENT` prevents a partially
accepted batch under this command's error policy.

After COPY, a Snowflake block counts rows with the manifest batch ID and raises
an exception unless the count matches 21,954. The observed Milestone 1 run
uploaded the file, parsed and loaded all 21,954 rows with zero errors, and
passed this reconciliation.

Snowflake normally skips a previously loaded staged filename, which protects a
simple rerun. That is file-delivery idempotency, not business-event
deduplication: the same events under another filename can still add raw
history. Milestone 2 owns that mutation-level proof.

Transferable lesson: preserve raw delivery evidence and reconcile counts at
the boundary; do not confuse file history with business-key correctness.

## 5. Each dbt Layer Changes One Data Contract

The dbt graph makes the transformations explicit:

- [`stg_wellbeing_submission_changes.sql`](../dbt/models/staging/stg_wellbeing_submission_changes.sql)
  extracts typed fields from the raw `VARIANT` without discarding load metadata.
- [`int_wellbeing_submission_latest.sql`](../dbt/models/intermediate/int_wellbeing_submission_latest.sql)
  ranks versions and retains one latest event per document.
- [`int_wellbeing_submission_current.sql`](../dbt/models/intermediate/int_wellbeing_submission_current.sql)
  keeps only a latest `upsert`, defining current state.
- [`int_wellbeing_answers.sql`](../dbt/models/intermediate/int_wellbeing_answers.sql)
  flattens 18 answer keys into one row per document and question.
- [`fct_wellbeing_response.sql`](../dbt/models/core/fct_wellbeing_response.sql)
  retains the source answer and adds transparent answered/adverse flags.
- [`mart_school_wellbeing_trend.sql`](../dbt/models/marts/mart_school_wellbeing_trend.sql)
  aggregates by trust, school, classification, period, and question.

Blank answer values still produce fact rows with `is_answered = false`. The
mart can therefore report eligible, answered, missing, and adverse counts with
an auditable denominator. The adverse rule is a demo reporting classification,
not a diagnosis or individual support decision.

Transferable lesson: state the grain at every layer and preserve denominator
information; a percentage without eligible, answered, and missing counts is
easy to misinterpret.

## 6. Reconciliation Tests Prove the Slice, Not the Future

`make demo-build` orders the local generator test, generation/load, and dbt
build. The observed dbt run completed 6 models and 27 tests: 33 passing nodes,
with 395,172 fact rows and 2,376 mart rows.

The singular tests under [`dbt/tests/`](../dbt/tests/) check four high-value
invariants:

- raw contains the fixed 21,954-row Milestone 1 fixture;
- fact contains `21,954 * 18 = 395,172` answer rows;
- `(document_id, question_code)` is unique;
- answered plus missing equals eligible, and adverse never exceeds answered.

Schema tests add non-null, uniqueness, and accepted-domain checks. Together
they prove the initial upsert-only slice. They do not yet exercise corrected
versions, duplicates, late older events, or withdrawal tombstones—even though
the latest/current SQL anticipates those operations. The fixed raw/fact count
tests must evolve when Milestone 2 deliberately adds history.

Transferable lesson: state what a test fixture proves and what it cannot prove;
future events often invalidate exact counts without invalidating the model.

## Execution Flow

From an empty set of demo relations, the intended acceptance path is:

```text
make demo-reset
  -> drop dbt-owned demo relations
  -> truncate the isolated raw table
  -> remove the Milestone 1 staged file

make demo-build
  -> node generator test
  -> generate NDJSON + manifest
  -> PUT + COPY + manifest/raw reconciliation
  -> dbt build models and tests in dependency order
  -> query MARTS.MART_SCHOOL_WELLBEING_TREND
```

[`reset-demo.sh`](../scripts/reset-demo.sh) is deliberately destructive inside
the isolated demo objects. It should never be repointed at shared or production
data. Generated row-level files remain ignored by Git.

## What the Tests Prove

The completed build demonstrates a valid checked source, deterministic output,
one event per raw row, a unique answer-level fact, reconciled aggregate
measures, and sufficient loader/transformer privileges. The documented product
query can compare adverse-response rates between fictional survey periods.

The current evidence does not prove a captured `demo-reset && demo-build`
sequence from empty state, mutation correctness, incremental/full-refresh
equivalence, source freshness, tenant row policies, cohort suppression, or a
dashboard. Those are delivery or later-milestone boundaries rather than hidden
Milestone 1 behavior.

## Try It Safely

Start with local checks that do not connect to Snowflake or consume warehouse
credits:

```bash
# Generate twice in temporary directories and prove deterministic output.
make test

# Generate the ignored local batch and manifest.
make generate

# Confirm one NDJSON line per source response.
gzip -dc generated-data/milestone-1/batch_m1_c17d965e5b1c.ndjson.gz | wc -l

# Inspect control metadata without printing respondent-level rows.
node -e 'const m=require("./generated-data/milestone-1/batch_m1_c17d965e5b1c.manifest.json"); console.log({batch_id:m.batch_id,row_count:m.row_count,columns:m.data_dictionary.length,questions:m.questions.length,data_file_sha256:m.data_file_sha256})'
```

Safe experiment: predict where source validation fails, then mutate only a
temporary copy:

```bash
cp data/school-survey-2018-19-1.csv /tmp/m1-checksum-experiment.csv
printf '\n' >> /tmp/m1-checksum-experiment.csv
node apps/generator/src/cli.ts \
  --source /tmp/m1-checksum-experiment.csv \
  --output /tmp/m1-checksum-output
```

The command should stop at the checksum comparison before parsing rows or
writing a batch. The original source and Snowflake data remain untouched.

Only when an intentional integration check is needed, load `.env` and use
`make demo-build`. Use `make demo-reset` only when explicitly accepting deletion
of the isolated demo relations, raw rows, and staged Milestone 1 file.

## Continuous-Learning Loop

1. Define the visible goal, such as “show a school trend with an auditable
   denominator.”
2. Name the enabling contract: deterministic envelope, answer-level grain, or
   reconciled mart measure.
3. Implement the smallest change at one ownership boundary.
4. Prove it cheaply with a local deterministic test, then one focused warehouse
   reconciliation when necessary.
5. Explain what failure revealed: changed source, malformed delivery, count
   mismatch, unexpected grain, or invalid business domain.
6. Record the lesson and carry the contract into the next mutation batch or
   mart.
