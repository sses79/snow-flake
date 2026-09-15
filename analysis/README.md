# Analyst queries

These queries answer the principal Milestone 4 questions using only the North
tenant's suppression-aware secure views. Run them with
`WELLBEING_DEMO_TRUST_NORTH_READER` and `WELLBEING_DEMO_APP_WH`.

- `01_worsening_schools.sql`: latest school movement for a selected indicator.
- `02_trust_benchmark_gaps.sql`: schools furthest above the trust benchmark.
- `03_category_change_drivers.sql`: question contributions to category change.

Positive percentage-point change means a higher adverse-response rate. Null
protected metrics mean that the cohort was suppressed or has no prior period.
These are aggregate, non-diagnostic survey indicators.
