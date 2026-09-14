# Milestone 2: incremental correctness

Milestone 2 proves that the append-only raw history produces the same current
state whether dbt processes new logical events incrementally or rebuilds from
all history. The fixture covers inserts, a correction, an exact duplicate, an
older version delivered late, a withdrawal tombstone, and the same business
event delivered under a different batch/file name.

## What is generated

`make generate` still creates the 21,954-event Milestone 1 baseline and now
also creates these ignored files under `generated-data/milestone-2/`:

| Delivery | Raw rows | Expected behavior |
|---|---:|---|
| `batch_m2_01_new_inserts` | 2 | Add two current documents |
| `batch_m2_02_correction_duplicate` | 2 | Preserve both raw rows but process one version-3 event |
| `batch_m2_03_late_older_version` | 1 | Retain version 3 instead of the late version 2 |
| `batch_m2_04_withdrawal` | 1 | Retain the tombstone in history and remove the document from current facts |
| `batch_m2_replay_late_older` | 1 | Preserve the new delivery while deduplicating its already-seen `event_id` |

The four numbered files are business mutation batches. The replay file is a
delivery-idempotency fixture, not a fifth business mutation.

Generated row-level files remain ignored by Git. The committed dbt seed
[`expected_milestone_2_batches.csv`](../dbt/seeds/expected_milestone_2_batches.csv)
contains batch IDs and counts only.

## Incremental model behavior

The warehouse retains three distinct grains:

```text
RAW history                     21,961 physical deliveries
  -> staging event dedup        21,959 logical events
  -> incremental latest state  21,956 documents, including one tombstone
  -> current upserts            21,955 documents
  -> incremental response fact 395,190 rows (21,955 x 18 questions)
  -> rebuilt trend mart          2,376 aggregate rows
```

[`stg_wellbeing_submission_changes.sql`](../dbt/models/staging/stg_wellbeing_submission_changes.sql)
keeps the earliest physical delivery for each `event_id`. Raw still preserves
the exact duplicate and renamed replay for audit.

[`int_wellbeing_submission_latest.sql`](../dbt/models/intermediate/int_wellbeing_submission_latest.sql)
is an incremental merge keyed by `document_id`. It compares event candidates
with the existing winner and ranks by `source_version`, `source_updated_at`, then
`event_id`. Arrival time never decides the winner. Because the table stores one
winner rather than an event-processing ledger, a losing late candidate may be
reconsidered on a later build; ranking makes that bounded work idempotent.

[`fct_wellbeing_response.sql`](../dbt/models/core/fct_wellbeing_response.sql)
is an incremental merge keyed by `(document_id, question_code)`. It selects
only new or business-field-changed answers. Its post-hook removes fact keys no
longer present in the current answer view, which gives tombstones physical
delete semantics without mutating raw history.

The trend mart remains a full table rebuild. It contains only 2,376 rows and a
rebuild is safer than maintaining affected aggregate groups after deletes or
dimension changes.

## Run incrementally

To extend an existing Milestone 1 database without deleting its raw history:

```bash
make test
make demo-load-m2
make dbt-build
```

`demo-load-m2` is rerunnable. Snowflake skips an already-loaded staged filename,
and each manifest is reconciled against its raw batch count.

For a deliberately destructive rebuild of only the isolated demo database,
run:

```bash
make demo-reset
make demo-build
```

Review [`reset-demo.sh`](../scripts/reset-demo.sh) before running it. It drops
dbt-owned demo relations, truncates the demo raw table, and removes the demo
stage files.

## Verify incremental/full-refresh equivalence

After the expected batches are present, run:

```bash
make verify-milestone-2
```

The verifier does not truncate raw history. It:

1. regenerates and idempotently loads the expected deliveries;
2. runs the incremental dbt build and all tests;
3. creates temporary zero-copy snapshots of the fact and mart;
4. runs `dbt build --full-refresh`;
5. compares both relations in both directions with `MINUS`;
6. drops the temporary snapshots; and
7. recreates the tenant-safe Power BI views and grants.

The 2026-08-25 acceptance run completed all 40 dbt nodes successfully and
returned `Incremental/full-refresh equivalence passed`.

## Tests and invariants

The Milestone 2 singular tests prove that:

- each expected physical batch count reconciles;
- raw has exactly two more physical rows than logical events;
- the incremental latest table equals a full ranking of event history;
- upserts contain the required curated payload;
- facts exactly reconcile to current normalized answers;
- `(document_id, question_code)` remains unique;
- withdrawn documents have no fact rows; and
- aggregate numerators and denominators still reconcile.

If dbt uses `externalbrowser` authentication and reports an OAuth callback
timeout, rerun the command and complete the identity-provider browser prompt.
