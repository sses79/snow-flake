SHELL := /bin/bash
DBT ?= .venv/bin/dbt

.NOTPARALLEL: demo-build

.PHONY: generate test demo-reset demo-load demo-load-m1 demo-load-m2 demo-build dbt-build verify-milestone-2 dashboard-dev dashboard-test dashboard-build

generate:
	node apps/generator/src/cli.ts

test:
	node --test apps/generator/test/*.test.ts

demo-reset:
	./scripts/reset-demo.sh

demo-load-m1: generate
	./scripts/load-batch.sh

demo-load-m2: generate
	./scripts/load-milestone-2.sh

demo-load: demo-load-m1 demo-load-m2

dbt-build:
	@test -f .env || (echo "Missing .env; copy .env.example and configure Snowflake." >&2; exit 1)
	set -a; source .env; set +a; $(DBT) build --project-dir dbt --profiles-dir dbt

demo-build: test demo-load dbt-build

verify-milestone-2: test
	./scripts/verify-milestone-2.sh

dashboard-dev:
	@test -f .env || (echo "Missing .env; copy .env.example and configure Snowflake." >&2; exit 1)
	set -a; source .env; set +a; pnpm --dir apps/dashboard dev

dashboard-test:
	pnpm --dir apps/dashboard test

dashboard-build:
	pnpm --dir apps/dashboard build
