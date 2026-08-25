SHELL := /bin/bash
DBT ?= .venv/bin/dbt

.NOTPARALLEL: demo-build

.PHONY: generate test demo-reset demo-load demo-build dbt-build

generate:
	node apps/generator/src/cli.ts

test:
	node --test apps/generator/test/*.test.ts

demo-reset:
	./scripts/reset-demo.sh

demo-load: generate
	./scripts/load-batch.sh

dbt-build:
	@test -f .env || (echo "Missing .env; copy .env.example and configure Snowflake." >&2; exit 1)
	set -a; source .env; set +a; $(DBT) build --project-dir dbt --profiles-dir dbt

demo-build: test demo-load dbt-build
