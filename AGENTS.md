# Repository Guidelines

## Project Structure & Module Organization

- `apps/generator/src/` contains the dependency-free TypeScript CSV adapter and batch generator; tests live in `apps/generator/test/`.
- `dbt/models/` follows the warehouse flow: `staging/`, `intermediate/`, `core/`, then `marts/`. Cross-model tests are in `dbt/tests/`.
- `infra/snowflake/` contains ordered, rerunnable account setup SQL. Preserve the numeric execution order.
- `scripts/` provides thin Snowflake loading and reset orchestration used by the `Makefile`.
- `docs/` and the root planning guides describe milestones and architecture.
- `data/` and `generated-data/` contain local, ignored source material and generated batches. Do not commit row-level survey data.

## Build, Test, and Development Commands

- `make generate` validates the source CSV and creates the deterministic gzipped NDJSON batch and manifest.
- `make test` or `npm test` runs the Node test suite.
- `make dbt-build` builds and tests all Snowflake models using `.venv/bin/dbt` and `.env`.
- `make demo-reset && make demo-build` recreates the complete source-to-mart demonstration from empty demo tables.

Use Node.js 22.18 or newer. Install dbt with `python3 -m venv .venv`, then `.venv/bin/pip install -r requirements-dbt.txt`.

## Coding Style & Naming Conventions

Use two-space indentation in TypeScript, YAML, and JSON, and four-space logical indentation in SQL. Prefer explicit types at public boundaries, immutable `const` values, and small functions. Use `camelCase` for TypeScript, `snake_case` for dbt models and columns, and uppercase Snowflake object names in infrastructure SQL. Retain model prefixes such as `stg_`, `int_`, `fct_`, and `mart_`.

No formatter is enforced currently. Run `git diff --check` and preserve the surrounding style before submitting changes.

## Testing Guidelines

Node tests use `node:test` and follow `*.test.ts`. Add deterministic assertions for checksums, counts, identifiers, and assignments. dbt schema tests belong beside their models; cross-model invariants use `dbt/tests/assert_*.sql`. Warehouse-model changes should include a reconciliation or grain test.

## Commit & Pull Request Guidelines

History uses concise, title-case summaries, for example `Initial Snowflake wellbeing demo foundation`. Keep commits focused. Pull requests should name the milestone, list verification commands, identify schema or grant changes, and link issues. Include screenshots only for dashboard changes and sample aggregate output—not row-level records.

## Security & Configuration

Copy `.env.example` to ignored `.env`. Keep credentials and Snowflake connection configuration outside Git. Preserve least-privilege role boundaries and never introduce direct identifiers, sensitive free text, or unsuppressed respondent-level outputs into curated models.
