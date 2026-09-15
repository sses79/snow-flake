# Milestone 4: analytical depth and trustworthy insights

Milestone 4 turns the question-level dashboard into an analyst workflow. It
adds explicit metric definitions, prior-period movement, weighted trust
benchmarks, category context, question-level change drivers, ordered response
distributions, aggregate CSV export, and minimum-cohort suppression.

## Analytical path

```text
indicator and answer catalogues
             |
CORE.FCT_WELLBEING_RESPONSE
             |
             +-- school indicator analysis -- trend, benchmark, export
             +-- school category analysis  -- category context
             `-- school change drivers     -- question contribution
                               |
                      tenant secure views
                               |
                    Next.js API and dashboard
```

The source classification varies within each generated fictional school. The
analytical marts therefore use school, survey period, and indicator/category
as their grain; classification is displayed as `Mixed source classifications`
instead of incorrectly splitting one fictional school into multiple schools.

## Metric dictionary

| Metric | Definition | Interpretation |
|---|---|---|
| Adverse-response rate | adverse answered responses / answered responses | Higher is worse for every curated indicator. |
| Period change (pp) | 100 × (current rate − previous rate) | Positive means worsening. `pp` means percentage points, not relative percent. |
| Trust benchmark | total trust adverse responses / total trust answered responses | Weighted from counts; it is not an average of school percentages. |
| Trust gap (pp) | 100 × (school rate − trust benchmark) | Positive means above the trust adverse-response benchmark. |
| Missing-response rate | missing responses / eligible submissions | At least 20% produces a limited-coverage warning. |
| Category rate | adverse question responses / answered question responses in the category | Context only; not pupil prevalence or an overall wellbeing score. |
| Driver contribution (pp) | current question adverse count / current category denominator minus the equivalent previous share, multiplied by 100 | Contributions sum to category movement, subject to display rounding. |
| Movement status | worsening at ≥ +1 pp, improving at ≤ −1 pp, otherwise stable | A descriptive product rule, not a statistical-significance test. |

The catalogue in `dbt/seeds/wellbeing_indicator_catalog.csv` owns readable
labels, categories, direction, and interpretation notes. The answer-scale seed
owns display order and the values classified as adverse. A dbt test proves
that every answered fact value is covered and agrees with the fact rule.

## Suppression

`eligible_submission_count < 10` sets `is_suppressed = true` before the
semantic layer exposes sensitive values. A suppressed row retains enough
metadata to show a coverage notice, but the adverse numerator, adverse rate,
missingness rate, prior-period change, benchmark gap, distribution counts, and
driver contributions are null.

The nine-submission dbt unit-test fixture proves the rule independently of the
current large demo cohorts. Singular tests also reject any protected metric
that escapes from a suppressed indicator or category row.

## Dashboard workflow

1. Select a category and indicator.
2. Use **Schools worsening** to identify the latest adverse-rate increases.
3. Compare the school with the dashed trust benchmark and the trust-gap card.
4. Select a school from the ranking or category table.
5. Inspect the question drivers and ordered answer distribution.
6. Download the filtered aggregate CSV when deeper analysis is useful.

The browser receives only the aggregate contract. Tenant view names and the
reader role remain a server-side allowlist, filters remain bound values, and
the export passes through the same query and suppression path as the visible
dashboard.

## Deploy and verify

Build the marts with a PAT that can activate `WELLBEING_DEMO_TRANSFORMER`, then
refresh the tenant views with `WELLBEING_DEMO_ADMIN`:

```bash
make dbt-build

snow sql -c "$SNOWFLAKE_CONNECTION_NAME" \
  -f infra/snowflake/05_tenant_reader_views.sql
```

`scripts/dbt-build.sh` loads `.env` and, for this personal demo, reuses
`SNOWFLAKE_DASHBOARD_TOKEN` or `SNOWFLAKE_DASHBOARD_PAT_FILE` for dbt. The dbt
profile still forces `WELLBEING_DEMO_TRANSFORMER`, while the dashboard forces a
tenant reader role. The PAT remains outside the repository and never reaches
the browser.

Run the application checks:

```bash
make dashboard-test
make dashboard-build
make dashboard-dev
```

The live implementation was verified with 216 school-indicator rows, 60
school-category rows, 216 driver rows, 1,044 ordered distribution rows, and a
nine-submission suppression unit test. The North API returned two schools,
five categories, 18 indicators, and no sensitive field names.

Reusable secure-view investigations are in [`analysis/`](../analysis/).
